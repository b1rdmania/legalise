from __future__ import annotations

from fastapi import APIRouter

from .common import *  # noqa: F403


router = APIRouter()


@router.post(
    "/{module_id}/update",
    response_model=UpdateModuleResponse,
)
async def update_module_endpoint(
    module_id: str,
    body: UpdateModuleRequest,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> UpdateModuleResponse:
    """Update an installed module to a new manifest version.

    Runs detect_expansion against the previous installed_modules
    permissions_snapshot. If expansion is detected, starts a fresh
    trust ceremony so the user can re-grant. If no expansion, updates
    the row in place without ceremony.

    Admin-only.
    """
    require_admin(user, action_label="module update")

    # Find the most recent installed version.
    from sqlalchemy import desc as _desc

    existing = await session.scalar(
        select(InstalledModule)
        .where(InstalledModule.module_id == module_id)
        .order_by(_desc(InstalledModule.installed_at))
        .limit(1)
    )
    if existing is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error": "module_not_installed",
                "message": f"module {module_id!r} is not installed",
            },
        )

    new_manifest = body.new_manifest
    if new_manifest.get("id") != module_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={
                "error": "module_id_mismatch",
                "message": (
                    f"new_manifest.id={new_manifest.get('id')!r} "
                    f"does not match path module_id={module_id!r}"
                ),
            },
        )

    # Validate new manifest.
    is_valid, errors = validate_manifest_v2(new_manifest)
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={"error": "invalid_manifest", "validation_errors": errors},
        )

    # Round-2 Reviewer P1#3: enforce dependency resolution on update
    # too. An update can introduce new dependencies (or change
    # version ranges); we resolve them up-front the same way as
    # install does.
    from app.core.dependency_resolver import resolve_dependencies

    resolution = await resolve_dependencies(new_manifest, session=session)
    if not resolution.is_satisfied:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={
                "error": "dependencies_unsatisfied",
                "resolution": resolution.to_dict(),
            },
        )

    from app.core.grants_lifecycle import detect_expansion, requires_reprompt

    report = detect_expansion(
        existing.permissions_snapshot, new_manifest
    )
    if requires_reprompt(report):
        # Start a fresh trust ceremony for the re-grant flow.
        ceremony = await start_ceremony(
            session,
            manifest=new_manifest,
            actor_user_id=user.id,
            signature=body.signature,
        )
        await session.commit()
        return UpdateModuleResponse(
            module_id=module_id,
            new_version=new_manifest.get("version", ""),
            expansion_detected=True,
            expansion_report=report.to_dict(),
            ceremony_id=str(ceremony.id),
        )

    # No expansion — update the row directly.
    card = build_permission_card(new_manifest)
    existing.version = new_manifest.get("version", existing.version)
    existing.manifest_snapshot = new_manifest
    existing.permissions_snapshot = {
        "data_movement": card.data_movement_summary,
        "gates": card.gates,
        "advice_tier_max": card.advice_tier_max,
        "audit_events": card.audit_events,
        "capabilities": card.capabilities,
    }
    session.add(existing)

    from app.core.api import audit

    await audit.log(
        session,
        "module.updated",
        actor_id=user.id,
        module=module_id,
        resource_type="installed_module",
        resource_id=module_id,
        payload={
            "new_version": new_manifest.get("version"),
            "expansion_detected": False,
        },
    )
    await session.commit()
    return UpdateModuleResponse(
        module_id=module_id,
        new_version=new_manifest.get("version", ""),
        expansion_detected=False,
        expansion_report=report.to_dict(),
        ceremony_id=None,
    )
