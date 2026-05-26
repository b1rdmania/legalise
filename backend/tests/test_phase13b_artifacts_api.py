"""Phase 13b A — artifact list/read endpoint tests.

Six tests:

1. Happy: list returns N rows in created_at desc order
2. Happy: read returns payload + metadata
3. Non-owner stranger: 404 uniform
4. Archived matter: 404
5. Artifact id not in this matter: 404 (defence-in-depth)
6. Storage file missing on disk: 500 with structured error

Plus a bonus reading test that NO audit row lands (Phase 13b
Decision #1).
"""

from __future__ import annotations

import json
import uuid
from pathlib import Path

import pytest
from sqlalchemy import select

from app.core.matter_artifacts import write_artifact
from app.models import (
    AuditEntry,
    Matter,
    MatterArtifact,
    PRIVILEGE_CLEARED,
    STATUS_ARCHIVED,
    STATUS_OPEN,
    User,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _register_and_login(client, *, suffix: str = "") -> str:
    email = f"p13ba{suffix}-{uuid.uuid4().hex[:8]}@example.com"
    password = "phase13ba-2026"
    await client.post(
        "/auth/register", json={"email": email, "password": password}
    )
    await client.post(
        "/auth/login",
        data={"username": email, "password": password},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    return email


async def _make_matter(session, user_id: uuid.UUID, *, posture: str = PRIVILEGE_CLEARED) -> Matter:
    m = Matter(
        id=uuid.uuid4(),
        slug=f"p13ba-{uuid.uuid4().hex[:8]}",
        title="P13b Artifact Test",
        matter_type="employment_tribunal",
        status=STATUS_OPEN,
        privilege_posture=posture,
        default_model_id="claude-opus-4-7",
        created_by_id=user_id,
    )
    session.add(m)
    await session.flush()
    return m


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


# ---------------------------------------------------------------------------
# 1. Happy: list returns N rows in created_at desc order
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_artifacts_returns_rows_in_desc_order(client) -> None:
    email = await _register_and_login(client)

    from app.main import app
    factory = app.state.session_factory
    async with factory() as session:
        user = await session.scalar(select(User).where(User.email == email))
        matter = await _make_matter(session, user.id)
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


# ---------------------------------------------------------------------------
# 2. Happy: read returns payload + metadata
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_read_artifact_returns_payload(client) -> None:
    email = await _register_and_login(client)

    from app.main import app
    factory = app.state.session_factory
    async with factory() as session:
        user = await session.scalar(select(User).where(User.email == email))
        matter = await _make_matter(session, user.id)
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


# ---------------------------------------------------------------------------
# 3. Non-owner stranger: 404 uniform
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_non_owner_stranger_404(client) -> None:
    """Owner creates a matter with an artifact; stranger logs in and
    gets a uniform 404 from both endpoints."""
    owner_email = await _register_and_login(client, suffix="owner")

    from app.main import app
    factory = app.state.session_factory
    async with factory() as session:
        owner = await session.scalar(select(User).where(User.email == owner_email))
        matter = await _make_matter(session, owner.id)
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


# ---------------------------------------------------------------------------
# 4. Archived matter: 404
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_archived_matter_404(client) -> None:
    email = await _register_and_login(client)

    from app.main import app
    factory = app.state.session_factory
    async with factory() as session:
        user = await session.scalar(select(User).where(User.email == email))
        matter = await _make_matter(session, user.id)
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


# ---------------------------------------------------------------------------
# 5. Artifact id not in this matter: 404
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_artifact_from_other_matter_returns_404(client) -> None:
    """Defence-in-depth — the FK already enforces matter_id, but the
    endpoint also filters by matter_id explicitly."""
    email = await _register_and_login(client)

    from app.main import app
    factory = app.state.session_factory
    async with factory() as session:
        user = await session.scalar(select(User).where(User.email == email))
        matter_a = await _make_matter(session, user.id)
        matter_b = await _make_matter(session, user.id)
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


# ---------------------------------------------------------------------------
# 6. Storage file missing on disk: 500 with structured error
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_storage_file_missing_returns_500(client) -> None:
    email = await _register_and_login(client)

    from app.main import app
    factory = app.state.session_factory
    async with factory() as session:
        user = await session.scalar(select(User).where(User.email == email))
        matter = await _make_matter(session, user.id)
        await session.flush()
        artifact = await _seed_artifact(session, matter=matter, user_id=user.id)
        await session.commit()
        slug = matter.slug
        artifact_id = artifact.id
        storage_path = artifact.storage_path

    # Delete the file on disk.
    Path(storage_path).unlink()

    resp = await client.get(f"/api/matters/{slug}/artifacts/{artifact_id}")
    assert resp.status_code == 500
    detail = resp.json()["detail"]
    assert detail["error"] == "artifact_file_missing"
    assert detail["artifact_id"] == str(artifact_id)


# ---------------------------------------------------------------------------
# Bonus: NO read audit (Phase 13b Decision #1)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_artifact_read_emits_no_audit_row(client) -> None:
    """Decision #1: artifact reads do NOT emit an audit row."""
    email = await _register_and_login(client)

    from app.main import app
    factory = app.state.session_factory
    async with factory() as session:
        user = await session.scalar(select(User).where(User.email == email))
        matter = await _make_matter(session, user.id)
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
