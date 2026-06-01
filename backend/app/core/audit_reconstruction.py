"""Audit reconstruction timeline builder.

Read-only, matter-scoped, pure-functional. Given a matter_id +
optional time window + source filter, returns a chronologically-
ordered timeline of every event the matter produced — audit rows,
state-machine transitions, and advice-boundary decisions.

This is the load-bearing surface for the supervised-autonomy claim:
without a query that reconstructs what happened, the audit log is
write-only theatre.

Architectural decisions:

1. **Matter-scoped only.** No cross-matter view at this layer.
2. **Three sources, not four.** Ceremony events
   (``module.ceremony.*``, ``module.installed``, etc.) are emitted
   via the standard audit path — they live in ``audit_entries``
   already, so a dedicated ``ceremony`` source would be redundant.
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

    Raises ``ValueError`` on ANY malformed input — bad base64, bad
    JSON, missing keys, bad timestamp. The API layer (``api/audit.py``)
    catches ``ValueError`` and translates to HTTP 422. Without the
    catch-all, base64/JSON/datetime errors leaked as HTTP 500.
    """
    try:
        raw = base64.urlsafe_b64decode(cursor.encode("ascii"))
    except (ValueError, TypeError) as exc:
        raise ValueError(f"cursor is not valid base64: {exc}") from exc
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError(f"cursor base64 does not decode to JSON: {exc}") from exc
    if not isinstance(payload, dict):
        raise ValueError(
            f"cursor JSON must be an object; got {type(payload).__name__}"
        )
    try:
        source = payload["source"]
        occurred_at_iso = payload["occurred_at"]
        source_row_id = payload["source_row_id"]
    except KeyError as exc:
        raise ValueError(f"cursor missing required key: {exc}") from exc
    if not isinstance(source, str) or not isinstance(source_row_id, str):
        raise ValueError("cursor source/source_row_id must be strings")
    try:
        occurred_at = datetime.fromisoformat(occurred_at_iso)
    except (TypeError, ValueError) as exc:
        raise ValueError(
            f"cursor occurred_at is not ISO-8601: {occurred_at_iso!r}"
        ) from exc
    # source_row_id must be a uuid string — the per-source SQL
    # filters cast it to UUID; let's catch malformed early with a
    # clean ValueError so the 422 says something useful.
    try:
        uuid.UUID(source_row_id)
    except (TypeError, ValueError) as exc:
        raise ValueError(
            f"cursor source_row_id is not a UUID: {source_row_id!r}"
        ) from exc
    return {
        "source": source,
        "occurred_at": occurred_at,
        "source_row_id": source_row_id,
    }


def _cursor_predicate(
    cursor_key: tuple | None,
    self_source: str,
    ts_col,
    id_col,
):
    """Build a SQL predicate that filters rows strictly AFTER the
    global cursor key for this source.

    The strict-after filter applies to every source — not only the
    cursor's own. Earlier implementations skipped this, and other sources
    re-queried from the start of the window with LIMIT N — so when
    a non-cursor source had many pre-cursor rows, the first N all
    sorted BEFORE the cursor and got dropped in memory. Later rows
    from that source were never fetched. The reconstruction view
    then silently omitted them.

    Fix: every source's SQL applies the cursor key, adapted via
    SOURCE_ORDER for cross-source tie-breaking:

    - SOURCE_ORDER[self] > cursor_source_order
      → rows at ``ts == cursor_ts`` count as "after" (this source
        sorts later within a tie), so ``ts >= cursor_ts``.
    - SOURCE_ORDER[self] < cursor_source_order
      → rows at ``ts == cursor_ts`` count as "before", so ``ts > cursor_ts``.
    - SOURCE_ORDER[self] == cursor_source_order
      → standard strict-after on the same source:
        ``(ts > cursor_ts) OR (ts == cursor_ts AND id > cursor_row_id)``.
    """
    if cursor_key is None:
        return None
    cursor_ts, cursor_source_order, cursor_row_id = cursor_key
    self_order = SOURCE_ORDER[self_source]
    if self_order > cursor_source_order:
        return ts_col >= cursor_ts
    if self_order < cursor_source_order:
        return ts_col > cursor_ts
    # Same source as the cursor.
    return (ts_col > cursor_ts) | (
        (ts_col == cursor_ts) & (id_col > uuid.UUID(cursor_row_id))
    )


