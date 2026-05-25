"""Phase 5 Step 6 — module.ceremony.rejected audit emission.

Two paths must emit the audit row:
1. ``InvalidCeremonyTransition`` raised inside ``advance_ceremony``
   and translated to HTTP 409 by ``api.modules.advance_install_endpoint``.
2. Pydantic ``RequestValidationError`` raised when the request body
   carries an action that isn't in ``Literal["trust","reject","grant"]``,
   translated to HTTP 422 by the global handler in ``main.py``.
"""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import select

from app.core.trust_ceremony import clear_ceremonies
from app.models import AuditEntry, User


@pytest.fixture
def captured_audit_failures(monkeypatch):
    """Capture every audit_failure call without writing to DB.

    Reason: audit_failure opens an independent committed session for
    production durability through rollback. In tests, the user only
    exists inside the outer SAVEPOINT — the independent session
    cannot see it. Pattern matches
    test_storage_failure_envelopes.py.

    Returns a list that the test reads to assert on emissions.
    """
    from app.core import api as api_module

    captured: list[dict] = []

    async def _capture(session, action, **kwargs):
        captured.append({"action": action, **kwargs})

    monkeypatch.setattr(api_module, "audit_failure", _capture)
    return captured


def _verified_manifest(module_id="legalise.r2-rejaudit", version="1.0.0") -> dict:
    return {
        "schema_version": "2.0.0",
        "id": module_id,
        "name": "Rej Audit",
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
                "ui": {"slot": "matter.workflows", "label": "X"},
                "streaming_mode": "sync",
                "advice_tier_max": "draft_advice",
                "audit_events": ["x.invoked"],
            }
        ],
    }


async def _login_admin(client) -> tuple[str, str]:
    email = f"p5-rejaudit-{uuid.uuid4().hex[:8]}@example.com"
    password = "phase5-rejaudit-2026"
    await client.post(
        "/auth/register", json={"email": email, "password": password}
    )
    from app.main import app

    factory = app.state.session_factory
    async with factory() as session:
        u = await session.scalar(select(User).where(User.email == email))
        u.is_superuser = True
        await session.commit()
    await client.post(
        "/auth/login",
        data={"username": email, "password": password},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    return email, password


@pytest.mark.asyncio
async def test_invalid_ceremony_transition_emits_audit_row(
    client, captured_audit_failures
) -> None:
    """grant from DISCOVERED → 409 + module.ceremony.rejected row."""
    clear_ceremonies()
    email, _ = await _login_admin(client)

    install = await client.post(
        "/api/modules/install",
        json={"source": "manifest", "manifest": _verified_manifest()},
    )
    assert install.status_code == 201, install.text
    ceremony_id = install.json()["ceremony_id"]

    resp = await client.post(
        f"/api/modules/install/{ceremony_id}/advance",
        json={"action": "grant"},
    )
    assert resp.status_code == 409

    # The endpoint's InvalidCeremonyTransition branch routes through
    # the captured audit_failure helper. Exactly one row should land
    # with the canonical shape.
    rejected = [
        c for c in captured_audit_failures
        if c["action"] == "module.ceremony.rejected"
    ]
    assert len(rejected) == 1
    payload = rejected[0]["payload"]
    assert payload["ceremony_id"] == ceremony_id
    assert payload["requested_action"] == "grant"
    assert payload["reason"] == "invalid_transition"


@pytest.mark.asyncio
async def test_unknown_action_emits_audit_row(
    client, captured_audit_failures
) -> None:
    """{"action":"banana"} → 422 + module.ceremony.rejected row via the
    global RequestValidationError handler."""
    clear_ceremonies()
    email, _ = await _login_admin(client)

    install = await client.post(
        "/api/modules/install",
        json={
            "source": "manifest",
            "manifest": _verified_manifest(module_id="legalise.r2-banana"),
        },
    )
    assert install.status_code == 201
    ceremony_id = install.json()["ceremony_id"]

    resp = await client.post(
        f"/api/modules/install/{ceremony_id}/advance",
        json={"action": "banana"},
    )
    assert resp.status_code == 422

    rejected = [
        c for c in captured_audit_failures
        if c["action"] == "module.ceremony.rejected"
    ]
    assert len(rejected) == 1
    payload = rejected[0]["payload"]
    assert payload["reason"] == "schema_validation_failed"
    assert payload["ceremony_id"] == ceremony_id
