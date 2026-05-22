"""Storage failure envelope tests — Issue #6.

Covers:
  - put_bytes failure during upload → 502 + audit row
  - get_bytes failure during download → 502 + audit row
  - get_bytes not-found stays 404 (not 502)
  - LocalStorageBackend raise semantics (documented)

All DB-backed tests skip when Postgres is unreachable.
"""

from __future__ import annotations

import io
import uuid

import pytest
from sqlalchemy import select

from app.core.storage import (
    LocalStorageBackend,
    StorageDeleteError,
    StorageReadError,
    StorageWriteError,
    _reset_backend,
)
from app.models import AuditEntry


# ---------------------------------------------------------------------------
# Helpers shared by DB-backed tests
# ---------------------------------------------------------------------------

EMAIL = "storage-envelopes@example.com"
PASSWORD = "storage-envelope-test-2026"


async def _signup_and_login(client, email: str = EMAIL, password: str = PASSWORD) -> None:
    reg = await client.post("/auth/register", json={"email": email, "password": password})
    assert reg.status_code == 201, reg.text
    login = await client.post(
        "/auth/login",
        data={"username": email, "password": password},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert login.status_code == 204, login.text


async def _create_matter(client, title: str = "Envelope Test Matter") -> str:
    resp = await client.post("/api/matters", json={"title": title})
    assert resp.status_code == 201, resp.text
    return resp.json()["slug"]


def _pdf_bytes() -> bytes:
    """Minimal valid PDF magic bytes for upload validation."""
    return b"%PDF-1.4 1 0 obj<</Type/Catalog>>endobj\n%%EOF"


# ---------------------------------------------------------------------------
# Unit tests — exception types (no DB required)
# ---------------------------------------------------------------------------


def test_storage_write_error_attributes() -> None:
    exc = StorageWriteError(
        "put failed", key="users/a/b", backend="s3", error_code="boto_client_error"
    )
    assert exc.key == "users/a/b"
    assert exc.backend == "s3"
    assert exc.error_code == "boto_client_error"
    assert isinstance(exc, StorageWriteError)


def test_storage_read_error_attributes() -> None:
    exc = StorageReadError(
        "get failed", key="users/a/b", backend="s3", error_code="network_error"
    )
    assert exc.key == "users/a/b"
    assert exc.backend == "s3"
    assert exc.error_code == "network_error"
    assert isinstance(exc, StorageReadError)


def test_storage_delete_error_attributes() -> None:
    exc = StorageDeleteError(
        "delete failed", key="users/a/b", backend="s3", error_code="boto_client_error"
    )
    assert exc.key == "users/a/b"
    assert exc.backend == "s3"
    assert isinstance(exc, StorageDeleteError)


def test_local_backend_missing_key_raises_key_error(tmp_path) -> None:
    """LocalStorageBackend still raises KeyError (not StorageReadError) for missing keys.

    This is intentional: LocalStorageBackend is test-only and does not go
    through boto3; its failure modes are purely filesystem-based. Callers that
    catch StorageReadError for 502 semantics will fall through to the KeyError
    → 404 path, which is the right behaviour in test environments.
    """
    backend = LocalStorageBackend(root=str(tmp_path))
    with pytest.raises(KeyError):
        backend.get_bytes("does/not/exist")


def test_local_backend_write_is_plain(tmp_path) -> None:
    """LocalStorageBackend.put_bytes does not raise StorageWriteError on success."""
    backend = LocalStorageBackend(root=str(tmp_path))
    backend.put_bytes("some/key", b"data")
    assert backend.get_bytes("some/key") == b"data"


# ---------------------------------------------------------------------------
# Helper storage mock classes
# ---------------------------------------------------------------------------


class _WriteFails:
    """Storage backend where put_bytes always raises StorageWriteError."""

    def put_bytes(self, key, data, content_type="application/octet-stream", metadata=None):
        raise StorageWriteError(
            "simulated write failure",
            key=key,
            backend="s3",
            error_code="boto_client_error",
        )

    def get_bytes(self, key):
        return b""

    def delete_object(self, key):
        pass

    def delete_prefix(self, prefix):
        return 0

    def exists(self, key):
        return False

    def list_keys(self, prefix):
        return []

    def presigned_get_url(self, key, ttl=3600):
        return f"https://example.com/{key}"


class _ReadFails:
    """Storage backend where get_bytes raises StorageReadError (not KeyError)."""

    def __init__(self):
        self._data: dict[str, bytes] = {}

    def put_bytes(self, key, data, content_type="application/octet-stream", metadata=None):
        self._data[key] = data

    def get_bytes(self, key):
        # Always raise StorageReadError regardless of whether the key exists.
        raise StorageReadError(
            "simulated read failure",
            key=key,
            backend="s3",
            error_code="network_error",
        )

    def delete_object(self, key):
        self._data.pop(key, None)

    def delete_prefix(self, prefix):
        gone = [k for k in self._data if k.startswith(prefix)]
        for k in gone:
            del self._data[k]
        return len(gone)

    def exists(self, key):
        return key in self._data

    def list_keys(self, prefix):
        return [k for k in self._data if k.startswith(prefix)]

    def presigned_get_url(self, key, ttl=3600):
        return f"https://example.com/{key}"


class _ReadMisses:
    """Storage backend where get_bytes always raises KeyError (not-found semantics)."""

    def put_bytes(self, key, data, content_type="application/octet-stream", metadata=None):
        pass

    def get_bytes(self, key):
        raise KeyError(f"storage key not found: {key}")

    def delete_object(self, key):
        pass

    def delete_prefix(self, prefix):
        return 0

    def exists(self, key):
        return False

    def list_keys(self, prefix):
        return []

    def presigned_get_url(self, key, ttl=3600):
        return f"https://example.com/{key}"


# ---------------------------------------------------------------------------
# DB-backed tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_upload_put_bytes_failure_returns_502(
    client, db_session, monkeypatch: pytest.MonkeyPatch
) -> None:
    """put_bytes failure during upload must return 502 with error=storage_write_failed.

    No Document row should be committed (the DB flush is rolled back).

    The audit row is written via `audit_failure` (separate committed
    session) so it survives the route's rollback. We assert the helper
    was invoked with the right shape — proving persistence end-to-end
    against the conftest test DB is impossible because the helper opens
    a fresh pooled connection that can't see User/Matter rows created
    inside the test's outer transaction (FK violation otherwise). The
    same pattern is used by test_provider_audit_completeness.py.

    R3 review fix.
    """
    from app.api import matters as matters_api
    from app.core import api as api_module
    from app.models import AuditEntry, Document

    monkeypatch.setattr(matters_api, "get_storage_backend", lambda: _WriteFails())

    # Patch audit_failure to capture invocations instead of writing to
    # a separate connection (which can't see test-scoped User/Matter).
    captured: list[dict] = []

    async def _capturing_audit_failure(session, action, **kwargs):
        captured.append({"action": action, **kwargs})

    monkeypatch.setattr(api_module, "audit_failure", _capturing_audit_failure)

    await _signup_and_login(client)
    slug = await _create_matter(client)

    resp = await client.post(
        f"/api/matters/{slug}/documents",
        files={"file": ("test.pdf", _pdf_bytes(), "application/pdf")},
    )
    assert resp.status_code == 502, resp.text
    detail = resp.json()["detail"]
    assert detail["error"] == "storage_write_failed"
    assert "storage_key" in detail
    assert "backend" in detail

    # Assert `audit_failure` was invoked exactly once with the
    # storage.put_bytes.failed action and the right shape.
    rows = [c for c in captured if c["action"] == "storage.put_bytes.failed"]
    assert len(rows) == 1, "audit_failure must be invoked on storage write failure"
    row = rows[0]
    assert row["module"] == "storage"
    assert row["resource_type"] == "document"
    assert "storage_key" in row["payload"]
    assert "backend" in row["payload"]
    assert "error_code" in row["payload"]

    # No document.upload audit row.
    upload_rows = list(
        (
            await db_session.scalars(
                select(AuditEntry).where(AuditEntry.action == "document.upload")
            )
        ).all()
    )
    assert len(upload_rows) == 0, "document.upload audit row must not exist on storage failure"


