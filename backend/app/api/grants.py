"""Per-matter, per-user grant endpoints.

Three endpoints under ``/api/matters/{slug}/grants``:

- ``POST``   — grant a capability on this matter (one capability per call).
- ``DELETE /{grant_id}`` — revoke a specific grant row.
- ``GET``    — list current grants on this matter, grouped by parent capability.

All three apply the strict matter-access predicate: matter owner OR
workspace superuser. A capability-grant on the matter does NOT, on its
own, satisfy access — granting your own authority is a privileged
surface; only the matter owner uses it.
"""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import current_user
from app.core.db import get_session
from app.core.grants_lifecycle import (
    CapabilityScopeUnsupported,
    create_grants_for_capability,
    revoke_grant,
)
from app.models import (
    InstalledModule,
    Matter,
    SCOPE_TYPE_MATTER,
    User,
    WorkspaceSkillCapabilityGrant,
)
from app.models.matter import STATUS_ARCHIVED


router = APIRouter()


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class GrantRequest(BaseModel):
    module_id: str
    capability_id: str


class GrantRow(BaseModel):
    id: str
    plugin: str
    skill: str
    capability: str
    scope_type: str
    scope_id: str | None
    granted_at: str | None = None


class GrantListResponse(BaseModel):
    matter_id: str
    grants: list[GrantRow]


class GrantCreateResponse(BaseModel):
    matter_id: str
    parent_capability_id: str
    module_id: str
    grants: list[GrantRow]
    was_idempotent_noop: bool


# ---------------------------------------------------------------------------
# Strict matter-access lookup — same shape as Phase 5 reconstruction
# ---------------------------------------------------------------------------


async def _load_matter_or_404(
    session: AsyncSession, *, slug: str, user: User
) -> Matter:
    matter = await session.scalar(
        select(Matter).where(
            Matter.slug == slug,
            Matter.created_by_id == user.id,
        )
    )
    if matter is None and user.is_superuser:
        matter = await session.scalar(
            select(Matter).where(Matter.slug == slug)
        )
    if matter is None or matter.status == STATUS_ARCHIVED:
        # Uniform 404 — never leak which matters exist for other users.
        raise HTTPException(
            status_code=404, detail=f"matter not found: {slug}"
        )
    return matter


def _row_to_payload(row: WorkspaceSkillCapabilityGrant) -> GrantRow:
    return GrantRow(
        id=str(row.id),
        plugin=row.plugin,
        skill=row.skill,
        capability=row.capability,
        scope_type=row.scope_type,
        scope_id=str(row.scope_id) if row.scope_id else None,
        granted_at=row.granted_at.isoformat() if row.granted_at else None,
    )


# ---------------------------------------------------------------------------
# POST /api/matters/{slug}/grants
# ---------------------------------------------------------------------------


@router.post(
    "/{slug}/grants",
    response_model=GrantCreateResponse,
)
async def create_grant_endpoint(
    slug: str,
    body: GrantRequest,
    response: Response,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> GrantCreateResponse:
    """Grant a capability on this matter to the calling user.

    The user grants capabilities to *themselves* — this endpoint
    intentionally has no cross-user variant (admin granting to
    another user is Phase 8+).

    Returns ``201`` on a write, ``200`` on an idempotent no-op.
    Per Phase 7 v2 Decision #4, the no-op path emits zero audit rows.
    """
    matter = await _load_matter_or_404(session, slug=slug, user=user)

    # The module must be installed AND enabled. We do NOT reuse the
    # 404 path for "not installed" vs "not enabled" — the former is
    # a 404, the latter a 409, so the client knows whether retrying
    # or chasing an admin is the right next step.
    installed = await session.scalar(
        select(InstalledModule).where(
            InstalledModule.module_id == body.module_id
        ).order_by(InstalledModule.installed_at.desc())
    )
    if installed is None:
        raise HTTPException(
            status_code=404,
            detail={
                "error": "module_not_installed",
                "module_id": body.module_id,
            },
        )
    if not installed.enabled:
        raise HTTPException(
            status_code=409,
            detail={
                "error": "module_disabled",
                "module_id": body.module_id,
                "message": (
                    "Module is installed but currently disabled. New "
                    "grants are blocked until an admin re-enables."
                ),
            },
        )

    try:
        result = await create_grants_for_capability(
            session,
            user=user,
            matter=matter,
            installed_module=installed,
            capability_id=body.capability_id,
        )
    except CapabilityScopeUnsupported as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={
                "error": "capability_scope_not_supported_here",
                "message": (
                    "POST /api/matters/{slug}/grants only accepts "
                    "matter-scope capabilities."
                ),
                "capability_id": exc.capability_id,
                "capability_scope": exc.capability_scope,
            },
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={
                "error": "capability_not_declared",
                "message": str(exc),
            },
        )

    await session.commit()

    response.status_code = (
        status.HTTP_200_OK
        if result.was_idempotent_noop
        else status.HTTP_201_CREATED
    )
    return GrantCreateResponse(
        matter_id=str(matter.id),
        parent_capability_id=result.parent_capability_id,
        module_id=body.module_id,
        grants=[_row_to_payload(r) for r in result.all_rows],
        was_idempotent_noop=result.was_idempotent_noop,
    )


# ---------------------------------------------------------------------------
# DELETE /api/matters/{slug}/grants/{grant_id}
# ---------------------------------------------------------------------------


@router.delete(
    "/{slug}/grants/{grant_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def revoke_grant_endpoint(
    slug: str,
    grant_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> Response:
    matter = await _load_matter_or_404(session, slug=slug, user=user)
    row = await revoke_grant(
        session, user=user, matter=matter, grant_id=grant_id
    )
    if row is None:
        # 404 — uniform across "wrong user", "wrong matter", "doesn't exist".
        raise HTTPException(
            status_code=404, detail=f"grant not found: {grant_id}"
        )
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# GET /api/matters/{slug}/grants
# ---------------------------------------------------------------------------


@router.get(
    "/{slug}/grants",
    response_model=GrantListResponse,
)
async def list_grants_endpoint(
    slug: str,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> GrantListResponse:
    matter = await _load_matter_or_404(session, slug=slug, user=user)
    rows = (
        await session.scalars(
            select(WorkspaceSkillCapabilityGrant)
            .where(
                WorkspaceSkillCapabilityGrant.user_id == user.id,
                WorkspaceSkillCapabilityGrant.scope_type == SCOPE_TYPE_MATTER,
                WorkspaceSkillCapabilityGrant.scope_id == matter.id,
            )
            .order_by(
                WorkspaceSkillCapabilityGrant.plugin,
                WorkspaceSkillCapabilityGrant.skill,
                WorkspaceSkillCapabilityGrant.capability,
            )
        )
    ).all()
    return GrantListResponse(
        matter_id=str(matter.id),
        grants=[_row_to_payload(r) for r in rows],
    )
