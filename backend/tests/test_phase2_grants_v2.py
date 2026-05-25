"""Phase 2 — grant table extension tests.

Three new nullable columns + widened plugin/capability columns per
migration 0015. Existing v1 grants must continue to resolve via
``require_capability`` unchanged; new v2 grants populate the
``capability_version``, ``granted_at_module_version``, and
``granted_permissions_snapshot`` fields.
"""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import select

from app.core.capabilities import (
    CapabilityDenied,
    grant,
    require_capability,
)
from app.models import User, WorkspaceSkillCapabilityGrant


async def _make_user(db_session) -> User:
    user = User(
        id=uuid.uuid4(),
        email=f"p2-grants-{uuid.uuid4().hex[:8]}@example.com",
        hashed_password="x" * 32,
        is_active=True,
        is_verified=True,
        is_superuser=False,
    )
    db_session.add(user)
    await db_session.flush()
    return user


@pytest.mark.asyncio
async def test_v1_grant_without_new_columns_still_resolves(db_session) -> None:
    """A grant inserted with NULL capability_version /
    granted_at_module_version / granted_permissions_snapshot (the
    legacy shape) must still validate via require_capability."""
    user = await _make_user(db_session)
    await grant(
        db_session,
        user_id=user.id,
        plugin="legacy-plugin",
        skill="legacy-skill",
        capability="matter.read",
    )
    await db_session.flush()
    # Should not raise.
    await require_capability(
        db_session,
        user_id=user.id,
        plugin="legacy-plugin",
        skill="legacy-skill",
        capability="matter.read",
    )

    # The row exists with NULL Phase 2 fields.
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


@pytest.mark.asyncio
async def test_unique_constraint_holds_across_grants(db_session) -> None:
    """The composite UNIQUE on (user_id, plugin, skill, capability)
    survives migration 0015. Two grants with the same tuple
    no-op via the ON CONFLICT DO NOTHING semantics in `grant`."""
    user = await _make_user(db_session)
    for _ in range(3):
        await grant(
            db_session,
            user_id=user.id,
            plugin="foo",
            skill="bar",
            capability="matter.read",
        )
    await db_session.flush()
    rows = (
        await db_session.scalars(
            select(WorkspaceSkillCapabilityGrant).where(
                WorkspaceSkillCapabilityGrant.user_id == user.id,
            )
        )
    ).all()
    assert len(rows) == 1