_STATE_MACHINE_ACTION_PREFIX = "state_machine.transition."
_ADVICE_BOUNDARY_ACTION_PREFIX = "advice_boundary.decision."


async def _query_audit_rows(
    session: AsyncSession,
    *,
    matter_id: uuid.UUID | None,
    since: datetime | None,
    until: datetime | None,
    cursor_key: tuple | None,
    limit: int,
    invocation_id: str | None = None,
    action: str | None = None,
) -> list[TimelineEntry]:
    if matter_id is None:
        stmt = select(AuditEntry).where(AuditEntry.matter_id.is_(None))
    else:
        stmt = select(AuditEntry).where(AuditEntry.matter_id == matter_id)
    if since is not None:
        stmt = stmt.where(AuditEntry.timestamp >= since)
    if until is not None:
        stmt = stmt.where(AuditEntry.timestamp <= until)
    # Filters apply BEFORE pagination. Each filter pushes into
    # SQL so the cursor + limit+1 over-fetch operates on the filtered
    # set, not the full source. Without this, a target row at the tail
    # of a dense non-matching window would never enter `pulls`.
    if action is not None:
        stmt = stmt.where(AuditEntry.action == action)
    if invocation_id is not None:
        # `payload.invocation_id` is the substrate's primary carrier
        # (runtime.py:132 + audit_phase1 convention). Match the JSONB
        # path via ->> 'invocation_id' = :inv.
        stmt = stmt.where(
            AuditEntry.payload["invocation_id"].astext == invocation_id
        )
    pred = _cursor_predicate(
        cursor_key, "audit", AuditEntry.timestamp, AuditEntry.id
    )
    if pred is not None:
        stmt = stmt.where(pred)
    stmt = stmt.order_by(AuditEntry.timestamp, AuditEntry.id).limit(limit)
    rows = (await session.scalars(stmt)).all()
    return [_audit_to_entry(r) for r in rows]


