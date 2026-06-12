"""Matter artifacts — write_artifact substrate + list/read API.

Merged from test_phase6_matter_artifacts.py and
test_phase13b_artifacts_api.py (test-slim Phase 3).

Substrate: write_artifact creates object-storage file + row, the
(invocation_id, kind) uniqueness constraint, and the WORM trigger
(no UPDATE, no DELETE). API: list/read happy paths, uniform 404s
(stranger / archived / cross-matter), 410 on missing storage object,
and the no-read-audit decision.
"""

from __future__ import annotations

import json
import uuid

import pytest
from sqlalchemy import select, text

from app.core.matter_artifacts import write_artifact
from app.models import (
    AuditEntry,
    Matter,
    MatterArtifact,
    PRIVILEGE_CLEARED,
    PRIVILEGE_MIXED,
    STATUS_ARCHIVED,
    STATUS_OPEN,
    User,
)


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------


async def _make_user(db_session) -> User:
    user = User(
        id=uuid.uuid4(),
        email=f"artifacts-{uuid.uuid4().hex[:8]}@example.com",
        hashed_password="x" * 32,
        is_active=True,
        is_verified=True,
        is_superuser=False,
    )
    db_session.add(user)
    await db_session.flush()
    return user


async def _make_matter(
    session, user_id: uuid.UUID, *, posture: str = PRIVILEGE_MIXED
) -> Matter:
    m = Matter(
        id=uuid.uuid4(),
        slug=f"art-{uuid.uuid4().hex[:8]}",
        title="Artifact Test",
        matter_type="employment_tribunal",
        status=STATUS_OPEN,
        privilege_posture=posture,
        default_model_id="claude-opus-4-7",
        created_by_id=user_id,
    )
    session.add(m)
    await session.flush()
    return m


