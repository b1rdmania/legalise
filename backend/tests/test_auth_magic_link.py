"""Magic-link (passwordless email) auth coverage. See ADR-012.

Layer 0 — the off switch (subprocess, no DB): MAGIC_LINK_ENABLED gates
the router at app-import time, so this suite's own CI run sets it true
(see .github/workflows/ci.yml) — meaning every other test in this file
would silently pass even if the production default flipped to "always
on" by accident. This layer imports app.main fresh in a subprocess with
the var explicitly UNSET to prove the off state is real.

Layer 1 — token issue/decode (sync, no DB): the self-issued JWT logic in
app/core/magic_link.py, independent of the HTTP layer.

Layer 2 — HTTP E2E (async, DB): request → verify creates a new account;
a second verify for the same email logs into the SAME account; an
existing-but-unverified account gets verified by clicking the link;
bad/expired tokens fail cleanly; the request endpoint is throttled.
"""

from __future__ import annotations

import os
import subprocess
import sys
import time

import jwt
import pytest
from sqlalchemy import select

from app.core.magic_link import (
    MAGIC_LINK_AUDIENCE,
    InvalidMagicLinkToken,
    decode_magic_link_token,
    generate_magic_link_token,
)

# ---------------------------------------------------------------------------
# Layer 0 — the off switch (subprocess, no DB)
# ---------------------------------------------------------------------------


def test_router_does_not_mount_when_flag_is_unset() -> None:
    env = dict(os.environ)
    env.pop("MAGIC_LINK_ENABLED", None)
    result = subprocess.run(
        [
            sys.executable,
            "-c",
            "from app.main import app; "
            "paths = [r.path for r in app.routes if hasattr(r, 'path')]; "
            "assert not any('magic-link' in p for p in paths), paths; "
            "print('ok')",
        ],
        cwd=os.path.dirname(os.path.dirname(__file__)),
        env=env,
        capture_output=True,
        text=True,
        timeout=30,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    assert "ok" in result.stdout
from app.models import User

# ---------------------------------------------------------------------------
# Layer 1 — token issue/decode (no DB)
# ---------------------------------------------------------------------------


def test_generate_and_decode_round_trips_email() -> None:
    token = generate_magic_link_token("round-trip@example.com")
    assert decode_magic_link_token(token) == "round-trip@example.com"


def test_decode_rejects_garbage_token() -> None:
    with pytest.raises(InvalidMagicLinkToken):
        decode_magic_link_token("not-a-jwt-at-all")


def test_decode_rejects_expired_token() -> None:
    from app.core.config import settings

    expired = jwt.encode(
        {
            "email": "expired@example.com",
            "aud": MAGIC_LINK_AUDIENCE,
            "exp": int(time.time()) - 60,
        },
        settings.session_secret,
        algorithm="HS256",
    )
    with pytest.raises(InvalidMagicLinkToken):
        decode_magic_link_token(expired)


def test_decode_rejects_wrong_audience() -> None:
    """A token signed with the same secret but a different audience
    claim (e.g. one of fastapi-users' own verify/reset/oauth-state
    tokens) must NOT be accepted here — tokens are not interchangeable
    across purposes even though they share a signing secret."""
    from app.core.config import settings

    wrong_audience = jwt.encode(
        {"email": "cross-purpose@example.com", "aud": "fastapi-users:verify"},
        settings.session_secret,
        algorithm="HS256",
    )
    with pytest.raises(InvalidMagicLinkToken):
        decode_magic_link_token(wrong_audience)


# ---------------------------------------------------------------------------
# Layer 2 — HTTP E2E (DB-backed)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_request_always_returns_202(client) -> None:
    resp = await client.post(
        "/auth/magic-link/request", json={"email": "new-magic-link-user@example.com"}
    )
    assert resp.status_code == 202, resp.text


@pytest.mark.asyncio
async def test_verify_creates_new_verified_user(client, db_session) -> None:
    email = "magic-link-new@example.com"
    token = generate_magic_link_token(email)

    resp = await client.post("/auth/magic-link/verify", json={"token": token})
    assert resp.status_code == 204, resp.text
    assert any(c.name for c in client.cookies.jar), "expected a session cookie"

    me = await client.get("/auth/users/me")
    assert me.status_code == 200, me.text
    assert me.json()["email"] == email
    assert me.json()["is_verified"] is True

    user = await db_session.scalar(select(User).where(User.email == email))
    assert user is not None
    assert user.is_verified is True


@pytest.mark.asyncio
async def test_verify_second_time_logs_into_same_user(client, db_session) -> None:
    email = "magic-link-repeat@example.com"

    first = await client.post(
        "/auth/magic-link/verify", json={"token": generate_magic_link_token(email)}
    )
    assert first.status_code == 204
    first_id = (await client.get("/auth/users/me")).json()["id"]

    client.cookies.clear()

    second = await client.post(
        "/auth/magic-link/verify", json={"token": generate_magic_link_token(email)}
    )
    assert second.status_code == 204
    second_id = (await client.get("/auth/users/me")).json()["id"]

    assert first_id == second_id, "magic link created a duplicate user for the same email"

    from sqlalchemy import func

    row_count = await db_session.scalar(
        select(func.count(User.id)).where(User.email == email)
    )
    assert row_count == 1, "magic link created a duplicate user row for the same email"


@pytest.mark.asyncio
async def test_verify_marks_existing_unverified_password_account_verified(
    client, db_session
) -> None:
    """A user who registered by password but never clicked the
    verification email can still get in via a magic link sent to the
    same address — clicking it is equally valid proof of ownership."""
    email = "password-then-magic-link@example.com"
    reg = await client.post(
        "/auth/register", json={"email": email, "password": "some-password-2026"}
    )
    assert reg.status_code == 201

    # Dev environment autoverifies on register (see UserManager.on_after_register) —
    # force it back to unverified so this test actually exercises the
    # "existing but unverified" branch rather than trivially matching an
    # already-verified user.
    user = await db_session.scalar(select(User).where(User.email == email))
    assert user is not None
    user.is_verified = False
    await db_session.commit()

    resp = await client.post(
        "/auth/magic-link/verify", json={"token": generate_magic_link_token(email)}
    )
    assert resp.status_code == 204, resp.text

    me = await client.get("/auth/users/me")
    assert me.json()["is_verified"] is True


@pytest.mark.asyncio
async def test_verify_rejects_bad_token(client) -> None:
    resp = await client.post("/auth/magic-link/verify", json={"token": "garbage"})
    assert resp.status_code == 400
    assert resp.json()["detail"] == "MAGIC_LINK_INVALID_OR_EXPIRED"


@pytest.mark.asyncio
async def test_request_is_throttled(client, monkeypatch) -> None:
    monkeypatch.setenv("LEGALISE_RATE_LIMIT_MAGIC_LINK_REQUEST_PER_HOUR", "2")
    email = "throttle-target@example.com"

    for _ in range(2):
        resp = await client.post("/auth/magic-link/request", json={"email": email})
        assert resp.status_code == 202

    blocked = await client.post("/auth/magic-link/request", json={"email": email})
    assert blocked.status_code == 429, blocked.text
    assert blocked.json()["detail"]["route"] == "auth.magic_link_request"
