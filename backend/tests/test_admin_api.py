"""Admin API — role management, user listing, workspace reconstruction.

Merged from test_phase11_admin_role.py, test_phase13b_admin_users_listing.py
and test_phase14_5_c_admin_reconstruction.py (test-slim Phase 3).

Routes covered (one non-admin-403 test per route, not per phase):
- POST /api/admin/users/{id}/role — promotion, self-promotion ban,
  invalid role, missing target, audit row, end-to-end posture unlock
- GET  /api/admin/users + /api/admin/users/{id} — listing, detail,
  filters, DTO never leaks password hash / tokens
- GET  /api/admin/audit/reconstruction — workspace-scoped (matter_id
  IS NULL) rows only, source semantics, filter composition, unified
  audit.reconstruction.viewed payload with scope="workspace"
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, UTC
from pathlib import Path

import pytest
from sqlalchemy import select

from app.core.model_gateway import ModelResult
from app.core.trust_ceremony import clear_ceremonies
from app.models import (
    AuditEntry,
    Matter,
    PRIVILEGE_MIXED,
    User,
)


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------


async def _register(client, *, email: str | None = None) -> tuple[str, str]:
    """Register a user. Returns (email, password)."""
    email = email or f"admin-api-{uuid.uuid4().hex[:8]}@example.com"
    password = "admin-api-2026"
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


async def _register_and_login(client) -> str:
    email, password = await _register(client)
    await _login(client, email, password)
    return email


async def _promote_to_superuser(email: str) -> uuid.UUID:
    from app.main import app
    factory = app.state.session_factory
    async with factory() as session:
        u = await session.scalar(select(User).where(User.email == email))
        u.is_superuser = True
        await session.commit()
        return u.id


async def _promote_in_session(db_session, email: str) -> None:
    user = await db_session.scalar(select(User).where(User.email == email))
    assert user is not None
    user.is_superuser = True
    await db_session.flush()


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


async def _set_role(email: str, role: str) -> uuid.UUID:
    from app.main import app
    factory = app.state.session_factory
    async with factory() as session:
        u = await session.scalar(select(User).where(User.email == email))
        u.role = role
        await session.commit()
        return u.id


def _insert_workspace_audit(
    db_session,
    *,
    action: str,
    seconds: int = 0,
    payload: dict | None = None,
) -> AuditEntry:
    """Insert a workspace-scoped audit row (matter_id IS NULL)."""
    row = AuditEntry(
        id=uuid.uuid4(),
        timestamp=datetime(2026, 1, 1, second=seconds, tzinfo=UTC),
        actor_id=None,
        matter_id=None,           # ← workspace scope
        action=action,
        module="test.workspace",
        resource_type=None,
        resource_id=None,
        payload=payload or {},
    )
    db_session.add(row)
    return row


# ===========================================================================
# POST /api/admin/users/{id}/role — role management
# ===========================================================================


@pytest.mark.asyncio
async def test_role_change_non_admin_caller_403(client) -> None:
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


@pytest.mark.asyncio
async def test_role_change_unknown_role_422(client) -> None:
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


@pytest.mark.asyncio
async def test_role_change_missing_target_404(client) -> None:
    admin_email, admin_pwd = await _register(client)
    await _promote_to_superuser(admin_email)
    await _login(client, admin_email, admin_pwd)

    resp = await client.post(
        f"/api/admin/users/{uuid.uuid4()}/role",
        json={"role": "qualified_solicitor"},
    )
    assert resp.status_code == 404
    assert resp.json()["detail"]["error"] == "user_not_found"


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
# End-to-end: after promotion, invoke on a B_mixed matter succeeds
# (exercises the plugin bridge via examples/modules/contract_review/)
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
def stub_gateway_admin(monkeypatch):
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
async def test_post_promotion_invoke_on_b_mixed_succeeds(
    client, stub_gateway_admin
) -> None:
    """The load-bearing end-to-end regression: after the admin promotes
    a fresh user to qualified_solicitor, the posture gate stops
    blocking on a B_mixed matter. Closes the demo-role gap.

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
    # user to superuser via direct DB — the role endpoint deliberately
    # only ships role management, not is_superuser management. A real
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
    for _ in range(6):
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
        # Khan v Acme defaults to B_mixed — pre-promotion a default
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
    #    qualified_solicitor per the promotion.
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


