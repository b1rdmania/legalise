"""Magic-link (passwordless email) auth routes.

Mounted at ``/auth/magic-link`` in ``app/main.py``:
- POST /auth/magic-link/request {email} — always 202, mints and emails a
  15-minute signed token (see app/core/magic_link.py). Throttled 5/IP/hour.
- POST /auth/magic-link/verify {token}  — decodes the token, gets or
  creates the user by email, logs them in via the same cookie/DB session
  strategy as every other login path (auth.user.logged_in gets audited
  by AuditingDatabaseStrategy exactly like password/OAuth login).

See ADR-012 for why account creation happens here rather than by reusing
UserManager.create().
"""

from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi_users.exceptions import UserNotExists
from pydantic import BaseModel, EmailStr
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.responses import Response

from app.core.auth import (
    UserManager,
    auth_backend,
    get_database_strategy,
    get_user_manager,
)
from app.core.config import settings
from app.core.db import get_session
from app.core.demand_capture import classify_email_domain
from app.core.email import send_magic_link
from app.core.magic_link import (
    InvalidMagicLinkToken,
    decode_magic_link_token,
    generate_magic_link_token,
)
from app.core.rate_limit import enforce_ip_rate_limit
from app.models import User

logger = structlog.get_logger()

router = APIRouter()


class MagicLinkRequest(BaseModel):
    email: EmailStr


class MagicLinkVerify(BaseModel):
    token: str


async def _throttle_magic_link_request(
    request: Request, session: AsyncSession = Depends(get_session)
) -> None:
    await enforce_ip_rate_limit(request, session, "auth.magic_link_request")


@router.post(
    "/request",
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(_throttle_magic_link_request)],
)
async def request_magic_link(body: MagicLinkRequest) -> dict:
    """Always 202, regardless of anything about the email. Unlike
    password reset, a magic link can create an account, so there's no
    meaningful "does this exist" distinction to leak either way."""
    token = generate_magic_link_token(body.email)
    link = f"{settings.magic_link_url_base}?token={token}"
    await send_magic_link(body.email, link)
    return {"detail": "If that's a valid email, a sign-in link is on its way."}


async def _create_user_for_magic_link(
    user_manager: UserManager, email: str, request: Request | None
) -> User:
    """Create a new account for a magic-link signup.

    Deliberately does NOT call UserManager.create() — that path's
    on_after_register hook unconditionally sends its own verification
    email in production, which would double-email someone who just
    proved ownership of this address by clicking the magic link that
    got them here. Mirrors the same steps by hand instead: a random
    unusable password (same shape OAuth-created accounts get — never
    sent anywhere, exists only so the column isn't empty), the same
    demand-capture email_domain/domain_class derivation, created
    already-verified, audited, and run through the same _post_verify
    side effects (seed demo matter) every other signup path gets.
    """
    password = user_manager.password_helper.generate()
    hashed_password = user_manager.password_helper.hash(password)
    domain, domain_class = classify_email_domain(email)
    user = await user_manager.user_db.create(
        {
            "email": email,
            "hashed_password": hashed_password,
            "is_active": True,
            "is_verified": True,
            "email_domain": domain,
            "domain_class": domain_class,
        }
    )

    logger.info("auth.user.registered", user_id=str(user.id))
    from app.core.api import audit

    await audit.log(
        user_manager.user_db.session,
        "auth.user.registered",
        actor_id=user.id,
        module="core.auth",
        resource_type="user",
        resource_id=str(user.id),
        payload={"method": "magic_link"},
    )
    await user_manager._maybe_promote_first_dev_user(user)
    # Cross-module reuse of UserManager's shared post-verify side effects
    # (seed demo matter, auth.user.verified audit row) — see its
    # docstring in app/core/auth.py, written explicitly to be shared
    # across signup paths that skip the on_after_verify hook.
    await user_manager._post_verify(user)
    return user


@router.post("/verify")
async def verify_magic_link(
    body: MagicLinkVerify,
    request: Request,
    user_manager: UserManager = Depends(get_user_manager),
    strategy=Depends(get_database_strategy),
) -> Response:
    try:
        email = decode_magic_link_token(body.token)
    except InvalidMagicLinkToken as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="MAGIC_LINK_INVALID_OR_EXPIRED"
        ) from exc

    try:
        user = await user_manager.get_by_email(email)
    except UserNotExists:
        user = await _create_user_for_magic_link(user_manager, email, request)

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="LOGIN_BAD_CREDENTIALS"
        )

    if not user.is_verified:
        # Existing-but-unverified account (registered by password, never
        # clicked the verification email) — clicking a magic link sent to
        # this address is equally valid proof of ownership.
        user = await user_manager.user_db.update(user, {"is_verified": True})
        await user_manager._post_verify(user)

    response = await auth_backend.login(strategy, user)
    await user_manager.on_after_login(user, request, response)
    return response
