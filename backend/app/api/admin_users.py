"""Phase 11 — admin user role management.

Single endpoint:

  POST /api/admin/users/{user_id}/role

Body ``{role}``. Superuser-only. Same endpoint serves promotion AND
demotion. Self-promotion forbidden. Idempotent — re-posting the
current role is a no-op (200, no audit row).

Closes the demo-role gap Phase 8 flagged: until this endpoint
existed, a default ``solicitor`` user could not run any module on
a ``B_mixed`` matter (the seeded Khan v Acme posture); only direct
DB mutation could promote them. After Phase 11 a real superuser
promotes via HTTP.

Audit shape: one row per actual change.

  action:    user.role.changed
  module:    core.admin_users
  actor_id:  the calling superuser
  payload:   {target_user_id, from_role, to_role, reason}

Reason is reserved for future structured codes (SRA roll lapse,
manual review, etc); Phase 11 stamps it ``"manual_admin_action"``.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.api import audit
from app.core.auth import current_user
from app.core.db import get_session
from app.models import User


router = APIRouter()


# Locked vocabulary — Phase 11 Decision #1.
#
# Three tokens in active substrate use across Phase 1 (advice-boundary
# tiers) and Phase 8 (posture gate). ``any_authenticated`` is a
# requirement token (the gate accepts any logged-in role); it is NOT a
# settable role on User. SRA-verified subclasses are deferred.
ALLOWED_ROLES: frozenset[str] = frozenset(
    {"solicitor", "qualified_solicitor", "workspace_admin"}
)


class RoleChangeRequest(BaseModel):
    role: str


class UserRoleOut(BaseModel):
    id: str
    email: str
    role: str
    is_superuser: bool


def _row_to_payload(user: User) -> UserRoleOut:
    return UserRoleOut(
        id=str(user.id),
        email=user.email,
        role=user.role,
        is_superuser=user.is_superuser,
    )


@router.post(
    "/users/{user_id}/role",
    response_model=UserRoleOut,
)
async def change_user_role_endpoint(
    user_id: uuid.UUID,
    body: RoleChangeRequest,
    session: AsyncSession = Depends(get_session),
    caller: User = Depends(current_user),
) -> UserRoleOut:
    # 1. Superuser-only.
    if not caller.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "admin_required",
                "message": (
                    "POST /api/admin/users/{id}/role requires superuser."
                ),
            },
        )

    # 2. Locked vocabulary — 422 with allowed list.
    if body.role not in ALLOWED_ROLES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={
                "error": "invalid_role",
                "supplied": body.role,
                "allowed": sorted(ALLOWED_ROLES),
            },
        )

    # 3. Target must exist.
    target = await session.scalar(select(User).where(User.id == user_id))
    if target is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "user_not_found"},
        )

    # 4. No self-promotion (Decision #2).
    if target.id == caller.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "self_promotion_forbidden",
                "message": (
                    "Superusers cannot change their own role via this "
                    "endpoint. Another superuser must act."
                ),
            },
        )

    # 5. Idempotent — same role is a no-op (200, no audit row).
    if target.role == body.role:
        return _row_to_payload(target)

    # 6. Mutate + audit.
    from_role = target.role
    target.role = body.role
    await audit.log(
        session,
        "user.role.changed",
        actor_id=caller.id,
        module="core.admin_users",
        resource_type="user",
        resource_id=str(target.id),
        payload={
            "target_user_id": str(target.id),
            "from_role": from_role,
            "to_role": body.role,
            "reason": "manual_admin_action",
        },
    )
    await session.commit()
    return _row_to_payload(target)
