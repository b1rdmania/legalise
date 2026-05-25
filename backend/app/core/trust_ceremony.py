"""Module install trust ceremony.

Per docs/handovers/PHASE_3_BUILD_PLAN.md §Step 5 and the
``TRUST_CEREMONY.md`` architecture doc.

Two install modes:

**Verified publisher fast path** (3 steps):
1. show publisher
2. show permission card
3. enable

**Unverified publisher full path** (7 steps):
1. inspect manifest
2. verify signature status
3. show publisher / unknown-publisher warning
4. show permissions
5. show data movement
6. show gates
7. explicit trust + grant

Both modes write audit rows at every state transition. Both modes
return a ``PermissionCard`` derived from the manifest's
``data_movement`` block so the frontend can render exactly what the
module will see and send.

Phase 3 ships the state machine + permission-card builder. Phase 12
builds the frontend modal UI. Phase 4 wires the per-grant lifecycle
(re-prompt on permission expansion).
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Any

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.phase1_runtime import audit_phase1
from app.core.publishers import is_verified_publisher, publisher_info
from app.core.signing import SignatureStatus, verify_manifest_signature

logger = structlog.get_logger()


class CeremonyState(str, Enum):
    """States in the trust-ceremony state machine."""

    DISCOVERED = "discovered"
    INSPECTED = "inspected"
    SIGNATURE_CHECKED = "signature_checked"
    PUBLISHER_CHECKED = "publisher_checked"
    PERMISSIONS_REVIEWED = "permissions_reviewed"
    GATES_REVIEWED = "gates_reviewed"
    GRANTED = "granted"
    ENABLED = "enabled"
    # Terminal failure states.
    REJECTED_BY_USER = "rejected_by_user"
    SIGNATURE_FAILED = "signature_failed"
    PUBLISHER_BLOCKED = "publisher_blocked"
    DEPENDENCY_MISSING = "dependency_missing"
    PERMISSION_DENIED = "permission_denied"
    SANDBOX_PROFILE_MISSING = "sandbox_profile_missing"


# Terminal failure states (no further transitions).
_TERMINAL_FAILURES: frozenset[CeremonyState] = frozenset(
    {
        CeremonyState.REJECTED_BY_USER,
        CeremonyState.SIGNATURE_FAILED,
        CeremonyState.PUBLISHER_BLOCKED,
        CeremonyState.DEPENDENCY_MISSING,
        CeremonyState.PERMISSION_DENIED,
        CeremonyState.SANDBOX_PROFILE_MISSING,
    }
)


@dataclass
class PermissionCard:
    """User-facing permission card rendered from the manifest.

    Frontend (Phase 12) reads this directly to render the install
    modal. The shape is locked here so Phase 12 can build against a
    stable contract.
    """

    module_id: str
    module_name: str
    publisher: str
    publisher_verified: bool
    signature_status: str
    visibility: str
    version: str
    capabilities: list[dict[str, Any]]
    data_movement_summary: dict[str, Any]
    gates: list[str]
    advice_tier_max: str
    audit_events: list[str]
    dependencies: list[dict[str, Any]] = field(default_factory=list)


@dataclass
class Ceremony:
    """One in-flight install ceremony.

    Phase 3 stores ceremonies in-process (no DB). Phase 4 may persist
    them when long-running install workflows need to survive worker
    restarts.
    """

    id: uuid.UUID
    module_id: str
    manifest: dict[str, Any]
    state: CeremonyState
    fast_path: bool
    permission_card: PermissionCard
    actor_user_id: uuid.UUID | None
    history: list[dict[str, Any]] = field(default_factory=list)


# In-process registry of ceremonies in flight. Phase 4 may move to a
# DB-backed table if ceremonies need to span workers.
_CEREMONIES: dict[uuid.UUID, Ceremony] = {}


def _aggregate_data_movement(manifest: dict[str, Any]) -> dict[str, Any]:
    """Aggregate every capability's data_movement into a single
    permission-card-shaped summary.

    Conservative: if ANY capability sends document bodies / binary /
    external network, the aggregate reports True. Frontend uses this
    to render a single "data leaving workspace" line.
    """
    sends_body = False
    sends_binary = False
    sends_metadata = False
    external_dests: set[str] = set()
    local_only = True
    for cap in manifest.get("capabilities") or []:
        dm = cap.get("data_movement") or {}
        sends_body = sends_body or bool(dm.get("sends_document_body"))
        sends_binary = sends_binary or bool(dm.get("sends_document_binary"))
        sends_metadata = sends_metadata or bool(dm.get("sends_matter_metadata"))
        for d in dm.get("external_destinations") or []:
            external_dests.add(d)
        if dm.get("local_only") is False:
            local_only = False
    if external_dests:
        local_only = False
    return {
        "sends_document_body": sends_body,
        "sends_document_binary": sends_binary,
        "sends_matter_metadata": sends_metadata,
        "external_destinations": sorted(external_dests),
        "local_only": local_only,
    }


def _aggregate_gates(manifest: dict[str, Any]) -> list[str]:
    """Union of every capability's gates."""
    gates: set[str] = set()
    for cap in manifest.get("capabilities") or []:
        for g in cap.get("gates") or []:
            if isinstance(g, str):
                gates.add(g)
    return sorted(gates)


