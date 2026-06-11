"""Runtime capability enforcement.

Doctrine, locked at HANDOVER_LAUNCH_QA.md:

    Manifest requests capabilities. Workspace grants capabilities.
    Runtime enforces capabilities.

This module is the runtime half. Every privileged boundary that is
executed on behalf of a `(plugin, skill)` pair calls
`require_capability(...)`. Missing grant raises `CapabilityDenied`,
which `app.main` turns into a structured 403 and an audit row.

Capability vocabulary (locked, mirrors `schemas/module.json`):

    matter.read
    document.body.read
    document.generated.write
    model.invoke
    chronology.read
    chronology.write
    citation.write

Note: audit emission is not a capability. Audit is mandatory provenance
and is not gated by grants. Any code path that mutates state writes an
audit row unconditionally.
"""

from __future__ import annotations

import re
import uuid
from typing import Iterable

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import WorkspaceSkillCapabilityGrant


# Capability vocabulary. Mirrors the schema enum in `schemas/module.json`
# and the submissions allowlist. The runtime accepts any string and lets
# the absence of a grant deny — the vocabulary list is here for callers
# to import a single source of truth for the v0.1 set.
CAPABILITY_VOCABULARY: frozenset[str] = frozenset(
    {
        "matter.read",
        "document.body.read",
        "document.generated.write",
        "model.invoke",
        "chronology.read",
        "chronology.write",
        "citation.write",
    }
)


# v2 capability-grammar extension.
#
# v1 vocabulary above is a flat set of seven strings. v2 introduces a
# typed grammar ``<scope>.<resource>.<action>`` (with optional deeper
# segments for nested resources, e.g.
# ``matter.context.legalise_memory.facts.write``).
#
# Scope is one of ``matter``, ``workspace``, ``global``. Resource +
# action segments are lowercase identifiers using only [a-z0-9_].
#
# The runtime accepts either form. Existing v1 strings continue to
# validate via membership in CAPABILITY_VOCABULARY above; new modules
# declare v2 grammar strings.
#
# The grant table and ``require_capability`` lookup are not changed by
# this extension — the capability column is a free-form String(64).
# What changes is what callers will *write* as a capability string and
# what helpers like ``is_valid_capability_string`` consider syntactically
# valid.
_V2_GRAMMAR_RE = re.compile(
    r"^(matter|workspace|global)\.[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$"
)


def is_valid_capability_string(value: str) -> bool:
    """True if ``value`` is a valid capability string.

    Valid means either:
    - exact membership in ``CAPABILITY_VOCABULARY`` (v1 legacy set), or
    - matches the v2 grammar
      ``<scope>.<resource>.<action>`` with one or more action/resource
      segments. Scope is restricted to ``matter | workspace | global``.

    Returns False for empty/None/non-string input.
    """
    if not isinstance(value, str) or not value:
        return False
    if value in CAPABILITY_VOCABULARY:
        return True
    return bool(_V2_GRAMMAR_RE.match(value))


def assert_capability_string(value: str) -> None:
    """Raise ``ValueError`` if ``value`` is not a valid capability
    string. Used by registry validators when a module declares
    capabilities that the runtime should accept.
    """
    if not is_valid_capability_string(value):
        raise ValueError(
            f"invalid capability string: {value!r} "
            "(must be a legacy v1 capability or match "
            "the v2 grammar <scope>.<resource>.<action>)"
        )


def capability_scope(value: str) -> str | None:
    """Return the scope segment of a v2-grammar capability, or None for
    legacy v1 strings (which have no canonical scope).

    Examples:
    - ``capability_scope("matter.documents.body.read")`` → ``"matter"``
    - ``capability_scope("workspace.providers.invoke")`` → ``"workspace"``
    - ``capability_scope("matter.read")`` → ``None`` (legacy v1)
    """
    if value not in CAPABILITY_VOCABULARY and _V2_GRAMMAR_RE.match(value):
        return value.split(".", 1)[0]
    return None


