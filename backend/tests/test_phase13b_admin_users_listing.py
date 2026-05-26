"""Phase 13b B — admin user list/detail endpoint tests.

Five tests:

1. Happy: list returns all users (superuser caller)
2. Happy: detail returns single user
3. Non-admin: 403 admin_required (both endpoints)
4. Target missing on detail: 404 user_not_found
5. DTO never leaks password hash / verification token / reset token

Plus a bonus: role filter only returns matching rows.
"""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import select

from app.models import User


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _register(client, *, email: str | None = None) -> tuple[str, str]:
    email = email or f"p13bb-{uuid.uuid4().hex[:8]}@example.com"
    password = "phase13bb-2026"
    await client.post(
        "/auth/register", json={"email": email, "password": password}
    )
    return email, password


async def _login(client, email: str, password: str) -> None:
    await client.post(
        "/auth/login",
        data={"username": email, "password": password},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )


async def _promote_superuser(email: str) -> uuid.UUID:
    from app.main import app
    factory = app.state.session_factory
    async with factory() as session:
        u = await session.scalar(select(User).where(User.email == email))
        u.is_superuser = True
        await session.commit()
        return u.id


async def _set_role(email: str, role: str) -> uuid.UUID:
    from app.main import app
    factory = app.state.session_factory
    async with factory() as session:
        u = await session.scalar(select(User).where(User.email == email))
        u.role = role
        await session.commit()
        return u.id


# ---------------------------------------------------------------------------
# 1. Happy: list returns all users
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_users_happy_path(client) -> None:
    admin_email, admin_pwd = await _register(client)
    await _promote_superuser(admin_email)
    # Two more users.
    target1, _ = await _register(client)
    target2, _ = await _register(client)
    await _login(client, admin_email, admin_pwd)

    resp = await client.get("/api/admin/users")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    emails = {row["email"] for row in body}
    assert admin_email in emails
    assert target1 in emails
    assert target2 in emails


# ---------------------------------------------------------------------------
# 2. Happy: detail returns single user
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_detail_returns_single_user(client) -> None:
    admin_email, admin_pwd = await _register(client)
    await _promote_superuser(admin_email)
    target_email, _ = await _register(client)
    target_id = None
    from app.main import app
    factory = app.state.session_factory
    async with factory() as session:
        u = await session.scalar(select(User).where(User.email == target_email))
        target_id = u.id
    await _login(client, admin_email, admin_pwd)

    resp = await client.get(f"/api/admin/users/{target_id}")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["id"] == str(target_id)
    assert body["email"] == target_email
    assert body["is_superuser"] is False


# ---------------------------------------------------------------------------
# 3. Non-admin: 403 admin_required
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_non_admin_caller_gets_403(client) -> None:
    caller_email, caller_pwd = await _register(client)
    # No promotion.
    await _login(client, caller_email, caller_pwd)

    resp_list = await client.get("/api/admin/users")
    assert resp_list.status_code == 403
    assert resp_list.json()["detail"]["error"] == "admin_required"

    resp_detail = await client.get(f"/api/admin/users/{uuid.uuid4()}")
    assert resp_detail.status_code == 403
    assert resp_detail.json()["detail"]["error"] == "admin_required"


# ---------------------------------------------------------------------------
# 4. Target missing on detail: 404
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_detail_missing_target_404(client) -> None:
    admin_email, admin_pwd = await _register(client)
    await _promote_superuser(admin_email)
    await _login(client, admin_email, admin_pwd)

    resp = await client.get(f"/api/admin/users/{uuid.uuid4()}")
    assert resp.status_code == 404
    assert resp.json()["detail"]["error"] == "user_not_found"


# ---------------------------------------------------------------------------
# 5. DTO never leaks hash/tokens (Decision #2)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_dto_never_leaks_password_hash_or_tokens(client) -> None:
    admin_email, admin_pwd = await _register(client)
    await _promote_superuser(admin_email)
    target_email, _ = await _register(client)
    await _login(client, admin_email, admin_pwd)

    resp = await client.get("/api/admin/users")
    assert resp.status_code == 200
    # Forbidden fields — none of these may appear in any row.
    forbidden = {"hashed_password", "verification_token", "reset_password_token"}
    for row in resp.json():
        leaked = forbidden & set(row.keys())
        assert leaked == set(), f"forbidden fields leaked: {leaked!r}"


# ---------------------------------------------------------------------------
# Bonus: role filter
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_users_role_filter(client) -> None:
    admin_email, admin_pwd = await _register(client)
    await _promote_superuser(admin_email)
    # One qualified_solicitor target.
    qs_email, _ = await _register(client)
    await _set_role(qs_email, "qualified_solicitor")
    # One workspace_admin target.
    wa_email, _ = await _register(client)
    await _set_role(wa_email, "workspace_admin")
    await _login(client, admin_email, admin_pwd)

    resp = await client.get("/api/admin/users?role=qualified_solicitor")
    assert resp.status_code == 200
    emails = {row["email"] for row in resp.json()}
    assert qs_email in emails
    assert wa_email not in emails
    assert admin_email not in emails


@pytest.mark.asyncio
async def test_list_users_is_superuser_filter(client) -> None:
    admin_email, admin_pwd = await _register(client)
    await _promote_superuser(admin_email)
    target_email, _ = await _register(client)
    await _login(client, admin_email, admin_pwd)

    resp = await client.get("/api/admin/users?is_superuser=true")
    assert resp.status_code == 200
    emails = {row["email"] for row in resp.json()}
    assert admin_email in emails
    assert target_email not in emails


@pytest.mark.asyncio
async def test_list_users_invalid_role_filter_422(client) -> None:
    admin_email, admin_pwd = await _register(client)
    await _promote_superuser(admin_email)
    await _login(client, admin_email, admin_pwd)

    resp = await client.get("/api/admin/users?role=banana")
    assert resp.status_code == 422
    assert resp.json()["detail"]["error"] == "invalid_role"
