from __future__ import annotations

from fastapi import APIRouter

from .common import *  # noqa: F403


router = APIRouter()


@router.post(
    "/{module_id}/revoke",
    status_code=status.HTTP_200_OK,
)
async def revoke_module_endpoint(
    module_id: str,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> dict[str, Any]:
    """Disable an installed module and revoke all per-user grants
    associated with it. Admin-only.

    Disable is per the InstalledModule row's enabled flag (soft).
    Grants for the module's (plugin, *) are deleted hard so future
    require_capability calls fall through to denial.
    """
    require_admin(user, action_label="module revoke")

    installed_rows = (
        await session.scalars(
            select(InstalledModule).where(
                InstalledModule.module_id == module_id,
            )
        )
    ).all()
    if not installed_rows:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error": "module_not_installed",
                "message": f"module {module_id!r} is not installed",
            },
        )

    revoked_grants = 0
    for row in installed_rows:
        row.enabled = False
        session.add(row)
        # Revoke grants for this module's plugin namespace.
        # The plugin column on grants is the module identity from
        # the caller's perspective; for v2 installs that is the
        # module_id directly.
        grants = (
            await session.scalars(
                select(WorkspaceSkillCapabilityGrant).where(
                    WorkspaceSkillCapabilityGrant.plugin == module_id,
                )
            )
        ).all()
        for grant_row in grants:
            await session.delete(grant_row)
            revoked_grants += 1

    from app.core.api import audit

    await audit.log(
        session,
        "module.disabled",
        actor_id=user.id,
        module=module_id,
        resource_type="installed_module",
        resource_id=module_id,
        payload={"revoked_grants": revoked_grants},
    )
    if revoked_grants:
        await audit.log(
            session,
            "module.grant.revoked",
            actor_id=user.id,
            module=module_id,
            resource_type="capability_grant",
            resource_id=module_id,
            payload={"count": revoked_grants},
        )

    await session.commit()
    return {
        "module_id": module_id,
        "disabled_rows": len(installed_rows),
        "revoked_grants": revoked_grants,
    }
