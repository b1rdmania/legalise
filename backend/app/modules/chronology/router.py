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
from app.core.matter_fs import append_history
from app.models import AuditEntry, Document, Event, Matter, User


router = APIRouter()


# ---------- schemas ---------------------------------------------------------

class ChronologyEventRead(BaseModel):
    id: uuid.UUID
    event_date: date
    description: str
    significance: int
    source_doc_ids: list[uuid.UUID]
    source_doc_filenames: list[str]
    priv_flag: bool
    from_disclosure: bool          # derived: any source doc is from disclosure
    proceedings_refs: list[str]    # derived: union of source docs' disclosure refs
    created_at: datetime


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


def _event_to_read(event: Event, docs_by_id: dict[uuid.UUID, Document]) -> ChronologyEventRead:
    source_docs = [docs_by_id[d] for d in (event.source_doc_ids or []) if d in docs_by_id]
    return ChronologyEventRead(
        id=event.id,
        event_date=event.event_date,
        description=event.description,
        significance=event.significance,
        source_doc_ids=list(event.source_doc_ids or []),
        source_doc_filenames=[d.filename for d in source_docs],
        priv_flag=event.priv_flag,
        from_disclosure=any(d.from_disclosure for d in source_docs),
        proceedings_refs=[
            d.disclosure_proceedings_ref for d in source_docs if d.disclosure_proceedings_ref
        ],
        created_at=event.created_at,
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
    matter = await session.scalar(select(Matter).where(Matter.slug == slug))
    if matter is None:
        raise HTTPException(404, f"matter not found: {slug}")

    events, docs_by_id = await _load_chronology(session, matter)
    reads = [_event_to_read(e, docs_by_id) for e in events]

    tainted_count = sum(1 for r in reads if r.from_disclosure)
    gate = await _gate_state(session, matter, user, tainted_count)

    # Statement-of-Facts variant strips privileged entries — what you would
    # share externally (counsel, opponent, court bundle). Disclosure-tainted
    # entries stay (they're disclosable material) but privilege-flagged
    # entries (advice, internal strategy) do not.
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
    matter = await session.scalar(select(Matter).where(Matter.slug == slug))
    if matter is None:
        raise HTTPException(404, f"matter not found: {slug}")

    if not body.acknowledgement.strip():
        raise HTTPException(400, "acknowledgement text is required")

    session.add(
        AuditEntry(
            actor_id=user.id,
            matter_id=matter.id,
            action="chronology.gate.confirmed",
            resource_type="chronology",
            resource_id=matter.slug,
            payload={
                "acknowledgement": body.acknowledgement.strip(),
                "rule": "CPR 31.22(1)",
            },
        )
    )
    await session.commit()
    append_history(matter.slug, "chronology.gate.confirmed", body.acknowledgement.strip()[:120])

    # Recompute and return the new state.
    events, docs_by_id = await _load_chronology(session, matter)
    tainted_count = sum(1 for e in events if _event_is_tainted(e, docs_by_id))
    return await _gate_state(session, matter, user, tainted_count)
