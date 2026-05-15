"""Run orchestration for tabular review.

Two entrypoints:

- `estimate(...)` — cost-band preview. Reads body lengths from
  `document_bodies` and applies the RATE_CARD keyed on the matter's
  default provider. Returns a ±30 % band; UI labels as estimated.
- `run_review(...)` — fires the per-cell gateway calls under a bounded
  semaphore. Postgres advisory transaction lock keyed on the review id
  prevents concurrent runs clobbering each other (W3 gotcha 1). Body
  unavailable per doc → recorded as a per-row error, run continues
  (gotcha 3, partial-success shape).
"""

from __future__ import annotations

import asyncio
import math
import time
import uuid
from typing import Any, Sequence

from sqlalchemy import select, text as sql_text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.api import audit as audit_api
from app.core.config import settings
from app.core.model_gateway import (
    ModelGateway,
    PrivilegePosture,
    PrivilegePaused,
    gateway as _module_gateway,
)
from app.core.user_keys import ProviderKeyMissing, get_user_provider_key
from app.models import Document, Matter
from app.models.document_body import DocumentBody, BODY_KIND_EXTRACTED
from app.models.tabular_review import TabularReview, TabularReviewRow

from .prompts import (
    MAX_BODY_CHARS,
    OUTPUT_TOKEN_BUDGET,
    RATE_CARD,
    system_prompt_for_type,
    user_prompt_for_cell,
)
from .schemas import ColumnSpec, RunErrorRow, RunEstimate, RunReport


CONFIRM_THRESHOLD = 50
RUN_CONCURRENCY = 4
# Per-call overhead in input tokens: framing string + per-type instructions
# plus the trigger user message. Rough constant; estimator is a band.
SYSTEM_OVERHEAD_TOKENS = 220
ESTIMATE_BAND_RATIO = 0.30  # ±30%


class ReviewRunInProgress(RuntimeError):
    """Raised when the per-review advisory lock cannot be acquired."""


def _approx_tokens(s: str) -> int:
    """A 4-chars-per-token approximation. Same constant the StubProvider uses."""
    if not s:
        return 0
    return max(1, math.ceil(len(s) / 4))


def _select_columns(
    columns: Sequence[dict], column_keys: list[str] | None
) -> list[ColumnSpec]:
    specs = [ColumnSpec.model_validate(c) for c in columns]
    if column_keys is None:
        return specs
    wanted = set(column_keys)
    return [c for c in specs if c.key in wanted]


async def _load_matter_documents(
    session: AsyncSession, matter_id: uuid.UUID, document_ids: list[uuid.UUID] | None
) -> list[Document]:
    stmt = select(Document).where(Document.matter_id == matter_id)
    if document_ids is not None:
        stmt = stmt.where(Document.id.in_(document_ids))
    stmt = stmt.order_by(Document.uploaded_at.asc())
    return list((await session.scalars(stmt)).all())


async def _load_body(session: AsyncSession, document_id: uuid.UUID) -> DocumentBody | None:
    return await session.scalar(
        select(DocumentBody).where(
            DocumentBody.document_id == document_id,
            DocumentBody.kind == BODY_KIND_EXTRACTED,
        )
    )


def _parse_response(raw: str, column_type: str) -> str:
    """Light post-processing per column type.

    All values land in JSONB as strings. The UI is responsible for
    rendering hints (date regex warnings, yes/no badges).
    """
    stripped = (raw or "").strip()
    if column_type == "yesno":
        lower = stripped.lower()
        for token in ("yes", "no", "unclear"):
            if token in lower.split():
                return token
        if lower.startswith(("yes", "no", "unclear")):
            for token in ("unclear", "yes", "no"):
                if lower.startswith(token):
                    return token
        return "unclear"
    # text / date / number: pass through, trimmed.
    return stripped


