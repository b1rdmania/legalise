"""Account-level endpoints — operations on the current user as an
account, not as a profile.

v0.1 only ships `DELETE /me` with the locked v0.1 policy:
    - if the user owns matters: 409 with `account_has_matters` (v0.2
      adds an export / delete-matter flow).
    - if the user owns no matters: soft-delete (deactivate + scrub
      editable profile fields), revoke every session, clear cookie.

Audit entries are NEVER cascade-deleted. The `actor_id` FK is nullable;
hard purge with `actor_id` anonymisation is a v0.2 background job.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import current_user
from app.core.config import settings
from app.core.db import get_session
from app.models import AccessToken, Matter, User


router = APIRouter()


@router.delete("/me", status_code=204)
async def delete_account(
    response: Response,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> Response:
    """Delete the current user's account.

    Refuses with 409 if any matter is owned by the user. v0.1 safety
    rail: a solicitor should not be able to delete their account and
    take an audit trail with them in one click. v0.2 will add a
    matter-export / matter-delete flow and an account-deletion
    workflow that walks through it.

    Otherwise soft-deletes: `is_active=False`, scrubbed name + posture,
    every access token for the user removed, session cookie cleared.
    Email + hashed_password are retained until a v0.2 background purge
    that anonymises actor_id on the audit log.
    """
    matter_count = (
        await session.scalar(
            select(func.count()).select_from(Matter).where(Matter.created_by_id == user.id)
        )
    ) or 0

    if matter_count > 0:
        raise HTTPException(
            status_code=409,
            detail={
                "error": "account_has_matters",
                "message": (
                    "This account owns matters. Export each matter via "
                    "POST /api/matters/{slug}/export, then delete it via "
                    "DELETE /api/matters/{slug}, then retry account deletion."
                ),
                "matter_count": matter_count,
            },
        )

    user.is_active = False
    user.name = ""
    user.default_model_id = None
    user.default_privilege_posture = None

    await session.execute(delete(AccessToken).where(AccessToken.user_id == user.id))
    await session.commit()

    response.delete_cookie(settings.session_cookie_name)
    response.status_code = 204
    return response