def declared_capabilities_for_skill(
    module_payload: dict | None, skill: str
) -> list[str]:
    """Resolve declared capabilities for a `(plugin, skill)` pair.

    Per-skill `skills.<slug>.capabilities` overrides the plugin-level
    `capabilities` list when present. Skills absent from the `skills`
    map inherit plugin-level. Non-dict inputs return `[]`.

    Single source of truth for both the Modules listing endpoint and
    the signup auto-grant. Keeps the two in lock-step so what the
    user sees is exactly what the runtime grants.
    """
    if not isinstance(module_payload, dict):
        return []
    skills_map = module_payload.get("skills")
    if isinstance(skills_map, dict):
        override = skills_map.get(skill)
        if isinstance(override, dict) and "capabilities" in override:
            override_caps = override.get("capabilities")
            if isinstance(override_caps, list):
                return [c for c in override_caps if isinstance(c, str)]
            return []
    plugin_caps = module_payload.get("capabilities")
    if isinstance(plugin_caps, list):
        return [c for c in plugin_caps if isinstance(c, str)]
    return []


class CapabilityDenied(Exception):
    """A `(user, plugin, skill)` lacked the capability the runtime asked for.

    Carries all four fields so the HTTP handler can build the structured
    403 payload and the audit row without re-fetching anything.
    """

    def __init__(
        self,
        *,
        user_id: uuid.UUID,
        plugin: str,
        skill: str,
        capability: str,
    ) -> None:
        self.user_id = user_id
        self.plugin = plugin
        self.skill = skill
        self.capability = capability
        super().__init__(
            f"capability denied: user={user_id} {plugin}/{skill} cap={capability}"
        )


async def require_capability(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    plugin: str,
    skill: str,
    capability: str,
    matter_id: uuid.UUID | None = None,
) -> None:
    """Raise CapabilityDenied if ``(user, plugin, skill)`` has not been
    granted ``capability``. Returns None on success.

    Matter scoping (column-backed)
    ------------------------------
    Scope is now a first-class column pair on the grant row:
    ``scope_type`` ("workspace" or "matter") + ``scope_id``
    (matter UUID when scope_type='matter', NULL otherwise).
    Migration 0019 backfilled legacy grants from the old
    ``snapshot.matter_id`` JSONB shape, so this lookup never
    touches the snapshot.

    Two cases, strict:

    1. ``matter_id is None`` → workspace-broad check. Filter
       ``scope_type='workspace' AND scope_id IS NULL``. Matter-
       scoped grants do NOT satisfy a workspace-broad check.
    2. ``matter_id`` is set → matter-scoped check. Filter
       ``scope_type='matter' AND scope_id=matter_id``. Workspace-
       broad grants do NOT satisfy a matter-scoped check.

    These two are mutually exclusive — the runtime never accepts
    "any grant regardless of scope". The caller decides which check
    applies (by passing matter_id or not); the grant row records
    which scope it was issued at; the SQL enforces exact alignment.

    Reads ``workspace_skill_capability_grants``; the partial-shape
    index ``ix_grant_user_plugin_skill_scope`` keeps this a
    single point-lookup.
    """
    from app.models import SCOPE_TYPE_MATTER, SCOPE_TYPE_WORKSPACE

    stmt = select(WorkspaceSkillCapabilityGrant.id).where(
        WorkspaceSkillCapabilityGrant.user_id == user_id,
        WorkspaceSkillCapabilityGrant.plugin == plugin,
        WorkspaceSkillCapabilityGrant.skill == skill,
        WorkspaceSkillCapabilityGrant.capability == capability,
    )
    if matter_id is None:
        stmt = stmt.where(
            WorkspaceSkillCapabilityGrant.scope_type == SCOPE_TYPE_WORKSPACE,
            WorkspaceSkillCapabilityGrant.scope_id.is_(None),
        )
    else:
        stmt = stmt.where(
            WorkspaceSkillCapabilityGrant.scope_type == SCOPE_TYPE_MATTER,
            WorkspaceSkillCapabilityGrant.scope_id == matter_id,
        )
    row = await session.scalar(stmt)
    if row is None:
        # Write an audit row for the denied attempt. Lazy import breaks the
        # cycle between `core.api` and this module.
        from app.core.api import audit

        await audit.log(
            session,
            "module.capability.denied",
            actor_id=user_id,
            matter_id=matter_id,
            module=plugin,
            resource_type="capability",
            resource_id=f"{plugin}:{skill}:{capability}",
            payload={
                "plugin": plugin,
                "skill": skill,
                "capability": capability,
                "matter_id": str(matter_id) if matter_id is not None else None,
                "scope": "matter" if matter_id is not None else "workspace",
            },
        )
        # Commit the audit row before raising so the denial is persisted
        # even when the FastAPI handler converts the exception to a 403
        # without finishing the request handler's own commit. The audit
        # log is provenance — losing it on the failure path is worse
        # than the small cost of an extra commit on the slow path.
        try:
            await session.commit()
        except Exception:
            # Some call sites run inside an outer test SAVEPOINT or have
            # no commit semantics. Swallow rather than mask the denial.
            await session.rollback()
        raise CapabilityDenied(
            user_id=user_id, plugin=plugin, skill=skill, capability=capability
        )


