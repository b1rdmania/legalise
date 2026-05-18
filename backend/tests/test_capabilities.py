"""Runtime capability-enforcement tests.

Two layers, mirroring the auth-login pattern:

1. **Helper-level**: `require_capability`, `grant`, `revoke`, `list_granted`
   exercised directly against a `db_session`. Skips cleanly when DB is
   unreachable.
2. **HTTP wire-through**: a module-attributed document body read 403s
   when the capability is missing.
3. **Auto-grant on signup**: register a user, assert the declared
   capabilities of installed plugins materialised as grant rows.

All DB-backed; the suite skips at conftest level when Postgres at
`TEST_DATABASE_URL` is unreachable.
"""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import select

from app.core.capabilities import (
    CapabilityDenied,
    grant,
    list_granted,
    require_capability,
    revoke,
)
from app.models import User, WorkspaceSkillCapabilityGrant


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _make_user(db_session) -> User:
    user = User(
        id=uuid.uuid4(),
        email=f"caps-{uuid.uuid4().hex[:8]}@example.com",
        hashed_password="x" * 32,
        is_active=True,
        is_verified=True,
        is_superuser=False,
    )
    db_session.add(user)
    await db_session.flush()
    return user


# ---------------------------------------------------------------------------
# Helper-level
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_require_capability_raises_when_missing(db_session) -> None:
    user = await _make_user(db_session)
    with pytest.raises(CapabilityDenied) as exc_info:
        await require_capability(
            db_session,
            user_id=user.id,
            plugin="uk-litigation-legal",
            skill="adversarial-premortem",
            capability="model.invoke",
        )
    err = exc_info.value
    assert err.plugin == "uk-litigation-legal"
    assert err.skill == "adversarial-premortem"
    assert err.capability == "model.invoke"
    assert err.user_id == user.id


@pytest.mark.asyncio
async def test_require_capability_succeeds_when_granted(db_session) -> None:
    user = await _make_user(db_session)
    await grant(
        db_session,
        user_id=user.id,
        plugin="uk-litigation-legal",
        skill="adversarial-premortem",
        capability="model.invoke",
    )
    await db_session.flush()
    # Should not raise.
    await require_capability(
        db_session,
        user_id=user.id,
        plugin="uk-litigation-legal",
        skill="adversarial-premortem",
        capability="model.invoke",
    )


@pytest.mark.asyncio
async def test_grant_is_idempotent(db_session) -> None:
    user = await _make_user(db_session)
    for _ in range(3):
        await grant(
            db_session,
            user_id=user.id,
            plugin="p",
            skill="s",
            capability="matter.read",
        )
    await db_session.flush()
    rows = (
        await db_session.scalars(
            select(WorkspaceSkillCapabilityGrant).where(
                WorkspaceSkillCapabilityGrant.user_id == user.id
            )
        )
    ).all()
    assert len(rows) == 1


@pytest.mark.asyncio
async def test_revoke_is_noop_when_absent(db_session) -> None:
    user = await _make_user(db_session)
    # No row yet; should not raise.
    await revoke(
        db_session,
        user_id=user.id,
        plugin="p",
        skill="s",
        capability="matter.read",
    )


@pytest.mark.asyncio
async def test_list_granted_returns_capability_slugs(db_session) -> None:
    user = await _make_user(db_session)
    for cap in ("matter.read", "model.invoke", "citation.write"):
        await grant(
            db_session,
            user_id=user.id,
            plugin="p",
            skill="s",
            capability=cap,
        )
    await db_session.flush()
    got = await list_granted(db_session, user.id, "p", "s")
    assert got == {"matter.read", "model.invoke", "citation.write"}


# ---------------------------------------------------------------------------
# HTTP wire-through
# ---------------------------------------------------------------------------


TEST_EMAIL = "caps-e2e@example.com"
TEST_PASSWORD = "caps-e2e-password-2026"