async def _register_and_login(client, *, suffix: str = "") -> str:
    email = f"artifacts{suffix}-{uuid.uuid4().hex[:8]}@example.com"
    password = "artifacts-2026"
    await client.post(
        "/auth/register", json={"email": email, "password": password}
    )
    await client.post(
        "/auth/login",
        data={"username": email, "password": password},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    return email


async def _seed_artifact(
    session,
    *,
    matter: Matter,
    user_id: uuid.UUID,
    invocation_id: uuid.UUID | None = None,
    kind: str = "findings_pack",
    payload: dict | None = None,
) -> MatterArtifact:
    return await write_artifact(
        session,
        matter=matter,
        capability_id="examples.test.review",
        module_id="examples.test",
        invocation_id=invocation_id or uuid.uuid4(),
        kind=kind,
        payload=payload or {"findings": [{"clause": "x", "severity": "high"}]},
        actor_user_id=user_id,
    )


# ===========================================================================
# Substrate — write_artifact + constraints + WORM
# ===========================================================================


@pytest.mark.asyncio
async def test_write_artifact_creates_file_and_row(db_session) -> None:
    user = await _make_user(db_session)
    matter = await _make_matter(db_session, user.id)
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
    matter = await _make_matter(db_session, user.id)
    invocation_id = uuid.uuid4()

    await _seed_artifact(
        session=db_session,
        matter=matter,
        user_id=user.id,
        invocation_id=invocation_id,
        payload={"a": 1},
    )
    await db_session.commit()

    # Same (invocation_id, kind) → IntegrityError.
    with pytest.raises(Exception):
        await _seed_artifact(
            session=db_session,
            matter=matter,
            user_id=user.id,
            invocation_id=invocation_id,
            payload={"a": 2},
        )
        await db_session.commit()
    await db_session.rollback()


@pytest.mark.asyncio
async def test_different_kinds_on_same_invocation_allowed(db_session) -> None:
    """One invocation can produce multiple artifact KINDS."""
    user = await _make_user(db_session)
    matter = await _make_matter(db_session, user.id)
    invocation_id = uuid.uuid4()

    a1 = await _seed_artifact(
        session=db_session,
        matter=matter,
        user_id=user.id,
        invocation_id=invocation_id,
        kind="findings_pack",
        payload={"a": 1},
    )
    a2 = await _seed_artifact(
        session=db_session,
        matter=matter,
        user_id=user.id,
        invocation_id=invocation_id,
        kind="citation_pack",
        payload={"b": 2},
    )
    await db_session.commit()
    assert a1.id != a2.id


@pytest.mark.asyncio
async def test_worm_trigger_rejects_update(db_session) -> None:
    user = await _make_user(db_session)
    matter = await _make_matter(db_session, user.id)
    artifact = await _seed_artifact(
        session=db_session, matter=matter, user_id=user.id, payload={"a": 1}
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
    matter = await _make_matter(db_session, user.id)
    artifact = await _seed_artifact(
        session=db_session, matter=matter, user_id=user.id, payload={"a": 1}
    )
    await db_session.commit()
    with pytest.raises(Exception):
        await db_session.execute(
            text("DELETE FROM matter_artifacts WHERE id = :rid"),
            {"rid": artifact.id},
        )
        await db_session.commit()
    await db_session.rollback()


# ===========================================================================
# API — list/read endpoints
# ===========================================================================


@pytest.mark.asyncio
async def test_list_artifacts_returns_rows_in_desc_order(client) -> None:
    email = await _register_and_login(client)

    from app.main import app
    factory = app.state.session_factory
    async with factory() as session:
        user = await session.scalar(select(User).where(User.email == email))
        matter = await _make_matter(session, user.id, posture=PRIVILEGE_CLEARED)
        await session.flush()
        # Three artifacts on this matter.
        for _ in range(3):
            await _seed_artifact(session, matter=matter, user_id=user.id)
        await session.commit()
        slug = matter.slug

    resp = await client.get(f"/api/matters/{slug}/artifacts")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert len(body) == 3
    # created_at desc.
    timestamps = [row["created_at"] for row in body]
    assert timestamps == sorted(timestamps, reverse=True)
    # Each row carries the canonical summary shape.
    for row in body:
        assert "id" in row
        assert "matter_id" in row
        assert "module_id" in row
        assert "capability_id" in row
        assert "invocation_id" in row
        assert "kind" in row
        assert "size_bytes" in row
        assert "payload" not in row  # list returns summary only


@pytest.mark.asyncio
async def test_read_artifact_returns_payload(client) -> None:
    email = await _register_and_login(client)

    from app.main import app
    factory = app.state.session_factory
    async with factory() as session:
        user = await session.scalar(select(User).where(User.email == email))
        matter = await _make_matter(session, user.id, posture=PRIVILEGE_CLEARED)
        await session.flush()
        artifact = await _seed_artifact(
            session,
            matter=matter,
            user_id=user.id,
            payload={"findings": [{"clause": "5.2", "severity": "high"}]},
        )
        await session.commit()
        artifact_id = artifact.id
        slug = matter.slug

    resp = await client.get(f"/api/matters/{slug}/artifacts/{artifact_id}")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["id"] == str(artifact_id)
    assert body["kind"] == "findings_pack"
    assert body["payload"]["findings"][0]["clause"] == "5.2"


@pytest.mark.asyncio
async def test_non_owner_stranger_404(client) -> None:
    """Owner creates a matter with an artifact; stranger logs in and
    gets a uniform 404 from both endpoints."""
    owner_email = await _register_and_login(client, suffix="owner")

    from app.main import app
    factory = app.state.session_factory
    async with factory() as session:
        owner = await session.scalar(select(User).where(User.email == owner_email))
        matter = await _make_matter(session, owner.id, posture=PRIVILEGE_CLEARED)
        await session.flush()
        artifact = await _seed_artifact(
            session, matter=matter, user_id=owner.id
        )
        await session.commit()
        slug = matter.slug
        artifact_id = artifact.id

    # Stranger logs in.
    await _register_and_login(client, suffix="stranger")

    resp_list = await client.get(f"/api/matters/{slug}/artifacts")
    assert resp_list.status_code == 404

    resp_read = await client.get(
        f"/api/matters/{slug}/artifacts/{artifact_id}"
    )
    assert resp_read.status_code == 404


@pytest.mark.asyncio
async def test_archived_matter_404(client) -> None:
    email = await _register_and_login(client)

    from app.main import app
    factory = app.state.session_factory
    async with factory() as session:
        user = await session.scalar(select(User).where(User.email == email))
        matter = await _make_matter(session, user.id, posture=PRIVILEGE_CLEARED)
        await session.flush()
        artifact = await _seed_artifact(session, matter=matter, user_id=user.id)
        matter.status = STATUS_ARCHIVED
        await session.commit()
        slug = matter.slug
        artifact_id = artifact.id

    resp_list = await client.get(f"/api/matters/{slug}/artifacts")
    assert resp_list.status_code == 404

    resp_read = await client.get(
        f"/api/matters/{slug}/artifacts/{artifact_id}"
    )
    assert resp_read.status_code == 404


@pytest.mark.asyncio
async def test_artifact_from_other_matter_returns_404(client) -> None:
    """Defence-in-depth — the FK already enforces matter_id, but the
    endpoint also filters by matter_id explicitly."""
    email = await _register_and_login(client)

    from app.main import app
    factory = app.state.session_factory
    async with factory() as session:
        user = await session.scalar(select(User).where(User.email == email))
        matter_a = await _make_matter(session, user.id, posture=PRIVILEGE_CLEARED)
        matter_b = await _make_matter(session, user.id, posture=PRIVILEGE_CLEARED)
        await session.flush()
        # Artifact lives on B.
        artifact_b = await _seed_artifact(
            session, matter=matter_b, user_id=user.id
        )
        await session.commit()
        slug_a = matter_a.slug
        artifact_b_id = artifact_b.id

    # Try to fetch B's artifact via A's URL.
    resp = await client.get(f"/api/matters/{slug_a}/artifacts/{artifact_b_id}")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_storage_object_missing_returns_410(client) -> None:
    email = await _register_and_login(client)

    from app.main import app
    factory = app.state.session_factory
    async with factory() as session:
        user = await session.scalar(select(User).where(User.email == email))
        matter = await _make_matter(session, user.id, posture=PRIVILEGE_CLEARED)
        await session.flush()
        artifact = await _seed_artifact(session, matter=matter, user_id=user.id)
        await session.commit()
        slug = matter.slug
        artifact_id = artifact.id
        storage_path = artifact.storage_path

    # Delete the object in storage (LMF-1: artifacts live in object
    # storage; a missing object surfaces cleanly as 410, not a crash).
    from app.core.storage import get_storage_backend
    get_storage_backend().delete_object(storage_path)

    resp = await client.get(f"/api/matters/{slug}/artifacts/{artifact_id}")
    assert resp.status_code == 410
    detail = resp.json()["detail"]
    assert detail["error"] == "legacy_artifact_unavailable"
    assert detail["artifact_id"] == str(artifact_id)


@pytest.mark.asyncio
async def test_artifact_read_emits_no_audit_row(client) -> None:
    """Decision #1: artifact reads do NOT emit an audit row."""
    email = await _register_and_login(client)

    from app.main import app
    factory = app.state.session_factory
    async with factory() as session:
        user = await session.scalar(select(User).where(User.email == email))
        matter = await _make_matter(session, user.id, posture=PRIVILEGE_CLEARED)
        await session.flush()
        artifact = await _seed_artifact(session, matter=matter, user_id=user.id)
        await session.commit()
        slug = matter.slug
        artifact_id = artifact.id
        matter_id = matter.id

    # Read the artifact a few times.
    for _ in range(3):
        resp = await client.get(
            f"/api/matters/{slug}/artifacts/{artifact_id}"
        )
        assert resp.status_code == 200

    async with factory() as session:
        # Any matter.artifact.read or similar row should NOT exist.
        for forbidden in ("matter.artifact.read", "artifact.read"):
            row = await session.scalar(
                select(AuditEntry).where(
                    AuditEntry.action == forbidden,
                    AuditEntry.matter_id == matter_id,
                )
            )
            assert row is None, (
                f"unexpected audit row {forbidden!r} — Phase 13b "
                f"Decision #1 says artifact reads do NOT audit"
            )
