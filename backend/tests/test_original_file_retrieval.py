"""Original File Retrieval v1 — GET /api/documents/{id}/original.

Streamed backend proxy. Owner-or-superuser; cross-user / archived /
missing / no-storage-uri / missing-object all return a uniform 404;
storage backend failure is a structured 502. Every successful access
emits `document.original.accessed`.
"""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import select

from app.core.storage import StorageReadError, get_storage_backend
from app.models import (
    AuditEntry,
    Document,
    Matter,
    PRIVILEGE_CLEARED,
    STATUS_ARCHIVED,
    STATUS_OPEN,
    User,
)

PDF_BYTES = b"%PDF-1.4 original-file-bytes"


async def _register_and_login(client, *, suffix: str = "") -> str:
    email = f"orig{suffix}-{uuid.uuid4().hex[:8]}@example.com"
    await client.post("/auth/register", json={"email": email, "password": "orig-2026"})
    await client.post(
        "/auth/login",
        data={"username": email, "password": "orig-2026"},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    return email


async def _login(client, email: str) -> None:
    await client.post(
        "/auth/login",
        data={"username": email, "password": "orig-2026"},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )


async def _promote_superuser(email: str) -> None:
    from app.main import app

    async with app.state.session_factory() as session:
        u = await session.scalar(select(User).where(User.email == email))
        u.is_superuser = True
        await session.commit()


async def _seed_document(
    owner_email: str,
    *,
    with_storage: bool = True,
    bogus_key: bool = False,
    archived: bool = False,
) -> tuple[str, str]:
    """Create a matter + document (and storage object) owned by owner_email.
    Returns (matter_slug, document_id)."""
    from app.main import app

    async with app.state.session_factory() as session:
        owner = await session.scalar(select(User).where(User.email == owner_email))
        matter = Matter(
            id=uuid.uuid4(),
            slug=f"orig-{uuid.uuid4().hex[:8]}",
            title="Original Retrieval Test",
            matter_type="employment_tribunal",
            status=STATUS_ARCHIVED if archived else STATUS_OPEN,
            privilege_posture=PRIVILEGE_CLEARED,
            default_model_id="claude-opus-4-7",
            created_by_id=owner.id,
        )
        session.add(matter)
        await session.flush()

        key: str | None = None
        if with_storage:
            key = f"test/original/{uuid.uuid4().hex}.pdf"
            if not bogus_key:
                get_storage_backend().put_bytes(
                    key, PDF_BYTES, content_type="application/pdf"
                )
        doc = Document(
            id=uuid.uuid4(),
            matter_id=matter.id,
            filename="claim-form.pdf",
            mime_type="application/pdf",
            size_bytes=len(PDF_BYTES),
            sha256="a" * 64,
            storage_uri=key,
            tag=None,
            from_disclosure=False,
            uploaded_by_id=owner.id,
        )
        session.add(doc)
        await session.commit()
        return matter.slug, str(doc.id)


async def _audit_count(action: str, document_id: str) -> int:
    from app.main import app

    async with app.state.session_factory() as session:
        rows = (
            await session.scalars(
                select(AuditEntry).where(
                    AuditEntry.action == action,
                    AuditEntry.resource_id == document_id,
                )
            )
        ).all()
        return len(rows)


@pytest.mark.asyncio
async def test_owner_opens_original_inline_and_audits(client) -> None:
    owner = await _register_and_login(client)
    _, doc_id = await _seed_document(owner)
    resp = await client.get(f"/api/documents/{doc_id}/original")
    assert resp.status_code == 200, resp.text
    assert resp.content == PDF_BYTES
    assert resp.headers["content-type"].startswith("application/pdf")
    assert resp.headers["content-disposition"].startswith("inline")
    assert await _audit_count("document.original.accessed", doc_id) == 1


@pytest.mark.asyncio
async def test_owner_downloads_attachment(client) -> None:
    owner = await _register_and_login(client)
    _, doc_id = await _seed_document(owner)
    resp = await client.get(f"/api/documents/{doc_id}/original?download=1")
    assert resp.status_code == 200
    assert resp.headers["content-disposition"].startswith("attachment")
    # Audit payload records download=true.
    from app.main import app

    async with app.state.session_factory() as session:
        row = await session.scalar(
            select(AuditEntry).where(
                AuditEntry.action == "document.original.accessed",
                AuditEntry.resource_id == doc_id,
            )
        )
        assert row is not None
        assert row.payload.get("download") is True


@pytest.mark.asyncio
async def test_superuser_non_owner_404(client) -> None:
    # Owner-only by design: a non-owner superuser gets a uniform 404 —
    # there is no admin/superuser document-read shortcut on this path.
    owner = await _register_and_login(client)
    _, doc_id = await _seed_document(owner)
    su = await _register_and_login(client, suffix="-su")
    await _promote_superuser(su)
    await _login(client, su)
    resp = await client.get(f"/api/documents/{doc_id}/original")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_cross_user_404(client) -> None:
    owner = await _register_and_login(client)
    _, doc_id = await _seed_document(owner)
    await _register_and_login(client, suffix="-other")  # different, non-super
    resp = await client.get(f"/api/documents/{doc_id}/original")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_archived_matter_404(client) -> None:
    owner = await _register_and_login(client)
    _, doc_id = await _seed_document(owner, archived=True)
    resp = await client.get(f"/api/documents/{doc_id}/original")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_missing_document_404(client) -> None:
    await _register_and_login(client)
    resp = await client.get(f"/api/documents/{uuid.uuid4()}/original")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_no_storage_uri_404(client) -> None:
    owner = await _register_and_login(client)
    _, doc_id = await _seed_document(owner, with_storage=False)
    resp = await client.get(f"/api/documents/{doc_id}/original")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_missing_storage_object_404(client) -> None:
    owner = await _register_and_login(client)
    _, doc_id = await _seed_document(owner, bogus_key=True)
    resp = await client.get(f"/api/documents/{doc_id}/original")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_storage_read_error_502(client, monkeypatch) -> None:
    owner = await _register_and_login(client)
    _, doc_id = await _seed_document(owner)

    class _Boom:
        def get_bytes(self, key: str) -> bytes:
            raise StorageReadError(
                "boom", key=key, backend="s3", error_code="network_error"
            )

    import app.api.documents as documents_api

    monkeypatch.setattr(documents_api, "get_storage_backend", lambda: _Boom())
    # audit_failure opens a separate committed session (correct in prod so
    # the row survives the request rollback) — but in the SAVEPOINT test
    # harness that session can't see the uncommitted seeded user, FK-
    # violating. We're asserting the 502 *envelope* here; no-op the
    # failure-audit so the harness limitation doesn't mask it. (See
    # legalise-savepoint-audit-trap.)
    async def _noop(*_a, **_k):
        return None

    monkeypatch.setattr(documents_api, "audit_failure", _noop)
    resp = await client.get(f"/api/documents/{doc_id}/original")
    assert resp.status_code == 502
    assert resp.json()["detail"]["error"] == "storage_read_failed"
