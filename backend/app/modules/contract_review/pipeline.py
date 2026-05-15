"""Contract Review pipeline orchestrator.

Sequencing:
    Stage 1 — Parser      (1 call) — abort on failure
    Stage 2 — Analyst     (1 call) — continue with empty analyses on failure
    Stage 3 — Redliner    (1 call) — continue with empty redlines on failure;
                                     skipped entirely if no clause scored >= 3
    Stage 4 — Summariser  (1 call) — fallback envelope on failure

Total: 4 sequential calls (Pre-Motion is 9). Each downstream stage
consumes upstream output, so they cannot run in parallel.

Audit: every model call writes a `model.call` row through the gateway. The
pipeline writes `module.contract_review.run.start`, four
`module.contract_review.stage.*` rows, and
`module.contract_review.run.complete`.

`on_event` is an optional async callback fired at stage boundaries — SSE
subscribes to it. Audit is the canonical record; SSE is UI sugar.
"""

from __future__ import annotations

import time
import uuid
from collections.abc import Awaitable, Callable
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.api import audit as audit_api
from app.core.model_gateway import (
    PrivilegePaused,
    PrivilegePosture,
    gateway as model_gateway,
)
from app.models import Document, Matter
from app.models.document_body import BODY_KIND_EXTRACTED, DocumentBody

from .agents import (
    AgentCall,
    AnalystAgent,
    ParserAgent,
    RedlinerAgent,
    SummariserAgent,
)
from .schemas import (
    AnalysisResult,
    ClauseAnalysis,
    ContractReviewInputs,
    ContractReviewResult,
    ContractSummary,
    ParsedContract,
    Redline,
    RedlineSet,
    StageStatus,
)


EventCallback = Callable[[str, dict[str, Any]], Awaitable[None]]


async def _noop_event(_name: str, _payload: dict[str, Any]) -> None:
    return None


# ----- Helpers -------------------------------------------------------------


async def _safe_emit(emit: EventCallback, name: str, payload: dict[str, Any]) -> None:
    try:
        await emit(name, payload)
    except Exception:
        # Client disconnect must not abort the pipeline.
        pass


def _stage_from_call(name: str, call: AgentCall | None, status: str) -> StageStatus:
    if call is None:
        return StageStatus(name=name, status=status)
    return StageStatus(
        name=name,
        status=status,
        sub_agent_count=1,
        duration_ms=call.latency_ms,
        token_count=call.token_count,
        errors=[call.error] if call.error else [],
    )


def _coerce_parsed(call: AgentCall) -> ParsedContract:
    try:
        return ParsedContract(**(call.parsed or {}))
    except Exception:
        # Partial salvage.
        try:
            return ParsedContract(
                title=(call.parsed or {}).get("title", ""),
                parties=(call.parsed or {}).get("parties", []) or [],
                document_type=(call.parsed or {}).get("document_type", "other"),
                governing_law_stated=(call.parsed or {}).get("governing_law_stated"),
                clauses=[],
            )
        except Exception:
            return ParsedContract()


def _coerce_analyses(call: AgentCall) -> list[ClauseAnalysis]:
    if call.parsed is None:
        return []
    try:
        return AnalysisResult(**call.parsed).clause_analyses
    except Exception:
        out: list[ClauseAnalysis] = []
        for raw in (call.parsed.get("clause_analyses") or []):
            try:
                out.append(ClauseAnalysis(**raw))
            except Exception:
                continue
        return out


def _coerce_redlines(call: AgentCall) -> list[Redline]:
    if call.parsed is None:
        return []
    try:
        return RedlineSet(**call.parsed).redlines
    except Exception:
        out: list[Redline] = []
        for raw in (call.parsed.get("redlines") or []):
            try:
                out.append(Redline(**raw))
            except Exception:
                continue
        return out


def _coerce_summary(call: AgentCall, fallback_reason: str = "") -> ContractSummary:
    if call.parsed is None:
        return ContractSummary(
            executive_summary=(
                "Summariser stage did not return parseable JSON. Inspect the "
                "per-stage outputs and audit log for the raw response."
                + (f" ({fallback_reason})" if fallback_reason else "")
            ),
            recommendation="Review per-stage outputs manually.",
        )
    try:
        return ContractSummary(**call.parsed)
    except Exception as exc:
        return ContractSummary(
            executive_summary=call.parsed.get("executive_summary", "")
            or f"Summariser JSON did not validate: {exc}",
            key_terms=call.parsed.get("key_terms", []) or [],
            risk_overview=call.parsed.get("risk_overview", "") or "",
            uk_specific_callouts=call.parsed.get("uk_specific_callouts", []) or [],
            recommendation=call.parsed.get("recommendation", "") or "",
        )


