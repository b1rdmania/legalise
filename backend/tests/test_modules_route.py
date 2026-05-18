"""Modules catalogue E2E coverage.

Shape-only tests. Whether `skills` or `broken` is populated depends on
the upstream `claude-for-uk-legal` repo state and the local
`PLUGINS_ROOT` checkout. We only assert the response shape and the
404 path on the per-skill endpoint.
"""

from __future__ import annotations

import pytest


TEST_EMAIL = "modules-e2e@example.com"
TEST_PASSWORD = "modules-e2e-password-2026"


async def _signup_and_login(client) -> None:
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


@pytest.mark.asyncio
async def test_list_modules_returns_expected_shape(client) -> None:
    await _signup_and_login(client)

    resp = await client.get("/api/modules")
    assert resp.status_code == 200, resp.text

    body = resp.json()
    assert set(body.keys()) >= {"plugins_root", "source", "skills", "broken"}
    assert isinstance(body["plugins_root"], str)
    assert isinstance(body["source"], dict)
    assert {"repo", "ref"} <= set(body["source"].keys())
    assert isinstance(body["skills"], list)
    assert isinstance(body["broken"], list)

    # Either we discovered skills with valid manifests, or every skill
    # surfaced as broken. The empty/empty state is also valid (PLUGINS_ROOT
    # missing) but should be rare in CI; we just check the shape contract.
    for skill in body["skills"]:
        assert {"plugin", "skill", "name", "description", "enabled"} <= set(skill.keys())
    for broken in body["broken"]:
        assert {"plugin", "skill", "errors"} <= set(broken.keys())
        assert isinstance(broken["errors"], list)


@pytest.mark.asyncio
async def test_get_skill_body_unknown_skill_returns_404(client) -> None:
    await _signup_and_login(client)
    resp = await client.get("/api/modules/no-such-plugin/no-such-skill")
    assert resp.status_code == 404
