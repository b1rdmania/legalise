"""Auth — fastapi-users with cookie transport + DatabaseStrategy.

Replaces the v0.1 stub. `current_user` now reads the session cookie,
resolves the access token against the `access_token` table, and returns
the real User row. Cookie-less / failed-auth requests get 401.

Public-without-auth endpoints (health, modules catalogue, marketing
surface) must NOT depend on `current_user`. Use `optional_current_user`
where you need actor resolution without forcing 401 (audit middleware).
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from typing import Annotated

import structlog
from fastapi import Depends, Request
from fastapi_users import BaseUserManager, FastAPIUsers, UUIDIDMixin
from fastapi_users.authentication import AuthenticationBackend, CookieTransport
from fastapi_users.authentication.strategy.db import (
    AccessTokenDatabase,
    DatabaseStrategy,
)
from fastapi_users_db_sqlalchemy import SQLAlchemyUserDatabase
from fastapi_users_db_sqlalchemy.access_token import SQLAlchemyAccessTokenDatabase
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.db import get_session
from app.core.email import send_password_reset, send_verification
from app.core.seed import seed_demo_matter_for_user
from app.models import AccessToken, User

logger = structlog.get_logger()


# --- Database adapters ------------------------------------------------------


async def get_user_db(
    session: AsyncSession = Depends(get_session),
) -> AsyncIterator[SQLAlchemyUserDatabase]:
    yield SQLAlchemyUserDatabase(session, User)


async def get_access_token_db(
    session: AsyncSession = Depends(get_session),
) -> AsyncIterator[SQLAlchemyAccessTokenDatabase]:
    yield SQLAlchemyAccessTokenDatabase(session, AccessToken)


# --- User manager -----------------------------------------------------------


class UserManager(UUIDIDMixin, BaseUserManager[User, uuid.UUID]):
    """Hooks for signup, verify, reset. Sends emails via Resend."""

    reset_password_token_secret = settings.session_secret
    verification_token_secret = settings.session_secret

    async def on_after_register(self, user: User, request: Request | None = None) -> None:
        # Never log raw email — PII.
        # user_id is the durable handle; admins join via the users table.
        logger.info("auth.user.registered", user_id=str(user.id))
        # Dev-only escape hatch: skip the email loop and mark verified on
        # register. Otherwise local signup→login is impossible without
        # standing up Resend just to test. Production environments always
        # require the real verification flow.
        from app.core.config import settings as _settings
        if _settings.environment in {"development", "dev", "local"}:
            user.is_verified = True
            await self.user_db.update(user, {"is_verified": True})
            logger.info("auth.dev_autoverify", user_id=str(user.id))
            # Dev autoverify bypasses on_after_verify, so run the same
            # post-verify side effects here. Day D: seed Khan under the
            # new user so the workspace is populated on first sign-in.
            await self._post_verify(user)
            return
        # Send verification email. We intentionally do NOT swallow
        # exceptions here. With requires_verification=True, a silent
        # email failure creates an unverified user who can register but
        # never log in. Bubbling the error means register fails with a
        # 5xx the operator can see — and assert_auth_secrets_present
        # already refuses to boot in production without RESEND_API_KEY,
        # so the only path that can hit this is a transient provider
        # outage, which is the right thing to surface.
        await self.request_verify(user, request)

    async def on_after_request_verify(
        self, user: User, token: str, request: Request | None = None
    ) -> None:
        link = f"{settings.email_verify_url_base}?token={token}"
        await send_verification(user.email, link)

    async def on_after_verify(self, user: User, request: Request | None = None) -> None:
        logger.info("auth.user.verified", user_id=str(user.id))
        await self._post_verify(user)

    async def _post_verify(self, user: User) -> None:
        """Side effects shared between the dev autoverify path and the
        real on_after_verify hook. Day D: copy the Khan demo matter into
        the new user's workspace so their first sign-in lands in a
        populated workspace, not an empty list.

        Idempotent — seed_demo_matter_for_user returns the existing row
        on re-run. Failures are logged and swallowed: a user who can't
        get the demo seeded should still be able to sign in and create
        their own matters.
        """
        try:
            session = self.user_db.session  # SQLAlchemyUserDatabase exposes its session
            matter = await seed_demo_matter_for_user(session, user)
            logger.info("auth.user.demo_seeded", user_id=str(user.id), slug=matter.slug)
        except Exception as exc:
            logger.warning(
                "auth.user.demo_seed_failed",
                user_id=str(user.id),
                error=str(exc),
            )

        # Auto-grant declared capabilities for every installed plugin's
        # skills. v0.1 policy: declared = granted; the workspace user
        # can revoke from the Modules page. Wrapped so a manifest read
        # failure cannot block registration.
        try:
            from app.core.capabilities import auto_grant_declared_for_user

            session = self.user_db.session
            count = await auto_grant_declared_for_user(session, user_id=user.id)
            await session.commit()
            logger.info(
                "auth.user.capabilities_auto_granted",
                user_id=str(user.id),
                triples=count,
            )
        except Exception as exc:
            logger.warning(
                "auth.user.capabilities_auto_grant_failed",
                user_id=str(user.id),
                error=str(exc),
            )

    async def on_after_forgot_password(
        self, user: User, token: str, request: Request | None = None
    ) -> None:
        link = f"{settings.password_reset_url_base}?token={token}"
        await send_password_reset(user.email, link)

    async def on_after_reset_password(
        self, user: User, request: Request | None = None
    ) -> None:
        logger.info("auth.password.reset", user_id=str(user.id))


async def get_user_manager(
    user_db: SQLAlchemyUserDatabase = Depends(get_user_db),
) -> AsyncIterator[UserManager]:
    yield UserManager(user_db)


# --- Auth backend (cookie + DB strategy) ------------------------------------


cookie_transport = CookieTransport(
    cookie_name=settings.session_cookie_name,
    cookie_max_age=settings.session_lifetime_seconds,
    cookie_secure=settings.session_cookie_secure,
    cookie_httponly=True,
    cookie_samesite="lax",
)


def get_database_strategy(
    access_token_db: AccessTokenDatabase[AccessToken] = Depends(get_access_token_db),
) -> DatabaseStrategy[User, uuid.UUID, AccessToken]:
    return DatabaseStrategy(access_token_db, lifetime_seconds=settings.session_lifetime_seconds)


auth_backend = AuthenticationBackend(
    name="cookie-db",
    transport=cookie_transport,
    get_strategy=get_database_strategy,
)


# --- FastAPIUsers + dependencies --------------------------------------------


fastapi_users = FastAPIUsers[User, uuid.UUID](get_user_manager, [auth_backend])

# `current_user` — hard dependency: 401 if no valid session, 403 if the
# session belongs to an unverified user. Workspace routes require email
# verification; production users must verify before accessing the app.
current_user = fastapi_users.current_user(active=True, verified=True)
# `optional_current_user` — soft dependency: returns None for anon traffic.
# Used by audit middleware so http.* rows resolve to NULL on anon, not
# stub. Verified flag is intentionally NOT enforced here — the middleware
# logs forensic provenance for unverified attempts too.
optional_current_user = fastapi_users.current_user(active=True, optional=True)


CurrentUser = Annotated[User, Depends(current_user)]
OptionalUser = Annotated[User | None, Depends(optional_current_user)]