# ----- Body resolver -------------------------------------------------------


async def _load_contract_body(
    session: AsyncSession, document_id: uuid.UUID, matter_id: uuid.UUID
) -> tuple[Document, str]:
    """Resolve the extracted body for a matter document.

    v0.1 uses extracted (original) body unconditionally — contract analysis
    is internal and needs real content. Anonymised bodies are not consumed
    here even when present. Returns (Document, body_text).
    """
    doc = await session.scalar(
        select(Document).where(Document.id == document_id, Document.matter_id == matter_id)
    )
    if doc is None:
        raise ValueError(
            f"document {document_id} not found on matter {matter_id}"
        )
    body = await session.scalar(
        select(DocumentBody).where(
            DocumentBody.document_id == doc.id,
            DocumentBody.kind == BODY_KIND_EXTRACTED,
        )
    )
    if body is None or not body.extracted_text:
        raise ValueError(
            f"document {doc.filename} has no extracted body — upload or re-extract first"
        )
    return doc, body.extracted_text


# ----- Orchestrator --------------------------------------------------------


async def run_contract_review(
    *,
    session: AsyncSession,
    gateway=model_gateway,
    matter: Matter,
    actor_id: uuid.UUID | None,
    inputs: ContractReviewInputs,
    on_event: EventCallback | None = None,
) -> ContractReviewResult:
    """Run the four-stage contract review against a matter document."""
    emit = on_event or _noop_event

    # Posture fast-fail before any audit row lands.
    posture_value = await session.scalar(
        select(Matter.privilege_posture).where(Matter.id == matter.id)
    )
    if posture_value is None:
        raise ValueError(f"matter vanished mid-request: {matter.id}")
    if PrivilegePosture(posture_value) is PrivilegePosture.C_PAUSED:
        raise PrivilegePaused(
            "Matter privilege posture is C_paused — Contract review blocked. "
            "Change posture to A_cleared or B_mixed to run."
        )

    # Resolve document + body up front so a missing body fails fast.
    try:
        document_uuid = uuid.UUID(inputs.document_id)
    except (ValueError, TypeError) as exc:
        raise ValueError(f"invalid document_id: {inputs.document_id}") from exc

    document, contract_body = await _load_contract_body(
        session, document_uuid, matter.id
    )

    started_at = datetime.now(timezone.utc)
    started_perf = time.perf_counter()

    # Start audit row — committed before any model call.
    await audit_api.log(
        session,
        "module.contract_review.run.start",
        module="contract_review",
        actor_id=actor_id,
        matter_id=matter.id,
        resource_type="contract-review",
        resource_id=str(document.id),
        payload={
            "document_id": str(document.id),
            "document_filename": document.filename,
            "posture": inputs.posture,
            "contract_type_hint": inputs.contract_type,
            "char_count": len(contract_body),
        },
    )
    await session.commit()

    # Initial stage statuses — pipeline fills these in.
    stages: dict[str, StageStatus] = {
        name: StageStatus(name=name, status="pending")
        for name in ("parser", "analyst", "redliner", "summariser")
    }

    await _safe_emit(
        emit,
        "stage.start",
        {"stage": "parser", "index": 1, "sub_agent_count": 1},
    )

    # ----- Stage 1: Parser -----------------------------------------------
    parser_call = await ParserAgent().run(
        session=session,
        gateway=gateway,
        matter=matter,
        actor_id=actor_id,
        contract_body=contract_body,
        contract_type_hint=inputs.contract_type,
        posture=inputs.posture,
        counterparty=inputs.counterparty_name,
    )
    await audit_api.log(
        session,
        "module.contract_review.stage.parser",
        module="contract_review",
        actor_id=actor_id,
        matter_id=matter.id,
        resource_type="contract-review",
        resource_id=str(document.id),
        payload={
            "ok": parser_call.error is None and parser_call.parsed is not None,
            "duration_ms": parser_call.latency_ms,
            "token_count": parser_call.token_count,
            "error": parser_call.error,
        },
    )
    await session.commit()

    if parser_call.error is not None or parser_call.parsed is None:
        # Parser is the only stage that aborts the pipeline. Without parsed
        # clauses the downstream stages have nothing meaningful to operate
        # on. Surface a fallback envelope so the UI shows the failure.
        stages["parser"] = _stage_from_call("parser", parser_call, "error")
        for k in ("analyst", "redliner", "summariser"):
            stages[k] = StageStatus(name=k, status="skipped")
        await _safe_emit(
            emit,
            "stage.end",
            {"stage": "parser", "index": 1, **stages["parser"].model_dump()},
        )
        return await _finalise(
            session=session,
            actor_id=actor_id,
            matter=matter,
            document=document,
            inputs=inputs,
            stages=stages,
            parsed=ParsedContract(),
            analyses=[],
            redlines=[],
            summary=ContractSummary(
                executive_summary=(
                    "Contract parser failed; downstream stages skipped. "
                    f"Error: {parser_call.error or 'no parseable JSON'}"
                ),
                recommendation="Re-run the review or inspect the audit log.",
            ),
            started_at=started_at,
            started_perf=started_perf,
            model_used=parser_call.model_used or "unknown",
            emit=emit,
        )

    parsed_contract = _coerce_parsed(parser_call)
    stages["parser"] = _stage_from_call("parser", parser_call, "done")
    await _safe_emit(
        emit,
        "stage.end",
        {"stage": "parser", "index": 1, **stages["parser"].model_dump()},
    )

    # ----- Stage 2: Analyst (UK wedge) -----------------------------------
    await _safe_emit(
        emit,
        "stage.start",
        {"stage": "analyst", "index": 2, "sub_agent_count": 1},
    )
    analyst_call = await AnalystAgent().run(
        session=session,
        gateway=gateway,
        matter=matter,
        actor_id=actor_id,
        parsed_contract=parsed_contract.model_dump(),
        contract_body=contract_body,
        posture=inputs.posture,
        counterparty=inputs.counterparty_name,
        deal_value=inputs.deal_value,
    )
    await audit_api.log(
        session,
        "module.contract_review.stage.analyst",
        module="contract_review",
        actor_id=actor_id,
        matter_id=matter.id,
        resource_type="contract-review",
        resource_id=str(document.id),
        payload={
            "ok": analyst_call.error is None and analyst_call.parsed is not None,
            "duration_ms": analyst_call.latency_ms,
            "token_count": analyst_call.token_count,
            "error": analyst_call.error,
        },
    )
    await session.commit()

    analyses = _coerce_analyses(analyst_call)
    if analyst_call.error is not None:
        stages["analyst"] = _stage_from_call("analyst", analyst_call, "error")
    else:
        stages["analyst"] = _stage_from_call("analyst", analyst_call, "done")
    await _safe_emit(
        emit,
        "stage.end",
        {"stage": "analyst", "index": 2, **stages["analyst"].model_dump()},
    )

    # ----- Stage 3: Redliner ---------------------------------------------
    needs_redline = any(
        (a.risk_score >= 3)
        or any(i.severity == "high" for i in a.uk_issues)
        for a in analyses
    )
    redlines: list[Redline] = []
    if not needs_redline:
        stages["redliner"] = StageStatus(name="redliner", status="skipped")
        await _safe_emit(
            emit,
            "stage.end",
            {"stage": "redliner", "index": 3, **stages["redliner"].model_dump()},
        )
    else:
        await _safe_emit(
            emit,
            "stage.start",
            {"stage": "redliner", "index": 3, "sub_agent_count": 1},
        )
        redliner_call = await RedlinerAgent().run(
            session=session,
            gateway=gateway,
            matter=matter,
            actor_id=actor_id,
            parsed_contract=parsed_contract.model_dump(),
            analyses=[a.model_dump() for a in analyses],
            posture=inputs.posture,
        )
        await audit_api.log(
            session,
            "module.contract_review.stage.redliner",
            module="contract_review",
            actor_id=actor_id,
            matter_id=matter.id,
            resource_type="contract-review",
            resource_id=str(document.id),
            payload={
                "ok": redliner_call.error is None and redliner_call.parsed is not None,
                "duration_ms": redliner_call.latency_ms,
                "token_count": redliner_call.token_count,
                "error": redliner_call.error,
            },
        )
        await session.commit()

        redlines = _coerce_redlines(redliner_call)
        status = "error" if redliner_call.error else "done"
        stages["redliner"] = _stage_from_call("redliner", redliner_call, status)
        await _safe_emit(
            emit,
            "stage.end",
            {"stage": "redliner", "index": 3, **stages["redliner"].model_dump()},
        )

    # ----- Stage 4: Summariser -------------------------------------------
    await _safe_emit(
        emit,
        "stage.start",
        {"stage": "summariser", "index": 4, "sub_agent_count": 1},
    )
    summariser_call = await SummariserAgent().run(
        session=session,
        gateway=gateway,
        matter=matter,
        actor_id=actor_id,
        parsed_contract=parsed_contract.model_dump(),
        analyses=[a.model_dump() for a in analyses],
        redlines=[r.model_dump() for r in redlines],
        posture=inputs.posture,
        counterparty=inputs.counterparty_name,
        deal_value=inputs.deal_value,
    )
    await audit_api.log(
        session,
        "module.contract_review.stage.summariser",
        module="contract_review",
        actor_id=actor_id,
        matter_id=matter.id,
        resource_type="contract-review",
        resource_id=str(document.id),
        payload={
            "ok": summariser_call.error is None and summariser_call.parsed is not None,
            "duration_ms": summariser_call.latency_ms,
            "token_count": summariser_call.token_count,
            "error": summariser_call.error,
        },
    )
    await session.commit()

    summary = _coerce_summary(summariser_call, summariser_call.error or "")
    status = "error" if summariser_call.error else "done"
    stages["summariser"] = _stage_from_call("summariser", summariser_call, status)
    await _safe_emit(
        emit,
        "stage.end",
        {"stage": "summariser", "index": 4, **stages["summariser"].model_dump()},
    )

    # ----- Choose a model_used label -------------------------------------
    model_used = next(
        (
            c.model_used
            for c in (summariser_call, analyst_call, parser_call)
            if c.model_used
        ),
        "unknown",
    )

    return await _finalise(
        session=session,
        actor_id=actor_id,
        matter=matter,
        document=document,
        inputs=inputs,
        stages=stages,
        parsed=parsed_contract,
        analyses=analyses,
        redlines=redlines,
        summary=summary,
        started_at=started_at,
        started_perf=started_perf,
        model_used=model_used,
        emit=emit,
    )


