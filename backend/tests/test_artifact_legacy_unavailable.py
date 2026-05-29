"""LMF-1 — legacy (pre-object-storage) artifacts surface cleanly.

Forward-only cutover: rows whose ``storage_path`` is an old absolute
local-fs path have no retrievable bytes (Fly fs is ephemeral; no
backfill). The read endpoint must return a clean 410, never crash.
"""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import select

from app.core.matter_artifacts import (
    ArtifactBytesUnavailable,
    load_artifact_bytes,
)
from app.models import (
    Matter,
    MatterArtifact,
    PRIVILEGE_CLEARED,
    STATUS_OPEN,
    User,
)


async def _register_and_login(client) -> str:
    email = f"legacy-{uuid.uuid4().hex[:8]}@example.com"
    await client.post("/auth/register", json={"email": email, "password": "legacy-2026"})
    await client.post(
        "/auth/login",
        data={"username": email, "password": "legacy-2026"},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    return email


def test_load_artifact_bytes_rejects_legacy_fs_path() -> None:
    # An absolute local-fs path = a pre-object-storage row.
    with pytest.raises(ArtifactBytesUnavailable):
        load_artifact_bytes("/data/matters/old/artifacts/review/x_findings_pack.json")


@pytest.mark.asyncio
async def test_read_legacy_artifact_returns_410(client) -> None:
    email = await _register_and_login(client)
    from app.main import app

    async with app.state.session_factory() as session:
        user = await session.scalar(select(User).where(User.email == email))
        matter = Matter(
            id=uuid.uuid4(),
            slug=f"legacy-{uuid.uuid4().hex[:8]}",
            title="Legacy Artifact Test",
            matter_type="employment_tribunal",
            status=STATUS_OPEN,
            privilege_posture=PRIVILEGE_CLEARED,
            default_model_id="claude-opus-4-7",
            created_by_id=user.id,
        )
        session.add(matter)
        await session.flush()
        # Insert a row with a LEGACY absolute fs path (WORM allows INSERT).
        legacy = MatterArtifact(
            id=uuid.uuid4(),
            matter_id=matter.id,
            module_id="examples.contract-review",
            capability_id="review",
            invocation_id=uuid.uuid4(),
            kind="findings_pack",
            storage_path="/data/matters/legacy/artifacts/review/old_findings_pack.json",
            created_by_id=user.id,
            size_bytes=10,
        )
        session.add(legacy)
        await session.commit()
        slug = matter.slug
        artifact_id = str(legacy.id)

    resp = await client.get(f"/api/matters/{slug}/artifacts/{artifact_id}")
    assert resp.status_code == 410
    assert resp.json()["detail"]["error"] == "legacy_artifact_unavailable"
