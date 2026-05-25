"""Phase 2 — HTTP tests for the v2 manifest endpoints.

Covers:
- GET /api/modules/v2 — list discovered modules
- GET /api/modules/v2/capabilities — flat capability catalogue
- GET /api/modules/v2/{module_id} — single module detail
- Verifies the v1 endpoint (GET /api/modules) continues to function
  unchanged.

Requires the `client` fixture (HTTP-level with auth).
"""

from __future__ import annotations

import uuid

import pytest


TEST_EMAIL_PREFIX = "p2-api"


async def _register_and_login(client) -> str:
    email = f"{TEST_EMAIL_PREFIX}-{uuid.uuid4().hex[:8]}@example.com"
    password = "phase2-api-test-2026"
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
    assert login.status_code == 204
    return email


@pytest.mark.asyncio
async def test_list_v2_modules_endpoint(client) -> None:
    await _register_and_login(client)
    resp = await client.get("/api/modules/v2")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "modules" in body
    assert "ui_slots" in body
    assert isinstance(body["modules"], list)
    assert isinstance(body["ui_slots"], list)
    # Every entry has the expected shape.
    for entry in body["modules"]:
        assert "module_id" in entry
        assert "source_kind" in entry
        assert entry["source_kind"] in (
            "v2",
            "v1_module_json",
            "v1_skill",
        )
        assert "manifest" in entry
        assert "is_valid" in entry
        assert "validation_errors" in entry


@pytest.mark.asyncio
async def test_list_v2_capabilities_endpoint(client) -> None:
    await _register_and_login(client)
    resp = await client.get("/api/modules/v2/capabilities")
    assert resp.status_code == 200, resp.text
    caps = resp.json()
    assert isinstance(caps, list)
    for cap in caps:
        assert "module_id" in cap
        assert "capability_id" in cap
        assert "kind" in cap
        assert "scope" in cap
        assert "reads" in cap
        assert "writes" in cap


@pytest.mark.asyncio
async def test_get_v2_module_not_found(client) -> None:
    await _register_and_login(client)
    resp = await client.get("/api/modules/v2/nonexistent-module-id-12345")
    assert resp.status_code == 404, resp.text
    body = resp.json()
    assert body["detail"]["error"] == "module_not_found"


@pytest.mark.asyncio
async def test_v2_endpoints_require_auth(client) -> None:
    """All three v2 endpoints must require an authenticated user."""
    for path in (
        "/api/modules/v2",
        "/api/modules/v2/capabilities",
        "/api/modules/v2/some-module",
    ):
        resp = await client.get(path)
        # fastapi-users returns 401 for unauthenticated requests when
        # the dependency chain hits current_user.
        assert resp.status_code in (401, 403), f"{path} did not require auth: {resp.status_code}"


@pytest.mark.asyncio
async def test_v1_modules_endpoint_still_functions(client) -> None:
    """Phase 2 must not break the legacy /api/modules endpoint."""
    await _register_and_login(client)
    resp = await client.get("/api/modules")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    # Legacy shape.
    assert "plugins_root" in body
    assert "source" in body
    assert "skills" in body
