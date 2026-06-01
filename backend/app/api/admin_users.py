"""Admin user role management.

Single endpoint:

  POST /api/admin/users/{user_id}/role

Body ``{role}``. Superuser-only. Same endpoint serves promotion AND
demotion. Self-promotion is forbidden. Idempotent — re-posting the
current role is a no-op (200, no audit row).

Closes the demo-role gap: a default ``solicitor`` user could not run any
module on a ``B_mixed`` matter; only a real superuser promotes via HTTP.

Audit shape: one row per actual change.

  action:    user.role.changed
  module:    core.admin_users
  actor_id:  the calling superuser
  payload:   {target_user_id, from_role, to_role, reason}

Reason is reserved for future structured codes (SRA roll lapse, manual
review, etc); currently stamped ``"manual_admin_action"``.
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


# Locked role vocabulary.
#
# Three tokens in active substrate use across the advice-boundary tiers
# and the posture gate. ``any_authenticated`` is a *requirement* token
# (the gate accepts any logged-in role); it is NOT a settable role on
# User. SRA-verified subclasses are deferred.
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


# Admin user list/detail DTO.
#
# NEVER returns password hashes, verification tokens, or reset tokens.
# The User model carries those fields; this DTO explicitly does not.
class UserAdminRead(BaseModel):
    id: str
    email: str
    role: str
    is_superuser: bool
    is_active: bool
    is_verified: bool
    name: str
    created_at: str | None = None  # User model may not have created_at; surface if present


def _row_to_admin_read(user: User) -> UserAdminRead:
    return UserAdminRead(
        id=str(user.id),
        email=user.email,
        role=user.role,
        is_superuser=user.is_superuser,
        is_active=user.is_active,
        is_verified=user.is_verified,
        name=user.name or "",
        created_at=(
            user.created_at.isoformat()
            if hasattr(user, "created_at") and user.created_at is not None
            else None
        ),
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


# ---------------------------------------------------------------------------
# Admin user list + detail
# ---------------------------------------------------------------------------


@router.get(
    "/users",
    response_model=list[UserAdminRead],
)
async def list_users_endpoint(
    role: str | None = None,
    is_superuser: bool | None = None,
    session: AsyncSession = Depends(get_session),
    caller: User = Depends(current_user),
) -> list[UserAdminRead]:
    """List users. Superuser-only.

    Optional query filters: ``role`` (one of the locked vocabulary
    tokens), ``is_superuser`` (true/false). No pagination — assumes
    <100 users per workspace; add pagination if that ceases to hold.
    """
    if not caller.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"error": "admin_required"},
        )

    stmt = select(User)
    if role is not None:
        if role not in ALLOWED_ROLES:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail={
                    "error": "invalid_role",
                    "supplied": role,
                    "allowed": sorted(ALLOWED_ROLES),
                },
            )
        stmt = stmt.where(User.role == role)
    if is_superuser is not None:
        stmt = stmt.where(User.is_superuser == is_superuser)
    stmt = stmt.order_by(User.created_at.desc())

    rows = (await session.scalars(stmt)).all()
    return [_row_to_admin_read(u) for u in rows]


@router.get(
    "/users/{user_id}",
    response_model=UserAdminRead,
)
async def get_user_endpoint(
    user_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    caller: User = Depends(current_user),
) -> UserAdminRead:
    """Read a single user by id. Superuser-only."""
    if not caller.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"error": "admin_required"},
        )
    target = await session.scalar(select(User).where(User.id == user_id))
    if target is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "user_not_found"},
        )
    return _row_to_admin_read(target)
