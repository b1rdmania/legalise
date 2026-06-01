"""Grant lifecycle — permission expansion detection.

When a module is updated to a new version, we diff the new manifest's
permission shape against the previously-installed permission shape.
Expansion (e.g. new write capability, higher advice tier, network
flipped on) requires re-prompting the user via the trust ceremony.
Non-expansion updates (e.g. version bump with identical permissions)
can update the installed_modules row directly without ceremony.

Pure-functional diff — no DB writes here. The caller (the update
endpoint in api/modules.py) consumes the ExpansionReport and decides
how to proceed.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.advice_boundary.tiers import ADVICE_TIER_FACTUAL_EXTRACTION, tier_rank


# Ordering of model_access strictness — increases count as
# expansion (none < optional < required < delegated).
_MODEL_ACCESS_ORDER = {
    "none": 0,
    "optional": 1,
    "delegated": 2,
    "required": 3,
}


@dataclass
class ExpansionReport:
    """Structured diff between an old permissions snapshot and a new
    one. Populated by ``detect_expansion``."""

    reads_added: list[str] = field(default_factory=list)
    writes_added: list[str] = field(default_factory=list)
    tier_raised: tuple[str, str] | None = None  # (old_tier, new_tier)
    external_network_added: bool = False
    new_destinations: list[str] = field(default_factory=list)
    new_gates_added: list[str] = field(default_factory=list)
    new_gates_removed: list[str] = field(default_factory=list)
    model_access_raised: tuple[str, str] | None = None

    @property
    def any_expansion(self) -> bool:
        """True if ANY of the expansion dimensions changed."""
        return any(
            [
                bool(self.reads_added),
                bool(self.writes_added),
                self.tier_raised is not None,
                self.external_network_added,
                bool(self.new_destinations),
                bool(self.new_gates_added),
                self.model_access_raised is not None,
            ]
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "reads_added": self.reads_added,
            "writes_added": self.writes_added,
            "tier_raised": (
                {"from": self.tier_raised[0], "to": self.tier_raised[1]}
                if self.tier_raised
                else None
            ),
            "external_network_added": self.external_network_added,
            "new_destinations": self.new_destinations,
            "new_gates_added": self.new_gates_added,
            "new_gates_removed": self.new_gates_removed,
            "model_access_raised": (
                {"from": self.model_access_raised[0], "to": self.model_access_raised[1]}
                if self.model_access_raised
                else None
            ),
            "any_expansion": self.any_expansion,
        }


def _flatten_capability_strings(snapshot: dict, key: str) -> set[str]:
    """Return the union of ``capability[key]`` strings across all
    capabilities in a permissions snapshot."""
    out: set[str] = set()
    for cap in snapshot.get("capabilities") or []:
        for value in cap.get(key) or []:
            if isinstance(value, str):
                out.add(value)
    return out


def _highest_tier(snapshot: dict) -> str:
    """Highest advice_tier_max across the snapshot's capabilities.

    Round-2 Reviewer P1#2: previously this only read the top-level
    ``advice_tier_max`` key. Aggregated InstalledModule snapshots
    (built by ``trust_ceremony.build_permission_card``) have the
    top-level key — but raw v2 manifests passed directly into
    ``detect_expansion`` (e.g. from ``update_module_endpoint``) carry
    tier per-capability with no top-level rollup. Without the
    capability scan, a manifest update from ``draft_advice`` to
    ``supervised_legal_advice`` would silently NOT trigger
    re-prompt. Now we scan capabilities and take the max regardless
    of which shape the snapshot is in.
    """
    candidates: list[str] = []
    top_level = snapshot.get("advice_tier_max")
    if isinstance(top_level, str):
        candidates.append(top_level)
    for cap in snapshot.get("capabilities") or []:
        tier = cap.get("advice_tier_max")
        if isinstance(tier, str):
            candidates.append(tier)
    if not candidates:
        return ADVICE_TIER_FACTUAL_EXTRACTION
    return max(candidates, key=tier_rank)


def _max_model_access(snapshot: dict) -> str:
    """Most strict model_access across the snapshot."""
    levels = [
        cap.get("model_access", "none")
        for cap in snapshot.get("capabilities") or []
    ]
    if not levels:
        return "none"
    return max(levels, key=lambda v: _MODEL_ACCESS_ORDER.get(v, 0))


def _any_external_network(snapshot: dict) -> bool:
    """True if ANY capability has external_network=True."""
    for cap in snapshot.get("capabilities") or []:
        if cap.get("external_network") is True:
            return True
    return False


def _all_destinations(snapshot: dict) -> set[str]:
    """Union of all external_destinations from data_movement
    summaries + individual capability data_movement blocks."""
    out: set[str] = set()
    # Top-level summary (set by trust_ceremony.build_permission_card).
    summary = snapshot.get("data_movement") or {}
    for d in summary.get("external_destinations") or []:
        if isinstance(d, str):
            out.add(d)
    # Per-capability data_movement (raw manifest shape).
    for cap in snapshot.get("capabilities") or []:
        dm = cap.get("data_movement") or {}
        for d in dm.get("external_destinations") or []:
            if isinstance(d, str):
                out.add(d)
    return out


def _all_gates(snapshot: dict) -> set[str]:
    """Union of gates declared across capabilities OR the top-level
    snapshot gates list."""
    out: set[str] = set()
    for g in snapshot.get("gates") or []:
        if isinstance(g, str):
            out.add(g)
    for cap in snapshot.get("capabilities") or []:
        for g in cap.get("gates") or []:
            if isinstance(g, str):
                out.add(g)
    return out


def detect_expansion(
    old_snapshot: dict[str, Any],
    new_snapshot: dict[str, Any],
) -> ExpansionReport:
    """Diff two permission snapshots and return a structured report.

    Either snapshot can come from ``InstalledModule.permissions_snapshot``
    (the aggregated trust-ceremony output) or from a raw manifest's
    capabilities array. The diff helpers tolerate both shapes.
    """
    old_reads = _flatten_capability_strings(old_snapshot, "reads")
    new_reads = _flatten_capability_strings(new_snapshot, "reads")
    reads_added = sorted(new_reads - old_reads)

    old_writes = _flatten_capability_strings(old_snapshot, "writes")
    new_writes = _flatten_capability_strings(new_snapshot, "writes")
    writes_added = sorted(new_writes - old_writes)

    old_tier = _highest_tier(old_snapshot)
    new_tier = _highest_tier(new_snapshot)
    tier_raised: tuple[str, str] | None = None
    if tier_rank(new_tier) > tier_rank(old_tier):
        tier_raised = (old_tier, new_tier)

    old_network = _any_external_network(old_snapshot)
    new_network = _any_external_network(new_snapshot)
    network_added = new_network and not old_network

    old_dests = _all_destinations(old_snapshot)
    new_dests = _all_destinations(new_snapshot)
    new_destinations = sorted(new_dests - old_dests)

    old_gates = _all_gates(old_snapshot)
    new_gates = _all_gates(new_snapshot)
    new_gates_added = sorted(new_gates - old_gates)
    new_gates_removed = sorted(old_gates - new_gates)

    old_ma = _max_model_access(old_snapshot)
    new_ma = _max_model_access(new_snapshot)
    model_access_raised: tuple[str, str] | None = None
    if _MODEL_ACCESS_ORDER.get(new_ma, 0) > _MODEL_ACCESS_ORDER.get(old_ma, 0):
        model_access_raised = (old_ma, new_ma)

    return ExpansionReport(
        reads_added=reads_added,
        writes_added=writes_added,
        tier_raised=tier_raised,
        external_network_added=network_added,
        new_destinations=new_destinations,
        new_gates_added=new_gates_added,
        new_gates_removed=new_gates_removed,
        model_access_raised=model_access_raised,
    )


def requires_reprompt(report: ExpansionReport) -> bool:
    """True if the expansion is material enough to require a fresh
    trust ceremony.

    Current policy: any expansion at all triggers re-prompt. May
    relax later for low-risk dimensions (e.g. gate removal alone
    might be OK; new audit_events alone is fine).
    """
    return report.any_expansion


# ---------------------------------------------------------------------------
# Grant creation / revocation helpers used by /api/matters/{slug}/grants
# ---------------------------------------------------------------------------


class CapabilityScopeUnsupported(Exception):
    """Raised when a matter-scoped grant is requested for a capability
    whose manifest declares ``scope: workspace`` or ``scope: global``.

    The matter-scoped endpoint must refuse to silently create
    workspace authority. The API layer catches this and returns
    HTTP 422 with the structured error code
    ``capability_scope_not_supported_here``.
    """

    def __init__(self, capability_id: str, capability_scope: str) -> None:
        self.capability_id = capability_id
        self.capability_scope = capability_scope
        super().__init__(
            f"capability {capability_id!r} has scope {capability_scope!r}; "
            f"matter-scoped grant endpoint accepts 'matter' scope only"
        )


@dataclass
class GrantCreationResult:
    """What ``create_grants_for_capability`` returns.

    Splits newly-written rows from already-existing rows so the
    endpoint knows whether to emit ``module.grant.created`` audit
    rows (idempotent no-op emits no audit). ``all_rows`` is the
    full set the client should see in the response.
    """

    created: list  # newly-inserted WorkspaceSkillCapabilityGrant rows
    existing: list  # rows that were already present
    parent_capability_id: str

    @property
    def all_rows(self) -> list:
        return [*self.created, *self.existing]

    @property
    def was_idempotent_noop(self) -> bool:
        return not self.created


def _find_capability_declaration(
    manifest: dict[str, Any], capability_id: str
) -> dict[str, Any] | None:
    """Locate the capability declaration in a v2 manifest snapshot.

    The snapshot stored on InstalledModule.manifest_snapshot mirrors
    the original module.json. Returns the inner dict or None.
    """
    for cap in manifest.get("capabilities") or []:
        if cap.get("id") == capability_id:
            return cap
    return None


async def create_grants_for_capability(
    session: AsyncSession,
    *,
    user,
    matter,
    installed_module,
    capability_id: str,
) -> GrantCreationResult:
    """Create per-user, matter-scoped grants for every capability
    string declared in a capability's reads + writes.

    Idempotent on ``(user, plugin, skill, capability, scope_type='matter', scope_id=matter.id)``
    via the composite unique constraint.

    Raises ``CapabilityScopeUnsupported`` if the capability's manifest
    declaration is anything other than ``scope: matter`` — matter
    endpoints must not produce workspace/global authority.

    The grants the user-facing surface depends on are:
    - One row per capability string in ``capability.reads``
    - One row per capability string in ``capability.writes``

    Each row carries ``granted_permissions_snapshot`` for provenance
    (matter_id, parent capability_id, the reads/writes the user
    accepted at grant time) so audit reconstruction has the full
    context.

    The function does NOT commit. The caller commits — keeps the
    grant write in the same transaction as the audit emission.
    """
    from app.models import (
        SCOPE_TYPE_MATTER,
        WorkspaceSkillCapabilityGrant,
    )

    manifest = installed_module.manifest_snapshot or {}
    capability = _find_capability_declaration(manifest, capability_id)
    if capability is None:
        raise ValueError(
            f"capability {capability_id!r} not declared in module "
            f"{installed_module.module_id!r} v{installed_module.version}"
        )
    capability_scope = capability.get("scope", "workspace")
    if capability_scope != SCOPE_TYPE_MATTER:
        raise CapabilityScopeUnsupported(
            capability_id=capability_id, capability_scope=capability_scope
        )

    capability_strings: list[str] = []
    for c in capability.get("reads") or []:
        if isinstance(c, str):
            capability_strings.append(c)
    for c in capability.get("writes") or []:
        if isinstance(c, str):
            capability_strings.append(c)

    plugin = installed_module.module_id
    skill = capability_id  # convention: skill column carries the parent capability id
    module_version = installed_module.version
    manifest_schema_version = manifest.get("schema_version")

    created: list = []
    existing: list = []
    for cap_string in capability_strings:
        existing_row = await session.scalar(
            select(WorkspaceSkillCapabilityGrant).where(
                WorkspaceSkillCapabilityGrant.user_id == user.id,
                WorkspaceSkillCapabilityGrant.plugin == plugin,
                WorkspaceSkillCapabilityGrant.skill == skill,
                WorkspaceSkillCapabilityGrant.capability == cap_string,
                WorkspaceSkillCapabilityGrant.scope_type == SCOPE_TYPE_MATTER,
                WorkspaceSkillCapabilityGrant.scope_id == matter.id,
            )
        )
        if existing_row is not None:
            existing.append(existing_row)
            continue
        new_row = WorkspaceSkillCapabilityGrant(
            id=uuid.uuid4(),
            user_id=user.id,
            plugin=plugin,
            skill=skill,
            capability=cap_string,
            granted_by_user_id=user.id,
            capability_version=manifest_schema_version,
            granted_at_module_version=module_version,
            granted_permissions_snapshot={
                "matter_id": str(matter.id),
                "capability_id": capability_id,
                "parent_reads": capability.get("reads") or [],
                "parent_writes": capability.get("writes") or [],
            },
            scope_type=SCOPE_TYPE_MATTER,
            scope_id=matter.id,
        )
        session.add(new_row)
        created.append(new_row)
    if created:
        await session.flush()

    # Emit module.grant.created ONLY for newly-written rows. An
    # idempotent no-op POST must not produce duplicate audit rows —
    # repeated grant attempts would otherwise flood the trail.
    if created:
        from app.core.api import audit

        for row in created:
            await audit.log(
                session,
                "module.grant.created",
                actor_id=user.id,
                matter_id=matter.id,
                module=plugin,
                resource_type="capability_grant",
                resource_id=str(row.id),
                payload={
                    "module_id": plugin,
                    "capability_id": capability_id,
                    "granted_capability": row.capability,
                    "scope_type": SCOPE_TYPE_MATTER,
                    "scope_id": str(matter.id),
                    "module_version": module_version,
                },
            )

    return GrantCreationResult(
        created=created,
        existing=existing,
        parent_capability_id=capability_id,
    )


async def revoke_grant(
    session: AsyncSession,
    *,
    user,
    matter,
    grant_id: uuid.UUID,
):
    """Revoke a single per-user grant by row id.

    Returns the deleted row, or None if no row with that id exists,
    belongs to the user, AND is scoped to the given matter. The
    triple check is what stops a user from revoking another user's
    grant or a grant on a different matter — the endpoint relies on
    None to translate to 404.

    Emits ``module.grant.revoked`` on success. Does not commit.
    """
    from app.models import (
        SCOPE_TYPE_MATTER,
        WorkspaceSkillCapabilityGrant,
    )

    row = await session.scalar(
        select(WorkspaceSkillCapabilityGrant).where(
            WorkspaceSkillCapabilityGrant.id == grant_id,
            WorkspaceSkillCapabilityGrant.user_id == user.id,
            WorkspaceSkillCapabilityGrant.scope_type == SCOPE_TYPE_MATTER,
            WorkspaceSkillCapabilityGrant.scope_id == matter.id,
        )
    )
    if row is None:
        return None

    plugin = row.plugin
    capability_id = (row.granted_permissions_snapshot or {}).get(
        "capability_id"
    )
    granted_capability = row.capability

    await session.delete(row)
    await session.flush()

    from app.core.api import audit

    await audit.log(
        session,
        "module.grant.revoked",
        actor_id=user.id,
        matter_id=matter.id,
        module=plugin,
        resource_type="capability_grant",
        resource_id=str(grant_id),
        payload={
            "module_id": plugin,
            "capability_id": capability_id,
            "granted_capability": granted_capability,
            "scope_type": SCOPE_TYPE_MATTER,
            "scope_id": str(matter.id),
            "reason": "explicit_revoke",
        },
    )
    return row


__all__ = [
    "CapabilityScopeUnsupported",
    "ExpansionReport",
    "GrantCreationResult",
    "create_grants_for_capability",
    "detect_expansion",
    "requires_reprompt",
    "revoke_grant",
]