# ===========================================================================
# GET /api/admin/users + /api/admin/users/{id} — listing + detail
# ===========================================================================


@pytest.mark.asyncio
async def test_list_users_happy_path(client) -> None:
    admin_email, admin_pwd = await _register(client)
    await _promote_to_superuser(admin_email)
    # Two more users.
    target1, _ = await _register(client)
    target2, _ = await _register(client)
    await _login(client, admin_email, admin_pwd)

    resp = await client.get("/api/admin/users")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    emails = {row["email"] for row in body}
    assert admin_email in emails
    assert target1 in emails
    assert target2 in emails


@pytest.mark.asyncio
async def test_detail_returns_single_user(client) -> None:
    admin_email, admin_pwd = await _register(client)
    await _promote_to_superuser(admin_email)
    target_email, _ = await _register(client)
    target_id = await _user_id_by_email(target_email)
    await _login(client, admin_email, admin_pwd)

    resp = await client.get(f"/api/admin/users/{target_id}")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["id"] == str(target_id)
    assert body["email"] == target_email
    assert body["is_superuser"] is False


@pytest.mark.asyncio
async def test_users_listing_non_admin_caller_gets_403(client) -> None:
    caller_email, caller_pwd = await _register(client)
    # No promotion.
    await _login(client, caller_email, caller_pwd)

    resp_list = await client.get("/api/admin/users")
    assert resp_list.status_code == 403
    assert resp_list.json()["detail"]["error"] == "admin_required"

    resp_detail = await client.get(f"/api/admin/users/{uuid.uuid4()}")
    assert resp_detail.status_code == 403
    assert resp_detail.json()["detail"]["error"] == "admin_required"


@pytest.mark.asyncio
async def test_detail_missing_target_404(client) -> None:
    admin_email, admin_pwd = await _register(client)
    await _promote_to_superuser(admin_email)
    await _login(client, admin_email, admin_pwd)

    resp = await client.get(f"/api/admin/users/{uuid.uuid4()}")
    assert resp.status_code == 404
    assert resp.json()["detail"]["error"] == "user_not_found"


@pytest.mark.asyncio
async def test_dto_never_leaks_password_hash_or_tokens(client) -> None:
    admin_email, admin_pwd = await _register(client)
    await _promote_to_superuser(admin_email)
    await _register(client)
    await _login(client, admin_email, admin_pwd)

    resp = await client.get("/api/admin/users")
    assert resp.status_code == 200
    # Forbidden fields — none of these may appear in any row.
    forbidden = {"hashed_password", "verification_token", "reset_password_token"}
    for row in resp.json():
        leaked = forbidden & set(row.keys())
        assert leaked == set(), f"forbidden fields leaked: {leaked!r}"


@pytest.mark.asyncio
async def test_list_users_role_filter(client) -> None:
    admin_email, admin_pwd = await _register(client)
    await _promote_to_superuser(admin_email)
    # One qualified_solicitor target.
    qs_email, _ = await _register(client)
    await _set_role(qs_email, "qualified_solicitor")
    # One workspace_admin target.
    wa_email, _ = await _register(client)
    await _set_role(wa_email, "workspace_admin")
    await _login(client, admin_email, admin_pwd)

    resp = await client.get("/api/admin/users?role=qualified_solicitor")
    assert resp.status_code == 200
    emails = {row["email"] for row in resp.json()}
    assert qs_email in emails
    assert wa_email not in emails
    assert admin_email not in emails


@pytest.mark.asyncio
async def test_list_users_is_superuser_filter(client) -> None:
    admin_email, admin_pwd = await _register(client)
    await _promote_to_superuser(admin_email)
    target_email, _ = await _register(client)
    await _login(client, admin_email, admin_pwd)

    resp = await client.get("/api/admin/users?is_superuser=true")
    assert resp.status_code == 200
    emails = {row["email"] for row in resp.json()}
    assert admin_email in emails
    assert target_email not in emails


