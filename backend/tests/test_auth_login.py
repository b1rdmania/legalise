"""End-to-end auth coverage.

The fastapi-users cookie strategy and the `access_token` table had zero
test coverage in the suite. The bug at `08f0f0b` was a single line
mistake in the ORM model (FK to `user.id` instead of `users.id`) and
67/67 tests still went green. This file is the floor.

Two layers:

1. **Metadata regression** (sync, no DB). Catches the exact bug class
   without needing infra. Stays green even when the DB is unreachable.
2. **HTTP E2E** (async, DB). Register a user, login, assert the cookie
   works against `/auth/users/me`, assert an `access_token` row exists
   for the user. Requires `conftest.py`'s `client` fixture.

Run the E2E layer inside the backend container per conftest.py.
"""

from __future__ import annotations

import pytest
from sqlalchemy import select, text

from app.models import User
from app.models.user import AccessToken


# ---------------------------------------------------------------------------
# Layer 1 — metadata regression (no DB)
# ---------------------------------------------------------------------------


def test_access_token_user_id_targets_users_table() -> None:
    """AccessToken.user_id FK must resolve to `users.id`, not `user.id`."""
    fks = list(AccessToken.__table__.c.user_id.foreign_keys)
    assert len(fks) == 1, f"expected one FK on access_token.user_id, got {len(fks)}"
    target = fks[0].target_fullname
    assert target == "users.id", (
        f"AccessToken.user_id FK target is {target!r}; expected 'users.id'. "
        "The fastapi-users mixin defaults to 'user.id' and our model must override."
    )


def test_access_token_user_id_cascade_on_delete() -> None:
    """Deleting a user should cascade to their access tokens."""
    fk = next(iter(AccessToken.__table__.c.user_id.foreign_keys))
    assert (fk.ondelete or "").lower() == "cascade", (
        f"AccessToken.user_id FK ondelete is {fk.ondelete!r}; expected 'cascade'."
    )


# ---------------------------------------------------------------------------
# Layer 2 — HTTP E2E (DB-backed)
# ---------------------------------------------------------------------------


# Stable across all E2E auth tests in this module. Per-test rollback
# makes collisions impossible; the constant just keeps assertions readable.
TEST_EMAIL = "auth-e2e@example.com"
TEST_PASSWORD = "auth-e2e-password-2026"


@pytest.mark.asyncio
async def test_register_returns_201_and_creates_user_row(client, db_session) -> None:
    resp = await client.post(
        "/auth/register",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD},
    )
    assert resp.status_code == 201, resp.text

    user = await db_session.scalar(select(User).where(User.email == TEST_EMAIL))
    assert user is not None
    # Dev environment autoverifies on register.
    assert user.is_verified is True


@pytest.mark.asyncio
async def test_login_sets_cookie_and_me_returns_200(client) -> None:
    """The bug at 08f0f0b lived here. Login flushed `access_token` with a
    FK pointing at a non-existent `user` table and the request 500'd. This
    test is the floor."""
    reg = await client.post(
        "/auth/register",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD},
    )
    assert reg.status_code == 201, reg.text

    login = await client.post(
        "/auth/login",
        data={"username": TEST_EMAIL, "password": TEST_PASSWORD},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert login.status_code == 204, login.text
    # Cookie set on the AsyncClient is automatic; verify it's there.
    assert any(c.name for c in client.cookies.jar)

    me = await client.get("/auth/users/me")
    assert me.status_code == 200, me.text
    body = me.json()
    assert body["email"] == TEST_EMAIL
    assert body["is_verified"] is True


@pytest.mark.asyncio
async def test_login_writes_access_token_row(client, db_session) -> None:
    """Confirm the flush actually completes — the bug at 08f0f0b broke this."""
    await client.post(
        "/auth/register",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD},
    )
    login = await client.post(
        "/auth/login",
        data={"username": TEST_EMAIL, "password": TEST_PASSWORD},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert login.status_code == 204

    user = await db_session.scalar(select(User).where(User.email == TEST_EMAIL))
    assert user is not None

    token_count = await db_session.scalar(
        text("SELECT COUNT(*) FROM access_token WHERE user_id = :uid"),
        {"uid": user.id},
    )
    assert token_count == 1, (
        f"expected 1 access_token row for user, got {token_count}. "
        "Login flush is broken — check AccessToken.user_id FK override."
    )


@pytest.mark.asyncio
async def test_me_without_cookie_is_unauthorized(client) -> None:
    me = await client.get("/auth/users/me")
    assert me.status_code == 401
