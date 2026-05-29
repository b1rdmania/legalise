"""Phase 6 — matter_artifacts helper + WORM + atomic-write tests."""

from __future__ import annotations

import json
import uuid

import pytest
from sqlalchemy import select, text

from app.core.matter_artifacts import write_artifact
from app.models import (
    Matter,
    MatterArtifact,
    PRIVILEGE_MIXED,
    STATUS_OPEN,
    User,
)


async def _make_user(db_session) -> User:
    user = User(
        id=uuid.uuid4(),
        email=f"p6-art-{uuid.uuid4().hex[:8]}@example.com",
        hashed_password="x" * 32,
        is_active=True,
        is_verified=True,
        is_superuser=False,
    )
    db_session.add(user)
    await db_session.flush()
    return user


async def _make_matter(db_session, user) -> Matter:
    matter = Matter(
        id=uuid.uuid4(),
        slug=f"art-{uuid.uuid4().hex[:8]}",
        title="Artifact Test",
        matter_type="employment_tribunal",
        status=STATUS_OPEN,
        privilege_posture=PRIVILEGE_MIXED,
        default_model_id="claude-opus-4-7",
        created_by_id=user.id,
    )
    db_session.add(matter)
    await db_session.flush()
    return matter


@pytest.mark.asyncio
async def test_write_artifact_creates_file_and_row(db_session) -> None:
    user = await _make_user(db_session)
    matter = await _make_matter(db_session, user)
    invocation_id = uuid.uuid4()
    payload = {"findings": [{"clause": "x", "severity": "high"}]}

    artifact = await write_artifact(
        db_session,
        matter=matter,
        capability_id="examples.test.review",
        module_id="examples.test",
        invocation_id=invocation_id,
        kind="findings_pack",
        payload=payload,
        actor_user_id=user.id,
    )
    await db_session.commit()

    # Row populated.
    assert artifact.id is not None
    assert artifact.size_bytes > 0
    assert artifact.kind == "findings_pack"
    assert artifact.invocation_id == invocation_id

    # Object in storage + parses as expected (LMF-1: artifacts are in
    # object storage; storage_path is now an S3 key, not an fs path).
    from app.core.storage import get_storage_backend
    assert not artifact.storage_path.startswith("/")  # a key, not a path
    data = get_storage_backend().get_bytes(artifact.storage_path)
    assert json.loads(data.decode("utf-8")) == payload


@pytest.mark.asyncio
async def test_unique_invocation_kind_constraint(db_session) -> None:
    user = await _make_user(db_session)
    matter = await _make_matter(db_session, user)
    invocation_id = uuid.uuid4()

    await write_artifact(
        db_session,
        matter=matter,
        capability_id="examples.test.review",
        module_id="examples.test",
        invocation_id=invocation_id,
        kind="findings_pack",
        payload={"a": 1},
        actor_user_id=user.id,
    )
    await db_session.commit()

    # Same (invocation_id, kind) → IntegrityError.
    with pytest.raises(Exception):
        await write_artifact(
            db_session,
            matter=matter,
            capability_id="examples.test.review",
            module_id="examples.test",
            invocation_id=invocation_id,
            kind="findings_pack",
            payload={"a": 2},
            actor_user_id=user.id,
        )
        await db_session.commit()
    await db_session.rollback()


@pytest.mark.asyncio
async def test_different_kinds_on_same_invocation_allowed(db_session) -> None:
    """One invocation can produce multiple artifact KINDS."""
    user = await _make_user(db_session)
    matter = await _make_matter(db_session, user)
    invocation_id = uuid.uuid4()

    a1 = await write_artifact(
        db_session,
        matter=matter,
        capability_id="cap",
        module_id="mod",
        invocation_id=invocation_id,
        kind="findings_pack",
        payload={"a": 1},
        actor_user_id=user.id,
    )
    a2 = await write_artifact(
        db_session,
        matter=matter,
        capability_id="cap",
        module_id="mod",
        invocation_id=invocation_id,
        kind="citation_pack",
        payload={"b": 2},
        actor_user_id=user.id,
    )
    await db_session.commit()
    assert a1.id != a2.id


@pytest.mark.asyncio
async def test_worm_trigger_rejects_update(db_session) -> None:
    user = await _make_user(db_session)
    matter = await _make_matter(db_session, user)
    artifact = await write_artifact(
        db_session,
        matter=matter,
        capability_id="cap",
        module_id="mod",
        invocation_id=uuid.uuid4(),
        kind="findings_pack",
        payload={"a": 1},
        actor_user_id=user.id,
    )
    await db_session.commit()
    with pytest.raises(Exception):
        await db_session.execute(
            text("UPDATE matter_artifacts SET kind = 'tampered' WHERE id = :rid"),
            {"rid": artifact.id},
        )
        await db_session.commit()
    await db_session.rollback()


@pytest.mark.asyncio
async def test_worm_trigger_rejects_delete(db_session) -> None:
    user = await _make_user(db_session)
    matter = await _make_matter(db_session, user)
    artifact = await write_artifact(
        db_session,
        matter=matter,
        capability_id="cap",
        module_id="mod",
        invocation_id=uuid.uuid4(),
        kind="findings_pack",
        payload={"a": 1},
        actor_user_id=user.id,
    )
    await db_session.commit()
    with pytest.raises(Exception):
        await db_session.execute(
            text("DELETE FROM matter_artifacts WHERE id = :rid"),
            {"rid": artifact.id},
        )
        await db_session.commit()
    await db_session.rollback()