@pytest.mark.asyncio
async def test_download_get_bytes_failure_returns_502(
    client, db_session, monkeypatch: pytest.MonkeyPatch
) -> None:
    """get_bytes failure during download must return 502 with error=storage_read_failed.

    The audit row is written via `audit_failure` (separate committed
    session) so it survives the route's rollback. Per the upload-test
    rationale: we assert the helper was invoked with the right shape
    rather than the row literally persisting in the conftest test DB.

    R3 review fix.
    """
    from app.api import documents as documents_api
    from app.core import api as api_module
    from app.models import AuditEntry

    captured: list[dict] = []

    async def _capturing_audit_failure(session, action, **kwargs):
        captured.append({"action": action, **kwargs})

    monkeypatch.setattr(api_module, "audit_failure", _capturing_audit_failure)

    # First: upload with a normal backend so we have a real AuditEntry + generated file.
    # We seed the generated-file audit entry directly rather than running the full
    # generate_docx pipeline (which requires a model). Inject an AuditEntry whose
    # action=document.generated with a known storage_uri so the download route resolves it.
    await _signup_and_login(client)
    slug = await _create_matter(client)

    # Fetch matter id from the list endpoint.
    matter_resp = await client.get(f"/api/matters/{slug}")
    assert matter_resp.status_code == 200, matter_resp.text
    matter_id = uuid.UUID(matter_resp.json()["id"])

    # Insert a synthetic `document.generated` audit entry pointing at a fake storage URI.
    file_uuid = uuid.uuid4()
    fake_storage_uri = f"users/00000000-0000-0000-0000-000000000000/matters/{matter_id}/generated/{file_uuid}/{file_uuid}.docx"
    from app.models import AuditEntry as AE
    from datetime import datetime, timezone

    entry = AE(
        action="document.generated",
        matter_id=matter_id,
        module="document_generation",
        resource_type="document",
        resource_id=str(file_uuid),
        payload={
            "storage_uri": fake_storage_uri,
            "title": "Test Doc",
        },
        timestamp=datetime.now(timezone.utc),
    )
    db_session.add(entry)
    await db_session.flush()

    # Patch storage backend to raise StorageReadError on get_bytes.
    monkeypatch.setattr(documents_api, "get_storage_backend", lambda: _ReadFails())

    resp = await client.get(f"/api/documents/generated/{file_uuid}")
    assert resp.status_code == 502, resp.text
    detail = resp.json()["detail"]
    assert detail["error"] == "storage_read_failed"
    assert "storage_key" in detail
    assert "backend" in detail

    rows = [c for c in captured if c["action"] == "storage.get_bytes.failed"]
    assert len(rows) == 1, "audit_failure must be invoked on storage read failure"
    row = rows[0]
    assert row["module"] == "storage"
    assert row["resource_type"] == "document"
    assert row["resource_id"] == str(file_uuid)
    assert "storage_key" in row["payload"]
    assert "backend" in row["payload"]
    assert "error_code" in row["payload"]