@pytest.mark.asyncio
async def test_list_users_invalid_role_filter_422(client) -> None:
    admin_email, admin_pwd = await _register(client)
    await _promote_to_superuser(admin_email)
    await _login(client, admin_email, admin_pwd)

    resp = await client.get("/api/admin/users?role=banana")
    assert resp.status_code == 422
    assert resp.json()["detail"]["error"] == "invalid_role"


# ===========================================================================
# GET /api/admin/audit/reconstruction — workspace-scoped reconstruction
# ===========================================================================


@pytest.mark.asyncio
async def test_admin_reconstruction_anon_caller_gets_401(client):
    client.cookies.clear()
    resp = await client.get("/api/admin/audit/reconstruction")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_admin_reconstruction_non_superuser_gets_403(client, db_session):
    await _register_and_login(client)
    # Default registration creates a non-superuser; do NOT promote.
    resp = await client.get("/api/admin/audit/reconstruction")
    assert resp.status_code == 403
    body = resp.json()
    assert body["detail"]["error"] == "admin_required"


@pytest.mark.asyncio
async def test_superuser_sees_workspace_rows(client, db_session):
    email = await _register_and_login(client)
    await _promote_in_session(db_session, email)
    target_action = f"admin-recon.workspace-row.{uuid.uuid4().hex[:6]}"
    _insert_workspace_audit(db_session, action=target_action, seconds=1)
    await db_session.flush()

    resp = await client.get("/api/admin/audit/reconstruction")
    assert resp.status_code == 200
    body = resp.json()
    actions = [e["action"] for e in body["entries"]]
    assert target_action in actions


@pytest.mark.asyncio
async def test_matter_scoped_rows_are_NOT_surfaced(client, db_session):
    """A row with matter_id set must NOT appear here. The admin
    endpoint is strictly workspace-scoped; matter rows live on the
    per-matter endpoint."""
    email = await _register_and_login(client)
    await _promote_in_session(db_session, email)
    user = await db_session.scalar(select(User).where(User.email == email))
    # Create a matter + a matter-scoped audit row.
    matter = await db_session.scalar(select(Matter).where(Matter.created_by_id == user.id))
    assert matter is not None
    matter_action = f"admin-recon.matter-row.{uuid.uuid4().hex[:6]}"
    db_session.add(AuditEntry(
        id=uuid.uuid4(),
        timestamp=datetime(2026, 1, 1, second=2, tzinfo=UTC),
        actor_id=None,
        matter_id=matter.id,
        action=matter_action,
        module="test.matter",
        payload={},
    ))
    await db_session.flush()

    resp = await client.get("/api/admin/audit/reconstruction")
    actions = [e["action"] for e in resp.json()["entries"]]
    assert matter_action not in actions, (
        "matter-scoped row leaked into the workspace-scope admin endpoint"
    )


