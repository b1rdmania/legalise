"""Auth router — mounts fastapi-users' built-in flows under `/auth`.

Routes (mounted at `/auth` in main.py):
- POST /auth/login                  — cookie login {username, password}
- POST /auth/logout                 — clears cookie
- POST /auth/register               — signup
- POST /auth/forgot-password
- POST /auth/reset-password
- POST /auth/request-verify-token
- POST /auth/verify
- GET  /auth/users/me               — current user
- PATCH /auth/users/me              — update current user

The frontend can call these directly. We keep fastapi-users' standard
names (login/logout/register) rather than aliasing to signin/signout —
matching upstream docs reduces surprise for self-hosters.

Abuse throttling: register, request-verify-token and forgot-password are
per-IP rate limited (Postgres sliding window — see app/core/rate_limit.py).
The fastapi-users routers are upstream factories, so the throttle rides in
as router-level dependencies; the verify and reset routers each bundle a
second route we do NOT throttle (/verify, /reset-password — both already
gated by a single-use token), so those dependencies match on path.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth_schemas import UserCreate, UserRead, UserUpdate
from app.core.auth import auth_backend, fastapi_users
from app.core.db import get_session
from app.core.rate_limit import enforce_ip_rate_limit

router = APIRouter()


async def _throttle_register(
    request: Request, session: AsyncSession = Depends(get_session)
) -> None:
    await enforce_ip_rate_limit(request, session, "auth.register")


async def _throttle_request_verify_token(
    request: Request, session: AsyncSession = Depends(get_session)
) -> None:
    # The verify router also serves POST /verify — token-gated, not throttled.
    if request.url.path.endswith("/request-verify-token"):
        await enforce_ip_rate_limit(request, session, "auth.request_verify_token")


async def _throttle_forgot_password(
    request: Request, session: AsyncSession = Depends(get_session)
) -> None:
    # The reset router also serves POST /reset-password — token-gated.
    if request.url.path.endswith("/forgot-password"):
        await enforce_ip_rate_limit(request, session, "auth.forgot_password")


router.include_router(
    fastapi_users.get_auth_router(auth_backend, requires_verification=True)
)
router.include_router(
    fastapi_users.get_register_router(UserRead, UserCreate),
    dependencies=[Depends(_throttle_register)],
)
router.include_router(
    fastapi_users.get_reset_password_router(),
    dependencies=[Depends(_throttle_forgot_password)],
)
router.include_router(
    fastapi_users.get_verify_router(UserRead),
    dependencies=[Depends(_throttle_request_verify_token)],
)
router.include_router(
    fastapi_users.get_users_router(UserRead, UserUpdate),
    prefix="/users",
)
