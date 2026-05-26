"""Phase 11 — admin role endpoint tests.

Seven tests per the v2 plan:

1. Non-admin → 403 admin_required
2. Self-promotion → 403 self_promotion_forbidden
3. Unknown role → 422 invalid_role
4. Target missing → 404 user_not_found
5. Successful promotion → 200; DB reflects new role
6. Audit row recorded with from_role + to_role + target_user_id
7. End-to-end: after promotion, Phase 10 invoke on B_mixed succeeds
"""

from __future__ import annotations

import json
import uuid
from pathlib import Path

import pytest
from sqlalchemy import select

from app.core.model_gateway import ModelResult
from app.core.trust_ceremony import clear_ceremonies
from app.models import (
    AuditEntry,
    InstalledModule,
    Matter,
    PRIVILEGE_MIXED,
    STATUS_OPEN,
    User,
)


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------


async def _register(client, *, email: str | None = None) -> tuple[str, str]:
    """Register a user. Returns (email, password)."""
    email = email or f"p11-{uuid.uuid4().hex[:8]}@example.com"
    password = "phase11-2026"
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


async def _promote_to_superuser(email: str) -> uuid.UUID:
    from app.main import app
    factory = app.state.session_factory
    async with factory() as session:
        u = await session.scalar(select(User).where(User.email == email))
        u.is_superuser = True
        await session.commit()
        return u.id


async def _user_id_by_email(email: str) -> uuid.UUID:
    from app.main import app
    factory = app.state.session_factory
    async with factory() as session:
        u = await session.scalar(select(User).where(User.email == email))
        return u.id


async def _user_role_by_id(user_id: uuid.UUID) -> str:
    from app.main import app
    factory = app.state.session_factory
    async with factory() as session:
        u = await session.scalar(select(User).where(User.id == user_id))
        return u.role


# ---------------------------------------------------------------------------
# 1. Non-admin → 403
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_non_admin_caller_403(client) -> None:
    # Caller registers but does NOT get superuser.
    caller_email, caller_pwd = await _register(client)
    target_email, _ = await _register(client)
    target_id = await _user_id_by_email(target_email)
    await _login(client, caller_email, caller_pwd)

    resp = await client.post(
        f"/api/admin/users/{target_id}/role",
        json={"role": "qualified_solicitor"},
    )
    assert resp.status_code == 403
    assert resp.json()["detail"]["error"] == "admin_required"

    # DB unchanged.
    assert await _user_role_by_id(target_id) == "solicitor"


# ---------------------------------------------------------------------------
# 2. Self-promotion → 403
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_self_promotion_forbidden(client) -> None:
    admin_email, admin_pwd = await _register(client)
    admin_id = await _promote_to_superuser(admin_email)
    await _login(client, admin_email, admin_pwd)

    resp = await client.post(
        f"/api/admin/users/{admin_id}/role",
        json={"role": "workspace_admin"},
    )
    assert resp.status_code == 403
    assert resp.json()["detail"]["error"] == "self_promotion_forbidden"

    # DB unchanged — admin stays at the default solicitor role.
    assert await _user_role_by_id(admin_id) == "solicitor"

    # No audit row.
    from app.main import app
    factory = app.state.session_factory
    async with factory() as session:
        rows = (
            await session.scalars(
                select(AuditEntry).where(
                    AuditEntry.action == "user.role.changed",
                    AuditEntry.actor_id == admin_id,
                )
            )
        ).all()
        assert rows == []


# ---------------------------------------------------------------------------
# 3. Unknown role → 422
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_unknown_role_422(client) -> None:
    admin_email, admin_pwd = await _register(client)
    await _promote_to_superuser(admin_email)
    await _login(client, admin_email, admin_pwd)
    target_email, _ = await _register(client)
    target_id = await _user_id_by_email(target_email)

    resp = await client.post(
        f"/api/admin/users/{target_id}/role",
        json={"role": "banana"},
    )
    assert resp.status_code == 422
    detail = resp.json()["detail"]
    assert detail["error"] == "invalid_role"
    assert detail["supplied"] == "banana"
    assert "qualified_solicitor" in detail["allowed"]

    # DB unchanged.
    assert await _user_role_by_id(target_id) == "solicitor"


