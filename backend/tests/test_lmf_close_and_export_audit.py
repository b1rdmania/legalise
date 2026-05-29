"""LMF-3 + LMF-4 — non-destructive close, and export-download audit.

Close (status=closed, storage retained, audited) is distinct from the
destructive DELETE tombstone. Export downloads emit
``matter.export.downloaded``. Owner-only throughout.
"""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import func, select

from app.core.exports import build_matter_export
from app.models import (
    AuditEntry,
    Job,
    Matter,
    PRIVILEGE_CLEARED,
    STATUS_ARCHIVED,
    STATUS_CLOSED,
    STATUS_OPEN,
    User,
)
from app.models.job import JOB_KIND_EXPORT, JOB_STATUS_SUCCEEDED


async def _register_and_login(client, *, suffix: str = "") -> str:
    email = f"lmf{suffix}-{uuid.uuid4().hex[:8]}@example.com"
    await client.post("/auth/register", json={"email": email, "password": "lmf-2026"})
    await client.post(
        "/auth/login",
        data={"username": email, "password": "lmf-2026"},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    return email


async def _seed_matter(owner_email: str, *, status: str = STATUS_OPEN) -> str:
    from app.main import app

    async with app.state.session_factory() as session:
        owner = await session.scalar(select(User).where(User.email == owner_email))
        matter = Matter(
            id=uuid.uuid4(),
            slug=f"lmf-{uuid.uuid4().hex[:8]}",
            title="LMF Close Test",
            matter_type="employment_tribunal",
            status=status,
            privilege_posture=PRIVILEGE_CLEARED,
            default_model_id="claude-opus-4-7",
            created_by_id=owner.id,
        )
        session.add(matter)
        await session.commit()
        return matter.slug


async def _audit_count(action: str, slug_or_id: str) -> int:
    from app.main import app

    async with app.state.session_factory() as session:
        rows = (
            await session.scalars(
                select(AuditEntry).where(AuditEntry.action == action)
            )
        ).all()
        return sum(1 for r in rows if slug_or_id in (r.resource_id or ""))


@pytest.mark.asyncio
async def test_close_is_non_destructive_and_audited(client) -> None:
    owner = await _register_and_login(client)
    slug = await _seed_matter(owner)

    resp = await client.post(f"/api/matters/{slug}/close")
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == STATUS_CLOSED

    # Still listed (close keeps access — unlike the archived tombstone).
    lst = await client.get("/api/matters")
    assert any(m["slug"] == slug for m in lst.json())
    # Audited.
    assert await _audit_count("matter.closed", slug) == 1


@pytest.mark.asyncio
async def test_close_is_idempotent(client) -> None:
    owner = await _register_and_login(client)
    slug = await _seed_matter(owner)
    await client.post(f"/api/matters/{slug}/close")
    again = await client.post(f"/api/matters/{slug}/close")
    assert again.status_code == 200
    assert again.json()["status"] == STATUS_CLOSED
    # No duplicate audit row for the idempotent re-close.
    assert await _audit_count("matter.closed", slug) == 1


@pytest.mark.asyncio
async def test_cannot_close_archived_matter(client) -> None:
    owner = await _register_and_login(client)
    slug = await _seed_matter(owner, status=STATUS_ARCHIVED)
    resp = await client.post(f"/api/matters/{slug}/close")
    assert resp.status_code == 409
    assert resp.json()["detail"]["error"] == "matter_archived"


@pytest.mark.asyncio
async def test_close_cross_user_404(client) -> None:
    owner = await _register_and_login(client)
    slug = await _seed_matter(owner)
    await _register_and_login(client, suffix="-other")
    resp = await client.post(f"/api/matters/{slug}/close")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_export_download_emits_audit(client) -> None:
    owner = await _register_and_login(client)
    from app.main import app

    async with app.state.session_factory() as session:
        user = await session.scalar(select(User).where(User.email == owner))
        matter = Matter(
            id=uuid.uuid4(),
            slug=f"lmf-{uuid.uuid4().hex[:8]}",
            title="LMF Export Download",
            matter_type="employment_tribunal",
            status=STATUS_OPEN,
            privilege_posture=PRIVILEGE_CLEARED,
            default_model_id="claude-opus-4-7",
            created_by_id=user.id,
        )
        session.add(matter)
        await session.flush()
        job_id = uuid.uuid4()
        export_key = await build_matter_export(session, matter, job_id)
        session.add(
            Job(
                id=job_id,
                matter_id=matter.id,
                created_by_id=user.id,
                kind=JOB_KIND_EXPORT,
                status=JOB_STATUS_SUCCEEDED,
                input_payload={},
                result_payload={"export_key": export_key},
            )
        )
        await session.commit()
        slug = matter.slug

    resp = await client.get(f"/api/matters/{slug}/export/{job_id}")
    # 302 (presigned, S3) or 200 (streamed, local) — either way the
    # download-access audit row must be written.
    assert resp.status_code in (200, 302), resp.text
    assert await _audit_count("matter.export.downloaded", str(job_id)) >= 0
    # The row is keyed on matter id; assert it exists for this matter.
    async with app.state.session_factory() as session:
        row = await session.scalar(
            select(AuditEntry).where(
                AuditEntry.action == "matter.export.downloaded",
                AuditEntry.matter_id == matter.id,
            )
        )
        assert row is not None
        assert row.payload.get("export_job_id") == str(job_id)


@pytest.mark.asyncio
async def test_export_download_failure_does_not_audit(client, monkeypatch) -> None:
    # Reviewer redline: the matter.export.downloaded row must only land
    # AFTER the bytes/presigned URL succeed — a storage/presign failure
    # must not leave a false "downloaded" row.
    owner = await _register_and_login(client)
    from app.main import app

    async with app.state.session_factory() as session:
        user = await session.scalar(select(User).where(User.email == owner))
        matter = Matter(
            id=uuid.uuid4(),
            slug=f"lmf-{uuid.uuid4().hex[:8]}",
            title="LMF Export Fail",
            matter_type="employment_tribunal",
            status=STATUS_OPEN,
            privilege_posture=PRIVILEGE_CLEARED,
            default_model_id="claude-opus-4-7",
            created_by_id=user.id,
        )
        session.add(matter)
        await session.flush()
        job_id = uuid.uuid4()
        export_key = await build_matter_export(session, matter, job_id)  # real storage
        session.add(
            Job(
                id=job_id,
                matter_id=matter.id,
                created_by_id=user.id,
                kind=JOB_KIND_EXPORT,
                status=JOB_STATUS_SUCCEEDED,
                input_payload={},
                result_payload={"export_key": export_key},
            )
        )
        await session.commit()
        slug = matter.slug
        matter_id = matter.id

    # Now make presigned-URL generation fail for the download call.
    class _BadStorage:
        def presigned_get_url(self, key, ttl=3600):
            raise RuntimeError("boom")

    import app.core.storage as storage_mod

    monkeypatch.setattr(storage_mod, "get_storage_backend", lambda: _BadStorage())
    resp = await client.get(f"/api/matters/{slug}/export/{job_id}")
    assert resp.status_code == 500
    # NO downloaded audit row was written.
    async with app.state.session_factory() as session:
        row = await session.scalar(
            select(AuditEntry).where(
                AuditEntry.action == "matter.export.downloaded",
                AuditEntry.matter_id == matter_id,
            )
        )
        assert row is None
