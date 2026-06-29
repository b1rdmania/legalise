"""Chronology module — read-only timeline of matter events, with CPR 31.22 gate.

CPR 31.22(1) is the implied undertaking on disclosure: a party to whom a
document has been disclosed may use the document only for the purpose of
the proceedings in which it is disclosed. Using it in any other proceedings
or for any other purpose is contempt of court (subject to the carve-outs
in 31.22(1)(a)-(c) and 31.22(2)).

The workspace is "another purpose" by default. We resolve the tension by:

  1. Tagging documents with `from_disclosure=True` and a
     `disclosure_proceedings_ref` at upload.
  2. Tracing chronology events to their source documents via
     `Event.source_doc_ids`.
  3. Treating any event whose source documents are from disclosure as
     31.22-tainted.
  4. Requiring the user to acknowledge the implied undertaking before the
     chronology renders. Acknowledgement is recorded as a
     `chronology.gate.confirmed` audit row, scoped to (matter, actor).
     Once recorded, no further acknowledgements are needed for that pair.

This is not legal advice. It is a forcing function so the solicitor
acknowledges 31.22 before composing anything that relies on disclosed
material.

v0.1 surface is read-only. Live event extraction is v0.2; v0.1 ships
seeded fixtures so the regulatory shape is visible without overclaiming
extraction quality.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select, and_, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import current_user
from app.core.db import get_session
from app.core.matter_access import resolve_owned_open_matter
from app.core.matter_fs import append_history
from app.core.api import audit
from app.models import AuditEntry, Document, Event, Matter, User
from app.models.event import STATUS_ACCEPTED, STATUS_REJECTED
from .build import build_chronology


router = APIRouter()


# ---------- schemas ---------------------------------------------------------

REDACTED_DESCRIPTION = "[withheld pending CPR 31.22 acknowledgement]"


class ChronologyEventRead(BaseModel):
    id: uuid.UUID
    event_date: date
    description: str
    significance: int
    source_doc_ids: list[uuid.UUID]
    source_doc_filenames: list[str]
    priv_flag: bool
    status: str                    # proposed | accepted | rejected
    from_disclosure: bool          # derived: any source doc is from disclosure
    proceedings_refs: list[str]    # derived: union of source docs' disclosure refs
    created_at: datetime
    redacted: bool = False         # true if this row's detail is withheld
                                   # behind the CPR 31.22 gate


class GateState(BaseModel):
    required: bool                  # is there ≥1 disclosure-tainted event?
    confirmed: bool                 # has this user confirmed for this matter?
    confirmed_at: datetime | None
    tainted_event_count: int


class ChronologyResponse(BaseModel):
    matter_slug: str
    events: list[ChronologyEventRead]
    gate: GateState
    statement_of_facts_variant: list[ChronologyEventRead]  # priv_flag=False subset


class GateConfirmBody(BaseModel):
    acknowledgement: str  # e.g. "I confirm the implied undertaking under CPR 31.22"


class ChronologyBuildResponse(BaseModel):
    matter_slug: str
    proposed: list[ChronologyEventRead]   # the freshly proposed events
    document_count: int                   # documents read for the build
    parse_failed: bool = False            # model response could not be parsed
    error: str | None = None              # provider failure class, if any


# ---------- helpers ---------------------------------------------------------

async def _load_chronology(session: AsyncSession, matter: Matter) -> tuple[list[Event], dict[uuid.UUID, Document]]:
    """Returns (events, docs_by_id). Events ordered by event_date asc."""
    events = list(
        (await session.scalars(
            select(Event).where(Event.matter_id == matter.id).order_by(Event.event_date.asc())
        )).all()
    )

    all_doc_ids: set[uuid.UUID] = set()
    for e in events:
        for d in (e.source_doc_ids or []):
            all_doc_ids.add(d)

    docs_by_id: dict[uuid.UUID, Document] = {}
    if all_doc_ids:
        rows = (
            await session.scalars(select(Document).where(Document.id.in_(all_doc_ids)))
        ).all()
        for d in rows:
            docs_by_id[d.id] = d

    return events, docs_by_id


def _event_is_tainted(event: Event, docs_by_id: dict[uuid.UUID, Document]) -> bool:
    for doc_id in event.source_doc_ids or []:
        doc = docs_by_id.get(doc_id)
        if doc is not None and doc.from_disclosure:
            return True
    return False


def _event_to_read(
    event: Event,
    docs_by_id: dict[uuid.UUID, Document],
    *,
    redact_tainted: bool,
) -> ChronologyEventRead:
    """Convert an Event row to its API representation.

    If `redact_tainted` is True and the event's source documents include
    one from disclosure, the description, source filenames, and
    proceedings refs are withheld at the server boundary — not just
    hidden in the UI. This is the actual CPR 31.22 access gate. The
    event's existence (id, date, significance, priv_flag, from_disclosure)
    is still surfaced so the solicitor can see *that* there is gated
    material before they choose to acknowledge the undertaking.
    """
    source_docs = [docs_by_id[d] for d in (event.source_doc_ids or []) if d in docs_by_id]
    from_disclosure = any(d.from_disclosure for d in source_docs)

    if redact_tainted and from_disclosure:
        return ChronologyEventRead(
            id=event.id,
            event_date=event.event_date,
            description=REDACTED_DESCRIPTION,
            significance=event.significance,
            source_doc_ids=list(event.source_doc_ids or []),
            source_doc_filenames=[],
            priv_flag=event.priv_flag,
            status=event.status,
            from_disclosure=True,
            proceedings_refs=[],
            created_at=event.created_at,
            redacted=True,
        )

    return ChronologyEventRead(
        id=event.id,
        event_date=event.event_date,
        description=event.description,
        significance=event.significance,
        source_doc_ids=list(event.source_doc_ids or []),
        source_doc_filenames=[d.filename for d in source_docs],
        priv_flag=event.priv_flag,
        status=event.status,
        from_disclosure=from_disclosure,
        proceedings_refs=[
            d.disclosure_proceedings_ref for d in source_docs if d.disclosure_proceedings_ref
        ],
        created_at=event.created_at,
        redacted=False,
    )


async def _gate_state(
    session: AsyncSession, matter: Matter, actor: User, tainted_count: int
) -> GateState:
    confirmed_at: datetime | None = None
    if tainted_count > 0:
        confirmed_at = await session.scalar(
            select(func.max(AuditEntry.timestamp)).where(
                and_(
                    AuditEntry.matter_id == matter.id,
                    AuditEntry.actor_id == actor.id,
                    AuditEntry.action == "chronology.gate.confirmed",
                )
            )
        )
    return GateState(
        required=tainted_count > 0,
        confirmed=confirmed_at is not None,
        confirmed_at=confirmed_at,
        tainted_event_count=tainted_count,
    )


# ---------- endpoints -------------------------------------------------------

@router.get("/{slug}/chronology", response_model=ChronologyResponse)
async def get_chronology(
    slug: str,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> ChronologyResponse:
    matter = await resolve_owned_open_matter(session, slug, user.id)

    events, docs_by_id = await _load_chronology(session, matter)

    # Count tainted entries from raw events (pre-redaction) so the gate
    # state reflects the truth even when the response withholds detail.
    tainted_count = sum(1 for e in events if _event_is_tainted(e, docs_by_id))
    gate = await _gate_state(session, matter, user, tainted_count)

    # Server-side access gate: withhold detail of disclosure-tainted
    # events until the user has acknowledged the CPR 31.22 implied
    # undertaking. The existence of the entry is surfaced; the content
    # is not.
    redact = gate.required and not gate.confirmed
    reads = [_event_to_read(e, docs_by_id, redact_tainted=redact) for e in events]

    # Statement-of-Facts variant strips privileged entries — what you would
    # share externally (counsel, opponent, court bundle). Disclosure-tainted
    # entries stay (they're disclosable material), but priv_flag entries
    # (advice, internal strategy) do not. Same redaction applies.
    sof = [r for r in reads if not r.priv_flag]

    return ChronologyResponse(
        matter_slug=matter.slug,
        events=reads,
        gate=gate,
        statement_of_facts_variant=sof,
    )


@router.post("/{slug}/chronology/gate", response_model=GateState, status_code=status.HTTP_200_OK)
async def confirm_gate(
    slug: str,
    body: GateConfirmBody,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> GateState:
    """Record this user's acknowledgement of CPR 31.22 implied undertaking
    for this matter. Idempotent — repeated confirmations write repeated
    audit rows (provenance over deduplication)."""
    matter = await resolve_owned_open_matter(session, slug, user.id)

    if not body.acknowledgement.strip():
        raise HTTPException(400, "acknowledgement text is required")

    await audit.log(
        session,
        "chronology.gate.confirmed",
        actor_id=user.id,
        matter_id=matter.id,
        module="chronology",
        resource_type="chronology",
        resource_id=matter.slug,
        payload={
            "acknowledgement": body.acknowledgement.strip(),
            "rule": "CPR 31.22(1)",
        },
    )
    await session.commit()
    append_history(
        matter.slug, matter.created_by_id, "chronology.gate.confirmed", body.acknowledgement.strip()[:120]
    )

    # Recompute and return the new state.
    events, docs_by_id = await _load_chronology(session, matter)
    tainted_count = sum(1 for e in events if _event_is_tainted(e, docs_by_id))
    return await _gate_state(session, matter, user, tainted_count)


@router.post(
    "/{slug}/chronology/build",
    response_model=ChronologyBuildResponse,
    status_code=status.HTTP_200_OK,
)
async def build(
    slug: str,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> ChronologyBuildResponse:
    """Owner-only. Read the matter's documents and propose dated events.

    Each extracted event is persisted as ``status="proposed"`` for the
    solicitor to accept or reject. Disclosure-tainted events (their source
    document is from disclosure) stay behind the same CPR 31.22 read gate as
    every other event — taint is derived from `source_doc_ids`, not stored.

    Resilient: a missing key, paused posture, provider error, or unparseable
    model response yields zero proposed events and a 200 with an empty list.
    """
    matter = await resolve_owned_open_matter(session, slug, user.id)

    build_result = await build_chronology(session=session, matter=matter, actor=user)

    await audit.log(
        session,
        "chronology.build",
        actor_id=user.id,
        matter_id=matter.id,
        module="chronology",
        resource_type="chronology",
        resource_id=matter.slug,
        payload={
            "document_count": build_result.document_count,
            "proposed_count": len(build_result.events),
            "parse_failed": build_result.parse_failed,
            "error": build_result.error,
            "default_model_id": matter.default_model_id,
        },
    )
    await session.commit()
    append_history(
        matter.slug,
        matter.created_by_id,
        "chronology.build",
        f"{len(build_result.events)} event(s) proposed from "
        f"{build_result.document_count} document(s)",
    )

    # Re-derive the read shape (incl. disclosure taint) for the new rows.
    _, docs_by_id = await _load_chronology(session, matter)
    redact_required = any(
        _event_is_tainted(e, docs_by_id) for e in build_result.events
    )
    gate = await _gate_state(
        session,
        matter,
        user,
        sum(1 for e in build_result.events if _event_is_tainted(e, docs_by_id)),
    )
    redact = redact_required and not gate.confirmed
    proposed = [
        _event_to_read(e, docs_by_id, redact_tainted=redact)
        for e in build_result.events
    ]

    return ChronologyBuildResponse(
        matter_slug=matter.slug,
        proposed=proposed,
        document_count=build_result.document_count,
        parse_failed=build_result.parse_failed,
        error=build_result.error,
    )


async def _set_event_status(
    *,
    session: AsyncSession,
    matter: Matter,
    user: User,
    event_id: uuid.UUID,
    new_status: str,
    action: str,
) -> ChronologyEventRead:
    """Owner-only status transition for one event, audited."""
    event = await session.scalar(
        select(Event).where(
            Event.id == event_id,
            Event.matter_id == matter.id,
        )
    )
    if event is None:
        raise HTTPException(404, f"event not found: {event_id}")

    event.status = new_status
    await audit.log(
        session,
        action,
        actor_id=user.id,
        matter_id=matter.id,
        module="chronology",
        resource_type="chronology_event",
        resource_id=str(event.id),
        payload={"status": new_status},
    )
    await session.commit()
    await session.refresh(event)

    _, docs_by_id = await _load_chronology(session, matter)
    gate_required = _event_is_tainted(event, docs_by_id)
    confirmed_at = None
    if gate_required:
        gate = await _gate_state(session, matter, user, 1)
        confirmed_at = gate.confirmed_at
    redact = gate_required and confirmed_at is None
    return _event_to_read(event, docs_by_id, redact_tainted=redact)


@router.post(
    "/{slug}/chronology/events/{event_id}/accept",
    response_model=ChronologyEventRead,
    status_code=status.HTTP_200_OK,
)
async def accept_event(
    slug: str,
    event_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> ChronologyEventRead:
    """Owner-only. Accept a proposed event into the chronology."""
    matter = await resolve_owned_open_matter(session, slug, user.id)
    return await _set_event_status(
        session=session,
        matter=matter,
        user=user,
        event_id=event_id,
        new_status=STATUS_ACCEPTED,
        action="chronology.event.accepted",
    )


@router.post(
    "/{slug}/chronology/events/{event_id}/reject",
    response_model=ChronologyEventRead,
    status_code=status.HTTP_200_OK,
)
async def reject_event(
    slug: str,
    event_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> ChronologyEventRead:
    """Owner-only. Reject a proposed event."""
    matter = await resolve_owned_open_matter(session, slug, user.id)
    return await _set_event_status(
        session=session,
        matter=matter,
        user=user,
        event_id=event_id,
        new_status=STATUS_REJECTED,
        action="chronology.event.rejected",
    )
