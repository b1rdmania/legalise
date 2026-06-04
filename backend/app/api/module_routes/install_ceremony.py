from __future__ import annotations

from fastapi import APIRouter

from .common import *  # noqa: F403


router = APIRouter()


@router.post(
    "/install",
    response_model=CeremonyResponse,
    status_code=status.HTTP_201_CREATED,
)
async def start_install_endpoint(
    body: StartInstallRequest,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> CeremonyResponse:
    """Begin a trust ceremony for installing a module.

    Admin-gated. Two source modes:
    - ``source="registry"``: install a discoverable module by id
    - ``source="manifest"``: install from an inline v2 manifest

    Returns the initial ceremony state + permission card. The
    frontend drives the ceremony to completion via
    ``POST /install/{id}/advance``.
    """
    require_admin(user, action_label="module install")

    if body.source == "registry":
        if not body.module_id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail={
                    "error": "missing_module_id",
                    "message": "source='registry' requires module_id",
                },
            )
        try:
            entry = load_manifest(body.module_id)
        except ManifestNotFoundError as exc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"error": "module_not_found", "message": str(exc)},
            )
        manifest = _entry_to_v2_manifest(entry)
    elif body.source == "manifest":
        if not body.manifest:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail={
                    "error": "missing_manifest",
                    "message": "source='manifest' requires manifest payload",
                },
            )
        manifest = body.manifest
    else:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={
                "error": "invalid_source",
                "message": (
                    f"source={body.source!r} not in 'registry' | 'manifest'"
                ),
            },
        )

    is_valid, errors = validate_manifest_v2(manifest)
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={
                "error": "invalid_manifest",
                "validation_errors": errors,
            },
        )

    # Enforce dependency resolution BEFORE the ceremony starts. The
    # 422 here is the canonical signal — there is no
    # CeremonyState.DEPENDENCY_MISSING terminal in the state machine.
    from app.core.dependency_resolver import resolve_dependencies

    resolution = await resolve_dependencies(manifest, session=session)
    if not resolution.is_satisfied:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={
                "error": "dependencies_unsatisfied",
                "resolution": resolution.to_dict(),
            },
        )

    ceremony = await start_ceremony(
        session,
        manifest=manifest,
        actor_user_id=user.id,
        signature=body.signature,
    )
    await session.commit()
    return _ceremony_to_response(ceremony)


@router.post(
    "/install/{ceremony_id}/advance",
    response_model=CeremonyResponse,
)
async def advance_install_endpoint(
    ceremony_id: UUID,
    body: AdvanceCeremonyRequest,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> CeremonyResponse:
    """Drive the trust ceremony state machine.

    Actions:
    - ``"trust"`` — accept and continue
    - ``"reject"`` — terminal: rejected_by_user
    - ``"grant"`` — final commit; persists InstalledModule + emits
      module.enabled
    """
    require_admin(user, action_label="module install")

    # Round-2 Reviewer P1#1: InvalidCeremonyTransition → 409 Conflict.
    # Prevents an admin from skipping straight to enabled via
    # ``action="grant"`` on a freshly-started ceremony.
    from app.core.trust_ceremony import InvalidCeremonyTransition

    try:
        ceremony = await advance_ceremony(
            session,
            ceremony_id=ceremony_id,
            action=body.action,
            actor_user_id=user.id,
        )
    except KeyError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error": "ceremony_not_found",
                "message": str(exc),
            },
        )
    except InvalidCeremonyTransition as exc:
        # Emit a module.ceremony.rejected audit row so bypass
        # attempts are observable in the reconstruction view.
        # Use audit_failure (independent committed session) because the
        # HTTPException below will roll back the request session.
        from app.core.api import audit_failure

        await audit_failure(
            session,
            "module.ceremony.rejected",
            actor_id=user.id,
            module="core.trust_ceremony",
            payload={
                "ceremony_id": str(ceremony_id),
                "requested_action": body.action,
                "reason": "invalid_transition",
                "message": str(exc),
            },
        )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "error": "invalid_ceremony_transition",
                "message": str(exc),
            },
        )

    # Round-2 Reviewer P2: persist only on the transition INTO enabled,
    # not on every poll of an already-enabled ceremony. Without this
    # guard a double-click on the final grant would attempt a second
    # insert and fail the UNIQUE (module_id, version) constraint.
    if ceremony.state == CeremonyState.ENABLED and not ceremony.persisted:
        await _persist_install(session, ceremony=ceremony, user=user)
        ceremony.persisted = True
    await session.commit()
    return _ceremony_to_response(ceremony)


@router.get(
    "/install/{ceremony_id}",
    response_model=CeremonyResponse,
)
async def get_install_endpoint(
    ceremony_id: UUID,
    user: User = Depends(current_user),
) -> CeremonyResponse:
    """Read the current state of an in-flight ceremony.

    Auth-gated (any authenticated user) so the install UI can poll
    without admin privileges. The advance endpoint remains admin-only.
    """
    ceremony = get_ceremony(ceremony_id)
    if ceremony is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error": "ceremony_not_found",
                "message": f"ceremony {ceremony_id} not found",
            },
        )
    return _ceremony_to_response(ceremony)
