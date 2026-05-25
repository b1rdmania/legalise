"""Phase 4 — revoke + update HTTP-level tests."""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import select

from app.core.trust_ceremony import clear_ceremonies
from app.models import InstalledModule, User, WorkspaceSkillCapabilityGrant


TEST_PREFIX = "p4-revoke"


def _verified_manifest(module_id="legalise.p4-test", version="1.0.0") -> dict:
    return {
        "schema_version": "2.0.0",
        "id": module_id,
        "name": "Phase 4 Test",
        "version": version,
        "publisher": "legalise",
        "signed_by": "legalise",
        "signature": "x" * 64,
        "visibility": "first_party",
        "runtime": "native",
        "entrypoint": {"python_module": "test.fixture", "entry": "M"},
        "capabilities": [
            {
                "id": "default",
                "kind": "skill",
                "scope": "matter",
                "reads": ["matter.read"],
                "writes": ["citation.write"],
                "model_access": "none",
                "external_network": False,
                "data_movement": {
                    "local_only": True,
                    "external_destinations": [],
                },
                "gates": ["privilege_posture"],
                "ui": {"slot": "matter.workflows", "label": "Test"},
                "streaming_mode": "sync",
                "advice_tier_max": "draft_advice",
                "audit_events": ["test.invoked"],
            }
        ],
    }


async def _register_admin(client) -> User:
    email = f"{TEST_PREFIX}-{uuid.uuid4().hex[:8]}@example.com"
    password = "phase4-test-2026"
    reg = await client.post(
        "/auth/register", json={"email": email, "password": password}
    )
    assert reg.status_code == 201

    from app.main import app

    factory = app.state.session_factory
    async with factory() as session:
        user = await session.scalar(
            select(User).where(User.email == email)
        )
        assert user is not None
        user.is_superuser = True
        await session.commit()
        return user

    login = await client.post(
        "/auth/login",
        data={"username": email, "password": password},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )


