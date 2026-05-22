"""MinIO / S3StorageBackend smoke tests.

These tests run ONLY when:
  - STORAGE_BACKEND=s3 is set in the environment, AND
  - the MinIO endpoint is actually reachable.

The default CI backend job uses STORAGE_BACKEND=local (fast, no services).
These tests run in the separate ``storage-minio-smoke`` CI job that spins
up a MinIO service container.

Skip behaviour when services are absent
----------------------------------------
The ``minio_backend`` fixture probes the endpoint with a TCP connect before
creating the S3StorageBackend. If the endpoint is not reachable, every test
in this module is skipped cleanly with a descriptive message — no error.

To run locally against a running MinIO (e.g. via docker-compose):

    STORAGE_BACKEND=s3 \\
    S3_ENDPOINT=http://localhost:9000 \\
    S3_ACCESS_KEY=legalise \\
    S3_SECRET_KEY=legalisesecret \\
    S3_BUCKET=legalise-smoke-test \\
    pytest backend/tests/test_storage_minio_smoke.py -v
"""

from __future__ import annotations

import os
import socket
import uuid

import pytest

from app.core.storage import S3StorageBackend, _reset_backend


# ---------------------------------------------------------------------------
# Skip helpers
# ---------------------------------------------------------------------------


def _minio_endpoint() -> tuple[str, int]:
    """Parse the S3_ENDPOINT env var into (host, port)."""
    raw = os.environ.get("S3_ENDPOINT", "http://minio:9000")
    # Strip scheme
    without_scheme = raw.split("://", 1)[-1]
    if ":" in without_scheme:
        host, port_str = without_scheme.rsplit(":", 1)
        try:
            return host, int(port_str)
        except ValueError:
            pass
    return without_scheme, 9000


def _probe_minio() -> bool:
    """Return True if the MinIO TCP port is reachable."""
    if os.environ.get("STORAGE_BACKEND", "").lower() != "s3":
        return False
    host, port = _minio_endpoint()
    try:
        with socket.create_connection((host, port), timeout=2):
            return True
    except OSError:
        return False


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
def minio_backend() -> S3StorageBackend:
    """Return a live S3StorageBackend against MinIO.

    Skips the test if MinIO is not reachable or STORAGE_BACKEND != s3.
    """
    if not _probe_minio():
        pytest.skip(
            "MinIO smoke tests skipped: STORAGE_BACKEND != s3 or endpoint "
            f"{os.environ.get('S3_ENDPOINT', 'http://minio:9000')} unreachable. "
            "Set STORAGE_BACKEND=s3 and start MinIO to run these tests."
        )
    return S3StorageBackend()


# ---------------------------------------------------------------------------
# Smoke tests: put / get / exists / delete round-trip
# ---------------------------------------------------------------------------


def test_minio_put_get_round_trip(minio_backend: S3StorageBackend) -> None:
    """Bytes written via put_bytes are returned verbatim by get_bytes."""
    key = f"smoke/{uuid.uuid4().hex}/hello.txt"
    data = b"legalise minio smoke test"
    minio_backend.put_bytes(key, data, content_type="text/plain")
    retrieved = minio_backend.get_bytes(key)
    assert retrieved == data, f"Expected {data!r}, got {retrieved!r}"
    # Cleanup
    minio_backend.delete_object(key)


def test_minio_exists_true_after_put(minio_backend: S3StorageBackend) -> None:
    """exists() returns True immediately after a put."""
    key = f"smoke/{uuid.uuid4().hex}/exists.bin"
    minio_backend.put_bytes(key, b"\x00\x01\x02", content_type="application/octet-stream")
    assert minio_backend.exists(key) is True
    minio_backend.delete_object(key)


def test_minio_exists_false_before_put(minio_backend: S3StorageBackend) -> None:
    """exists() returns False for a key that was never written."""
    key = f"smoke/{uuid.uuid4().hex}/ghost.bin"
    assert minio_backend.exists(key) is False


def test_minio_delete_removes_object(minio_backend: S3StorageBackend) -> None:
    """delete_object() makes the key disappear from exists()."""
    key = f"smoke/{uuid.uuid4().hex}/to-delete.bin"
    minio_backend.put_bytes(key, b"bye", content_type="application/octet-stream")
    assert minio_backend.exists(key) is True
    minio_backend.delete_object(key)
    assert minio_backend.exists(key) is False


def test_minio_get_missing_key_raises_key_error(minio_backend: S3StorageBackend) -> None:
    """get_bytes() on a non-existent key raises KeyError (not a boto3 exception)."""
    key = f"smoke/{uuid.uuid4().hex}/nonexistent.txt"
    with pytest.raises(KeyError, match="storage key not found"):
        minio_backend.get_bytes(key)


def test_minio_delete_nonexistent_is_noop(minio_backend: S3StorageBackend) -> None:
    """delete_object() on a missing key must not raise."""
    key = f"smoke/{uuid.uuid4().hex}/also-nonexistent.txt"
    minio_backend.delete_object(key)  # must not raise


def test_minio_list_keys_and_delete_prefix(minio_backend: S3StorageBackend) -> None:
    """list_keys returns written keys; delete_prefix removes them all."""
    prefix = f"smoke/{uuid.uuid4().hex}/"
    keys = [f"{prefix}a.bin", f"{prefix}b.bin", f"{prefix}c.bin"]
    for k in keys:
        minio_backend.put_bytes(k, b"x")

    listed = minio_backend.list_keys(prefix)
    assert sorted(listed) == sorted(keys), f"Expected {sorted(keys)}, got {sorted(listed)}"

    deleted = minio_backend.delete_prefix(prefix)
    assert deleted == 3

    assert minio_backend.list_keys(prefix) == []
