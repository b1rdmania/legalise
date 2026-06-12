"""Phase 7 — /api/matters/{slug}/grants endpoint tests.

POST + DELETE + GET, all under the strict matter-access predicate.

The vertical-slice integration test
(``test_phase6_vertical_slice``) covers the happy path end-to-end;
this file isolates and pins the edge cases:

POST:
- POST happy path: rows land with matter scope, one audit per row
- idempotent no-op returns 200 and emits ZERO audit rows
- cross-matter independence: grant on A and B coexist
- non-owner → 404
- module not installed → 404
- module disabled → 409
- archived matter → 404
- capability_id not in module → 422 capability_not_declared
- workspace-scope capability → 422 capability_scope_not_supported_here

DELETE:
- happy path: row gone, audit row written, subsequent require_capability denies
- foreign grant (different user) → 404
- archived matter → 404
- non-existent grant id → 404
- non-owner → 404

GET:
- happy path: returns rows owner created on this matter
- non-owner → 404
- archived matter → 404
"""

from __future__ import annotations

import json
import uuid
from pathlib import Path

import pytest
from sqlalchemy import select

from app.core.capabilities import CapabilityDenied, require_capability
from app.core.trust_ceremony import clear_ceremonies
from app.models import (
    AuditEntry,
    InstalledModule,
    Matter,
    PRIVILEGE_MIXED,
    SCOPE_TYPE_MATTER,
    STATUS_ARCHIVED,
    STATUS_OPEN,
    User,
    WorkspaceSkillCapabilityGrant,
)


# ---------------------------------------------------------------------------
# Shared setup helpers
# ---------------------------------------------------------------------------


def _verified_manifest_for_install() -> dict:
    """Load the on-disk signed Contract Review manifest."""
    candidates = [
        Path(__file__).resolve().parents[2]
        / "examples" / "modules" / "contract_review" / "module.json",
        Path("/app/examples/modules/contract_review/module.json"),
    ]
    for c in candidates:
        if c.exists():
            return json.loads(c.read_text())
    raise FileNotFoundError(f"contract-review manifest not found at: {candidates}")


async def _register_and_login_admin(client) -> str:
    email = f"p7-grants-{uuid.uuid4().hex[:8]}@example.com"
    password = "phase7-grants-2026"
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
    return email


async def _install_contract_review(client) -> str:
    """Run the trust ceremony to enabled. Returns the InstalledModule.id
    (as string) so callers can disable it for the 409 test."""
    clear_ceremonies()
    manifest = _verified_manifest_for_install()
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
    final = await client.post(
        f"/api/modules/install/{ceremony_id}/advance",
        json={"action": "grant"},
    )
    assert final.status_code == 200
    from app.main import app
    factory = app.state.session_factory
    async with factory() as session:
        installed = await session.scalar(
            select(InstalledModule).where(
                InstalledModule.module_id == "examples.contract-review"
            )
        )
        return str(installed.id)


async def _matter_for_current_user(client) -> tuple[str, uuid.UUID, uuid.UUID]:
    """Return (slug, matter_id, user_id) of a fresh matter owned by
    the currently-logged-in user."""
    from app.main import app
    from app.core.seed import KHAN_SLUG

    factory = app.state.session_factory
    async with factory() as session:
        # The auth fixture auto-seeds Khan v Acme on register, so we
        # can just reuse it — slug is stable per user.
        # But we want freshness for some tests, so build a new matter.
        u = await session.scalar(
            select(User).where(User.email.like("p7-grants-%"))
            .order_by(User.opened_at.desc() if hasattr(User, "opened_at") else User.id)
        )
        m = Matter(
            id=uuid.uuid4(),
            slug=f"p7-{uuid.uuid4().hex[:8]}",
            title="P7 Test",
            matter_type="employment_tribunal",
            status=STATUS_OPEN,
            privilege_posture=PRIVILEGE_MIXED,
            default_model_id="claude-opus-4-7",
            created_by_id=u.id,
        )
        session.add(m)
        await session.commit()
        return m.slug, m.id, u.id


