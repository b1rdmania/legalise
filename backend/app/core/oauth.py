"""Social sign-in (OAuth) — Google, Microsoft, GitHub. See ADR-012.

fastapi-users ships an OAuth router (``fastapi_users.get_oauth_router``),
but both its ``/authorize`` and ``/callback`` endpoints return JSON, not a
browser redirect — they're built for an SPA that calls them via
fetch/XHR and handles navigation itself. This app's OAuth buttons are
plain ``<a href>`` links (see ``frontend/src/auth/SignIn.tsx``) — a real
full-page redirect flow, no client-side OAuth SDK — so both endpoints
here are custom, reusing fastapi-users' own internal building blocks
(state-token signing, the ``oauth_callback()`` manager method, the
``AuthenticationBackend`` login) rather than its router factory.

Each provider only mounts if its client id/secret are configured
(``mount_oauth_providers`` skips unconfigured ones) — a provider with no
credentials 404s on ``/auth/oauth/<provider>/*`` instead of erroring, so
partial rollout (e.g. GitHub live, Google/Microsoft still pending
console setup) works cleanly. Errors during the callback (denied
consent, no verified email, provider outage) redirect to the login page
with an ``oauth_error`` query param rather than raising a raw JSON
error — a browser mid-redirect should always land on a real page.
"""

from __future__ import annotations

from typing import Annotated
from urllib.parse import urlparse

import jwt as _pyjwt
import structlog
from fastapi import APIRouter, Depends, Request
from fastapi.responses import RedirectResponse
from fastapi_users.authentication.strategy.db import DatabaseStrategy
from fastapi_users.exceptions import UserAlreadyExists
from fastapi_users.jwt import decode_jwt, generate_jwt
from httpx_oauth.integrations.fastapi import OAuth2AuthorizeCallback, OAuth2AuthorizeCallbackError
from httpx_oauth.oauth2 import BaseOAuth2

from app.core.auth import UserManager, auth_backend, get_database_strategy, get_user_manager
from app.core.config import settings

logger = structlog.get_logger()

STATE_TOKEN_AUDIENCE = "legalise:oauth-state"
STATE_TOKEN_LIFETIME_SECONDS = 600  # 10 minutes — plenty for a consent screen


def _login_url(error: str | None = None) -> str:
    origin = urlparse(settings.oauth_redirect_url)
    base = f"{origin.scheme}://{origin.netloc}/auth/login"
    return f"{base}?oauth_error={error}" if error else base


def _copy_set_cookie(source_response, redirect: RedirectResponse) -> RedirectResponse:
    """`auth_backend.login()` returns a 204 with a Set-Cookie header —
    copy it onto the redirect, since we're replacing that response with
    a 302 rather than returning it directly."""
    for key, value in source_response.raw_headers:
        if key.lower() == b"set-cookie":
            redirect.raw_headers.append((key, value))
    return redirect


def build_oauth_router(provider_name: str, oauth_client: BaseOAuth2) -> APIRouter:
    router = APIRouter()
    callback_url = f"{settings.oauth_callback_base_url}/auth/oauth/{provider_name}/callback"
    authorize_callback = OAuth2AuthorizeCallback(oauth_client, redirect_url=callback_url)

    @router.get("/authorize")
    async def authorize() -> RedirectResponse:
        state = generate_jwt(
            {"aud": STATE_TOKEN_AUDIENCE},
            settings.session_secret,
            STATE_TOKEN_LIFETIME_SECONDS,
        )
        authorization_url = await oauth_client.get_authorization_url(callback_url, state)
        return RedirectResponse(authorization_url, status_code=302)

    @router.get("/callback")
    async def callback(
        request: Request,
        user_manager: Annotated[UserManager, Depends(get_user_manager)],
        strategy: Annotated[DatabaseStrategy, Depends(get_database_strategy)],
        code: str | None = None,
        state: str | None = None,
        error: str | None = None,
    ) -> RedirectResponse:
        try:
            token, returned_state = await authorize_callback(
                request, code=code, state=state, error=error
            )
        except OAuth2AuthorizeCallbackError:
            logger.info("auth.oauth.callback_error", provider=provider_name)
            return RedirectResponse(_login_url("provider_denied"), status_code=302)

        try:
            decode_jwt(returned_state or "", settings.session_secret, [STATE_TOKEN_AUDIENCE])
        except _pyjwt.PyJWTError:
            logger.warning("auth.oauth.bad_state", provider=provider_name)
            return RedirectResponse(_login_url("invalid_state"), status_code=302)

        account_id, account_email = await oauth_client.get_id_email(token["access_token"])
        if account_email is None:
            # GitHub in particular: the account has no public/verified
            # email. Nothing to associate or create a user with.
            logger.info("auth.oauth.no_email", provider=provider_name)
            return RedirectResponse(_login_url("no_email"), status_code=302)

        try:
            user = await user_manager.oauth_callback(
                provider_name,
                token["access_token"],
                account_id,
                account_email,
                token.get("expires_at"),
                token.get("refresh_token"),
                request,
                associate_by_email=True,
                is_verified_by_default=True,
            )
        except UserAlreadyExists:
            logger.info("auth.oauth.already_exists", provider=provider_name)
            return RedirectResponse(_login_url("already_exists"), status_code=302)

        if not user.is_active:
            return RedirectResponse(_login_url("inactive"), status_code=302)

        login_response = await auth_backend.login(strategy, user)
        await user_manager.on_after_login(user, request, login_response)
        redirect = RedirectResponse(settings.oauth_redirect_url, status_code=302)
        return _copy_set_cookie(login_response, redirect)

    return router