@pytest.mark.asyncio
async def test_download_not_found_stays_404(
    client, db_session, monkeypatch: pytest.MonkeyPatch
) -> None:
    """get_bytes KeyError (object missing) must return 404, not 502."""
    from app.api import documents as documents_api
    from app.models import AuditEntry as AE
    from datetime import datetime, timezone

    await _signup_and_login(client)
    slug = await _create_matter(client)

    matter_resp = await client.get(f"/api/matters/{slug}")
    assert matter_resp.status_code == 200
    matter_id = uuid.UUID(matter_resp.json()["id"])

    file_uuid = uuid.uuid4()
    fake_storage_uri = f"users/x/matters/{matter_id}/generated/{file_uuid}/{file_uuid}.docx"

    entry = AE(
        action="document.generated",
        matter_id=matter_id,
        module="document_generation",
        resource_type="document",
        resource_id=str(file_uuid),
        payload={
            "storage_uri": fake_storage_uri,
            "title": "Missing Doc",
        },
        timestamp=datetime.now(timezone.utc),
    )
    db_session.add(entry)
    await db_session.flush()

    # Backend raises KeyError (not StorageReadError) — not-found semantics.
    monkeypatch.setattr(documents_api, "get_storage_backend", lambda: _ReadMisses())

    resp = await client.get(f"/api/documents/generated/{file_uuid}")
    assert resp.status_code == 404, resp.text