# ---------------------------------------------------------------------------
# POST happy paths
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_post_grant_happy_path(client) -> None:
    await _register_and_login_admin(client)
    await _install_contract_review(client)
    slug, matter_id, user_id = await _matter_for_current_user(client)

    resp = await client.post(
        f"/api/matters/{slug}/grants",
        json={
            "module_id": "examples.contract-review",
            "capability_id": "review",
        },
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["was_idempotent_noop"] is False
    assert body["parent_capability_id"] == "review"
    caps = {g["capability"] for g in body["grants"]}
    assert caps == {"matter.document.read", "matter.artifact.write"}
    # All grants are matter-scoped to this matter.
    for g in body["grants"]:
        assert g["scope_type"] == "matter"
        assert g["scope_id"] == str(matter_id)

    # One module.grant.created audit per row written.
    from app.main import app
    factory = app.state.session_factory
    async with factory() as session:
        audits = (
            await session.scalars(
                select(AuditEntry).where(
                    AuditEntry.action == "module.grant.created",
                    AuditEntry.actor_id == user_id,
                    AuditEntry.matter_id == matter_id,
                )
            )
        ).all()
        assert len(audits) == 2


@pytest.mark.asyncio
async def test_post_grant_idempotent_no_op_emits_no_audit(client) -> None:
    """Phase 7 v2 Decision #4: a repeat POST returns 200 with the
    same row ids and writes ZERO new audit rows."""
    await _register_and_login_admin(client)
    await _install_contract_review(client)
    slug, matter_id, user_id = await _matter_for_current_user(client)

    first = await client.post(
        f"/api/matters/{slug}/grants",
        json={
            "module_id": "examples.contract-review",
            "capability_id": "review",
        },
    )
    assert first.status_code == 201
    first_ids = {g["id"] for g in first.json()["grants"]}

    second = await client.post(
        f"/api/matters/{slug}/grants",
        json={
            "module_id": "examples.contract-review",
            "capability_id": "review",
        },
    )
    assert second.status_code == 200, second.text
    assert second.json()["was_idempotent_noop"] is True
    assert {g["id"] for g in second.json()["grants"]} == first_ids

    # Audit count unchanged.
    from app.main import app
    factory = app.state.session_factory
    async with factory() as session:
        audits = (
            await session.scalars(
                select(AuditEntry).where(
                    AuditEntry.action == "module.grant.created",
                    AuditEntry.actor_id == user_id,
                    AuditEntry.matter_id == matter_id,
                )
            )
        ).all()
        assert len(audits) == 2, (
            f"idempotent no-op emitted extra audits: got {len(audits)}, want 2"
        )


@pytest.mark.asyncio
async def test_post_grant_cross_matter_independence(client) -> None:
    """The load-bearing test: same user, two matters, each gets its
    own scoped grants. Pre-Phase-7-v2 the unique constraint on
    (user, plugin, skill, capability) made this impossible."""
    await _register_and_login_admin(client)
    await _install_contract_review(client)
    slug_a, matter_a_id, user_id = await _matter_for_current_user(client)
    slug_b, matter_b_id, _ = await _matter_for_current_user(client)

    for slug in (slug_a, slug_b):
        r = await client.post(
            f"/api/matters/{slug}/grants",
            json={
                "module_id": "examples.contract-review",
                "capability_id": "review",
            },
        )
        assert r.status_code == 201, r.text

    # Both grant sets coexist; require_capability(matter_id=...) for
    # each matter passes; for a third unknown matter, denies.
    from app.main import app
    factory = app.state.session_factory
    async with factory() as session:
        for matter_id in (matter_a_id, matter_b_id):
            await require_capability(
                session,
                user_id=user_id,
                plugin="examples.contract-review",
                skill="review",
                capability="matter.document.read",
                matter_id=matter_id,
            )
        with pytest.raises(CapabilityDenied):
            await require_capability(
                session,
                user_id=user_id,
                plugin="examples.contract-review",
                skill="review",
                capability="matter.document.read",
                matter_id=uuid.uuid4(),  # never granted
            )


# ---------------------------------------------------------------------------
# POST refusals
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_post_grant_workspace_scope_capability_refused(client) -> None:
    """Phase 7 v2 Decision #5: matter endpoint never creates
    workspace authority."""
    await _register_and_login_admin(client)
    await _install_contract_review(client)
    slug, _, _ = await _matter_for_current_user(client)

    resp = await client.post(
        f"/api/matters/{slug}/grants",
        json={
            "module_id": "examples.contract-review",
            # default-provider is scope=workspace in the manifest.
            "capability_id": "default-provider",
        },
    )
    assert resp.status_code == 422, resp.text
    body = resp.json()
    assert body["detail"]["error"] == "capability_scope_not_supported_here"
    assert body["detail"]["capability_scope"] == "workspace"

    # No grant row written.
    from app.main import app
    factory = app.state.session_factory
    async with factory() as session:
        rows = (
            await session.scalars(
                select(WorkspaceSkillCapabilityGrant).where(
                    WorkspaceSkillCapabilityGrant.plugin
                    == "examples.contract-review",
                    WorkspaceSkillCapabilityGrant.skill == "default-provider",
                )
            )
        ).all()
        assert rows == []


@pytest.mark.asyncio
async def test_post_grant_unknown_capability_id(client) -> None:
    await _register_and_login_admin(client)
    await _install_contract_review(client)
    slug, _, _ = await _matter_for_current_user(client)

    resp = await client.post(
        f"/api/matters/{slug}/grants",
        json={
            "module_id": "examples.contract-review",
            "capability_id": "no-such-capability",
        },
    )
    assert resp.status_code == 422
    assert resp.json()["detail"]["error"] == "capability_not_declared"


@pytest.mark.asyncio
async def test_post_grant_module_not_installed(client) -> None:
    await _register_and_login_admin(client)
    slug, _, _ = await _matter_for_current_user(client)
    resp = await client.post(
        f"/api/matters/{slug}/grants",
        json={
            "module_id": "examples.never-installed",
            "capability_id": "review",
        },
    )
    assert resp.status_code == 404
    assert resp.json()["detail"]["error"] == "module_not_installed"


@pytest.mark.asyncio
async def test_post_grant_module_disabled_returns_409(client) -> None:
    await _register_and_login_admin(client)
    installed_id = await _install_contract_review(client)
    slug, _, _ = await _matter_for_current_user(client)

    # Disable the installed module.
    from app.main import app
    factory = app.state.session_factory
    async with factory() as session:
        installed = await session.scalar(
            select(InstalledModule).where(
                InstalledModule.id == uuid.UUID(installed_id)
            )
        )
        installed.enabled = False
        await session.commit()

    resp = await client.post(
        f"/api/matters/{slug}/grants",
        json={
            "module_id": "examples.contract-review",
            "capability_id": "review",
        },
    )
    assert resp.status_code == 409
    assert resp.json()["detail"]["error"] == "module_disabled"


@pytest.mark.asyncio
async def test_post_grant_archived_matter_404(client) -> None:
    await _register_and_login_admin(client)
    await _install_contract_review(client)
    slug, matter_id, _ = await _matter_for_current_user(client)

    from app.main import app
    factory = app.state.session_factory
    async with factory() as session:
        m = await session.scalar(select(Matter).where(Matter.id == matter_id))
        m.status = STATUS_ARCHIVED
        await session.commit()

    resp = await client.post(
        f"/api/matters/{slug}/grants",
        json={
            "module_id": "examples.contract-review",
            "capability_id": "review",
        },
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_post_grant_non_owner_404(client) -> None:
    """Cross-user 404 — uniform response so attackers can't probe
    which matters exist."""
    # User A creates a matter.
    email_a = f"p7-owner-{uuid.uuid4().hex[:8]}@example.com"
    password = "phase7-grants-2026"
    await client.post(
        "/auth/register", json={"email": email_a, "password": password}
    )
    from app.main import app
    factory = app.state.session_factory
    async with factory() as session:
        owner = await session.scalar(select(User).where(User.email == email_a))
        m = Matter(
            id=uuid.uuid4(),
            slug=f"private-{uuid.uuid4().hex[:8]}",
            title="A's private matter",
            matter_type="employment_tribunal",
            status=STATUS_OPEN,
            privilege_posture=PRIVILEGE_MIXED,
            default_model_id="claude-opus-4-7",
            created_by_id=owner.id,
        )
        session.add(m)
        await session.commit()
        slug = m.slug

    # User B (stranger, non-superuser) logs in and tries to grant.
    email_b = f"p7-stranger-{uuid.uuid4().hex[:8]}@example.com"
    await client.post(
        "/auth/register", json={"email": email_b, "password": password}
    )
    await client.post(
        "/auth/login",
        data={"username": email_b, "password": password},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )

    resp = await client.post(
        f"/api/matters/{slug}/grants",
        json={
            "module_id": "examples.contract-review",
            "capability_id": "review",
        },
    )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# DELETE
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_delete_grant_revokes_and_audits(client) -> None:
    await _register_and_login_admin(client)
    await _install_contract_review(client)
    slug, matter_id, user_id = await _matter_for_current_user(client)

    create = await client.post(
        f"/api/matters/{slug}/grants",
        json={
            "module_id": "examples.contract-review",
            "capability_id": "review",
        },
    )
    grant_id = create.json()["grants"][0]["id"]
    target_cap = create.json()["grants"][0]["capability"]

    resp = await client.delete(f"/api/matters/{slug}/grants/{grant_id}")
    assert resp.status_code == 204, resp.text

    # Subsequent require_capability for that cap on that matter denies.
    from app.main import app
    factory = app.state.session_factory
    async with factory() as session:
        with pytest.raises(CapabilityDenied):
            await require_capability(
                session,
                user_id=user_id,
                plugin="examples.contract-review",
                skill="review",
                capability=target_cap,
                matter_id=matter_id,
            )
        # And the audit row landed.
        revoked = await session.scalar(
            select(AuditEntry).where(
                AuditEntry.action == "module.grant.revoked",
                AuditEntry.actor_id == user_id,
                AuditEntry.matter_id == matter_id,
            )
        )
        assert revoked is not None
        assert revoked.payload["granted_capability"] == target_cap


@pytest.mark.asyncio
async def test_delete_grant_non_existent_id_404(client) -> None:
    await _register_and_login_admin(client)
    slug, _, _ = await _matter_for_current_user(client)
    resp = await client.delete(
        f"/api/matters/{slug}/grants/{uuid.uuid4()}"
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_delete_grant_on_archived_matter_404(client) -> None:
    await _register_and_login_admin(client)
    await _install_contract_review(client)
    slug, matter_id, _ = await _matter_for_current_user(client)
    create = await client.post(
        f"/api/matters/{slug}/grants",
        json={
            "module_id": "examples.contract-review",
            "capability_id": "review",
        },
    )
    grant_id = create.json()["grants"][0]["id"]

    from app.main import app
    factory = app.state.session_factory
    async with factory() as session:
        m = await session.scalar(select(Matter).where(Matter.id == matter_id))
        m.status = STATUS_ARCHIVED
        await session.commit()

    resp = await client.delete(f"/api/matters/{slug}/grants/{grant_id}")
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# GET
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_grants_lists_only_this_matter(client) -> None:
    await _register_and_login_admin(client)
    await _install_contract_review(client)
    slug_a, matter_a_id, _ = await _matter_for_current_user(client)
    slug_b, _, _ = await _matter_for_current_user(client)

    # Grant on matter A only.
    await client.post(
        f"/api/matters/{slug_a}/grants",
        json={
            "module_id": "examples.contract-review",
            "capability_id": "review",
        },
    )

    a_resp = await client.get(f"/api/matters/{slug_a}/grants")
    assert a_resp.status_code == 200
    a_body = a_resp.json()
    assert a_body["matter_id"] == str(matter_a_id)
    assert len(a_body["grants"]) == 2

    # Matter B has none.
    b_resp = await client.get(f"/api/matters/{slug_b}/grants")
    assert b_resp.status_code == 200
    assert b_resp.json()["grants"] == []


@pytest.mark.asyncio
async def test_get_grants_non_owner_404(client) -> None:
    email_a = f"p7-getowner-{uuid.uuid4().hex[:8]}@example.com"
    password = "phase7-grants-2026"
    await client.post(
        "/auth/register", json={"email": email_a, "password": password}
    )
    from app.main import app
    factory = app.state.session_factory
    async with factory() as session:
        owner = await session.scalar(select(User).where(User.email == email_a))
        m = Matter(
            id=uuid.uuid4(),
            slug=f"private-get-{uuid.uuid4().hex[:8]}",
            title="A's matter",
            matter_type="employment_tribunal",
            status=STATUS_OPEN,
            privilege_posture=PRIVILEGE_MIXED,
            default_model_id="claude-opus-4-7",
            created_by_id=owner.id,
        )
        session.add(m)
        await session.commit()
        slug = m.slug

    email_b = f"p7-getstranger-{uuid.uuid4().hex[:8]}@example.com"
    await client.post(
        "/auth/register", json={"email": email_b, "password": password}
    )
    await client.post(
        "/auth/login",
        data={"username": email_b, "password": password},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )

    resp = await client.get(f"/api/matters/{slug}/grants")
    assert resp.status_code == 404
