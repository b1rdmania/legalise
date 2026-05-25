"""Phase 5 — audit reconstruction timeline builder.

Read-only, matter-scoped, pure-functional. Given a matter_id +
optional time window + source filter, returns a chronologically-
ordered timeline of every event the matter produced — audit rows,
state-machine transitions, and advice-boundary decisions.

This is the load-bearing surface for the "supervised autonomy"
claim: without a query that reconstructs what happened, the audit
log is write-only theatre.

Architectural decisions (ratified at Phase 5 v3):

1. **Matter-scoped only.** No cross-matter view at this layer.
2. **Three sources, not four.** The original plan named a separate
   ``ceremony`` source, but ceremony events (``module.ceremony.*``,
   ``module.installed``, etc.) are emitted via the standard audit
   path — they live in ``audit_entries`` already. A dedicated source
   would have been redundant.
3. **Cursor shape:** ``{source, occurred_at, source_row_id}``.
   ``(occurred_at, id)`` alone duplicates or skips rows on timestamp
   ties across the three source tables (different id spaces).
4. **No FX conversion at this layer.** Cost data on
   ``model.invoked`` rows is returned in its native ``cost_micros``
   + ``currency`` columns; presentation layers handle FX if they
   want to.
5. **One SQL query per source.** In-memory merge sort with
   DB-side ``LIMIT limit + 1`` per source to bound memory.
"""

from __future__ import annotations

import base64
import json
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime, UTC
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    AdviceBoundaryDecision,
    AuditEntry,
    StateMachineDefinition,
    StateMachineInstance,
    StateMachineTransition,
)


# Canonical source order — used as the tie-breaker when two rows
# from different tables share an ``occurred_at`` timestamp.
SOURCE_ORDER: dict[str, int] = {
    "audit": 0,
    "state_machine": 1,
    "advice_boundary": 2,
}

VALID_SOURCES = frozenset(SOURCE_ORDER)

DEFAULT_LIMIT = 200
MAX_LIMIT = 500


@dataclass
class TimelineEntry:
    """One row in the reconstructed timeline. Source-agnostic shape."""

    source: str
    occurred_at: datetime
    action: str
    actor: dict[str, Any] = field(default_factory=dict)  # {user_id, role?}
    matter_id: str | None = None
    module_id: str | None = None
    capability_id: str | None = None
    payload: dict[str, Any] = field(default_factory=dict)
    refs: dict[str, Any] = field(default_factory=dict)
    source_row_id: str = ""  # uuid string

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        d["occurred_at"] = self.occurred_at.isoformat()
        return d


@dataclass
class ReconstructionPage:
    """One page of timeline results + an opaque cursor for the next."""

    entries: list[TimelineEntry]
    next_cursor: str | None
    total_in_window_estimate: int  # sum of per-source counts pulled


def encode_cursor(entry: TimelineEntry) -> str:
    """Encode the last entry of a page as an opaque cursor.

    Cursor uniquely identifies the page boundary across all three
    source tables — source order + timestamp + row id together
    disambiguate timestamp ties.
    """
    payload = {
        "source": entry.source,
        "occurred_at": entry.occurred_at.isoformat(),
        "source_row_id": entry.source_row_id,
    }
    return base64.urlsafe_b64encode(
        json.dumps(payload, separators=(",", ":")).encode("utf-8")
    ).decode("ascii")


def decode_cursor(cursor: str) -> dict[str, Any]:
    """Decode an opaque cursor produced by ``encode_cursor``.

    Returns ``{source, occurred_at, source_row_id}``. Caller is
    responsible for filtering rows strictly AFTER the cursor.
    """
    raw = base64.urlsafe_b64decode(cursor.encode("ascii"))
    payload = json.loads(raw)
    return {
        "source": payload["source"],
        "occurred_at": datetime.fromisoformat(payload["occurred_at"]),
        "source_row_id": payload["source_row_id"],
    }


async def _query_audit_rows(
    session: AsyncSession,
    *,
    matter_id: uuid.UUID,
    since: datetime | None,
    until: datetime | None,
    after: tuple[datetime, str] | None,
    limit: int,
) -> list[TimelineEntry]:
    stmt = select(AuditEntry).where(AuditEntry.matter_id == matter_id)
    if since is not None:
        stmt = stmt.where(AuditEntry.timestamp >= since)
    if until is not None:
        stmt = stmt.where(AuditEntry.timestamp <= until)
    if after is not None:
        ts, rid = after
        # Strictly after the cursor: (timestamp > ts) OR (timestamp == ts AND id > rid).
        stmt = stmt.where(
            (AuditEntry.timestamp > ts)
            | ((AuditEntry.timestamp == ts) & (AuditEntry.id > uuid.UUID(rid)))
        )
    stmt = stmt.order_by(AuditEntry.timestamp, AuditEntry.id).limit(limit)
    rows = (await session.scalars(stmt)).all()
    return [_audit_to_entry(r) for r in rows]