def _audit_to_entry(r: AuditEntry) -> TimelineEntry:
    payload = dict(r.payload or {})
    # Pull module_id / capability_id from payload if present (the
    # audit substrate's convention).
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
    matter_id: uuid.UUID | None,
    since: datetime | None,
    until: datetime | None,
    cursor_key: tuple | None,
    limit: int,
    invocation_id: str | None = None,
    action: str | None = None,
) -> list[TimelineEntry]:
    # Workspace scope (matter_id is None) has no state_machine rows
    # by substrate design (StateMachineInstance rows always carry a
    # matter owner). Return empty cleanly.
    if matter_id is None:
        return []
    # invocation_id filter: state_machine transitions don't carry
    # invocation_id as a deterministic column. Honest behaviour is
    # to return empty when the caller filters by it.
    if invocation_id is not None:
        return []
    # action filter: synthesised action is
    # `state_machine.transition.<status>`. If the action filter
    # doesn't start with that prefix the source matches nothing;
    # if it does we push the status into SQL.
    status_filter: str | None = None
    if action is not None:
        if not action.startswith(_STATE_MACHINE_ACTION_PREFIX):
            return []
        status_filter = action.removeprefix(_STATE_MACHINE_ACTION_PREFIX)
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
    if status_filter is not None:
        stmt = stmt.where(StateMachineTransition.status == status_filter)
    pred = _cursor_predicate(
        cursor_key,
        "state_machine",
        StateMachineTransition.occurred_at,
        StateMachineTransition.id,
    )
    if pred is not None:
        stmt = stmt.where(pred)
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
    matter_id: uuid.UUID | None,
    since: datetime | None,
    until: datetime | None,
    cursor_key: tuple | None,
    limit: int,
    invocation_id: str | None = None,
    action: str | None = None,
) -> list[TimelineEntry]:
    # Workspace scope has no advice_boundary rows by substrate
    # design (AdviceBoundaryDecision.gate_state always carries
    # matter_id; the table is matter-bound).
    if matter_id is None:
        return []
    # action filter parallel to state_machine: the synthesised
    # action is `advice_boundary.decision.<status>`.
    status_filter: str | None = None
    if action is not None:
        if not action.startswith(_ADVICE_BOUNDARY_ACTION_PREFIX):
            return []
        status_filter = action.removeprefix(_ADVICE_BOUNDARY_ACTION_PREFIX)
    stmt = select(AdviceBoundaryDecision).where(
        AdviceBoundaryDecision.gate_state["matter_id"].astext == str(matter_id)
    )
    if since is not None:
        stmt = stmt.where(AdviceBoundaryDecision.decided_at >= since)
    if until is not None:
        stmt = stmt.where(AdviceBoundaryDecision.decided_at <= until)
    if status_filter is not None:
        stmt = stmt.where(AdviceBoundaryDecision.status == status_filter)
    if invocation_id is not None:
        # Substrate convention: AdviceBoundaryDecision.output_id
        # carries the invocation_id verbatim (string form). See the
        # pre-motion vertical-slice regression test.
        stmt = stmt.where(AdviceBoundaryDecision.output_id == invocation_id)
    pred = _cursor_predicate(
        cursor_key,
        "advice_boundary",
        AdviceBoundaryDecision.decided_at,
        AdviceBoundaryDecision.id,
    )
    if pred is not None:
        stmt = stmt.where(pred)
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
    matter_id: uuid.UUID | None,
    since: datetime | None = None,
    until: datetime | None = None,
    sources: frozenset[str] | set[str] | None = None,
    cursor: str | None = None,
    limit: int = DEFAULT_LIMIT,
    invocation_id: str | None = None,
    action: str | None = None,
) -> ReconstructionPage:
    """Reconstruct the timeline.

    Pure-functional. No mutation. No external calls. The endpoint
    that wraps this MUST authorise the caller separately — the
    helper does no auth itself.

    Parameters
    ----------
    session
        Read-only AsyncSession.
    matter_id
        Matter to scope to. ``None`` selects the workspace scope
        (audit-source rows where matter_id IS NULL).
    since, until
        Optional ISO8601 time window. Defaults are open-ended.
    sources
        Subset of ``VALID_SOURCES``. ``None`` = all three.
    cursor
        Opaque cursor returned by a previous call. ``None`` for
        the first page.
    limit
        Max entries per page. Capped at ``MAX_LIMIT``.
    invocation_id
        Filter to rows matching this invocation. For audit rows,
        matches ``payload.invocation_id``. For advice_boundary rows,
        matches ``output_id`` (substrate convention). State_machine
        rows have no deterministic invocation_id carrier and return
        empty under this filter.
    action
        Filter to rows where the synthesised action equals this
        string verbatim. State_machine + advice_boundary
        sources only match if the string carries their respective
        ``state_machine.transition.<status>`` / ``advice_boundary.decision.<status>``
        prefix.

    Filters apply BEFORE pagination — both push into per-source SQL
    so the cursor + limit+1 over-fetch operates on the filtered set.
    A target row at the tail of a dense non-matching window enters
    the first page rather than requiring the caller to chase
    ``next_cursor`` through irrelevant rows.

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

    # Decode cursor → global key applied to EVERY source's SQL via
    # _cursor_predicate. The strict-after filter must apply to every
    # source — non-cursor sources with many pre-cursor rows would
    # otherwise lose later rows to the LIMIT N cap.
    cursor_key: tuple | None = None
    if cursor is not None:
        decoded = decode_cursor(cursor)
        if decoded["source"] not in VALID_SOURCES:
            raise ValueError(f"cursor names unknown source {decoded['source']}")
        cursor_key = (
            decoded["occurred_at"],
            SOURCE_ORDER[decoded["source"]],
            decoded["source_row_id"],
        )

    # Pull limit+1 from each source so the merge has enough overlap to
    # decide a correct page boundary.
    pulls: list[TimelineEntry] = []
    for src in sources:
        rows = await _QUERY_FNS[src](
            session,
            matter_id=matter_id,
            since=since,
            until=until,
            cursor_key=cursor_key,
            limit=limit + 1,
            invocation_id=invocation_id,
            action=action,
        )
        pulls.extend(rows)

    pulls.sort(key=_entry_sort_key)

    # Belt-and-braces: the SQL predicate already guarantees rows are
    # strict-after the cursor across all sources, but keep the
    # in-memory filter as defence-in-depth — cheap, and any future
    # source whose predicate has a bug fails closed (omits a row)
    # instead of failing open (returns duplicates).
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