def _aggregate_audit_events(manifest: dict[str, Any]) -> list[str]:
    """Union of every capability's declared audit_events."""
    events: set[str] = set()
    for cap in manifest.get("capabilities") or []:
        for e in cap.get("audit_events") or []:
            if isinstance(e, str):
                events.add(e)
    return sorted(events)


def _highest_tier(manifest: dict[str, Any]) -> str:
    """Highest declared advice_tier_max across the manifest's
    capabilities. Used to render the worst-case tier on the permission
    card so users see the ceiling at-a-glance."""
    order = (
        "factual_extraction",
        "legal_information",
        "draft_advice",
        "supervised_legal_advice",
        "approved_final_advice",
    )
    highest = "factual_extraction"
    for cap in manifest.get("capabilities") or []:
        tier = cap.get("advice_tier_max")
        if isinstance(tier, str) and order.index(tier) > order.index(highest):
            highest = tier
    return highest


def build_permission_card(manifest: dict[str, Any]) -> PermissionCard:
    """Build the user-facing permission card from a v2 manifest."""
    return PermissionCard(
        module_id=manifest.get("id", ""),
        module_name=manifest.get("name", ""),
        publisher=manifest.get("publisher", ""),
        publisher_verified=is_verified_publisher(
            manifest.get("publisher", "")
        ),
        signature_status="unknown",  # filled in by run_signature_check
        visibility=manifest.get("visibility", "community"),
        version=manifest.get("version", ""),
        capabilities=[
            {
                "id": cap.get("id"),
                "kind": cap.get("kind"),
                "scope": cap.get("scope"),
                "reads": list(cap.get("reads") or []),
                "writes": list(cap.get("writes") or []),
                "model_access": cap.get("model_access"),
                "external_network": cap.get("external_network"),
                "advice_tier_max": cap.get("advice_tier_max"),
                "ui_slot": (cap.get("ui") or {}).get("slot"),
            }
            for cap in manifest.get("capabilities") or []
        ],
        data_movement_summary=_aggregate_data_movement(manifest),
        gates=_aggregate_gates(manifest),
        advice_tier_max=_highest_tier(manifest),
        audit_events=_aggregate_audit_events(manifest),
        dependencies=list(manifest.get("requires") or []),
    )


async def _emit_state_transition(
    session: AsyncSession,
    *,
    ceremony: Ceremony,
    action: str,
    payload: dict[str, Any] | None = None,
) -> None:
    """Audit a ceremony state transition."""
    await audit_phase1(
        session,
        action=action,
        primitive="trust_ceremony",
        actor_id=ceremony.actor_user_id,
        module_id=ceremony.module_id,
        resource_type="install_ceremony",
        resource_id=str(ceremony.id),
        payload={
            "ceremony_id": str(ceremony.id),
            "state": ceremony.state.value,
            **(payload or {}),
        },
    )
    ceremony.history.append(
        {"state": ceremony.state.value, "action": action, "payload": payload}
    )


async def start_ceremony(
    session: AsyncSession,
    *,
    manifest: dict[str, Any],
    actor_user_id: uuid.UUID,
    signature: str | None = None,
) -> Ceremony:
    """Begin an install ceremony for a v2 manifest.

    Returns the initial ``Ceremony`` in either ``inspected`` (fast
    path candidate) or ``discovered`` (full path) state. The state
    encodes whether the verified-publisher fast path will be taken.

    Side effects: writes a ``module.discovered`` audit row before
    returning.
    """
    ceremony_id = uuid.uuid4()
    card = build_permission_card(manifest)
    # Signature check happens immediately so both paths see the same
    # signature_status field on the permission card.
    sig_result = verify_manifest_signature(manifest, signature=signature)
    card.signature_status = sig_result.status.value

    fast_path = (
        sig_result.status == SignatureStatus.VERIFIED
        and card.publisher_verified
    )

    ceremony = Ceremony(
        id=ceremony_id,
        module_id=manifest.get("id", ""),
        manifest=manifest,
        state=CeremonyState.DISCOVERED,
        fast_path=fast_path,
        permission_card=card,
        actor_user_id=actor_user_id,
    )
    _CEREMONIES[ceremony_id] = ceremony

    await _emit_state_transition(
        session,
        ceremony=ceremony,
        action="module.discovered",
        payload={
            "publisher": card.publisher,
            "publisher_verified": card.publisher_verified,
            "signature_status": card.signature_status,
            "fast_path": fast_path,
        },
    )
    return ceremony