def _audit_to_entry(r: AuditEntry) -> TimelineEntry:
    payload = dict(r.payload or {})
    # Pull module_id / capability_id from payload if present (Phase 1
    # convention from audit_phase1).
    module_id = payload.pop("module_id", None) or r.module
    capability_id = payload.pop("capability_id", None)
    # Cost columns surface alongside payload so readers can find them
    # without parsing the JSONB blob.
    if r.cost_micros is not None:
        payload["cost_micros"] = r.cost_micros
        payload["currency"] = r.currency
    if r.tokens_in is not None:
        payload["tokens_in"] = r.tokens_in
    if r.tokens_out is not None:
        payload["tokens_out"] = r.tokens_out
    if r.provider is not None:
        payload["provider"] = r.provider
    if r.model_id is not None:
        payload["model_id"] = r.model_id
    return TimelineEntry(
        source="audit",
        occurred_at=r.timestamp,
        action=r.action,
        actor={"user_id": str(r.actor_id) if r.actor_id else None},
        matter_id=str(r.matter_id) if r.matter_id else None,
        module_id=module_id,
        capability_id=capability_id,
        payload=payload,
        refs={
            "audit_entry_id": str(r.id),
            "resource_type": r.resource_type,
            "resource_id": r.resource_id,
        },
        source_row_id=str(r.id),
    )


async def _query_state_machine_rows(
    session: AsyncSession,
    *,
    matter_id: uuid.UUID,
    since: datetime | None,
    until: datetime | None,
    after: tuple[datetime, str] | None,
    limit: int,
) -> list[TimelineEntry]:
    # State machine instances scope by (owner_scope='matter', owner_id=str).
    # definition_key lives on StateMachineDefinition, joined via
    # StateMachineInstance.definition_id.
    stmt = (
        select(StateMachineTransition, StateMachineDefinition.definition_key)
        .join(
            StateMachineInstance,
            StateMachineTransition.instance_id == StateMachineInstance.id,
        )
        .join(
            StateMachineDefinition,
            StateMachineInstance.definition_id == StateMachineDefinition.id,
        )
        .where(
            StateMachineInstance.owner_scope == "matter",
            StateMachineInstance.owner_id == str(matter_id),
        )
    )
    if since is not None:
        stmt = stmt.where(StateMachineTransition.occurred_at >= since)
    if until is not None:
        stmt = stmt.where(StateMachineTransition.occurred_at <= until)
    if after is not None:
        ts, rid = after
        stmt = stmt.where(
            (StateMachineTransition.occurred_at > ts)
            | (
                (StateMachineTransition.occurred_at == ts)
                & (StateMachineTransition.id > uuid.UUID(rid))
            )
        )
    stmt = stmt.order_by(
        StateMachineTransition.occurred_at, StateMachineTransition.id
    ).limit(limit)
    result = (await session.execute(stmt)).all()
    return [_smt_to_entry(t, key, matter_id) for (t, key) in result]


def _smt_to_entry(
    t: StateMachineTransition,
    definition_key: str,
    matter_id: uuid.UUID,
) -> TimelineEntry:
    return TimelineEntry(
        source="state_machine",
        occurred_at=t.occurred_at,
        action=f"state_machine.transition.{t.status}",
        actor={"user_id": str(t.actor_id) if t.actor_id else None},
        matter_id=str(matter_id),
        module_id=t.module_id,
        capability_id=t.capability_id,
        payload={
            "definition_key": definition_key,
            "from_state": t.from_state,
            "to_state": t.to_state,
            "reason": t.reason,
            "extra_metadata": t.extra_metadata,
            "gate_state": t.gate_state,
            "status": t.status,
        },
        refs={"transition_id": str(t.id), "instance_id": str(t.instance_id)},
        source_row_id=str(t.id),
    )


async def _query_advice_boundary_rows(
    session: AsyncSession,
    *,
    matter_id: uuid.UUID,
    since: datetime | None,
    until: datetime | None,
    after: tuple[datetime, str] | None,
    limit: int,
) -> list[TimelineEntry]:
    # advice_boundary_decisions has no matter_id column; the gate
    # caller stores it in gate_state JSONB. We filter by
    # gate_state->>'matter_id' = matter_id::text.
    stmt = select(AdviceBoundaryDecision).where(
        AdviceBoundaryDecision.gate_state["matter_id"].astext == str(matter_id)
    )
    if since is not None:
        stmt = stmt.where(AdviceBoundaryDecision.decided_at >= since)
    if until is not None:
        stmt = stmt.where(AdviceBoundaryDecision.decided_at <= until)
    if after is not None:
        ts, rid = after
        stmt = stmt.where(
            (AdviceBoundaryDecision.decided_at > ts)
            | (
                (AdviceBoundaryDecision.decided_at == ts)
                & (AdviceBoundaryDecision.id > uuid.UUID(rid))
            )
        )
    stmt = stmt.order_by(
        AdviceBoundaryDecision.decided_at, AdviceBoundaryDecision.id
    ).limit(limit)
    rows = (await session.scalars(stmt)).all()
    return [_abd_to_entry(r, matter_id) for r in rows]


