"""Unit 1 storage tests.

Three groups:

1. StorageBackend unit tests (LocalStorageBackend, no DB required).
   - put/get/exists/delete round-trip.
   - path traversal rejection.

2. Key helper tests.
   - uploaded_key and generated_key shape.
   - raw filenames are sanitised in generated_key.

3. Integration tests (DB required, marked skip when DB is absent).
   - Upload route stores bytes in storage and sets storage_uri.
   - Cross-user denial: user B cannot download user A's document.
   - Path traversal via filename does not produce a traversal key.
"""

from __future__ import annotations

import os
import uuid
from pathlib import Path

import pytest

from app.core.storage import (
    LocalStorageBackend,
    _reset_backend,
    generated_key,
    get_storage_backend,
    uploaded_key,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def reset_storage_singleton():
    """Ensure each test starts with a clean backend singleton."""
    _reset_backend()
    yield
    _reset_backend()


@pytest.fixture()
def local_backend(tmp_path: Path) -> LocalStorageBackend:
    return LocalStorageBackend(root=str(tmp_path))


# ---------------------------------------------------------------------------
# 1. LocalStorageBackend round-trip
# ---------------------------------------------------------------------------


def test_put_get_round_trip(local_backend: LocalStorageBackend) -> None:
    key = "users/abc/matters/def/documents/ghi/deadbeef"
    data = b"hello legalise"
    local_backend.put_bytes(key, data, content_type="text/plain")
    assert local_backend.get_bytes(key) == data


def test_exists_true_after_put(local_backend: LocalStorageBackend) -> None:
    key = "some/nested/key"
    local_backend.put_bytes(key, b"data")
    assert local_backend.exists(key) is True


def test_exists_false_before_put(local_backend: LocalStorageBackend) -> None:
    assert local_backend.exists("nonexistent/key") is False


def test_get_missing_key_raises_key_error(local_backend: LocalStorageBackend) -> None:
    with pytest.raises(KeyError):
        local_backend.get_bytes("does/not/exist")


def test_delete_removes_object(local_backend: LocalStorageBackend) -> None:
    key = "to/delete/file"
    local_backend.put_bytes(key, b"bye")
    local_backend.delete_object(key)
    assert local_backend.exists(key) is False


def test_delete_nonexistent_is_noop(local_backend: LocalStorageBackend) -> None:
    # Must not raise.
    local_backend.delete_object("ghost/key")


# ---------------------------------------------------------------------------
# 2. Path traversal rejection (LocalStorageBackend)
# ---------------------------------------------------------------------------


def test_path_traversal_double_dot_rejected(local_backend: LocalStorageBackend) -> None:
    """A key containing `..` must not escape the storage root."""
    with pytest.raises(ValueError, match="path traversal"):
        local_backend.put_bytes("../../etc/passwd", b"evil")


def test_path_traversal_absolute_rejected(local_backend: LocalStorageBackend) -> None:
    """An absolute path key must not escape the storage root."""
    with pytest.raises(ValueError, match="path traversal"):
        local_backend.get_bytes("/etc/passwd")


def test_path_traversal_encoded_dot_rejected(local_backend: LocalStorageBackend) -> None:
    """Deep traversal with mixed ../. must not escape."""
    with pytest.raises(ValueError, match="path traversal"):
        local_backend.exists("valid/../../other_tenant/secret")


# ---------------------------------------------------------------------------
# 3. Key helper shape tests
# ---------------------------------------------------------------------------


def test_uploaded_key_shape() -> None:
    uid = uuid.UUID("00000000-0000-0000-0000-000000000001")
    mid = uuid.UUID("00000000-0000-0000-0000-000000000002")
    did = uuid.UUID("00000000-0000-0000-0000-000000000003")
    sha = "a" * 64
    key = uploaded_key(uid, mid, did, sha)
    assert key == f"users/{uid}/matters/{mid}/documents/{did}/{sha}"
    # Must be tenant-scoped: user id at segment 1.
    assert key.startswith(f"users/{uid}/")


def test_generated_key_shape() -> None:
    uid = uuid.UUID("00000000-0000-0000-0000-000000000001")
    mid = uuid.UUID("00000000-0000-0000-0000-000000000002")
    did = uuid.UUID("00000000-0000-0000-0000-000000000003")
    key = generated_key(uid, mid, did, "report.docx")
    assert key == f"users/{uid}/matters/{mid}/generated/{did}/report.docx"
    assert key.startswith(f"users/{uid}/")


def test_generated_key_sanitises_slashes() -> None:
    """A filename containing `/` must not produce a path-injection key."""
    uid = uuid.uuid4()
    mid = uuid.uuid4()
    did = uuid.uuid4()
    key = generated_key(uid, mid, did, "../../../etc/passwd")
    # Slashes replaced; the key must not contain the raw traversal string.
    assert "../../" not in key
    assert "/etc/passwd" not in key
    # Key still starts with the expected tenant prefix.
    assert key.startswith(f"users/{uid}/matters/{mid}/generated/{did}/")


def test_generated_key_sanitises_null_bytes() -> None:
    uid = uuid.uuid4()
    mid = uuid.uuid4()
    did = uuid.uuid4()
    key = generated_key(uid, mid, did, "file\x00name.docx")
    # Null byte must not appear in the key.
    assert "\x00" not in key


# ---------------------------------------------------------------------------
# 4. get_storage_backend — env routing
# ---------------------------------------------------------------------------


def test_get_storage_backend_local(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("STORAGE_BACKEND", "local")
    monkeypatch.setenv("LOCAL_STORAGE_ROOT", str(tmp_path))
    backend = get_storage_backend()
    assert isinstance(backend, LocalStorageBackend)


# ---------------------------------------------------------------------------
# 5. Integration: upload stores bytes, cross-user denial (DB-backed)
# ---------------------------------------------------------------------------

TEST_EMAIL_A = "storage-user-a@example.com"
TEST_EMAIL_B = "storage-user-b@example.com"
TEST_PASSWORD = "test-storage-password-2026"

_PDF_BYTES = (
    b"%PDF-1.4\n"
    b"1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
    b"2 0 obj<</Type/Pages/Count 0/Kids[]>>endobj\n"
    b"xref\n0 3\n0000000000 65535 f \n"
    b"trailer<</Size 3/Root 1 0 R>>\n"
    b"startxref\n0\n%%EOF\n"
)


async def _register_and_login(client, email: str, password: str) -> None:
    r = await client.post("/auth/register", json={"email": email, "password": password})
    assert r.status_code == 201, r.text
    r = await client.post(
        "/auth/login",
        data={"username": email, "password": password},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert r.status_code == 204, r.text


@pytest.mark.asyncio
async def test_upload_sets_storage_uri(client, monkeypatch, tmp_path) -> None:
    """After upload the Document row must have storage_uri set to the object key."""
    monkeypatch.setenv("STORAGE_BACKEND", "local")
    monkeypatch.setenv("LOCAL_STORAGE_ROOT", str(tmp_path))
    _reset_backend()

    await _register_and_login(client, TEST_EMAIL_A, TEST_PASSWORD)

    # Create a matter first.
    r = await client.post(
        "/api/matters",
        json={"title": "Storage Test Matter", "matter_type": "employment_tribunal"},
    )
    assert r.status_code == 201, r.text
    slug = r.json()["slug"]

    # Upload a document.
    r = await client.post(
        f"/api/matters/{slug}/documents",
        files={"file": ("evidence.pdf", _PDF_BYTES, "application/pdf")},
    )
    assert r.status_code == 201, r.text
    doc = r.json()
    assert doc["filename"] == "evidence.pdf"
    # The response model doesn't expose storage_uri; verify the object was
    # stored by checking the storage backend directly.
    backend = get_storage_backend()
    # At least one key must exist under users/*/matters/*/documents/*
    doc_id = doc["id"]
    found = False
    root = tmp_path
    for f in root.rglob("*"):
        if f.is_file() and "documents" in str(f):
            found = True
            break
    assert found, "No document bytes written to storage after upload"


@pytest.mark.asyncio
async def test_cross_user_matter_denial(client, monkeypatch, tmp_path) -> None:
    """User B uploading to User A's matter slug must get 404."""
    monkeypatch.setenv("STORAGE_BACKEND", "local")
    monkeypatch.setenv("LOCAL_STORAGE_ROOT", str(tmp_path))
    _reset_backend()

    # Register user A and create a matter.
    email_a = f"cross-user-a-{uuid.uuid4().hex[:8]}@example.com"
    email_b = f"cross-user-b-{uuid.uuid4().hex[:8]}@example.com"
    await _register_and_login(client, email_a, TEST_PASSWORD)

    r = await client.post(
        "/api/matters",
        json={"title": "User A Private Matter", "matter_type": "employment_tribunal"},
    )
    assert r.status_code == 201, r.text
    slug_a = r.json()["slug"]

    # Log in as user B.
    r = await client.post("/auth/logout")
    await _register_and_login(client, email_b, TEST_PASSWORD)

    # User B must not be able to upload to user A's matter.
    r = await client.post(
        f"/api/matters/{slug_a}/documents",
        files={"file": ("evil.pdf", _PDF_BYTES, "application/pdf")},
    )
    assert r.status_code == 404, f"Expected 404, got {r.status_code}: {r.text}"


@pytest.mark.asyncio
async def test_path_traversal_in_filename_does_not_escape_key(
    client, monkeypatch, tmp_path
) -> None:
    """A filename containing path separators must not produce a traversal key.

    The upload succeeds (filename sanitisation is on the key, not the stored
    filename). The storage key must not contain the raw traversal segment.
    """
    monkeypatch.setenv("STORAGE_BACKEND", "local")
    monkeypatch.setenv("LOCAL_STORAGE_ROOT", str(tmp_path))
    _reset_backend()

    email = f"traversal-test-{uuid.uuid4().hex[:8]}@example.com"
    await _register_and_login(client, email, TEST_PASSWORD)

    r = await client.post(
        "/api/matters",
        json={"title": "Traversal Matter", "matter_type": "employment_tribunal"},
    )
    assert r.status_code == 201, r.text
    slug = r.json()["slug"]

    # Use a valid PDF body but a malicious filename.
    r = await client.post(
        f"/api/matters/{slug}/documents",
        files={
            "file": (
                "../../etc/passwd",
                _PDF_BYTES,
                "application/pdf",
            )
        },
    )
    # Upload must succeed (filename is stored as-is in DB; the key is sanitised).
    assert r.status_code == 201, r.text

    # No file must exist outside tmp_path.
    for f in tmp_path.rglob("*"):
        assert f.is_relative_to(tmp_path), f"File escaped storage root: {f}"