async def estimate(
    *,
    session: AsyncSession,
    review: TabularReview,
    documents: Sequence[Document],
    matter: Matter,
    column_keys: list[str] | None = None,
    document_ids: list[uuid.UUID] | None = None,
) -> RunEstimate:
    """Cost-band estimate for a (review, doc-set, column-set) tuple."""
    cols = _select_columns(review.columns_config, column_keys)
    doc_subset: list[Document]
    if document_ids is None:
        doc_subset = list(documents)
    else:
        wanted = set(document_ids)
        doc_subset = [d for d in documents if d.id in wanted]

    total_calls = 0
    est_input_tokens = 0
    est_output_tokens = 0
    for doc in doc_subset:
        body = await _load_body(session, doc.id)
        # Even when body is unavailable, we leave it out of the estimate —
        # it can't be billed. Run will emit a per-row error for it.
        if body is None or body.extraction_method == "failed" or not body.extracted_text:
            continue
        body_tokens = _approx_tokens(body.extracted_text[:MAX_BODY_CHARS])
        for col in cols:
            total_calls += 1
            est_input_tokens += (
                body_tokens
                + _approx_tokens(col.prompt)
                + SYSTEM_OVERHEAD_TOKENS
            )
            est_output_tokens += OUTPUT_TOKEN_BUDGET.get(col.type, 200)

    # Defer to the gateway's actual routing so a B_mixed matter with
    # Ollama registered shows local rates (£0.00), not the Anthropic
    # rate-card it would never hit. Codex R3 finding: estimate() was
    # the last `provider_for_model` caller after R2; using the gateway
    # selector keeps preflight + estimate + actual run consistent.
    posture = PrivilegePosture(matter.privilege_posture)
    provider = _module_gateway.select_provider_name(matter.default_model_id, posture)
    if provider not in RATE_CARD:
        provider = "stub-echo"
    p_in, p_out = RATE_CARD[provider]
    # Cost in pence; rate-card units are pence per 1M tokens.
    base_pence = (
        est_input_tokens * p_in + est_output_tokens * p_out
    ) / 1_000_000
    lower = int(math.floor(base_pence * (1 - ESTIMATE_BAND_RATIO)))
    upper = int(math.ceil(base_pence * (1 + ESTIMATE_BAND_RATIO)))

    return RunEstimate(
        total_calls=total_calls,
        est_input_tokens=est_input_tokens,
        est_output_tokens=est_output_tokens,
        est_cost_pence_lower=max(0, lower),
        est_cost_pence_upper=max(0, upper),
        requires_confirm=total_calls > CONFIRM_THRESHOLD,
        provider=provider,
        model_id=matter.default_model_id,
    )


async def _upsert_cell(
    session: AsyncSession,
    review_id: uuid.UUID,
    document_id: uuid.UUID,
    column_key: str,
    value: Any,
    now_ts,
) -> None:
    """Insert-or-merge one cell's value into `tabular_review_rows`.

    The composite-PK row may not exist yet (lazy creation). The
    `extracted_values` JSONB is merged in Python — we re-read the
    current dict and write the merged copy. Concurrent upserts to
    different column keys on the same row are serialised by the
    advisory lock held for the duration of the run.
    """
    existing = await session.scalar(
        select(TabularReviewRow).where(
            TabularReviewRow.review_id == review_id,
            TabularReviewRow.document_id == document_id,
        )
    )
    if existing is None:
        stmt = pg_insert(TabularReviewRow).values(
            review_id=review_id,
            document_id=document_id,
            extracted_values={column_key: value},
            last_run_at=now_ts,
        )
        stmt = stmt.on_conflict_do_update(
            index_elements=[
                TabularReviewRow.review_id,
                TabularReviewRow.document_id,
            ],
            set_={
                "extracted_values": stmt.excluded.extracted_values,
                "last_run_at": now_ts,
            },
        )
        await session.execute(stmt)
    else:
        merged = dict(existing.extracted_values or {})
        merged[column_key] = value
        existing.extracted_values = merged
        existing.last_run_at = now_ts


