"""Runtime capability-enforcement tests.

Layers, mirroring the auth-login pattern:

1. **Grammar (pure unit)**: `is_valid_capability_string`,
   `assert_capability_string`, `capability_scope` — folded in from
   test_phase2_capability_grammar.py (test-slim Phase 3). Schema↔runtime
   vocabulary parity stays in test_capability_vocabulary_schema.py.
2. **Helper-level**: `require_capability`, `grant`, `revoke`, `list_granted`
   exercised directly against a `db_session`. Skips cleanly when DB is
   unreachable.
3. **Grant table v2 shape**: the migration-0015 columns
   (capability_version / granted_at_module_version /
   granted_permissions_snapshot) — folded in from
   test_phase2_grants_v2.py. Its v1-grant-still-resolves happy path was
   merged into `test_require_capability_succeeds_when_granted` (same
   behaviour); its unique-constraint test duplicated
   `test_grant_is_idempotent` and was dropped.
4. **HTTP wire-through**: a module-attributed document body read 403s
   when the capability is missing.

All DB-backed parts skip at conftest level when Postgres at
`TEST_DATABASE_URL` is unreachable.
"""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import select

from app.core.capabilities import (
    CAPABILITY_VOCABULARY,
    CapabilityDenied,
    assert_capability_string,
    capability_scope,
    grant,
    is_valid_capability_string,
    list_granted,
    require_capability,
    revoke,
)
from app.models import User, WorkspaceSkillCapabilityGrant


# ---------------------------------------------------------------------------
# Grammar (pure unit — no DB)
# ---------------------------------------------------------------------------


def test_legacy_v1_strings_are_valid() -> None:
    for cap in CAPABILITY_VOCABULARY:
        assert is_valid_capability_string(cap), cap


def test_v2_grammar_strings_are_valid() -> None:
    valid = [
        "matter.documents.body.read",
        "matter.context.legalise_memory.facts.write",
        "matter.context.companies_house.write",
        "matter.state.intake.transition",
        "matter.events.read",
        "workspace.providers.invoke",
        "workspace.intake.prospects.write",
        "global.registry.read",
        # Single deepest segment (3 parts).
        "matter.notes.write",
    ]
    for cap in valid:
        assert is_valid_capability_string(cap), cap


def test_invalid_capability_strings_rejected() -> None:
    invalid = [
        "",  # empty
        "just_one_part",  # one segment
        "two.parts",  # missing required action segment
        "foo.bar.baz",  # scope not in matter|workspace|global
        "matter.",  # trailing dot
        ".matter.read",  # leading dot
        "MATTER.documents.read",  # uppercase scope
        "matter..read",  # empty middle segment
        "matter.documents-with-hyphen.read",  # hyphens not allowed in segment
    ]
    for cap in invalid:
        assert not is_valid_capability_string(cap), cap


def test_non_string_inputs_rejected() -> None:
    assert not is_valid_capability_string(None)  # type: ignore[arg-type]
    assert not is_valid_capability_string(123)  # type: ignore[arg-type]
    assert not is_valid_capability_string([])  # type: ignore[arg-type]


def test_assert_capability_string_raises_on_invalid() -> None:
    with pytest.raises(ValueError, match="invalid capability"):
        assert_capability_string("foo.bar.baz")


def test_assert_capability_string_passes_for_valid() -> None:
    # Should not raise.
    assert_capability_string("matter.read")
    assert_capability_string("matter.documents.body.read")


def test_capability_scope_for_v2_grammar() -> None:
    assert capability_scope("matter.documents.body.read") == "matter"
    assert capability_scope("workspace.providers.invoke") == "workspace"
    assert capability_scope("global.registry.read") == "global"


def test_capability_scope_for_legacy_v1_returns_none() -> None:
    """Legacy v1 strings have no canonical scope — `matter.read` looks
    like it has a scope but the dot count is just 2 (not v2 grammar
    shape), so it falls into the legacy bucket and returns None."""
    assert capability_scope("matter.read") is None
    assert capability_scope("model.invoke") is None
    assert capability_scope("document.body.read") is None


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

    # Legacy/v1 shape (merged from test_phase2_grants_v2): `grant`
    # writes NULL for the migration-0015 columns, and the grant still
    # resolves through require_capability above.
    row = await db_session.scalar(
        select(WorkspaceSkillCapabilityGrant).where(
            WorkspaceSkillCapabilityGrant.user_id == user.id,
        )
    )
    assert row is not None
    assert row.capability_version is None
    assert row.granted_at_module_version is None
    assert row.granted_permissions_snapshot is None


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
# Grant table v2 shape (migration 0015) — from test_phase2_grants_v2.py
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_v2_grant_with_full_snapshot_resolves(db_session) -> None:
    """A v2 grant populates all three Phase 2 fields. require_capability
    treats it identically to a legacy grant — the new fields are
    read by Phase 4 grant-lifecycle, not by the runtime check."""
    user = await _make_user(db_session)
    grant_row = WorkspaceSkillCapabilityGrant(
        id=uuid.uuid4(),
        user_id=user.id,
        plugin="legalise-matter-memory",
        skill="default",
        capability="matter.context.legalise_memory.facts.write",
        capability_version="2.0.0",
        granted_at_module_version="1.0.0",
        granted_permissions_snapshot={
            "reads": ["matter.context.legalise_memory.facts.read"],
            "writes": ["matter.context.legalise_memory.facts.write"],
            "gates": ["privilege_posture"],
            "advice_tier_max": "draft_advice",
        },
    )
    db_session.add(grant_row)
    await db_session.flush()

    # Resolves.
    await require_capability(
        db_session,
        user_id=user.id,
        plugin="legalise-matter-memory",
        skill="default",
        capability="matter.context.legalise_memory.facts.write",
    )

    # Snapshot is queryable.
    row = await db_session.scalar(
        select(WorkspaceSkillCapabilityGrant).where(
            WorkspaceSkillCapabilityGrant.user_id == user.id,
        )
    )
    assert row is not None
    assert row.capability_version == "2.0.0"
    assert row.granted_at_module_version == "1.0.0"
    snap = row.granted_permissions_snapshot
    assert snap is not None
    assert snap["advice_tier_max"] == "draft_advice"
    assert "matter.context.legalise_memory.facts.read" in snap["reads"]


@pytest.mark.asyncio
async def test_widened_capability_column_accepts_v2_grammar_strings(
    db_session,
) -> None:
    """The capability column widened from VARCHAR(64) to VARCHAR(256)
    so v2 grammar strings fit. Confirm a 50+ char string writes + reads."""
    user = await _make_user(db_session)
    long_cap = "matter.context.legalise_memory.accepted_facts.write"
    assert len(long_cap) > 40
    await grant(
        db_session,
        user_id=user.id,
        plugin="legalise-matter-memory",
        skill="default",
        capability=long_cap,
    )
    await db_session.flush()
    await require_capability(
        db_session,
        user_id=user.id,
        plugin="legalise-matter-memory",
        skill="default",
        capability=long_cap,
    )


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