async def advance_ceremony(
    session: AsyncSession,
    *,
    ceremony_id: uuid.UUID,
    action: str,
    actor_user_id: uuid.UUID,
) -> Ceremony:
    """Drive the ceremony state machine.

    ``action`` values:
    - ``"trust"`` — user accepts the permission card and continues
    - ``"reject"`` — user rejects; transitions to ``rejected_by_user``
    - ``"grant"`` — final commit; transitions to ``enabled``

    Returns the updated ceremony. Raises ``KeyError`` if the
    ``ceremony_id`` is unknown.
    """
    ceremony = _CEREMONIES.get(ceremony_id)
    if ceremony is None:
        raise KeyError(f"unknown ceremony {ceremony_id}")
    if ceremony.state in _TERMINAL_FAILURES or ceremony.state == CeremonyState.ENABLED:
        # Terminal — no further transitions.
        return ceremony

    if action == "reject":
        ceremony.state = CeremonyState.REJECTED_BY_USER
        await _emit_state_transition(
            session,
            ceremony=ceremony,
            action="module.denied",
            payload={"reason": "rejected_by_user"},
        )
        return ceremony

    # Normal progression. Fast path collapses several intermediate
    # states; full path walks all 7.
    next_state = _next_state(ceremony, action)
    ceremony.state = next_state
    audit_action = _audit_for_state(next_state)
    await _emit_state_transition(
        session,
        ceremony=ceremony,
        action=audit_action,
    )
    return ceremony


def _next_state(ceremony: Ceremony, action: str) -> CeremonyState:
    """Compute the next state given the current state + action."""
    current = ceremony.state
    fast = ceremony.fast_path

    if action == "grant":
        return CeremonyState.ENABLED

    # action == "trust" by default.
    if fast:
        # Fast path collapses inspected/signature_checked/
        # publisher_checked/permissions_reviewed into permission card
        # review; the user clicks "enable" once.
        if current == CeremonyState.DISCOVERED:
            return CeremonyState.PUBLISHER_CHECKED
        if current == CeremonyState.PUBLISHER_CHECKED:
            return CeremonyState.PERMISSIONS_REVIEWED
        if current == CeremonyState.PERMISSIONS_REVIEWED:
            return CeremonyState.GRANTED
        if current == CeremonyState.GRANTED:
            return CeremonyState.ENABLED
        return current

    # Full path walks all 7 states.
    if current == CeremonyState.DISCOVERED:
        return CeremonyState.INSPECTED
    if current == CeremonyState.INSPECTED:
        return CeremonyState.SIGNATURE_CHECKED
    if current == CeremonyState.SIGNATURE_CHECKED:
        return CeremonyState.PUBLISHER_CHECKED
    if current == CeremonyState.PUBLISHER_CHECKED:
        return CeremonyState.PERMISSIONS_REVIEWED
    if current == CeremonyState.PERMISSIONS_REVIEWED:
        return CeremonyState.GATES_REVIEWED
    if current == CeremonyState.GATES_REVIEWED:
        return CeremonyState.GRANTED
    if current == CeremonyState.GRANTED:
        return CeremonyState.ENABLED
    return current


def _audit_for_state(state: CeremonyState) -> str:
    """Map a target state to the canonical audit action name."""
    mapping = {
        CeremonyState.INSPECTED: "module.manifest.inspected",
        CeremonyState.SIGNATURE_CHECKED: "module.signature.checked",
        CeremonyState.PUBLISHER_CHECKED: "module.publisher.checked",
        CeremonyState.PERMISSIONS_REVIEWED: "module.permissions.reviewed",
        CeremonyState.GATES_REVIEWED: "module.permissions.reviewed",
        CeremonyState.GRANTED: "module.grant.created",
        CeremonyState.ENABLED: "module.enabled",
    }
    return mapping.get(state, "module.state_transition")


def get_ceremony(ceremony_id: uuid.UUID) -> Ceremony | None:
    """Read-only access to a ceremony for the HTTP handler."""
    return _CEREMONIES.get(ceremony_id)


def clear_ceremonies() -> None:
    """Test/admin helper — wipes the in-process registry."""
    _CEREMONIES.clear()


__all__ = [
    "CeremonyState",
    "PermissionCard",
    "Ceremony",
    "build_permission_card",
    "start_ceremony",
    "advance_ceremony",
    "get_ceremony",
    "clear_ceremonies",
]
