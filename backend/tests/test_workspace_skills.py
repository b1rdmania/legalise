"""Workspace skill toggle E2E coverage.

Disable / enable round-trip on a `(plugin, skill)` pair, observed
through `GET /api/workspace/disabled-skills`. Absence in the table
means enabled; presence means disabled.
"""

from __future__ import annotations

import pytest


TEST_EMAIL = "workspace-e2e@example.com"
TEST_PASSWORD = "workspace-e2e-password-2026"
PLUGIN = "uk-employment-legal"
SKILL = "lba-drafter"


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
async def test_disabled_skills_starts_empty(client) -> None:
    await _signup_and_login(client)

    resp = await client.get("/api/workspace/disabled-skills")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body == {"disabled": []}


@pytest.mark.asyncio
async def test_disable_then_enable_round_trip(client) -> None:
    await _signup_and_login(client)

    disable = await client.post(f"/api/workspace/skills/{PLUGIN}/{SKILL}/disable")
    assert disable.status_code == 200, disable.text
    assert disable.json() == {"plugin": PLUGIN, "skill": SKILL, "enabled": False}

    after_disable = await client.get("/api/workspace/disabled-skills")
    assert after_disable.status_code == 200
    pairs = {(d["plugin"], d["skill"]) for d in after_disable.json()["disabled"]}
    assert (PLUGIN, SKILL) in pairs

    enable = await client.post(f"/api/workspace/skills/{PLUGIN}/{SKILL}/enable")
    assert enable.status_code == 200, enable.text
    assert enable.json() == {"plugin": PLUGIN, "skill": SKILL, "enabled": True}

    after_enable = await client.get("/api/workspace/disabled-skills")
    assert after_enable.status_code == 200
    pairs = {(d["plugin"], d["skill"]) for d in after_enable.json()["disabled"]}
    assert (PLUGIN, SKILL) not in pairs


@pytest.mark.asyncio
async def test_disable_is_idempotent(client) -> None:
    await _signup_and_login(client)

    first = await client.post(f"/api/workspace/skills/{PLUGIN}/{SKILL}/disable")
    assert first.status_code == 200
    second = await client.post(f"/api/workspace/skills/{PLUGIN}/{SKILL}/disable")
    assert second.status_code == 200
    listing = await client.get("/api/workspace/disabled-skills")
    pairs = [(d["plugin"], d["skill"]) for d in listing.json()["disabled"]]
    assert pairs.count((PLUGIN, SKILL)) == 1, (
        f"disable should be idempotent; got duplicate rows: {pairs}"
    )