@pytest.mark.asyncio
async def test_document_body_module_call_denies_without_grant(
    client, db_session
) -> None:
    """A module-attributed body read (plugin+skill query params) must 403
    when the capability is not granted."""
    # Register + login. Auto-grant runs at signup and grants whatever the
    # currently-installed plugins declare; we intentionally pick a
    # `(plugin, skill)` pair that does not exist so the grant cannot be
    # auto-installed and the denial path fires.
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
    assert login.status_code == 204

    # Random document_id (does not exist) — the capability check runs
    # before the document lookup would 404 because the route resolves
    # the document first. We just need a route that resolves the user
    # then enforces the capability. So we must hit a real document.
    # The seeded Khan demo writes documents under the user. Find one.
    user = await db_session.scalar(
        select(User).where(User.email == TEST_EMAIL)
    )
    assert user is not None

    # The body endpoint resolves the document first, then requires the
    # capability. So we need a doc owned by this user. Use a random uuid:
    # the test still proves the capability denial does NOT fire on a
    # non-module call (404 instead of 403). For the deny case, we want a
    # real document — pick one from the seeded matter.
    from app.models import Document, Matter

    matter = await db_session.scalar(
        select(Matter).where(Matter.created_by_id == user.id)
    )
    assert matter is not None, "demo seed should have run at signup"
    doc = await db_session.scalar(
        select(Document).where(Document.matter_id == matter.id)
    )
    assert doc is not None, "demo seed should have written documents"

    # Module-attributed call to a (plugin, skill) the user never granted.
    resp = await client.get(
        f"/api/documents/{doc.id}/body",
        params={"plugin": "nonexistent-plugin", "skill": "nonexistent-skill"},
    )
    assert resp.status_code == 403, resp.text
    body = resp.json()
    assert body.get("error") == "capability_denied"
    assert body.get("plugin") == "nonexistent-plugin"
    assert body.get("skill") == "nonexistent-skill"
    assert body.get("capability") == "document.body.read"
    # Message should be solicitor-readable.
    assert "Modules page" in body.get("message", "")


# ---------------------------------------------------------------------------
# Auto-grant on signup
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_signup_auto_grants_declared_capabilities(client, db_session) -> None:
    """Registration triggers the auto-grant. After signup, the user has
    at least one grant per installed plugin that declares capabilities."""
    email = f"caps-autogrant-{uuid.uuid4().hex[:8]}@example.com"
    reg = await client.post(
        "/auth/register",
        json={"email": email, "password": "auto-grant-password-2026"},
    )
    assert reg.status_code == 201, reg.text

    user = await db_session.scalar(select(User).where(User.email == email))
    assert user is not None

    # Read the installed plugin set. If no manifests are installed
    # (CI without the plugin checkout), this assertion is satisfied
    # vacuously — auto-grant runs to zero rows and that is fine.
    from app.api.modules import _plugins_root, _skill_paths

    root = _plugins_root()
    installed_paths = _skill_paths()
    if not installed_paths:
        # Nothing to grant; the no-op path is the only assertion.
        rows = await db_session.scalars(
            select(WorkspaceSkillCapabilityGrant).where(
                WorkspaceSkillCapabilityGrant.user_id == user.id
            )
        )
        assert rows.all() == []
        return

    # At least one grant must exist if any installed plugin's
    # module.json declares capabilities.
    rows = (
        await db_session.scalars(
            select(WorkspaceSkillCapabilityGrant).where(
                WorkspaceSkillCapabilityGrant.user_id == user.id
            )
        )
    ).all()
    # Either there are no manifests with declared capabilities, or there
    # are grants. The auto-grant cannot fabricate from nothing.
    import json as _json

    expected_any = False
    for path in installed_paths:
        mj = path.parent.parent.parent / "module.json"
        if not mj.exists():
            continue
        try:
            payload = _json.loads(mj.read_text(encoding="utf-8"))
        except ValueError:
            continue
        if isinstance(payload, dict) and payload.get("capabilities"):
            expected_any = True
            break
    if expected_any:
        assert rows, (
            "expected auto-grant to write at least one capability grant "
            "for the new user; got zero rows."
        )
