"""Anonymisation orchestrator.

`anonymise_document` is the single entry point for the router. It:

1. Loads the document + matter, enforces ownership.
2. Loads the extracted body (422 if missing or extraction_method=failed).
3. Loads any existing `redacted` body to seed idempotent re-runs.
4. Runs Presidio (engine in {"presidio","auto"}).
5. On "auto" with low recall, falls back to Claude through the gateway.
6. UPSERTs the `redacted` DocumentBody with mapping + engine + timestamp.
7. Writes a module audit row.

Caller commits the session.
"""

from __future__ import annotations

import time
import uuid
from dataclasses import dataclass
from datetime import datetime, UTC

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.model_gateway import ModelGateway
from app.core.api import audit
from app.models import Document, DocumentBody, Matter, STATUS_ARCHIVED
from app.models.document_body import (
    BODY_KIND_EXTRACTED,
    BODY_KIND_REDACTED,
)
from app.modules.anonymisation import presidio_engine
from app.modules.anonymisation.mapping import tokenise
from app.modules.anonymisation.presidio_engine import AnalysedSpan
from app.modules.anonymisation.prompts import (
    CLAUDE_ANON_SYSTEM_PROMPT,
    parse_claude_envelope,
)
from app.modules.anonymisation.schemas import (
    AnonymisationResult,
    TokenMapping,
)

# Auto-mode fallback thresholds (per design call).
_AUTO_MIN_ENTITIES = 3
_AUTO_MIN_CHARS = 1000

# Cap on Claude fallback input length — match the document_edit module's
# truncation budget so behaviour is consistent across audit rows.
_MAX_CLAUDE_CHARS = 32_000


@dataclass
class _RunOutcome:
    redacted: str
    mapping: dict
    engine_used: str
    entity_count: int


def _spans_from_claude(envelope: dict, source_text: str) -> list[AnalysedSpan]:
    """Coerce a Claude JSON envelope into AnalysedSpan objects.

    Trusts `spans` when offsets verify against the source text. Falls
    back to literal string search using `tokens` when offsets are
    missing, drifted, or fail validation.
    """
    out: list[AnalysedSpan] = []
    seen: set[tuple[int, int]] = set()

    raw_spans = envelope.get("spans")
    if isinstance(raw_spans, list):
        for s in raw_spans:
            if not isinstance(s, dict):
                continue
            try:
                start = int(s.get("start"))
                end = int(s.get("end"))
            except (TypeError, ValueError):
                continue
            original = str(s.get("original", ""))
            if not original or start < 0 or end <= start or end > len(source_text):
                continue
            if source_text[start:end] != original:
                continue
            entity_type = str(s.get("entity_type", "PERSON")).upper()
            key = (start, end)
            if key in seen:
                continue
            seen.add(key)
            out.append(
                AnalysedSpan(
                    start=start,
                    end=end,
                    entity_type=entity_type,
                    score=0.9,
                    original=original,
                )
            )

    # If `spans` was unusable, scan literal occurrences of each token's
    # `original` instead. Bounded at 50 hits per token to defuse a model
    # that returns a one-letter "original".
    if not out:
        tokens = envelope.get("tokens")
        if isinstance(tokens, list):
            for t in tokens:
                if not isinstance(t, dict):
                    continue
                original = str(t.get("original", ""))
                if len(original) < 2:
                    continue
                entity_type = str(t.get("entity_type", "PERSON")).upper()
                start = 0
                hits = 0
                while hits < 50:
                    idx = source_text.find(original, start)
                    if idx < 0:
                        break
                    end = idx + len(original)
                    key = (idx, end)
                    if key not in seen:
                        seen.add(key)
                        out.append(
                            AnalysedSpan(
                                start=idx,
                                end=end,
                                entity_type=entity_type,
                                score=0.9,
                                original=original,
                            )
                        )
                    start = end
                    hits += 1

    # De-overlap + right-to-left ordering, mirroring the Presidio path.
    out.sort(key=lambda s: (s.start, -s.score))
    deduped: list[AnalysedSpan] = []
    last_end = -1
    for s in out:
        if s.start < last_end:
            continue
        deduped.append(s)
        last_end = s.end
    deduped.sort(key=lambda s: s.start, reverse=True)
    return deduped


async def _run_presidio(
    text: str,
    *,
    threshold: float,
    entity_types: list[str] | None,
    existing_mapping: dict | None,
) -> _RunOutcome:
    spans = presidio_engine.analyse(
        text, threshold=threshold, entity_types=entity_types
    )
    redacted, mapping = tokenise(text, spans, existing_mapping=existing_mapping)
    return _RunOutcome(
        redacted=redacted,
        mapping=mapping,
        engine_used="presidio",
        entity_count=len(mapping.get("tokens", {})),
    )


async def _run_claude(
    *,
    session: AsyncSession,
    gateway: ModelGateway,
    matter_id: uuid.UUID,
    actor_id: uuid.UUID,
    doc_id: uuid.UUID,
    text: str,
    existing_mapping: dict | None,
) -> _RunOutcome:
    """Claude fallback via the model gateway. Inherits posture + audit."""
    payload_text = text if len(text) <= _MAX_CLAUDE_CHARS else (
        text[: _MAX_CLAUDE_CHARS - 200]
        + "\n\n[... truncated for context window ...]"
    )
    user_prompt = (
        "Identify every personally identifying span in the following "
        "document body. Return the JSON envelope only.\n\n"
        f"--- DOCUMENT BODY ---\n{payload_text}\n--- END DOCUMENT BODY ---"
    )

    result = await gateway.call(
        session=session,
        matter_id=matter_id,
        actor_id=actor_id,
        prompt=user_prompt,
        system=CLAUDE_ANON_SYSTEM_PROMPT,
        resource_type="document",
        resource_id=str(doc_id),
        payload={"module": "anonymisation", "stage": "claude_fallback"},
        caller_module="anonymisation",
    )

    envelope = parse_claude_envelope(result.text)
    spans = _spans_from_claude(envelope, text)
    redacted, mapping = tokenise(text, spans, existing_mapping=existing_mapping)
    return _RunOutcome(
        redacted=redacted,
        mapping=mapping,
        engine_used="claude",
        entity_count=len(mapping.get("tokens", {})),
    )


