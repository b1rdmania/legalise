"""Chronology auto-build — extract dated events from a matter's documents.

The solicitor asks the workspace to read the matter's documents and propose
a chronology; the model returns dated events as structured JSON, and each is
persisted as a ``status="proposed"`` :class:`~app.models.event.Event` for the
solicitor to accept or reject. Nothing is auto-accepted — the model proposes,
the human disposes.

Quality of the extraction depends on a real model and is validated later with
a BYO key. This module is the *plumbing*: it routes through the same gateway
as every other module, parses defensively through
``app.core.structured_output.parse_model_json``, and is resilient by design —
a provider failure, a missing key, or an unparseable response yields ZERO
proposed events rather than an error. CPR 31.22 taint is not stored on the
event; it is derived at read time from whether a source document carries
``from_disclosure=True`` (see ``router.py``), so the build path simply records
the source document in ``Event.source_doc_ids`` and the existing gate does the
rest.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date

from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.api import audit
from app.core.model_gateway import (
    PrivilegePaused,
    PrivilegePosture,
    ProviderKeyMissing,
)
from app.core.model_gateway import gateway as model_gateway
from app.core.structured_output import StructuredOutputError, parse_model_json
from app.core.user_keys import ProviderUpstreamError
from app.models import Document, Event, Matter, User
from app.models.document_body import BODY_KIND_EXTRACTED, DocumentBody
from app.models.event import STATUS_PROPOSED

# Char budgets mirror the assistant pipeline's heuristics so a build prompt
# stays within a sane context window without a tokeniser dependency.
_CHARS_PER_TOKEN = 4
_PER_DOCUMENT_CHAR_BUDGET = 3000 * _CHARS_PER_TOKEN
_MAX_DOCUMENTS = 40
_DEFAULT_SIGNIFICANCE = 3

BUILD_SYSTEM_PROMPT = """You extract a litigation chronology from documents in a UK legal matter.

Read the documents provided and return every dated event of legal significance: things that happened on a specific calendar date (letters sent, meetings held, payments made, notices given, deadlines, incidents). One event per distinct dated fact. England & Wales context.

Rules:
- Only include an event when you can attribute it to a specific calendar date. If a document gives only a month or year with no day, skip it.
- event_date MUST be an ISO date, exactly YYYY-MM-DD.
- description is one terse factual sentence. No advice, no commentary, no hedging, no em dashes.
- source_document_id MUST be the [doc:<id>] UUID of the document the event came from, copied verbatim. Never invent an id. If you cannot attribute an event to one of the listed documents, omit it.
- Do not duplicate the same event. Do not invent events that are not supported by the document text.

Return JSON only, exactly this shape and nothing else:
{"events": [{"event_date": "YYYY-MM-DD", "description": "...", "source_document_id": "<uuid>"}]}