def _abd_to_entry(
    r: AdviceBoundaryDecision, matter_id: uuid.UUID
) -> TimelineEntry:
    return TimelineEntry(
        source="advice_boundary",
        occurred_at=r.decided_at,
        action=f"advice_boundary.decision.{r.status}",
        actor={
            "user_id": str(r.actor_user_id) if r.actor_user_id else None,
            "role": r.actor_role,
        },
        matter_id=str(matter_id),
        module_id=r.module_id,
        capability_id=r.capability_id,
        payload={
            "output_id": r.output_id,
            "from_tier": r.from_tier,
            "to_tier": r.to_tier,
            "declared_tier_max": r.declared_tier_max,
            "gate_state": r.gate_state,
            "status": r.status,
        },
        refs={"advice_boundary_decision_id": str(r.id)},
        source_row_id=str(r.id),
    )


_QUERY_FNS = {
    "audit": _query_audit_rows,
    "state_machine": _query_state_machine_rows,
    "advice_boundary": _query_advice_boundary_rows,
}


def _entry_sort_key(e: TimelineEntry) -> tuple:
    return (e.occurred_at, SOURCE_ORDER[e.source], e.source_row_id)


async def reconstruct(
    session: AsyncSession,
    *,
    matter_id: uuid.UUID,
    since: datetime | None = None,
    until: datetime | None = None,
    sources: frozenset[str] | set[str] | None = None,
    cursor: str | None = None,
    limit: int = DEFAULT_LIMIT,
) -> ReconstructionPage:
    """Reconstruct the matter timeline.

    Pure-functional. No mutation. No external calls. The endpoint
    that wraps this MUST authorise the caller separately — the
    helper does no auth itself.

    Parameters
    ----------
    session
        Read-only AsyncSession.
    matter_id
        Matter to scope to. Required.
    since, until
        Optional ISO8601 time window. Defaults are open-ended.
    sources
        Subset of ``VALID_SOURCES``. ``None`` = all three.
    cursor
        Opaque cursor returned by a previous call. ``None`` for
        the first page.
    limit
        Max entries per page. Capped at ``MAX_LIMIT``.

    Returns
    -------
    ReconstructionPage with up to ``limit`` entries + a ``next_cursor``
    if more pages are available.

    Raises
    ------
    ValueError
        Invalid source name, invalid cursor, or limit out of range.
    """
    if limit <= 0 or limit > MAX_LIMIT:
        raise ValueError(f"limit must be in (0, {MAX_LIMIT}]; got {limit}")
    if sources is None:
        sources = VALID_SOURCES
    else:
        unknown = set(sources) - VALID_SOURCES
        if unknown:
            raise ValueError(
                f"unknown sources: {sorted(unknown)}; valid={sorted(VALID_SOURCES)}"
            )

    # Decode cursor → per-source "after" tuple. Only the source the
    # cursor came from gets the strict-after filter; the other sources
    # still pull from their natural start within the time window, then
    # the merge-sort drops anything ≤ the cursor's key.
    cursor_after_by_source: dict[str, tuple[datetime, str] | None] = {
        s: None for s in VALID_SOURCES
    }
    cursor_key: tuple | None = None
    if cursor is not None:
        decoded = decode_cursor(cursor)
        if decoded["source"] not in VALID_SOURCES:
            raise ValueError(f"cursor names unknown source {decoded['source']}")
        cursor_after_by_source[decoded["source"]] = (
            decoded["occurred_at"],
            decoded["source_row_id"],
        )
        cursor_key = (
            decoded["occurred_at"],
            SOURCE_ORDER[decoded["source"]],
            decoded["source_row_id"],
        )

    # Pull limit+1 from each source so the merge has enough overlap to
    # produce a correct ordering for the page boundary.
    pulls: list[TimelineEntry] = []
    for src in sources:
        rows = await _QUERY_FNS[src](
            session,
            matter_id=matter_id,
            since=since,
            until=until,
            after=cursor_after_by_source[src],
            limit=limit + 1,
        )
        pulls.extend(rows)

    pulls.sort(key=_entry_sort_key)

    # If a cursor was supplied, drop anything ≤ the cursor's key.
    # The same-source query already filtered strict-after — this
    # handles other sources whose rows interleave around the cursor.
    if cursor_key is not None:
        pulls = [e for e in pulls if _entry_sort_key(e) > cursor_key]

    if len(pulls) > limit:
        page = pulls[:limit]
        next_cursor: str | None = encode_cursor(page[-1])
    else:
        page = pulls
        next_cursor = None

    return ReconstructionPage(
        entries=page,
        next_cursor=next_cursor,
        total_in_window_estimate=len(pulls),
    )


__all__ = [
    "DEFAULT_LIMIT",
    "MAX_LIMIT",
    "ReconstructionPage",
    "SOURCE_ORDER",
    "TimelineEntry",
    "VALID_SOURCES",
    "decode_cursor",
    "encode_cursor",
    "reconstruct",
]
