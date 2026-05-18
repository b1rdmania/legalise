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
    audit.emit
"""

from __future__ import annotations

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
        "audit.emit",
    }
)


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
) -> None:
    """Raise CapabilityDenied if `(user, plugin, skill)` has not been
    granted `capability`. Returns None on success.

    Reads `workspace_skill_capability_grants` directly; index on
    `(user_id, plugin, skill)` keeps this a single point-lookup.
    """
    row = await session.scalar(
        select(WorkspaceSkillCapabilityGrant.id).where(
            WorkspaceSkillCapabilityGrant.user_id == user_id,
            WorkspaceSkillCapabilityGrant.plugin == plugin,
            WorkspaceSkillCapabilityGrant.skill == skill,
            WorkspaceSkillCapabilityGrant.capability == capability,
        )
    )
    if row is None:
        # Write an audit row for the denied attempt. Lazy import breaks the
        # cycle between `core.api` and this module.
        from app.core.api import audit

        await audit.log(
            session,
            "module.capability.denied",
            actor_id=user_id,
            module=plugin,
            resource_type="capability",
            resource_id=f"{plugin}:{skill}:{capability}",
            payload={
                "plugin": plugin,
                "skill": skill,
                "capability": capability,
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
) -> None:
    """Idempotent grant.

    Uses Postgres `ON CONFLICT DO NOTHING` on the composite unique key so
    concurrent grants and re-runs both no-op cleanly.
    """
    stmt = (
        pg_insert(WorkspaceSkillCapabilityGrant)
        .values(
            user_id=user_id,
            plugin=plugin,
            skill=skill,
            capability=capability,
            granted_by_user_id=granted_by_user_id,
        )
        .on_conflict_do_nothing(
            constraint="uq_capability_grants_user_plugin_skill_capability",
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


async def auto_grant_declared_for_user(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
) -> int:
    """Grant every declared capability of every installed plugin's skills
    to `user_id`. Returns the number of `(plugin, skill, capability)`
    triples written. Idempotent.

    v0.1 policy: declared = granted at signup. The Modules page lets the
    user revoke any time. v0.1.1 ships an explicit grant UI; until then
    the auto-grant keeps the user-visible workspace working end-to-end.
    """
    # Lazy imports break startup cycles; this module is imported very early.
    import json as _json

    from app.api.modules import _module_json_for, _skill_paths, _plugins_root

    root = _plugins_root()
    written = 0
    # Walk every SKILL.md found at PLUGINS_ROOT. Each one resolves to a
    # plugin's `module.json`; the declared `capabilities` list applies
    # to every skill under that plugin (the schema is plugin-level in
    # v0.1; per-skill capabilities ship with the next manifest revision).
    manifest_cache: dict[str, list[str]] = {}
    for path in _skill_paths():
        try:
            plugin, _, skill, _filename = path.relative_to(root).parts
        except ValueError:
            continue
        if plugin not in manifest_cache:
            mj_path = _module_json_for(path)
            if not mj_path.exists():
                manifest_cache[plugin] = []
                continue
            try:
                payload = _json.loads(mj_path.read_text(encoding="utf-8"))
            except (ValueError, OSError):
                manifest_cache[plugin] = []
                continue
            caps = payload.get("capabilities") if isinstance(payload, dict) else None
            manifest_cache[plugin] = (
                [c for c in caps if isinstance(c, str)]
                if isinstance(caps, list)
                else []
            )
        for capability in manifest_cache[plugin]:
            await grant(
                session,
                user_id=user_id,
                plugin=plugin,
                skill=skill,
                capability=capability,
            )
            written += 1
    return written


__all__ = [
    "CAPABILITY_VOCABULARY",
    "CapabilityDenied",
    "require_capability",
    "list_granted",
    "grant",
    "grant_many",
    "revoke",
    "auto_grant_declared_for_user",
]