If there are no datable events, return {"events": []}.
"""


@dataclass(frozen=True)
class BuildResult:
    """Outcome of one auto-build run.

    ``events`` are the freshly persisted proposed rows (empty on any
    failure). ``parse_failed`` / ``error`` explain an empty result so the
    caller can audit and the UI can stay honest.
    """

    events: list[Event]
    document_count: int
    parse_failed: bool = False
    error: str | None = None
    duplicates_skipped: int = 0


# --- defensive model-output schemas -----------------------------------------
# Fields are typed loosely (strings) so one malformed row does not fail the
# whole batch under pydantic validation; each row is re-validated by hand in
# ``_coerce_events`` and skipped individually if it does not hold up.


class _ProposedEventRaw(BaseModel):
    model_config = ConfigDict(extra="ignore")

    event_date: str | None = None
    description: str | None = None
    source_document_id: str | None = None


class _ExtractionEnvelope(BaseModel):
    model_config = ConfigDict(extra="ignore")

    events: list[_ProposedEventRaw] = []


async def _load_documents_with_bodies(
    session: AsyncSession, matter_id: uuid.UUID
) -> list[tuple[Document, str]]:
    """Matter documents that carry extracted text, newest first, capped.

    Documents with no extracted body are skipped — there is nothing to read.
    """
    rows = (
        await session.scalars(
            select(Document)
            .where(Document.matter_id == matter_id)
            .order_by(Document.uploaded_at.desc())
            .limit(_MAX_DOCUMENTS)
        )
    ).all()

    out: list[tuple[Document, str]] = []
    for doc in rows:
        body = await session.scalar(
            select(DocumentBody).where(
                DocumentBody.document_id == doc.id,
                DocumentBody.kind == BODY_KIND_EXTRACTED,
            )
        )
        text = body.extracted_text if body and body.extracted_text else ""
        if not text.strip():
            continue
        out.append((doc, _truncate(text, _PER_DOCUMENT_CHAR_BUDGET)))
    return out


def _truncate(text: str, char_budget: int) -> str:
    if char_budget <= 0:
        return ""
    if len(text) <= char_budget:
        return text
    return text[:char_budget].rstrip() + "…"


def _build_prompt(documents: list[tuple[Document, str]]) -> str:
    blocks = ["## Documents", ""]
    for doc, text in documents:
        blocks.append(f"[doc:{doc.id}] {doc.filename}")
        blocks.append(text)
        blocks.append("")
    blocks.append(
        "Extract the chronology now. Return JSON only matching the documented shape."
    )
    return "\n".join(blocks)


def _coerce_events(
    envelope: _ExtractionEnvelope,
    *,
    known_docs: dict[uuid.UUID, Document],
) -> list[tuple[date, str, uuid.UUID | None]]:
    """Validate raw model rows into ``(event_date, description, source_doc_id)``.

    A row is dropped (not fatal) when its date is not a clean ISO date, its
    description is empty, or its ``source_document_id`` is not a document in
    this matter. Unknown / missing source ids leave ``source_doc_id`` None.
    """
    out: list[tuple[date, str, uuid.UUID | None]] = []
    for raw in envelope.events:
        if not raw.event_date or not raw.description:
            continue
        description = raw.description.strip()
        if not description:
            continue
        try:
            event_date = date.fromisoformat(raw.event_date.strip())
        except (ValueError, TypeError):
            continue

        source_doc_id: uuid.UUID | None = None
        if raw.source_document_id:
            try:
                candidate = uuid.UUID(raw.source_document_id.strip())
            except (ValueError, TypeError, AttributeError):
                candidate = None
            if candidate is not None and candidate in known_docs:
                source_doc_id = candidate

        out.append((event_date, description, source_doc_id))
    return out


async def build_chronology(
    *,
    session: AsyncSession,
    matter: Matter,
    actor: User,
    gateway=model_gateway,
) -> BuildResult:
    """Read the matter's documents, ask the model for dated events, persist them.

    Returns the proposed rows (added + flushed, not committed — the caller
    commits inside the request transaction alongside the audit row). Resilient:
    a missing key, a paused posture, an upstream provider error, or an
    unparseable response all yield an empty, non-crashing result.
    """
    documents = await _load_documents_with_bodies(session, matter.id)
    known_docs = {doc.id: doc for doc, _ in documents}

    if not documents:
        return BuildResult(events=[], document_count=0)

    prompt = _build_prompt(documents)

    try:
        result = await gateway.call(
            session=session,
            matter_id=matter.id,
            actor_id=actor.id,
            prompt=prompt,
            model=matter.default_model_id,
            posture=PrivilegePosture(matter.privilege_posture),
            system=BUILD_SYSTEM_PROMPT,
            resource_type="chronology",
            resource_id=matter.slug,
            payload={"stage": "chronology.build", "module": "chronology"},
            caller_module="chronology",
        )
    except (ProviderKeyMissing, ProviderUpstreamError, PrivilegePaused) as exc:
        # No key / provider down / paused posture: propose nothing rather than
        # surface an error. Extraction quality is a real-key concern; the
        # plumbing must never crash the build.
        return BuildResult(
            events=[], document_count=len(documents), error=type(exc).__name__
        )

    try:
        envelope = parse_model_json(result.text, _ExtractionEnvelope)
    except StructuredOutputError:
        return BuildResult(
            events=[], document_count=len(documents), parse_failed=True
        )

    coerced = _coerce_events(envelope, known_docs=known_docs)

    # Dedup: a re-run must not re-propose events the matter already has (in
    # any status). Key on (date, whitespace-normalised lowercase description),
    # and dedup within this batch too. This fixes the "build again → duplicate
    # events" bug.
    def _key(d: date, desc: str) -> tuple[date, str]:
        return (d, " ".join(desc.split()).lower())

    existing = await session.execute(
        select(Event.event_date, Event.description).where(
            Event.matter_id == matter.id
        )
    )
    seen_keys = {_key(d, desc) for d, desc in existing.all()}

    created: list[Event] = []
    duplicates = 0
    for event_date, description, source_doc_id in coerced:
        key = _key(event_date, description)
        if key in seen_keys:
            duplicates += 1
            continue
        seen_keys.add(key)
        event = Event(
            matter_id=matter.id,
            event_date=event_date,
            description=description,
            significance=_DEFAULT_SIGNIFICANCE,
            # Reuse the existing source-document reference: the CPR 31.22 gate
            # in router.py derives taint from these ids' `from_disclosure`.
            source_doc_ids=[source_doc_id] if source_doc_id is not None else [],
            priv_flag=False,
            status=STATUS_PROPOSED,
            created_by_id=actor.id,
        )
        session.add(event)
        created.append(event)

    if created:
        await session.flush()

    return BuildResult(
        events=created,
        document_count=len(documents),
        duplicates_skipped=duplicates,
    )


__all__ = ["build_chronology", "BuildResult", "BUILD_SYSTEM_PROMPT"]
