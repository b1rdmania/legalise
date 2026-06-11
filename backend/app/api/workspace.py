"""Workspace endpoints — per-user module lifecycle.

Enable/disable a `(plugin, skill)` pair for the current user — for
installed modules `plugin` carries the module_id. Absence in
`workspace_disabled_skills` means enabled (default); presence means
disabled. The assistant pipeline consults the same table when building
the runnable-skill menu.

Audit rows route through `audit.log()` with `module="module_lifecycle"`
so the Modules-page activity surfaces in the matter-agnostic audit
view (matter_id is null — these actions are workspace-wide, not
matter-scoped).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.api import audit
from app.core.auth import current_user
from app.core.db import get_session
from app.models import User, WorkspaceDisabledSkill


router = APIRouter()


def _safe_part(part: str) -> bool:
    return bool(part) and "/" not in part and not part.startswith(".") and part not in {".", ".."}


def _validate(plugin: str, skill: str) -> None:
    if not (_safe_part(plugin) and _safe_part(skill)):
        raise HTTPException(400, "invalid plugin or skill identifier")


@router.get("/disabled-skills")
async def list_disabled_skills(
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> dict:
    """Return the set of `(plugin, skill)` pairs disabled for the user."""
    rows = await session.scalars(
        select(WorkspaceDisabledSkill).where(WorkspaceDisabledSkill.user_id == user.id)
    )
    return {
        "disabled": [{"plugin": r.plugin, "skill": r.skill} for r in rows.all()],
    }


@router.post("/skills/{plugin}/{skill}/disable")
async def disable_skill(
    plugin: str,
    skill: str,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> dict:
    _validate(plugin, skill)
    existing = await session.scalar(
        select(WorkspaceDisabledSkill).where(
            WorkspaceDisabledSkill.user_id == user.id,
            WorkspaceDisabledSkill.plugin == plugin,
            WorkspaceDisabledSkill.skill == skill,
        )
    )
    if existing is None:
        session.add(
            WorkspaceDisabledSkill(user_id=user.id, plugin=plugin, skill=skill)
        )
        await audit.log(
            session,
            "module.skill.disabled",
            actor_id=user.id,
            module="module_lifecycle",
            resource_type="skill",
            resource_id=f"{plugin}:{skill}",
            payload={"plugin": plugin, "skill": skill},
        )
        await session.commit()
    return {"plugin": plugin, "skill": skill, "enabled": False}


@router.post("/skills/{plugin}/{skill}/enable")
async def enable_skill(
    plugin: str,
    skill: str,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> dict:
    _validate(plugin, skill)
    result = await session.execute(
        delete(WorkspaceDisabledSkill).where(
            WorkspaceDisabledSkill.user_id == user.id,
            WorkspaceDisabledSkill.plugin == plugin,
            WorkspaceDisabledSkill.skill == skill,
        )
    )
    if result.rowcount:
        await audit.log(
            session,
            "module.skill.enabled",
            actor_id=user.id,
            module="module_lifecycle",
            resource_type="skill",
            resource_id=f"{plugin}:{skill}",
            payload={"plugin": plugin, "skill": skill},
        )
        await session.commit()
    return {"plugin": plugin, "skill": skill, "enabled": True}