async def list_granted(
    session: AsyncSession,
    user_id: uuid.UUID,
    plugin: str,
    skill: str,
) -> set[str]:
    """Return the set of capability slugs granted to this triple."""
    rows = await session.scalars(
        select(WorkspaceSkillCapabilityGrant.capability).where(
            WorkspaceSkillCapabilityGrant.user_id == user_id,
            WorkspaceSkillCapabilityGrant.plugin == plugin,
            WorkspaceSkillCapabilityGrant.skill == skill,
        )
    )
    return set(rows.all())


async def grant(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    plugin: str,
    skill: str,
    capability: str,
    granted_by_user_id: uuid.UUID | None = None,
    scope_type: str | None = None,
    scope_id: uuid.UUID | None = None,
) -> None:
    """Idempotent grant.

    Uses Postgres `ON CONFLICT DO NOTHING` on the new composite
    unique key ``(user_id, plugin, skill, capability, scope_type,
    scope_id)`` so concurrent grants and re-runs both no-op cleanly.

    ``scope_type`` and ``scope_id`` default to workspace scope so
    existing callers (auto-grant at signup, legacy workflows) keep
    behaving identically. Matter-scoped grant endpoints pass
    ``scope_type='matter', scope_id=matter.id`` explicitly.
    """
    from app.models import SCOPE_TYPE_MATTER, SCOPE_TYPE_WORKSPACE

    effective_scope_type = scope_type or SCOPE_TYPE_WORKSPACE
    effective_scope_id = scope_id if effective_scope_type == SCOPE_TYPE_MATTER else None
    stmt = (
        pg_insert(WorkspaceSkillCapabilityGrant)
        .values(
            user_id=user_id,
            plugin=plugin,
            skill=skill,
            capability=capability,
            granted_by_user_id=granted_by_user_id,
            scope_type=effective_scope_type,
            scope_id=effective_scope_id,
        )
        .on_conflict_do_nothing(
            constraint="uq_grant_user_plugin_skill_cap_scope",
        )
    )
    await session.execute(stmt)


async def grant_many(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    plugin: str,
    skill: str,
    capabilities: Iterable[str],
    granted_by_user_id: uuid.UUID | None = None,
) -> None:
    """Idempotent bulk grant. No-op on empty iterable."""
    for capability in capabilities:
        await grant(
            session,
            user_id=user_id,
            plugin=plugin,
            skill=skill,
            capability=capability,
            granted_by_user_id=granted_by_user_id,
        )


async def revoke(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    plugin: str,
    skill: str,
    capability: str,
) -> None:
    """Remove a grant. No-op if not present."""
    row = await session.scalar(
        select(WorkspaceSkillCapabilityGrant).where(
            WorkspaceSkillCapabilityGrant.user_id == user_id,
            WorkspaceSkillCapabilityGrant.plugin == plugin,
            WorkspaceSkillCapabilityGrant.skill == skill,
            WorkspaceSkillCapabilityGrant.capability == capability,
        )
    )
    if row is None:
        return
    await session.delete(row)


__all__ = [
    "CAPABILITY_VOCABULARY",
    "CapabilityDenied",
    "assert_capability_string",
    "capability_scope",
    "declared_capabilities_for_skill",
    "is_valid_capability_string",
    "require_capability",
    "list_granted",
    "grant",
    "grant_many",
    "revoke",
]
