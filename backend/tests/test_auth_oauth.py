"""OAuth (Google/Microsoft/GitHub) auth coverage. See ADR-012.

The provider routers only mount at import time based on which
GOOGLE_/MICROSOFT_/GITHUB_OAUTH_CLIENT_ID+SECRET env vars are set (see
app/api/oauth.py) — a real design choice (partial rollout, no dead
buttons), but it means a bare env-var monkeypatch inside a test can't
retroactively mount a router onto the already-imported `app`. Instead,
these tests mount `build_oauth_router` directly onto a throwaway
FastAPI app that shares the same `get_session` override as the `client`
fixture (see conftest.py) — this exercises the real account-creation/
linking/redirect logic in app/core/oauth.py without needing real
provider credentials or import-time env timing.

Provider network calls (get_access_token, get_id_email) are monkeypatched
on the client class directly — this suite never talks to a real Google/
Microsoft/GitHub server.
"""

from __future__ import annotations

import urllib.parse

import pytest
import pytest_asyncio
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from httpx_oauth.clients.google import GoogleOAuth2
from httpx_oauth.oauth2 import OAuth2Token
from sqlalchemy import select

from app.core.db import get_session
from app.core.oauth import build_oauth_router
from app.models import OAuthAccount, User


@pytest.fixture
def google_client() -> GoogleOAuth2:
    return GoogleOAuth2("fake-client-id", "fake-client-secret")


@pytest_asyncio.fixture
async def oauth_client(db_connection, google_client):
    """A throwaway app mounting only the Google OAuth router, sharing
    the test's transactional DB session the same way conftest.py's
    `client` fixture does."""
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

    factory = async_sessionmaker(
        bind=db_connection,
        class_=AsyncSession,
        expire_on_commit=False,
        join_transaction_mode="create_savepoint",
    )

    async def _override_session():
        async with factory() as session:
            yield session

    app = FastAPI()
    app.include_router(build_oauth_router("google", google_client), prefix="/auth/oauth/google")
    app.dependency_overrides[get_session] = _override_session

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as ac:
        yield ac


def _fake_provider_response(account_id: str, email: str | None):
    async def fake_get_access_token(self, code, redirect_uri, code_verifier=None):
        return OAuth2Token({"access_token": "fake-access-token", "token_type": "bearer"})

    async def fake_get_id_email(self, token):
        return account_id, email

    return fake_get_access_token, fake_get_id_email


async def _authorize_and_get_state(oauth_client: AsyncClient) -> str:
    resp = await oauth_client.get("/auth/oauth/google/authorize")
    assert resp.status_code == 302
    query = urllib.parse.urlparse(resp.headers["location"]).query
    return urllib.parse.parse_qs(query)["state"][0]


@pytest.mark.asyncio
async def test_authorize_redirects_to_provider_with_correct_callback(
    oauth_client, monkeypatch
) -> None:
    from app.core.config import settings

    monkeypatch.setattr(settings, "oauth_callback_base_url", "http://localhost:8000")
    resp = await oauth_client.get("/auth/oauth/google/authorize")
    assert resp.status_code == 302
    location = resp.headers["location"]
    assert location.startswith("https://accounts.google.com/")
    assert urllib.parse.quote(
        "http://localhost:8000/auth/oauth/google/callback", safe=""
    ) in location


@pytest.mark.asyncio
async def test_callback_creates_new_user_and_sets_cookie(
    oauth_client, db_session, monkeypatch
) -> None:
    email = "oauth-new-user@example.com"
    get_token, get_id_email = _fake_provider_response("google-acct-1", email)
    monkeypatch.setattr(GoogleOAuth2, "get_access_token", get_token)
    monkeypatch.setattr(GoogleOAuth2, "get_id_email", get_id_email)

    state = await _authorize_and_get_state(oauth_client)
    resp = await oauth_client.get(
        "/auth/oauth/google/callback", params={"code": "fake-code", "state": state}
    )
    assert resp.status_code == 302, resp.text
    assert resp.headers["location"].endswith("/matters")
    assert "set-cookie" in resp.headers

    user = await db_session.scalar(select(User).where(User.email == email))
    assert user is not None
    assert user.is_verified is True

    oauth_row = await db_session.scalar(
        select(OAuthAccount).where(OAuthAccount.account_id == "google-acct-1")
    )
    assert oauth_row is not None
    assert oauth_row.user_id == user.id
    assert oauth_row.oauth_name == "google"


