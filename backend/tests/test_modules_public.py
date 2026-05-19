"""Public modules catalogue coverage.

The endpoint is the unauth surface for the Modules page. Two contract
requirements above shape:
    1. No workspace state leaks (no `granted_capabilities`, no `enabled`).
    2. The skills/broken contents must match what the authed endpoint
       reports, because both must walk the same manifest resolver.
"""

from __future__ import annotations

import pytest


PUBLIC_AUTH_EMAIL = "modules-public-cross@example.com"
PUBLIC_AUTH_PASSWORD = "modules-public-cross-password-2026"


@pytest.mark.asyncio
async def test_public_modules_returns_expected_shape(client) -> None:
    resp = await client.get("/api/modules/public")
    assert resp.status_code == 200, resp.text

    body = resp.json()
    assert set(body.keys()) == {"source", "skills", "broken"}
    assert {"repo", "ref"} <= set(body["source"].keys())
    assert isinstance(body["skills"], list)
    assert isinstance(body["broken"], list)

    for skill in body["skills"]:
        expected = {
            "plugin",
            "skill",
            "name",
            "description",
            "declared_capabilities",
            "trust_posture",
            "source_url",
        }
        assert set(skill.keys()) == expected, (
            f"unexpected keys on public skill: {set(skill.keys()) ^ expected}"
        )

    for broken in body["broken"]:
        assert {"plugin", "skill", "errors"} <= set(broken.keys())


@pytest.mark.asyncio
async def test_public_modules_does_not_leak_workspace_state(client) -> None:
    """The public response must not carry `granted_capabilities` or
    `enabled` even if Pydantic would happily serialise them."""
    resp = await client.get("/api/modules/public")
    assert resp.status_code == 200, resp.text
    for skill in resp.json()["skills"]:
        assert "granted_capabilities" not in skill
        assert "enabled" not in skill


@pytest.mark.asyncio
async def test_public_modules_requires_no_auth(client) -> None:
    """No cookie, no auth header, still 200."""
    resp = await client.get("/api/modules/public")
    assert resp.status_code == 200, resp.text


@pytest.mark.asyncio
async def test_public_modules_sets_cache_header(client) -> None:
    resp = await client.get("/api/modules/public")
    cache = resp.headers.get("cache-control", "")
    assert "max-age=300" in cache
    assert "public" in cache


@pytest.mark.asyncio
async def test_public_matches_authed_skill_set(client) -> None:
    """Both endpoints walk the same manifest resolver, so the (plugin, skill)
    pairs they surface must match (modulo broken-manifest membership, which
    is identical by construction)."""

    reg = await client.post(
        "/auth/register",
        json={"email": PUBLIC_AUTH_EMAIL, "password": PUBLIC_AUTH_PASSWORD},
    )
    assert reg.status_code == 201, reg.text
    login = await client.post(
        "/auth/login",
        data={"username": PUBLIC_AUTH_EMAIL, "password": PUBLIC_AUTH_PASSWORD},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert login.status_code == 204, login.text

    authed = await client.get("/api/modules")
    assert authed.status_code == 200, authed.text
    public = await client.get("/api/modules/public")
    assert public.status_code == 200, public.text

    def pairs(payload: dict) -> set[tuple[str, str]]:
        return {(s["plugin"], s["skill"]) for s in payload["skills"]}

    def broken_pairs(payload: dict) -> set[tuple[str, str]]:
        return {(b["plugin"], b["skill"]) for b in payload["broken"]}

    assert pairs(authed.json()) == pairs(public.json())
    assert broken_pairs(authed.json()) == broken_pairs(public.json())