@pytest.mark.asyncio
async def test_state_machine_source_alone_returns_empty(client, db_session):
    """Request accepted (no 422), response empty. The chip on the
    frontend renders disabled with a tooltip naming the substrate
    constraint; the substrate-truth here is that no rows exist."""
    email = await _register_and_login(client)
    await _promote_in_session(db_session, email)
    resp = await client.get(
        "/api/admin/audit/reconstruction?include=state_machine",
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["entries"] == []
    assert body["next_cursor"] is None


@pytest.mark.asyncio
async def test_advice_boundary_source_alone_returns_empty(client, db_session):
    email = await _register_and_login(client)
    await _promote_in_session(db_session, email)
    resp = await client.get(
        "/api/admin/audit/reconstruction?include=advice_boundary",
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["entries"] == []


@pytest.mark.asyncio
async def test_all_three_sources_accepted_only_audit_returns_rows(
    client, db_session
):
    """Pin the substrate-truth contract: include=audit,state_machine,
    advice_boundary is accepted (no 422 churn) and only audit yields
    rows. Frontend chip UX renders the two non-audit chips as
    disabled with a tooltip; backend mirrors with empty returns."""
    email = await _register_and_login(client)
    await _promote_in_session(db_session, email)
    target_action = f"admin-recon.multi-source.{uuid.uuid4().hex[:6]}"
    _insert_workspace_audit(db_session, action=target_action, seconds=3)
    await db_session.flush()

    resp = await client.get(
        "/api/admin/audit/reconstruction"
        "?include=audit,state_machine,advice_boundary",
    )
    assert resp.status_code == 200
    body = resp.json()
    actions = [e["action"] for e in body["entries"]]
    assert target_action in actions
    # No state_machine or advice_boundary rows surfaced.
    for e in body["entries"]:
        assert e["source"] == "audit"


@pytest.mark.asyncio
async def test_action_filter_matches_module_ceremony_rejected(
    client, db_session
):
    """The original UX motivation for 14-B-#2: the InstallCeremony
    409 banner names module.ceremony.rejected; the admin endpoint
    must surface that row when filtered by action."""
    email = await _register_and_login(client)
    await _promote_in_session(db_session, email)
    _insert_workspace_audit(db_session, action="module.ceremony.rejected", seconds=4)
    _insert_workspace_audit(db_session, action="auth.user.registered", seconds=5)
    await db_session.flush()

    resp = await client.get(
        "/api/admin/audit/reconstruction?action=module.ceremony.rejected",
    )
    body = resp.json()
    actions = [e["action"] for e in body["entries"]]
    # Every returned row must match the filter (no auth.user.registered
    # leaked through). Other tests / seed data may have produced
    # additional matches; we don't pin exact equality.
    assert "module.ceremony.rejected" in actions
    assert all(a == "module.ceremony.rejected" for a in actions)


@pytest.mark.asyncio
async def test_admin_reconstruction_invalid_invocation_id_422(client, db_session):
    email = await _register_and_login(client)
    await _promote_in_session(db_session, email)
    resp = await client.get(
        "/api/admin/audit/reconstruction?invocation_id=not-a-uuid",
    )
    assert resp.status_code == 422
    body = resp.json()
    assert body["detail"]["error"] == "invalid_invocation_id"


@pytest.mark.asyncio
async def test_emits_unified_payload_shape_with_workspace_scope(
    client, db_session
):
    """Locked contract from Phase 14.5 A: same action across both
    surfaces, two `scope` values. The admin endpoint must emit
    scope=workspace + matter_id=None + the filters block."""
    email = await _register_and_login(client)
    await _promote_in_session(db_session, email)
    user = await db_session.scalar(select(User).where(User.email == email))

    inv = str(uuid.uuid4())
    resp = await client.get(
        f"/api/admin/audit/reconstruction?invocation_id={inv}"
        f"&action=module.ceremony.rejected",
    )
    assert resp.status_code == 200

    row = await db_session.scalar(
        select(AuditEntry).where(
            AuditEntry.action == "audit.reconstruction.viewed",
            AuditEntry.actor_id == user.id,
            AuditEntry.matter_id.is_(None),    # ← workspace scope
        ).order_by(AuditEntry.timestamp.desc()).limit(1)
    )
    assert row is not None
    payload = row.payload or {}
    assert payload["scope"] == "workspace"
    assert payload["matter_id"] is None
    filters = payload["filters"]
    assert filters["invocation_id"] == inv
    assert filters["action"] == "module.ceremony.rejected"


@pytest.mark.asyncio
async def test_admin_audit_row_visible_from_admin_endpoint_itself(
    client, db_session
):
    """Audit-the-auditor across the admin surface: visiting the
    endpoint emits a row that subsequent visits can see. The matter
    endpoint never surfaces it (matter_id IS NULL excludes it from
    the per-matter loader)."""
    email = await _register_and_login(client)
    await _promote_in_session(db_session, email)

    # First visit — emits one viewed row.
    await client.get("/api/admin/audit/reconstruction")
    # Second visit — should see the row from the first call.
    resp = await client.get(
        "/api/admin/audit/reconstruction?action=audit.reconstruction.viewed",
    )
    actions = [e["action"] for e in resp.json()["entries"]]
    # At least one prior viewed row should surface (from the first
    # call above). The second call's emission lands AFTER the page
    # was rendered + before commit; same-call visibility isn't the
    # contract here — cross-call visibility is.
    assert "audit.reconstruction.viewed" in actions