async def run_review(
    *,
    session: AsyncSession,
    gateway: ModelGateway,
    review: TabularReview,
    matter: Matter,
    actor_id: uuid.UUID,
    column_keys: list[str] | None = None,
    document_ids: list[uuid.UUID] | None = None,
    confirm_above_50: bool = False,
) -> RunReport:
    """Execute the review across the requested (doc, column) grid."""
    started_perf = time.perf_counter()

    documents = await _load_matter_documents(session, matter.id, document_ids)
    pre_estimate = await estimate(
        session=session,
        review=review,
        documents=documents,
        matter=matter,
        column_keys=column_keys,
        document_ids=None,  # documents already filtered above
    )
    if pre_estimate.requires_confirm and not confirm_above_50:
        raise ValueError("confirm_above_50 required")

    cols = _select_columns(review.columns_config, column_keys)
    if not cols:
        return RunReport(cells_run=0, cells_failed=0, errors=[], duration_ms=0)

    # Provider-key preflight. Fail BEFORE holding the advisory lock +
    # writing audit rows so the router surfaces 422 cleanly. Codex R2
    # finding: defer to the gateway's own routing — on a B_mixed matter
    # with Ollama registered, the gateway would serve the call keylessly
    # against the local model even if `claude-*` is requested. Don't
    # demand an Anthropic key in that case.
    posture = PrivilegePosture(matter.privilege_posture)
    selected_provider = gateway.select_provider_name(matter.default_model_id, posture)
    if gateway.is_keyed_provider(selected_provider):
        user_key = await get_user_provider_key(session, actor_id, selected_provider)
        fallback_allowed = (
            settings.environment in {"development", "dev", "local"}
            and settings.allow_server_key_fallback
        )
        if user_key is None and not fallback_allowed:
            raise ProviderKeyMissing(selected_provider)

    # Advisory lock — per-review, transaction-scoped. Released on commit
    # or rollback. `pg_try_advisory_xact_lock` returns boolean; if false,
    # another run is in progress.
    lock_acquired = await session.scalar(
        sql_text(
            "SELECT pg_try_advisory_xact_lock(hashtext(:k))"
        ).bindparams(k=f"tabular_review:{review.id}")
    )
    if not lock_acquired:
        raise ReviewRunInProgress("review_run_in_progress")

    await audit_api.log(
        session,
        "module.tabular_review.run.started",
        module="tabular_review",
        actor_id=actor_id,
        matter_id=matter.id,
        resource_type="tabular_review",
        resource_id=str(review.id),
        payload={
            "review_id": str(review.id),
            "column_keys": [c.key for c in cols],
            "document_ids": [str(d.id) for d in documents],
            "estimated_calls": pre_estimate.total_calls,
        },
    )
    # Note: audit_api.log adds the row to the session; we let the final
    # commit at the end of the request flush both the audit rows and
    # the cell upserts together.

    # Pre-fetch every body once; the runner re-uses the cached body for
    # every column in that doc.
    body_cache: dict[uuid.UUID, DocumentBody | None] = {}
    for doc in documents:
        body_cache[doc.id] = await _load_body(session, doc.id)

    errors: list[RunErrorRow] = []
    cells_run = 0
    cells_failed = 0
    from datetime import datetime, timezone
    now_ts = datetime.now(timezone.utc)

    # Cells are processed serially. SQLAlchemy AsyncSession is not safe
    # to use across concurrent tasks, and the gateway call writes the
    # `model.call` audit row into the same session — so per-task
    # sessions would mean ordering pain and partial-commit risk.
    # ~50 cells max @ ~1-3s/cell = ~150s max, acceptable for v0.1.
    # Codex R1 finding: shared-session gather was unsafe.
    for doc in documents:
        for col in cols:
            body = body_cache.get(doc.id)
            if body is None or body.extraction_method == "failed" or not body.extracted_text:
                raw_text: str | None = None
                err_msg: str | None = "body unavailable"
            else:
                sys_prompt = system_prompt_for_type(col.type, col.prompt, body.extracted_text)
                user_msg = user_prompt_for_cell(col.label)
                try:
                    result = await gateway.call(
                        session=session,
                        matter_id=matter.id,
                        actor_id=actor_id,
                        prompt=user_msg,
                        system=sys_prompt,
                        resource_type="tabular_review",
                        resource_id=str(review.id),
                        payload={
                            "module": "tabular_review",
                            "review_id": str(review.id),
                            "column_key": col.key,
                            "document_id": str(doc.id),
                        },
                    )
                except (PrivilegePaused, ProviderKeyMissing):
                    # Policy failures propagate — preflight should have
                    # caught key-missing, but keep the guard in case the
                    # provider key was revoked mid-run.
                    raise
                except Exception as exc:  # noqa: BLE001
                    raw_text, err_msg = None, f"{type(exc).__name__}: {exc}"
                else:
                    raw_text, err_msg = result.text, None

            if err_msg is not None:
                cells_failed += 1
                errors.append(
                    RunErrorRow(
                        document_id=doc.id,
                        column_key=col.key,
                        error_message=err_msg,
                    )
                )
                await audit_api.log(
                    session,
                    "module.tabular_review.column.run",
                    module="tabular_review",
                    actor_id=actor_id,
                    matter_id=matter.id,
                    resource_type="tabular_review",
                    resource_id=str(review.id),
                    payload={
                        "review_id": str(review.id),
                        "column_key": col.key,
                        "document_id": str(doc.id),
                        "parse_ok": False,
                        "error": err_msg,
                    },
                )
                continue
            value = _parse_response(raw_text or "", col.type)
            await _upsert_cell(
                session=session,
                review_id=review.id,
                document_id=doc.id,
                column_key=col.key,
                value=value,
                now_ts=now_ts,
            )
            cells_run += 1
            await audit_api.log(
                session,
                "module.tabular_review.column.run",
                module="tabular_review",
                actor_id=actor_id,
                matter_id=matter.id,
                resource_type="tabular_review",
                resource_id=str(review.id),
                payload={
                    "review_id": str(review.id),
                    "column_key": col.key,
                    "document_id": str(doc.id),
                    "value_length": len(value),
                    "parse_ok": True,
                },
            )

    duration_ms = int((time.perf_counter() - started_perf) * 1000)
    review.updated_at = now_ts

    await audit_api.log(
        session,
        "module.tabular_review.run.completed",
        module="tabular_review",
        actor_id=actor_id,
        matter_id=matter.id,
        resource_type="tabular_review",
        resource_id=str(review.id),
        payload={
            "review_id": str(review.id),
            "cells_run": cells_run,
            "cells_failed": cells_failed,
            "duration_ms": duration_ms,
        },
    )

    return RunReport(
        cells_run=cells_run,
        cells_failed=cells_failed,
        errors=errors,
        duration_ms=duration_ms,
    )


__all__ = [
    "ReviewRunInProgress",
    "CONFIRM_THRESHOLD",
    "estimate",
    "run_review",
]
