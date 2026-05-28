"""Phase 13b C — bootstrap-state endpoint tests.

Three tests + a no-auth-required regression:

1. After first register, no superuser: {user_count: 1, has_superuser: false}
2. After bootstrap: {user_count: N, has_superuser: true}
3. No authentication required (Decision #3)

Note: the testing infrastructure always seeds at least one user in
shared fixtures; the "user_count: 0" case is exercised only at
a true fresh-fork deployment, not in pytest. We assert the
relative shape (count > 0 after register, has_superuser after promotion).
"""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import select

from app.models import User


async def _register(client) -> tuple[str, str]:
    email = f"p13bc-{uuid.uuid4().hex[:8]}@example.com"
    password = "phase13bc-2026"
    await client.post(
        "/auth/register", json={"email": email, "password": password}
    )
    return email, password


# ---------------------------------------------------------------------------
# 1. After register, no superuser
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_after_register_no_superuser(client, db_session) -> None:
    # Snapshot the count before this test's register.
    initial = await client.get("/api/system/bootstrap-state")
    assert initial.status_code == 200
    initial_count = initial.json()["user_count"]
    initial_has_super = initial.json()["has_superuser"]

    await _register(client)

    resp = await client.get("/api/system/bootstrap-state")
    assert resp.status_code == 200
    body = resp.json()
    # Register added at least one user; cleaning up here doesn't
    # control other parallel tests, so assert the bound rather than
    # equality.
    assert body["user_count"] >= initial_count + 1
    # has_superuser flag does not change just from register.
    assert body["has_superuser"] == initial_has_super


# ---------------------------------------------------------------------------
# 2. After promotion: has_superuser=True
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_after_superuser_promotion_flag_flips(client) -> None:
    email, _ = await _register(client)

    # Promote.
    from app.main import app
    factory = app.state.session_factory
    async with factory() as session:
        u = await session.scalar(select(User).where(User.email == email))
        u.is_superuser = True
        await session.commit()

    resp = await client.get("/api/system/bootstrap-state")
    assert resp.status_code == 200
    body = resp.json()
    assert body["user_count"] >= 1
    assert body["has_superuser"] is True


# ---------------------------------------------------------------------------
# 3. No authentication required (Decision #3)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_no_authentication_required(client) -> None:
    """The endpoint MUST be callable without a session cookie.

    The shared client fixture may or may not have a logged-in user;
    we explicitly clear cookies to be sure no auth state leaks in.
    """
    # Clear any session cookies in the test client.
    client.cookies.clear()
    resp = await client.get("/api/system/bootstrap-state")
    assert resp.status_code == 200
    body = resp.json()
    assert "user_count" in body
    assert "has_superuser" in body


@pytest.mark.asyncio
async def test_response_shape(client) -> None:
    """Body has exactly the expected keys; no unexpected fields leak.
    Phase 17.5 added firm_role_gates_enabled so the SPA knows whether to
    present the firm role hierarchy."""
    resp = await client.get("/api/system/bootstrap-state")
    assert resp.status_code == 200
    body = resp.json()
    assert set(body.keys()) == {
        "user_count",
        "has_superuser",
        "firm_role_gates_enabled",
    }
    assert isinstance(body["user_count"], int)
    assert isinstance(body["has_superuser"], bool)
    assert isinstance(body["firm_role_gates_enabled"], bool)
