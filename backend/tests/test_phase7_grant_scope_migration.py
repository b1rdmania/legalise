"""Phase 7 — migration 0019 schema-shape regressions.

Pins the four properties the migration's correctness depends on:

1. Two grants for the same (user, plugin, skill, capability) with
   different scope_id both insert OK.
2. Two grants with identical scope tuple reject on the new UNIQUE
   (including the NULLS NOT DISTINCT semantics — two workspace
   grants conflict, not coexist).
3. Check constraint catches scope_type='matter' with NULL scope_id.
4. Check constraint catches scope_type='workspace' with non-NULL
   scope_id (the constraint runs both ways).
"""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy.exc import IntegrityError

from app.models import (
    Matter,
    PRIVILEGE_MIXED,
    SCOPE_TYPE_MATTER,
    SCOPE_TYPE_WORKSPACE,
    STATUS_OPEN,
    User,
    WorkspaceSkillCapabilityGrant,
)


async def _make_user(db_session) -> User:
    u = User(
        id=uuid.uuid4(),
        email=f"p7-mig-{uuid.uuid4().hex[:8]}@example.com",
        hashed_password="x" * 32,
        is_active=True,
        is_verified=True,
        is_superuser=False,
    )
    db_session.add(u)
    await db_session.flush()
    return u


async def _make_matter(db_session, user) -> Matter:
    m = Matter(
        id=uuid.uuid4(),
        slug=f"mig-{uuid.uuid4().hex[:8]}",
        title="Mig Test",
        matter_type="employment_tribunal",
        status=STATUS_OPEN,
        privilege_posture=PRIVILEGE_MIXED,
        default_model_id="claude-opus-4-7",
        created_by_id=user.id,
    )
    db_session.add(m)
    await db_session.flush()
    return m


@pytest.mark.asyncio
async def test_two_grants_same_tuple_different_scope_both_insert(db_session):
    """The whole reason for the migration: same (user, plugin, skill,
    capability) at two different matter scopes must coexist."""
    user = await _make_user(db_session)
    matter_a = await _make_matter(db_session, user)
    matter_b = await _make_matter(db_session, user)

    db_session.add(
        WorkspaceSkillCapabilityGrant(
            id=uuid.uuid4(),
            user_id=user.id,
            plugin="examples.test",
            skill="t",
            capability="matter.read",
            scope_type=SCOPE_TYPE_MATTER,
            scope_id=matter_a.id,
            granted_permissions_snapshot={"matter_id": str(matter_a.id)},
        )
    )
    db_session.add(
        WorkspaceSkillCapabilityGrant(
            id=uuid.uuid4(),
            user_id=user.id,
            plugin="examples.test",
            skill="t",
            capability="matter.read",
            scope_type=SCOPE_TYPE_MATTER,
            scope_id=matter_b.id,
            granted_permissions_snapshot={"matter_id": str(matter_b.id)},
        )
    )
    # Should commit cleanly — different scope_id, different uniqueness tuple.
    await db_session.commit()


@pytest.mark.asyncio
async def test_two_grants_identical_scope_reject(db_session):
    """Including the workspace + NULL scope_id case (NULLS NOT DISTINCT)."""
    user = await _make_user(db_session)
    db_session.add(
        WorkspaceSkillCapabilityGrant(
            id=uuid.uuid4(),
            user_id=user.id,
            plugin="examples.test",
            skill="t",
            capability="workspace.thing.do",
            scope_type=SCOPE_TYPE_WORKSPACE,
            scope_id=None,
        )
    )
    db_session.add(
        WorkspaceSkillCapabilityGrant(
            id=uuid.uuid4(),
            user_id=user.id,
            plugin="examples.test",
            skill="t",
            capability="workspace.thing.do",
            scope_type=SCOPE_TYPE_WORKSPACE,
            scope_id=None,
        )
    )
    with pytest.raises(IntegrityError):
        await db_session.commit()
    await db_session.rollback()


@pytest.mark.asyncio
async def test_check_constraint_rejects_matter_without_id(db_session):
    user = await _make_user(db_session)
    db_session.add(
        WorkspaceSkillCapabilityGrant(
            id=uuid.uuid4(),
            user_id=user.id,
            plugin="examples.test",
            skill="t",
            capability="matter.read",
            scope_type=SCOPE_TYPE_MATTER,
            scope_id=None,  # invalid: matter scope needs scope_id
        )
    )
    with pytest.raises(IntegrityError):
        await db_session.commit()
    await db_session.rollback()


@pytest.mark.asyncio
async def test_scope_type_vocab_rejects_arbitrary_string(db_session):
    """Reviewer Phase 7 follow-up: scope_type must be one of the
    canonical two values. Pre-fix, the pairing check stopped bad
    null pairings but a row with scope_type='global', scope_id=NULL
    would have slipped through with no DB-side rejection."""
    user = await _make_user(db_session)
    db_session.add(
        WorkspaceSkillCapabilityGrant(
            id=uuid.uuid4(),
            user_id=user.id,
            plugin="examples.test",
            skill="t",
            capability="workspace.thing.do",
            scope_type="global",  # not in the vocabulary
            scope_id=None,
        )
    )
    with pytest.raises(IntegrityError):
        await db_session.commit()
    await db_session.rollback()


@pytest.mark.asyncio
async def test_check_constraint_rejects_workspace_with_id(db_session):
    user = await _make_user(db_session)
    matter = await _make_matter(db_session, user)
    db_session.add(
        WorkspaceSkillCapabilityGrant(
            id=uuid.uuid4(),
            user_id=user.id,
            plugin="examples.test",
            skill="t",
            capability="workspace.thing.do",
            scope_type=SCOPE_TYPE_WORKSPACE,
            scope_id=matter.id,  # invalid: workspace must have NULL scope_id
        )
    )
    with pytest.raises(IntegrityError):
        await db_session.commit()
    await db_session.rollback()
