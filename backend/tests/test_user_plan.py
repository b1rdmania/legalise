"""User.plan field coverage.

v0.1 contract:
    - Every new user is `free`.
    - The field is surfaced on `/auth/users/me`.
    - It is display-only - no enforcement, no billing semantics.
"""

from __future__ import annotations

import pytest


EMAIL = "user-plan@example.com"
PASSWORD = "user-plan-password-2026"


async def _signup_and_login(client, email: str, password: str) -> None:
    reg = await client.post(
        "/auth/register",
        json={"email": email, "password": password},
    )
    assert reg.status_code == 201, reg.text
    login = await client.post(
        "/auth/login",
        data={"username": email, "password": password},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert login.status_code == 204, login.text


@pytest.mark.asyncio
async def test_new_user_has_free_plan(client) -> None:
    """Fresh user signup -> /auth/users/me returns plan == 'free'."""
    await _signup_and_login(client, EMAIL, PASSWORD)
    me = await client.get("/auth/users/me")
    assert me.status_code == 200, me.text
    body = me.json()
    assert "plan" in body
    assert body["plan"] == "free"


@pytest.mark.asyncio
async def test_register_response_includes_plan(client) -> None:
    """The fastapi-users register response should also carry the field."""
    resp = await client.post(
        "/auth/register",
        json={"email": "register-plan@example.com", "password": "register-plan-password-2026"},
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body.get("plan") == "free"