@pytest.mark.asyncio
async def test_callback_links_to_existing_user_by_verified_email(
    oauth_client, client, db_session, monkeypatch
) -> None:
    """A user who already has a password account gets their Google
    identity linked to that SAME account when the emails match —
    associate_by_email=True, since the provider already verified the
    email before returning it."""
    email = "oauth-link-existing@example.com"
    reg = await client.post("/auth/register", json={"email": email, "password": "pw-2026-xyz"})
    assert reg.status_code == 201
    existing_user = await db_session.scalar(select(User).where(User.email == email))
    assert existing_user is not None

    get_token, get_id_email = _fake_provider_response("google-acct-2", email)
    monkeypatch.setattr(GoogleOAuth2, "get_access_token", get_token)
    monkeypatch.setattr(GoogleOAuth2, "get_id_email", get_id_email)

    state = await _authorize_and_get_state(oauth_client)
    resp = await oauth_client.get(
        "/auth/oauth/google/callback", params={"code": "fake-code", "state": state}
    )
    assert resp.status_code == 302

    oauth_row = await db_session.scalar(
        select(OAuthAccount).where(OAuthAccount.account_id == "google-acct-2")
    )
    assert oauth_row is not None
    assert oauth_row.user_id == existing_user.id, "OAuth identity linked to a different user"

    # No duplicate user row was created for the same email.
    from sqlalchemy import func

    row_count = await db_session.scalar(select(func.count(User.id)).where(User.email == email))
    assert row_count == 1


@pytest.mark.asyncio
async def test_callback_no_verified_email_redirects_with_error(
    oauth_client, monkeypatch
) -> None:
    """GitHub in particular: an account with no public/verified email
    returns None — nothing to link or create a user with."""
    get_token, get_id_email = _fake_provider_response("google-acct-no-email", None)
    monkeypatch.setattr(GoogleOAuth2, "get_access_token", get_token)
    monkeypatch.setattr(GoogleOAuth2, "get_id_email", get_id_email)

    state = await _authorize_and_get_state(oauth_client)
    resp = await oauth_client.get(
        "/auth/oauth/google/callback", params={"code": "fake-code", "state": state}
    )
    assert resp.status_code == 302
    assert "oauth_error=no_email" in resp.headers["location"]
    assert "set-cookie" not in resp.headers


@pytest.mark.asyncio
async def test_callback_rejects_tampered_state(oauth_client, monkeypatch) -> None:
    # Mock the token exchange to succeed so this test isolates the state
    # check specifically — without it, a garbage code hits Google's real
    # token endpoint and fails there first, for an unrelated reason.
    get_token, get_id_email = _fake_provider_response("google-acct-tampered", "x@example.com")
    monkeypatch.setattr(GoogleOAuth2, "get_access_token", get_token)
    monkeypatch.setattr(GoogleOAuth2, "get_id_email", get_id_email)

    resp = await oauth_client.get(
        "/auth/oauth/google/callback", params={"code": "fake-code", "state": "not-a-real-token"}
    )
    assert resp.status_code == 302
    assert "oauth_error=invalid_state" in resp.headers["location"]
    assert "set-cookie" not in resp.headers


@pytest.mark.asyncio
async def test_callback_provider_denial_redirects_with_error(oauth_client) -> None:
    """The provider redirects back with `error=access_denied` instead of
    a `code` when the user declines consent — no code, no state check
    reached, straight to a clean redirect."""
    resp = await oauth_client.get(
        "/auth/oauth/google/callback", params={"error": "access_denied"}
    )
    assert resp.status_code == 302
    assert "oauth_error=provider_denied" in resp.headers["location"]


@pytest.mark.asyncio
async def test_unconfigured_provider_404s(client) -> None:
    """The real app (`client` fixture, not the throwaway `oauth_client`)
    has no OAuth env vars set in the test environment, so no provider
    router mounted at import time."""
    resp = await client.get("/auth/oauth/microsoft/authorize")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_oauth_providers_endpoint_reports_configured_state(client) -> None:
    resp = await client.get("/auth/oauth/providers")
    assert resp.status_code == 200
    body = resp.json()
    assert set(body.keys()) == {"google", "microsoft", "github", "magic_link"}
    assert body["google"] is False, "test environment has no Google credentials configured"
    assert body["microsoft"] is False, "test environment has no Microsoft credentials configured"
    assert body["github"] is False, "test environment has no GitHub credentials configured"
    # magic_link tracks MAGIC_LINK_ENABLED directly (CI sets it true so
    # this file's own HTTP tests can run) — not asserted false/true here,
    # just that the key exists and mirrors the flag.
    from app.core.config import settings

    assert body["magic_link"] is settings.magic_link_enabled
