"""Phase 3 — install API tests (HTTP-level)."""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import select

from app.core.trust_ceremony import clear_ceremonies
from app.models import InstalledModule, User


TEST_EMAIL_PREFIX = "p3-install"


def _verified_manifest() -> dict:
    return {
        "schema_version": "2.0.0",
        "id": "legalise.test-install",
        "name": "Phase 3 Install Test",
        "version": "1.0.0",
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
                "data_movement": {"local_only": True, "external_destinations": []},
                "gates": ["privilege_posture"],
                "ui": {"slot": "matter.workflows", "label": "Test"},
                "streaming_mode": "sync",
                "advice_tier_max": "draft_advice",
                "audit_events": ["test.invoked"],
            }
        ],
    }


async def _register_admin(client) -> str:
    """Register a superuser via the auth flow + flip is_superuser."""
    from app.core.db import get_session

    email = f"{TEST_EMAIL_PREFIX}-{uuid.uuid4().hex[:8]}@example.com"
    password = "phase3-install-2026"
    reg = await client.post(
        "/auth/register",
        json={"email": email, "password": password},
    )
    assert reg.status_code == 201, reg.text

    # Manually flip the user to superuser via the session factory.
    from app.main import app

    factory = app.state.session_factory
    async with factory() as session:
        user = await session.scalar(
            select(User).where(User.email == email)
        )
        assert user is not None
        user.is_superuser = True
        await session.commit()

    login = await client.post(
        "/auth/login",
        data={"username": email, "password": password},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert login.status_code == 204
    return email


async def _register_regular_user(client) -> str:
    email = f"{TEST_EMAIL_PREFIX}-reg-{uuid.uuid4().hex[:8]}@example.com"
    password = "phase3-install-2026"
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
async def test_start_install_requires_admin(client) -> None:
    """Non-superuser cannot start an install ceremony."""
    clear_ceremonies()
    await _register_regular_user(client)
    resp = await client.post(
        "/api/modules/install",
        json={"source": "manifest", "manifest": _verified_manifest()},
    )
    assert resp.status_code == 403
    assert resp.json()["detail"]["error"] == "admin_required"


@pytest.mark.asyncio
async def test_start_install_with_inline_manifest_succeeds(client) -> None:
    """Superuser can install an inline manifest. Returns CeremonyResponse
    with fast_path=true (publisher=legalise + signature)."""
    clear_ceremonies()
    await _register_admin(client)
    resp = await client.post(
        "/api/modules/install",
        json={"source": "manifest", "manifest": _verified_manifest()},
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["module_id"] == "legalise.test-install"
    assert body["fast_path"] is True
    assert body["state"] == "discovered"
    assert body["permission_card"]["publisher_verified"] is True


@pytest.mark.asyncio
async def test_start_install_invalid_manifest_rejected(client) -> None:
    clear_ceremonies()
    await _register_admin(client)
    bad_manifest = _verified_manifest()
    bad_manifest["capabilities"][0]["kind"] = "wizard"  # invalid enum
    resp = await client.post(
        "/api/modules/install",
        json={"source": "manifest", "manifest": bad_manifest},
    )
    assert resp.status_code == 422
    assert resp.json()["detail"]["error"] == "invalid_manifest"


@pytest.mark.asyncio
async def test_start_install_invalid_source_rejected(client) -> None:
    clear_ceremonies()
    await _register_admin(client)
    resp = await client.post(
        "/api/modules/install",
        json={"source": "not-a-source"},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_full_install_ceremony_persists_installed_module(client) -> None:
    """End-to-end: start ceremony → advance through fast path → grant
    → enabled. After enabled, an installed_modules row exists."""
    clear_ceremonies()
    await _register_admin(client)

    # 1. Start
    start_resp = await client.post(
        "/api/modules/install",
        json={"source": "manifest", "manifest": _verified_manifest()},
    )
    assert start_resp.status_code == 201
    ceremony_id = start_resp.json()["ceremony_id"]

    # 2-4. Advance through fast path with action=trust three times.
    for _ in range(3):
        resp = await client.post(
            f"/api/modules/install/{ceremony_id}/advance",
            json={"action": "trust"},
        )
        assert resp.status_code == 200, resp.text

    # 5. Final grant.
    resp = await client.post(
        f"/api/modules/install/{ceremony_id}/advance",
        json={"action": "grant"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["state"] == "enabled"
    assert body["is_terminal"] is True

    # InstalledModule row exists.
    from app.main import app

    factory = app.state.session_factory
    async with factory() as session:
        row = await session.scalar(
            select(InstalledModule).where(
                InstalledModule.module_id == "legalise.test-install",
            )
        )
        assert row is not None
        assert row.version == "1.0.0"
        assert row.publisher == "legalise"
        assert row.enabled is True
        assert row.signature_status == "verified"
        assert row.verified_at is not None  # fast path took


@pytest.mark.asyncio
async def test_reject_install_does_not_persist(client) -> None:
    clear_ceremonies()
    await _register_admin(client)
    start_resp = await client.post(
        "/api/modules/install",
        json={"source": "manifest", "manifest": _verified_manifest()},
    )
    ceremony_id = start_resp.json()["ceremony_id"]
    resp = await client.post(
        f"/api/modules/install/{ceremony_id}/advance",
        json={"action": "reject"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["state"] == "rejected_by_user"
    assert body["is_terminal"] is True

    # No installed_modules row.
    from app.main import app

    factory = app.state.session_factory
    async with factory() as session:
        row = await session.scalar(
            select(InstalledModule).where(
                InstalledModule.module_id == "legalise.test-install",
            )
        )
        assert row is None


@pytest.mark.asyncio
async def test_get_ceremony_state(client) -> None:
    clear_ceremonies()
    await _register_admin(client)
    start_resp = await client.post(
        "/api/modules/install",
        json={"source": "manifest", "manifest": _verified_manifest()},
    )
    ceremony_id = start_resp.json()["ceremony_id"]
    resp = await client.get(f"/api/modules/install/{ceremony_id}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["ceremony_id"] == ceremony_id
    assert body["state"] == "discovered"


@pytest.mark.asyncio
async def test_get_unknown_ceremony_404(client) -> None:
    clear_ceremonies()
    await _register_admin(client)
    resp = await client.get(f"/api/modules/install/{uuid.uuid4()}")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_advance_requires_admin(client) -> None:
    """Even if the ceremony was started by an admin, advancing
    requires admin too. Regular user cannot drive someone else's
    ceremony."""
    clear_ceremonies()
    await _register_admin(client)
    start_resp = await client.post(
        "/api/modules/install",
        json={"source": "manifest", "manifest": _verified_manifest()},
    )
    ceremony_id = start_resp.json()["ceremony_id"]
    # Log out via subsequent register/login as a non-superuser.
    await _register_regular_user(client)
    resp = await client.post(
        f"/api/modules/install/{ceremony_id}/advance",
        json={"action": "trust"},
    )
    assert resp.status_code == 403
