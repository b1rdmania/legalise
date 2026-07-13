"""Mounts /auth/oauth/<provider> for each configured social sign-in
provider, plus a small public endpoint the frontend uses to know which
sign-in method buttons to render (OAuth providers AND magic link — the
one endpoint covers the whole "new login methods" surface, gated
per-method as described in each's own config). See app/core/oauth.py
for the router builder and ADR-012 for the design.
"""

from __future__ import annotations

from fastapi import APIRouter
from httpx_oauth.clients.github import GitHubOAuth2
from httpx_oauth.clients.google import GoogleOAuth2
from httpx_oauth.clients.microsoft import MicrosoftGraphOAuth2

from app.core.config import settings
from app.core.oauth import build_oauth_router

router = APIRouter()

_ENABLED: dict[str, bool] = {
    "google": False,
    "microsoft": False,
    "github": False,
    "magic_link": settings.magic_link_enabled,
}

if settings.google_oauth_client_id and settings.google_oauth_client_secret:
    _ENABLED["google"] = True
    router.include_router(
        build_oauth_router(
            "google",
            GoogleOAuth2(settings.google_oauth_client_id, settings.google_oauth_client_secret),
        ),
        prefix="/google",
    )

if settings.microsoft_oauth_client_id and settings.microsoft_oauth_client_secret:
    _ENABLED["microsoft"] = True
    router.include_router(
        build_oauth_router(
            "microsoft",
            MicrosoftGraphOAuth2(
                settings.microsoft_oauth_client_id, settings.microsoft_oauth_client_secret
            ),
        ),
        prefix="/microsoft",
    )

if settings.github_oauth_client_id and settings.github_oauth_client_secret:
    _ENABLED["github"] = True
    router.include_router(
        build_oauth_router(
            "github",
            GitHubOAuth2(settings.github_oauth_client_id, settings.github_oauth_client_secret),
        ),
        prefix="/github",
    )


@router.get("/providers")
async def oauth_providers() -> dict[str, bool]:
    """Public, unauthenticated — which sign-in method buttons the
    frontend should render (OAuth providers + magic link). Not a
    secret: it says a button exists, not anything about the client
    id/secret behind it."""
    return _ENABLED