# ---------------------------------------------------------------------------
# 4. Target missing → 404
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_missing_target_404(client) -> None:
    admin_email, admin_pwd = await _register(client)
    await _promote_to_superuser(admin_email)
    await _login(client, admin_email, admin_pwd)

    resp = await client.post(
        f"/api/admin/users/{uuid.uuid4()}/role",
        json={"role": "qualified_solicitor"},
    )
    assert resp.status_code == 404
    assert resp.json()["detail"]["error"] == "user_not_found"


# ---------------------------------------------------------------------------
# 5. Successful promotion → 200 + DB reflects
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_successful_promotion(client) -> None:
    admin_email, admin_pwd = await _register(client)
    await _promote_to_superuser(admin_email)
    await _login(client, admin_email, admin_pwd)
    target_email, _ = await _register(client)
    target_id = await _user_id_by_email(target_email)

    assert await _user_role_by_id(target_id) == "solicitor"

    resp = await client.post(
        f"/api/admin/users/{target_id}/role",
        json={"role": "qualified_solicitor"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["id"] == str(target_id)
    assert body["role"] == "qualified_solicitor"
    assert body["email"] == target_email

    # DB reflects the change.
    assert await _user_role_by_id(target_id) == "qualified_solicitor"


# ---------------------------------------------------------------------------
# 6. Audit row recorded
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_audit_row_recorded_on_promotion(client) -> None:
    admin_email, admin_pwd = await _register(client)
    admin_id = await _promote_to_superuser(admin_email)
    await _login(client, admin_email, admin_pwd)
    target_email, _ = await _register(client)
    target_id = await _user_id_by_email(target_email)

    resp = await client.post(
        f"/api/admin/users/{target_id}/role",
        json={"role": "qualified_solicitor"},
    )
    assert resp.status_code == 200

    from app.main import app
    factory = app.state.session_factory
    async with factory() as session:
        row = await session.scalar(
            select(AuditEntry).where(
                AuditEntry.action == "user.role.changed",
                AuditEntry.actor_id == admin_id,
                AuditEntry.resource_id == str(target_id),
            )
        )
        assert row is not None
        assert row.module == "core.admin_users"
        assert row.payload["target_user_id"] == str(target_id)
        assert row.payload["from_role"] == "solicitor"
        assert row.payload["to_role"] == "qualified_solicitor"
        assert row.payload["reason"] == "manual_admin_action"


# ---------------------------------------------------------------------------
# 7. End-to-end: after promotion, Phase 10 invoke on B_mixed succeeds
# ---------------------------------------------------------------------------


def _verified_manifest_contract_review() -> dict:
    candidates = [
        Path(__file__).resolve().parents[2]
        / "examples" / "modules" / "contract_review" / "module.json",
        Path("/app/examples/modules/contract_review/module.json"),
    ]
    for c in candidates:
        if c.exists():
            return json.loads(c.read_text())
    raise FileNotFoundError("contract-review manifest")


@pytest.fixture
def stub_gateway_phase11(monkeypatch):
    from app.core.api import model_gateway as gateway_singleton

    async def _stub_call(**kwargs):
        return ModelResult(
            text=json.dumps({"findings": []}),
            model_used="anthropic",
            prompt_hash="x" * 64,
            response_hash="x" * 64,
            token_count=42,
            latency_ms=10,
        )

    monkeypatch.setattr(gateway_singleton, "call", _stub_call)


@pytest.mark.asyncio
async def test_post_promotion_phase10_invoke_on_b_mixed_succeeds(
    client, stub_gateway_phase11
) -> None:
    """The load-bearing end-to-end regression: after Phase 11 promotes
    a fresh user to qualified_solicitor, the Phase 8 posture gate
    stops blocking on a B_mixed matter. Closes the demo-role gap.

    Walks:
      1. Register admin → promote to superuser
      2. Register fresh user (default role = solicitor)
      3. Admin promotes fresh user via POST /api/admin/users/{id}/role
      4. Fresh user logs in, installs Contract Review, grants caps,
         posts to /invocations against the seeded Khan v Acme
         (B_mixed posture)
      5. Invocation succeeds — posture gate accepts qualified_solicitor
    """
    clear_ceremonies()

    # 1+2. Two registrations. Admin's needs superuser; user stays
    #      at default 'solicitor'.
    admin_email, admin_pwd = await _register(client)
    await _promote_to_superuser(admin_email)
    user_email, user_pwd = await _register(client)
    user_id = await _user_id_by_email(user_email)

    # 3. Admin promotes the fresh user.
    await _login(client, admin_email, admin_pwd)
    promote = await client.post(
        f"/api/admin/users/{user_id}/role",
        json={"role": "qualified_solicitor"},
    )
    assert promote.status_code == 200
    assert promote.json()["role"] == "qualified_solicitor"

    # The fresh user also needs install rights for the test (admin
    # install ceremony is gated on superuser). Promote the fresh
    # user to superuser via direct DB — Phase 11 deliberately only
    # ships role management, not is_superuser management. A real
    # demo deployment would either grant superuser separately or
    # have the admin install + the user just grant; the test takes
    # the simpler path.
    from app.main import app
    factory = app.state.session_factory
    async with factory() as session:
        u = await session.scalar(select(User).where(User.id == user_id))
        u.is_superuser = True
        await session.commit()

    # 4. Fresh user logs in and walks the install → grant → invoke flow.
    await _login(client, user_email, user_pwd)

    manifest = _verified_manifest_contract_review()
    start = await client.post(
        "/api/modules/install",
        json={"source": "manifest", "manifest": manifest},
    )
    assert start.status_code == 201
    ceremony_id = start.json()["ceremony_id"]
    for _ in range(3):
        r = await client.post(
            f"/api/modules/install/{ceremony_id}/advance",
            json={"action": "trust"},
        )
        assert r.status_code == 200
    final = await client.post(
        f"/api/modules/install/{ceremony_id}/advance",
        json={"action": "grant"},
    )
    assert final.status_code == 200

    # Resolve Khan v Acme + NDA document.
    from app.core.seed import KHAN_SLUG
    from app.models import Document

    async with factory() as session:
        matter = await session.scalar(
            select(Matter).where(
                Matter.slug == KHAN_SLUG, Matter.created_by_id == user_id
            )
        )
        assert matter is not None
        # Khan v Acme defaults to B_mixed — pre-Phase-11 a default
        # 'solicitor' user would have hit posture_gate_blocked.
        assert matter.privilege_posture == PRIVILEGE_MIXED
        matter_slug = matter.slug
        nda = await session.scalar(
            select(Document).where(
                Document.matter_id == matter.id,
                Document.filename == "synthetic-mutual-nda.docx",
            )
        )
        assert nda is not None
        nda_id = nda.id

    grant = await client.post(
        f"/api/matters/{matter_slug}/grants",
        json={
            "module_id": "examples.contract-review",
            "capability_id": "review",
        },
    )
    assert grant.status_code == 201

    # 5. Invoke — posture should now PASS because the user is
    #    qualified_solicitor per Phase 11's promotion.
    invoke = await client.post(
        f"/api/matters/{matter_slug}/invocations",
        json={
            "module_id": "examples.contract-review",
            "capability_id": "review",
            "args": {"document_id": str(nda_id)},
        },
    )
    assert invoke.status_code == 200, invoke.text
    assert invoke.json()["matter_id"] == str(matter.id)