async def _login_admin(client, user_email: str) -> None:
    login = await client.post(
        "/auth/login",
        data={"username": user_email, "password": "phase4-test-2026"},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert login.status_code == 204


async def _register_and_login_admin(client) -> User:
    user = await _register_admin(client)
    await _login_admin(client, user.email)
    return user


async def _install_via_ceremony(client, manifest) -> str:
    """Drive the install ceremony to enabled. Returns the module_id."""
    clear_ceremonies()
    start = await client.post(
        "/api/modules/install",
        json={"source": "manifest", "manifest": manifest},
    )
    assert start.status_code == 201, start.text
    ceremony_id = start.json()["ceremony_id"]
    for _ in range(3):
        r = await client.post(
            f"/api/modules/install/{ceremony_id}/advance",
            json={"action": "trust"},
        )
        assert r.status_code == 200
    r = await client.post(
        f"/api/modules/install/{ceremony_id}/advance",
        json={"action": "grant"},
    )
    assert r.status_code == 200
    return manifest["id"]


@pytest.mark.asyncio
async def test_revoke_not_installed_returns_404(client) -> None:
    await _register_and_login_admin(client)
    resp = await client.post("/api/modules/nope.module/revoke")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_revoke_requires_admin(client) -> None:
    # Register a regular user (not admin).
    email = f"{TEST_PREFIX}-regular-{uuid.uuid4().hex[:8]}@example.com"
    password = "phase4-test-2026"
    await client.post(
        "/auth/register", json={"email": email, "password": password}
    )
    await client.post(
        "/auth/login",
        data={"username": email, "password": password},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    resp = await client.post("/api/modules/anything.module/revoke")
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_revoke_disables_installed_module(client) -> None:
    """Install a module, revoke it, verify it's disabled."""
    user = await _register_and_login_admin(client)
    manifest = _verified_manifest("legalise.revoke-test")
    await _install_via_ceremony(client, manifest)

    resp = await client.post(
        f"/api/modules/{manifest['id']}/revoke",
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["module_id"] == manifest["id"]
    assert body["disabled_rows"] >= 1

    # Confirm the row is disabled.
    from app.main import app

    factory = app.state.session_factory
    async with factory() as session:
        row = await session.scalar(
            select(InstalledModule).where(
                InstalledModule.module_id == manifest["id"]
            )
        )
        assert row is not None
        assert row.enabled is False


@pytest.mark.asyncio
async def test_update_not_installed_returns_404(client) -> None:
    await _register_and_login_admin(client)
    resp = await client.post(
        "/api/modules/nope.module/update",
        json={"new_manifest": _verified_manifest("nope.module")},
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_update_no_expansion_updates_in_place(client) -> None:
    """Install v1.0.0, update to v1.0.1 with identical permissions →
    no ceremony, row updated."""
    await _register_and_login_admin(client)
    manifest_v1 = _verified_manifest("legalise.update-test", "1.0.0")
    await _install_via_ceremony(client, manifest_v1)

    manifest_v2 = _verified_manifest("legalise.update-test", "1.0.1")
    resp = await client.post(
        f"/api/modules/{manifest_v1['id']}/update",
        json={"new_manifest": manifest_v2},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["expansion_detected"] is False
    assert body["ceremony_id"] is None
    assert body["new_version"] == "1.0.1"


@pytest.mark.asyncio
async def test_update_with_expansion_starts_new_ceremony(client) -> None:
    """Install with no external_network, update with external_network=True →
    expansion detected, new ceremony started."""
    await _register_and_login_admin(client)
    manifest_v1 = _verified_manifest("legalise.expand-test", "1.0.0")
    await _install_via_ceremony(client, manifest_v1)

    manifest_v2 = _verified_manifest("legalise.expand-test", "1.1.0")
    manifest_v2["capabilities"][0]["external_network"] = True
    manifest_v2["capabilities"][0]["data_movement"][
        "external_destinations"
    ] = ["api.example.com"]

    resp = await client.post(
        f"/api/modules/{manifest_v1['id']}/update",
        json={"new_manifest": manifest_v2},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["expansion_detected"] is True
    assert body["ceremony_id"] is not None
    assert body["expansion_report"]["external_network_added"] is True


@pytest.mark.asyncio
async def test_update_module_id_mismatch_rejected(client) -> None:
    await _register_and_login_admin(client)
    manifest_v1 = _verified_manifest("legalise.mismatch-test", "1.0.0")
    await _install_via_ceremony(client, manifest_v1)

    wrong = _verified_manifest("legalise.different-id", "2.0.0")
    resp = await client.post(
        f"/api/modules/{manifest_v1['id']}/update",
        json={"new_manifest": wrong},
    )
    assert resp.status_code == 422
    assert resp.json()["detail"]["error"] == "module_id_mismatch"


@pytest.mark.asyncio
async def test_update_invalid_manifest_rejected(client) -> None:
    await _register_and_login_admin(client)
    manifest_v1 = _verified_manifest("legalise.invalid-test", "1.0.0")
    await _install_via_ceremony(client, manifest_v1)

    bad = _verified_manifest("legalise.invalid-test", "1.1.0")
    bad["capabilities"][0]["kind"] = "wizard"

    resp = await client.post(
        f"/api/modules/{manifest_v1['id']}/update",
        json={"new_manifest": bad},
    )
    assert resp.status_code == 422
    assert resp.json()["detail"]["error"] == "invalid_manifest"


@pytest.mark.asyncio
async def test_update_requires_admin(client) -> None:
    """Non-admin cannot trigger update."""
    email = f"{TEST_PREFIX}-regularupdate-{uuid.uuid4().hex[:8]}@example.com"
    await client.post(
        "/auth/register",
        json={"email": email, "password": "phase4-test-2026"},
    )
    await client.post(
        "/auth/login",
        data={"username": email, "password": "phase4-test-2026"},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    resp = await client.post(
        "/api/modules/anything.module/update",
        json={"new_manifest": _verified_manifest("anything.module")},
    )
    assert resp.status_code == 403