async def _finalise(
    *,
    session: AsyncSession,
    actor_id: uuid.UUID | None,
    matter: Matter,
    document: Document,
    inputs: ContractReviewInputs,
    stages: dict[str, StageStatus],
    parsed: ParsedContract,
    analyses: list[ClauseAnalysis],
    redlines: list[Redline],
    summary: ContractSummary,
    started_at: datetime,
    started_perf: float,
    model_used: str,
    emit: EventCallback,
) -> ContractReviewResult:
    """Assemble the result envelope, write completion audit, emit run.complete."""
    total_ms = int((time.perf_counter() - started_perf) * 1000)
    total_tokens = sum(s.token_count for s in stages.values())

    stage_list = [
        stages["parser"],
        stages["analyst"],
        stages["redliner"],
        stages["summariser"],
    ]

    result = ContractReviewResult(
        matter_slug=matter.slug,
        document_id=str(document.id),
        document_filename=document.filename,
        started_at=started_at.isoformat(),
        completed_at=datetime.now(timezone.utc).isoformat(),
        total_duration_ms=total_ms,
        total_token_count=total_tokens,
        model_used=model_used,
        stages=stage_list,
        parsed=parsed,
        analyses=analyses,
        redlines=redlines,
        summary=summary,
        posture=inputs.posture,
        contract_type=inputs.contract_type,
    )

    await audit_api.log(
        session,
        "module.contract_review.run.complete",
        module="contract_review",
        actor_id=actor_id,
        matter_id=matter.id,
        resource_type="contract-review",
        resource_id=str(document.id),
        payload={
            "duration_ms": total_ms,
            "token_count": total_tokens,
            "clause_count": len(parsed.clauses),
            "analysis_count": len(analyses),
            "redline_count": len(redlines),
            "stage_errors": {s.name: s.errors for s in stage_list if s.errors},
        },
    )
    await session.commit()

    await _safe_emit(
        emit,
        "run.complete",
        {
            "total_duration_ms": total_ms,
            "total_token_count": total_tokens,
            "clause_count": len(parsed.clauses),
            "redline_count": len(redlines),
        },
    )
    return result
