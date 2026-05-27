"""Phase 14.5 C — workspace / admin audit reconstruction.

Closes BACKEND_GAP_AUDIT finding 14-B-#2. New endpoint
``GET /api/admin/audit/reconstruction`` returns workspace-scoped
audit rows (matter_id IS NULL) so InstallCeremony's invalid-transition
banner + future admin surfaces can deep-link to a real reconstruction
page.

Substrate truth + locks:
- Superuser-only (admin_required envelope on 403).
- Only `source="audit"` returns rows. state_machine + advice_boundary
  are matter-bound by substrate design (StateMachineInstance always
  has a matter owner; AdviceBoundaryDecision.gate_state always carries
  matter_id) and return empty cleanly.
- Composes with Phase 14.5 A `invocation_id` + `action` filters.
- Emits the SAME `audit.reconstruction.viewed` action as the matter
  endpoint, with `payload.scope="workspace"` + `payload.matter_id=None`.
  Unified payload schema across both surfaces.
"""

from __future__ import annotations

import uuid
from datetime import datetime, UTC

import pytest
from sqlalchemy import select

from app.models import AuditEntry, User


# ---------------------------------------------------------------------------
# Helpers — register / login / promote
# ---------------------------------------------------------------------------


async def _register_and_login(client) -> str:
    email = f"p145c-{uuid.uuid4().hex[:8]}@example.com"
    pw = "p145c-pwd-2026"
    await client.post("/auth/register", json={"email": email, "password": pw})
    await client.post(
        "/auth/login",
        data={"username": email, "password": pw},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    return email


async def _promote_to_superuser(db_session, email: str) -> None:
    user = await db_session.scalar(select(User).where(User.email == email))
    assert user is not None
    user.is_superuser = True
    await db_session.flush()


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


# ---------------------------------------------------------------------------
# Auth gating
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_anon_caller_gets_401(client):
    client.cookies.clear()
    resp = await client.get("/api/admin/audit/reconstruction")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_non_superuser_gets_403_admin_required(client, db_session):
    await _register_and_login(client)
    # Default registration creates a non-superuser; do NOT promote.
    resp = await client.get("/api/admin/audit/reconstruction")
    assert resp.status_code == 403
    body = resp.json()
    assert body["detail"]["error"] == "admin_required"


# ---------------------------------------------------------------------------
# Returns workspace rows (matter_id IS NULL)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_superuser_sees_workspace_rows(client, db_session):
    email = await _register_and_login(client)
    await _promote_to_superuser(db_session, email)
    target_action = f"phase145c.workspace-row.{uuid.uuid4().hex[:6]}"
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
    from app.models import Matter

    email = await _register_and_login(client)
    await _promote_to_superuser(db_session, email)
    user = await db_session.scalar(select(User).where(User.email == email))
    # Create a matter + a matter-scoped audit row.
    matter = await db_session.scalar(select(Matter).where(Matter.created_by_id == user.id))
    assert matter is not None
    matter_action = f"phase145c.matter-row.{uuid.uuid4().hex[:6]}"
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


# ---------------------------------------------------------------------------
# Source semantics: state_machine + advice_boundary return empty
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_state_machine_source_alone_returns_empty(client, db_session):
    """Request accepted (no 422), response empty. The chip on the
    frontend renders disabled with a tooltip naming the substrate
    constraint; the substrate-truth here is that no rows exist."""
    email = await _register_and_login(client)
    await _promote_to_superuser(db_session, email)
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
    await _promote_to_superuser(db_session, email)
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
    await _promote_to_superuser(db_session, email)
    target_action = f"phase145c.multi-source.{uuid.uuid4().hex[:6]}"
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


# ---------------------------------------------------------------------------
# Filter composition (Phase 14.5 A params apply here too)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_action_filter_matches_module_ceremony_rejected(
    client, db_session
):
    """The original UX motivation for 14-B-#2: the InstallCeremony
    409 banner names module.ceremony.rejected; the admin endpoint
    must surface that row when filtered by action."""
    email = await _register_and_login(client)
    await _promote_to_superuser(db_session, email)
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
async def test_invalid_invocation_id_422(client, db_session):
    email = await _register_and_login(client)
    await _promote_to_superuser(db_session, email)
    resp = await client.get(
        "/api/admin/audit/reconstruction?invocation_id=not-a-uuid",
    )
    assert resp.status_code == 422
    body = resp.json()
    assert body["detail"]["error"] == "invalid_invocation_id"


# ---------------------------------------------------------------------------
# Unified audit payload — scope="workspace" + matter_id=None
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_emits_unified_payload_shape_with_workspace_scope(
    client, db_session
):
    """Locked contract from Phase 14.5 A: same action across both
    surfaces, two `scope` values. The admin endpoint must emit
    scope=workspace + matter_id=None + the filters block."""
    email = await _register_and_login(client)
    await _promote_to_superuser(db_session, email)
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
    await _promote_to_superuser(db_session, email)

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
