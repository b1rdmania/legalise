"""Per-IP abuse throttling on the unauthenticated auth surface.

Covers app/core/rate_limit.py + the router wiring in app/api/auth.py:

- register / request-verify-token / forgot-password throttle at the
  configured per-IP-per-hour limit and return the 429 envelope;
- a different client IP is an independent bucket;
- the window slides — backdated attempts (inserted directly, no sleeps)
  do not count and are swept;
- the first rejection in a window writes exactly one ``auth.rate_limited``
  audit row, however many blocked attempts follow;
- routes that share an upstream fastapi-users router with a throttled
  route (POST /auth/verify, POST /auth/reset-password) are NOT throttled;
- a 0 override disables the throttle.

All limits are pinned via env overrides so the tests are independent of
the shipped defaults; one test asserts the defaults themselves.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import func, select

from app.core.rate_limit import RATE_LIMITED_ROUTES, client_ip, route_limit
from app.models import AuditEntry, AuthThrottleEvent


def _email(i: int) -> str:
    return f"throttle-{i}@example.com"


PASSWORD = "throttle-password-2026"


async def _register(client, i: int, headers: dict | None = None):
    return await client.post(
        "/auth/register",
        json={"email": _email(i), "password": PASSWORD},
        headers=headers or {},
    )


async def _audit_throttle_count(db_session) -> int:
    return (
        await db_session.scalar(
            select(func.count(AuditEntry.id)).where(
                AuditEntry.action == "auth.rate_limited"
            )
        )
    ) or 0


# ---------------------------------------------------------------------------
# Defaults (no env override in play)
# ---------------------------------------------------------------------------


def test_shipped_defaults(monkeypatch) -> None:
    for suffix, _ in RATE_LIMITED_ROUTES.values():
        monkeypatch.delenv(f"LEGALISE_RATE_LIMIT_{suffix}_PER_HOUR", raising=False)
    assert route_limit("auth.register") == 5
    assert route_limit("auth.request_verify_token") == 10
    assert route_limit("auth.forgot_password") == 10


# ---------------------------------------------------------------------------
# POST /auth/register
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_register_throttles_at_limit(client, db_session, monkeypatch) -> None:
    monkeypatch.setenv("LEGALISE_RATE_LIMIT_REGISTER_PER_HOUR", "3")

    for i in range(3):
        resp = await _register(client, i)
        assert resp.status_code == 201, resp.text

    resp = await _register(client, 3)
    assert resp.status_code == 429, resp.text
    detail = resp.json()["detail"]
    assert detail["error"] == "rate_limited"
    assert detail["route"] == "auth.register"
    assert detail["limit_per_hour"] == 3
    assert resp.headers.get("retry-after") == "3600"

    # Exactly one audit row for the first rejection.
    assert await _audit_throttle_count(db_session) == 1


@pytest.mark.asyncio
async def test_register_repeat_blocks_audit_once(client, db_session, monkeypatch) -> None:
    monkeypatch.setenv("LEGALISE_RATE_LIMIT_REGISTER_PER_HOUR", "1")

    assert (await _register(client, 0)).status_code == 201
    for i in range(1, 4):
        assert (await _register(client, i)).status_code == 429

    assert await _audit_throttle_count(db_session) == 1
    row = await db_session.scalar(
        select(AuditEntry).where(AuditEntry.action == "auth.rate_limited")
    )
    assert row.actor_id is None
    assert row.resource_type == "auth"
    assert row.resource_id == "auth.register"
    assert row.payload["limit_per_hour"] == 1
    assert row.payload["ip"]


@pytest.mark.asyncio
async def test_register_different_ip_is_separate_bucket(client, monkeypatch) -> None:
    monkeypatch.setenv("LEGALISE_RATE_LIMIT_REGISTER_PER_HOUR", "1")

    assert (await _register(client, 0)).status_code == 201
    assert (await _register(client, 1)).status_code == 429
    # Same socket, different Fly-asserted client IP — fresh bucket.
    # (Fly-Client-IP is set by Fly's proxy, not client-controllable.)
    resp = await _register(client, 2, headers={"fly-client-ip": "203.0.113.7"})
    assert resp.status_code == 201, resp.text


@pytest.mark.asyncio
async def test_register_window_slides_without_sleeping(
    client, db_session, monkeypatch
) -> None:
    monkeypatch.setenv("LEGALISE_RATE_LIMIT_REGISTER_PER_HOUR", "2")
    ip = "203.0.113.9"
    stale = datetime.now(timezone.utc) - timedelta(hours=2)

    # Two attempts from this IP, both outside the 1h window.
    for _ in range(2):
        db_session.add(AuthThrottleEvent(ip=ip, route="auth.register", created_at=stale))
    await db_session.commit()

    resp = await _register(client, 0, headers={"fly-client-ip": ip})
    assert resp.status_code == 201, resp.text

    # The expired rows were swept by the opportunistic cleanup.
    stale_left = await db_session.scalar(
        select(func.count(AuthThrottleEvent.id)).where(
            AuthThrottleEvent.route == "auth.register",
            AuthThrottleEvent.created_at < datetime.now(timezone.utc) - timedelta(hours=1),
        )
    )
    assert stale_left == 0


@pytest.mark.asyncio
async def test_register_zero_disables_throttle(client, db_session, monkeypatch) -> None:
    monkeypatch.setenv("LEGALISE_RATE_LIMIT_REGISTER_PER_HOUR", "0")

    for i in range(4):
        assert (await _register(client, i)).status_code == 201

    # Disabled means no attempt rows either.
    rows = await db_session.scalar(
        select(func.count(AuthThrottleEvent.id)).where(
            AuthThrottleEvent.route == "auth.register"
        )
    )
    assert rows == 0


# ---------------------------------------------------------------------------
# POST /auth/request-verify-token
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_request_verify_token_throttles(client, monkeypatch) -> None:
    monkeypatch.setenv("LEGALISE_RATE_LIMIT_REQUEST_VERIFY_TOKEN_PER_HOUR", "2")

    for _ in range(2):
        resp = await client.post(
            "/auth/request-verify-token", json={"email": "nobody@example.com"}
        )
        # fastapi-users always 202s to avoid email enumeration.
        assert resp.status_code == 202, resp.text

    resp = await client.post(
        "/auth/request-verify-token", json={"email": "nobody@example.com"}
    )
    assert resp.status_code == 429
    assert resp.json()["detail"]["route"] == "auth.request_verify_token"


@pytest.mark.asyncio
async def test_verify_route_not_throttled(client, monkeypatch) -> None:
    """POST /auth/verify shares the upstream verify router but is
    token-gated — it must keep returning 400 (bad token), never 429."""
    monkeypatch.setenv("LEGALISE_RATE_LIMIT_REQUEST_VERIFY_TOKEN_PER_HOUR", "1")

    resp = await client.post(
        "/auth/request-verify-token", json={"email": "nobody@example.com"}
    )
    assert resp.status_code == 202
    resp = await client.post(
        "/auth/request-verify-token", json={"email": "nobody@example.com"}
    )
    assert resp.status_code == 429

    # Bucket exhausted — /verify still serves.
    resp = await client.post("/auth/verify", json={"token": "not-a-real-token"})
    assert resp.status_code == 400, resp.text


# ---------------------------------------------------------------------------
# POST /auth/forgot-password
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_forgot_password_throttles_but_reset_password_does_not(
    client, monkeypatch
) -> None:
    monkeypatch.setenv("LEGALISE_RATE_LIMIT_FORGOT_PASSWORD_PER_HOUR", "1")

    resp = await client.post(
        "/auth/forgot-password", json={"email": "nobody@example.com"}
    )
    assert resp.status_code == 202, resp.text
    resp = await client.post(
        "/auth/forgot-password", json={"email": "nobody@example.com"}
    )
    assert resp.status_code == 429
    assert resp.json()["detail"]["route"] == "auth.forgot_password"

    # Same upstream router, token-gated sibling route: not throttled.
    resp = await client.post(
        "/auth/reset-password",
        json={"token": "not-a-real-token", "password": PASSWORD},
    )
    assert resp.status_code == 400, resp.text


# ---------------------------------------------------------------------------
# POST /auth/login
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_login_throttles_at_limit(client, db_session, monkeypatch) -> None:
    """Login attempts (valid or not) throttle at the per-IP limit —
    mirrors the register throttle wiring."""
    monkeypatch.setenv("LEGALISE_RATE_LIMIT_LOGIN_PER_HOUR", "3")

    for _ in range(3):
        resp = await client.post(
            "/auth/login",
            data={"username": "nobody@example.com", "password": "wrong-password"},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        assert resp.status_code == 400, resp.text  # bad credentials, not throttled

    resp = await client.post(
        "/auth/login",
        data={"username": "nobody@example.com", "password": "wrong-password"},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert resp.status_code == 429, resp.text
    detail = resp.json()["detail"]
    assert detail["error"] == "rate_limited"
    assert detail["route"] == "auth.login"
    assert detail["limit_per_hour"] == 3
    assert resp.headers.get("retry-after") == "3600"

    # Exactly one audit row for the first rejection.
    assert await _audit_throttle_count(db_session) == 1


@pytest.mark.asyncio
async def test_logout_not_throttled_by_login_bucket(client, monkeypatch) -> None:
    """POST /auth/logout shares the upstream auth router but is
    cookie-gated — exhausting the login bucket must not 429 it."""
    monkeypatch.setenv("LEGALISE_RATE_LIMIT_LOGIN_PER_HOUR", "1")

    resp = await client.post(
        "/auth/login",
        data={"username": "nobody@example.com", "password": "wrong-password"},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert resp.status_code == 400
    resp = await client.post(
        "/auth/login",
        data={"username": "nobody@example.com", "password": "wrong-password"},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert resp.status_code == 429

    # Bucket exhausted — /logout still serves (401: no cookie).
    resp = await client.post("/auth/logout")
    assert resp.status_code == 401, resp.text


def test_login_shipped_default(monkeypatch) -> None:
    monkeypatch.delenv("LEGALISE_RATE_LIMIT_LOGIN_PER_HOUR", raising=False)
    assert route_limit("auth.login") == 10


# ---------------------------------------------------------------------------
# client_ip — header-trust hardening (spoof scenarios)
# ---------------------------------------------------------------------------


class _StubClient:
    def __init__(self, host: str | None) -> None:
        self.host = host


class _StubRequest:
    """Duck-typed Request: client_ip only reads .headers.get and .client."""

    def __init__(self, headers: dict[str, str], peer: str | None = "10.0.0.1") -> None:
        self.headers = {k.lower(): v for k, v in headers.items()}
        self.client = _StubClient(peer) if peer else None


class TestClientIpHeaderTrust:
    def test_cf_header_trusted_when_hop_is_cloudflare(self) -> None:
        # Fly-Client-IP inside Cloudflare's published ranges → the request
        # really came via Cloudflare, so CF-Connecting-IP is authoritative.
        request = _StubRequest(
            {"cf-connecting-ip": "198.51.100.9", "fly-client-ip": "172.68.1.2"}
        )
        assert client_ip(request) == "198.51.100.9"

    def test_cf_header_ignored_when_origin_hit_directly(self) -> None:
        # Attacker hits the .fly.dev origin directly and forges the CF
        # header: Fly saw the attacker's real IP, not Cloudflare, so the
        # forged header must not mint a fresh throttle bucket.
        request = _StubRequest(
            {"cf-connecting-ip": "203.0.113.99", "fly-client-ip": "198.51.100.7"}
        )
        assert client_ip(request) == "198.51.100.7"

    def test_cf_header_alone_ignored(self) -> None:
        # No Fly hop at all (e.g. local/self-hosted): a bare CF header is
        # client-controlled — fall through to the peer address.
        request = _StubRequest({"cf-connecting-ip": "203.0.113.99"})
        assert client_ip(request) == "10.0.0.1"

    def test_cf_header_trusted_for_ipv6_cloudflare_hop(self) -> None:
        request = _StubRequest(
            {"cf-connecting-ip": "2001:db8::7", "fly-client-ip": "2606:4700::1234"}
        )
        assert client_ip(request) == "2001:db8::7"

    def test_x_forwarded_for_never_trusted(self) -> None:
        # XFF is trivially spoofable and no longer part of the chain.
        request = _StubRequest({"x-forwarded-for": "203.0.113.5, 10.0.0.9"})
        assert client_ip(request) == "10.0.0.1"

    def test_garbage_fly_header_falls_back_to_itself(self) -> None:
        # A malformed Fly-Client-IP can't be a Cloudflare hop; the CF
        # header is ignored and the Fly value (still proxy-set) is used.
        request = _StubRequest(
            {"cf-connecting-ip": "203.0.113.99", "fly-client-ip": "not-an-ip"}
        )
        assert client_ip(request) == "not-an-ip"

    def test_no_headers_no_peer_is_unknown(self) -> None:
        request = _StubRequest({}, peer=None)
        assert client_ip(request) == "unknown"