def _tokens_list(mapping: dict) -> list[TokenMapping]:
    """Flatten the persisted `tokens` dict into the API response shape."""
    out: list[TokenMapping] = []
    tokens = mapping.get("tokens") if isinstance(mapping, dict) else None
    if not isinstance(tokens, dict):
        return out
    for token, meta in tokens.items():
        if not isinstance(token, str) or not isinstance(meta, dict):
            continue
        out.append(
            TokenMapping(
                token=token,
                entity_type=str(meta.get("entity_type", "")),
                original=str(meta.get("original", "")),
                occurrences=int(meta.get("occurrences", 0) or 0),
            )
        )
    # Stable order: PARTY_1, PARTY_2, ORG_1, ...
    out.sort(key=lambda t: (t.token.split("_", 1)[0], t.token))
    return out


async def anonymise_document(
    *,
    session: AsyncSession,
    gateway: ModelGateway,
    document_id: uuid.UUID,
    actor_id: uuid.UUID,
    engine: str = "auto",
    entity_types: list[str] | None = None,
    threshold: float = 0.4,
) -> AnonymisationResult:
    """Run anonymisation against the document's extracted body."""
    pair = (
        await session.execute(
            select(Document, Matter)
            .join(Matter, Matter.id == Document.matter_id)
            .where(Document.id == document_id)
        )
    ).first()
    if pair is None:
        raise LookupError("document not found")
    doc, matter = pair
    if matter.created_by_id != actor_id or matter.status == STATUS_ARCHIVED:
        raise LookupError("document not found")

    body = await session.scalar(
        select(DocumentBody).where(
            DocumentBody.document_id == doc.id,
            DocumentBody.kind == BODY_KIND_EXTRACTED,
        )
    )
    if body is None or body.extraction_method == "failed" or not body.extracted_text:
        raise ValueError("document body not available for anonymisation")

    text = body.extracted_text

    existing = await session.scalar(
        select(DocumentBody).where(
            DocumentBody.document_id == doc.id,
            DocumentBody.kind == BODY_KIND_REDACTED,
        )
    )
    existing_mapping = existing.mapping if existing else None

    started = time.perf_counter()
    if engine not in {"presidio", "claude", "auto"}:
        raise ValueError(f"unknown engine: {engine!r}")

    if engine == "claude":
        outcome = await _run_claude(
            session=session,
            gateway=gateway,
            matter_id=matter.id,
            actor_id=actor_id,
            doc_id=doc.id,
            text=text,
            existing_mapping=existing_mapping,
        )
    else:
        outcome = await _run_presidio(
            text,
            threshold=threshold,
            entity_types=entity_types,
            existing_mapping=existing_mapping,
        )
        if (
            engine == "auto"
            and outcome.entity_count < _AUTO_MIN_ENTITIES
            and len(text) > _AUTO_MIN_CHARS
        ):
            outcome = await _run_claude(
                session=session,
                gateway=gateway,
                matter_id=matter.id,
                actor_id=actor_id,
                doc_id=doc.id,
                text=text,
                existing_mapping=existing_mapping,
            )

    latency_ms = int((time.perf_counter() - started) * 1000)
    now = datetime.now(UTC)
    char_count = len(outcome.redacted)

    if existing is None:
        existing = DocumentBody(
            document_id=doc.id,
            kind=BODY_KIND_REDACTED,
            extracted_text=outcome.redacted,
            extraction_method=outcome.engine_used,
            extracted_at=now,
            char_count=char_count,
            page_count=body.page_count,
            error_reason=None,
            mapping=outcome.mapping,
            engine=outcome.engine_used,
            anonymised_at=now,
        )
        session.add(existing)
    else:
        existing.extracted_text = outcome.redacted
        existing.extraction_method = outcome.engine_used
        existing.extracted_at = now
        existing.char_count = char_count
        existing.page_count = body.page_count
        existing.error_reason = None
        existing.mapping = outcome.mapping
        existing.engine = outcome.engine_used
        existing.anonymised_at = now

    await audit.log(
        session,
        "module.anonymisation.run",
        actor_id=actor_id,
        matter_id=matter.id,
        module="anonymisation",
        resource_type="document",
        resource_id=str(doc.id),
        payload={
            "engine_requested": engine,
            "engine": outcome.engine_used,
            "entity_count": outcome.entity_count,
            "char_count": char_count,
            "latency_ms": latency_ms,
            "threshold": threshold,
        },
    )
    await session.flush()

    return AnonymisationResult(
        document_id=doc.id,
        redacted_text=outcome.redacted,
        engine=outcome.engine_used,
        anonymised_at=now,
        char_count=char_count,
        entity_count=outcome.entity_count,
        tokens=_tokens_list(outcome.mapping),
    )


__all__ = ["anonymise_document"]
