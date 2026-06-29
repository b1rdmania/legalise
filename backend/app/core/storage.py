"""Object storage abstraction — Unit 1 (real backend substrate).

Two backends:

  S3StorageBackend  — boto3 against MinIO (local compose) or R2 (hosted prod).
                      Reads config from app.core.config.settings.
  LocalStorageBackend — local filesystem only; used in tests via env override.

Choosing a backend
------------------
Call `get_storage_backend()` to get the singleton. It consults the env var
`STORAGE_BACKEND` (values: ``s3`` [default] / ``local``). The local backend
root defaults to ``/tmp/legalise-test-storage``; override with
``LOCAL_STORAGE_ROOT``.

Key format helpers
------------------
Two helpers build canonical object keys:

  uploaded_key(user_id, matter_id, document_id, sha256)
      → ``users/{user_id}/matters/{matter_id}/documents/{document_id}/{sha256}``

  generated_key(user_id, matter_id, document_id, filename)
      → ``users/{user_id}/matters/{matter_id}/generated/{document_id}/{filename}``

Both sanitise their inputs so raw user-supplied filenames cannot produce
path-traversal keys. Callers MUST use these helpers — never construct keys
from raw filenames.
"""

from __future__ import annotations

import os
import re
import uuid
from pathlib import Path
from typing import Protocol, runtime_checkable


# ---------------------------------------------------------------------------
# Storage exception types
# ---------------------------------------------------------------------------


class StorageError(Exception):
    """Base class for all structured storage failures."""

    def __init__(self, message: str, key: str, backend: str, error_code: str) -> None:
        super().__init__(message)
        self.key = key
        self.backend = backend
        self.error_code = error_code


class StorageWriteError(StorageError):
    """Raised by put_bytes on a non-retryable backend failure."""


class StorageReadError(StorageError):
    """Raised by get_bytes when the object isn't readable for non-not-found reasons.

    KeyError is still raised for missing objects ("not found" semantics).
    StorageReadError surfaces every other boto3/IO failure.
    """


class StorageDeleteError(StorageError):
    """Raised by delete_object / delete_prefix on backend failure."""


# ---------------------------------------------------------------------------
# Key helpers
# ---------------------------------------------------------------------------

_SAFE_FILENAME_RE = re.compile(r"[^A-Za-z0-9._-]")


def _sanitise_filename(name: str, max_len: int = 100) -> str:
    """Strip everything except safe ASCII chars, then truncate."""
    cleaned = _SAFE_FILENAME_RE.sub("_", name)
    return cleaned[:max_len] or "file"


def uploaded_key(
    user_id: uuid.UUID,
    matter_id: uuid.UUID,
    document_id: uuid.UUID,
    sha256: str,
) -> str:
    """Return the canonical key for an uploaded document's binary.

    Key: ``users/{user_id}/matters/{matter_id}/documents/{document_id}/{sha256}``

    SHA-256 hex is the content address; the segment is 64 hex chars and
    does not need sanitisation. The UUID segments are similarly safe.
    """
    return f"users/{user_id}/matters/{matter_id}/documents/{document_id}/{sha256}"


def generated_key(
    user_id: uuid.UUID,
    matter_id: uuid.UUID,
    document_id: uuid.UUID,
    filename: str,
) -> str:
    """Return the canonical key for a generated artefact (.docx / .pdf).

    Key: ``users/{user_id}/matters/{matter_id}/generated/{document_id}/{safe_filename}``

    ``filename`` is sanitised so it cannot contain path separators or
    unexpected characters even if the caller passes a user-supplied string.
    """
    safe = _sanitise_filename(filename)
    return f"users/{user_id}/matters/{matter_id}/generated/{document_id}/{safe}"


def document_asset_key(
    user_id: uuid.UUID,
    matter_id: uuid.UUID,
    document_id: uuid.UUID,
    asset_id: uuid.UUID,
    filename: str,
) -> str:
    """Canonical object-storage key for document editor embedded assets.

    Key: ``users/{user_id}/matters/{matter_id}/documents/{document_id}/assets/{asset_id}/{safe_filename}``

    It deliberately lives under the matter prefix so destructive matter
    deletion sweeps assets with the rest of the matter storage.
    """
    safe = _sanitise_filename(filename)
    return (
        f"users/{user_id}/matters/{matter_id}/documents/"
        f"{document_id}/assets/{asset_id}/{safe}"
    )


def artifact_key(
    user_id: uuid.UUID,
    matter_id: uuid.UUID,
    artifact_id: uuid.UUID,
    capability_id: str,
    kind: str,
) -> str:
    """Canonical object-storage key for a matter artifact.

    Key: ``users/{user_id}/matters/{matter_id}/artifacts/{capability}/{artifact_id}_{kind}.json``

    Lives under ``matter_prefix(user_id, matter_id)`` so the existing
    ``delete_prefix`` matter-cleanup sweeps artifacts too. ``capability``
    + ``kind`` are sanitised so they cannot inject path separators.
    """
    safe_cap = _sanitise_filename(capability_id)
    safe_kind = _sanitise_filename(kind)
    return (
        f"users/{user_id}/matters/{matter_id}/artifacts/"
        f"{safe_cap}/{artifact_id}_{safe_kind}.json"
    )


# ---------------------------------------------------------------------------
# Protocol
# ---------------------------------------------------------------------------


@runtime_checkable
class StorageBackend(Protocol):
    """Minimal S3-compatible object storage protocol.

    Implementors:
      S3StorageBackend   — boto3 / MinIO / R2.
      LocalStorageBackend — filesystem, tests only.
    """

    def put_bytes(
        self,
        key: str,
        data: bytes,
        content_type: str = "application/octet-stream",
        metadata: dict[str, str] | None = None,
    ) -> None:
        """Write ``data`` at ``key``. Overwrites if exists."""
        ...

    def get_bytes(self, key: str) -> bytes:
        """Return the object at ``key``. Raises ``KeyError`` if absent."""
        ...

    def delete_object(self, key: str) -> None:
        """Delete the object at ``key``. No-op if absent."""
        ...

    def exists(self, key: str) -> bool:
        """Return True if the key exists in the bucket."""
        ...

    def presigned_get_url(self, key: str, ttl: int = 3600) -> str:
        """Return a presigned GET URL valid for ``ttl`` seconds."""
        ...

    def list_keys(self, prefix: str) -> list[str]:
        """Return all object keys that start with ``prefix``."""
        ...

    def delete_prefix(self, prefix: str) -> int:
        """Delete all objects whose key starts with ``prefix``.

        Returns the count of objects deleted. Safe to call when no objects
        exist under the prefix (returns 0). Used by the matter delete path
        to remove all storage objects scoped to a matter.
        """
        ...


# ---------------------------------------------------------------------------
# S3-compatible backend (MinIO / R2 via boto3)
# ---------------------------------------------------------------------------


class S3StorageBackend:
    """boto3 backend.

    Reads ``s3_endpoint``, ``s3_access_key``, ``s3_secret_key``,
    ``s3_bucket``, ``s3_region`` from app.core.config.settings. All five
    are already in config.py; no new env vars are introduced.

    Lazy client: the boto3 Session is created on first use so the import
    doesn't hard-require network at module-load time (important for tests
    that override the backend before any storage call).
    """

    def __init__(self) -> None:
        self._client = None
        self._bucket: str | None = None

    def _ensure_client(self):
        if self._client is not None:
            return
        import boto3
        from botocore.config import Config
        from app.core.config import settings

        self._bucket = settings.s3_bucket
        self._client = boto3.client(
            "s3",
            endpoint_url=settings.s3_endpoint,
            aws_access_key_id=settings.s3_access_key,
            aws_secret_access_key=settings.s3_secret_key,
            region_name=settings.s3_region,
            config=Config(signature_version="s3v4"),
        )
        # Ensure bucket exists (idempotent; MinIO accepts this on existing buckets).
        self._ensure_bucket()

    def _ensure_bucket(self) -> None:
        """Create the bucket if it doesn't exist. Swallows BucketAlreadyOwnedByYou."""
        try:
            from botocore.exceptions import ClientError
            self._client.head_bucket(Bucket=self._bucket)
        except Exception:
            try:
                self._client.create_bucket(Bucket=self._bucket)
            except Exception:
                pass  # Already exists or transient error; put_bytes will surface real failures.

    def put_bytes(
        self,
        key: str,
        data: bytes,
        content_type: str = "application/octet-stream",
        metadata: dict[str, str] | None = None,
    ) -> None:
        self._ensure_client()
        from botocore.exceptions import ClientError, EndpointConnectionError
        kwargs: dict = {
            "Bucket": self._bucket,
            "Key": key,
            "Body": data,
            "ContentType": content_type,
        }
        if metadata:
            kwargs["Metadata"] = metadata
        try:
            self._client.put_object(**kwargs)
        except ClientError as exc:
            raise StorageWriteError(
                f"S3 put_bytes failed for key {key!r}: {exc}",
                key=key,
                backend="s3",
                error_code="boto_client_error",
            ) from exc
        except EndpointConnectionError as exc:
            raise StorageWriteError(
                f"S3 endpoint unreachable during put_bytes for key {key!r}: {exc}",
                key=key,
                backend="s3",
                error_code="network_error",
            ) from exc
        except OSError as exc:
            raise StorageWriteError(
                f"Network error during put_bytes for key {key!r}: {exc}",
                key=key,
                backend="s3",
                error_code="network_error",
            ) from exc

    def get_bytes(self, key: str) -> bytes:
        self._ensure_client()
        from botocore.exceptions import ClientError, EndpointConnectionError
        try:
            response = self._client.get_object(Bucket=self._bucket, Key=key)
            return response["Body"].read()
        except ClientError as exc:
            code = exc.response["Error"]["Code"]
            if code in ("NoSuchKey", "404"):
                raise KeyError(f"storage key not found: {key}") from exc
            raise StorageReadError(
                f"S3 get_bytes failed for key {key!r}: {exc}",
                key=key,
                backend="s3",
                error_code="boto_client_error",
            ) from exc
        except EndpointConnectionError as exc:
            raise StorageReadError(
                f"S3 endpoint unreachable during get_bytes for key {key!r}: {exc}",
                key=key,
                backend="s3",
                error_code="network_error",
            ) from exc
        except OSError as exc:
            raise StorageReadError(
                f"Network error during get_bytes for key {key!r}: {exc}",
                key=key,
                backend="s3",
                error_code="network_error",
            ) from exc

    def delete_object(self, key: str) -> None:
        self._ensure_client()
        from botocore.exceptions import ClientError, EndpointConnectionError
        try:
            self._client.delete_object(Bucket=self._bucket, Key=key)
        except ClientError as exc:
            raise StorageDeleteError(
                f"S3 delete_object failed for key {key!r}: {exc}",
                key=key,
                backend="s3",
                error_code="boto_client_error",
            ) from exc
        except EndpointConnectionError as exc:
            raise StorageDeleteError(
                f"S3 endpoint unreachable during delete_object for key {key!r}: {exc}",
                key=key,
                backend="s3",
                error_code="network_error",
            ) from exc

    def exists(self, key: str) -> bool:
        self._ensure_client()
        from botocore.exceptions import ClientError
        try:
            self._client.head_object(Bucket=self._bucket, Key=key)
            return True
        except ClientError as exc:
            if exc.response["Error"]["Code"] in ("404", "NoSuchKey"):
                return False
            raise

    def presigned_get_url(self, key: str, ttl: int = 3600) -> str:
        self._ensure_client()
        return self._client.generate_presigned_url(
            "get_object",
            Params={"Bucket": self._bucket, "Key": key},
            ExpiresIn=ttl,
        )

    def list_keys(self, prefix: str) -> list[str]:
        self._ensure_client()
        keys: list[str] = []
        paginator = self._client.get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket=self._bucket, Prefix=prefix):
            for obj in page.get("Contents", []):
                keys.append(obj["Key"])
        return keys

    def delete_prefix(self, prefix: str) -> int:
        self._ensure_client()
        from botocore.exceptions import ClientError, EndpointConnectionError
        try:
            keys = self.list_keys(prefix)
        except (ClientError, EndpointConnectionError, OSError) as exc:
            raise StorageDeleteError(
                f"S3 delete_prefix list failed for prefix {prefix!r}: {exc}",
                key=prefix,
                backend="s3",
                error_code="boto_client_error" if not isinstance(exc, (EndpointConnectionError, OSError)) else "network_error",
            ) from exc
        if not keys:
            return 0
        # S3 batch delete: max 1000 per call
        deleted = 0
        try:
            for i in range(0, len(keys), 1000):
                batch = [{"Key": k} for k in keys[i : i + 1000]]
                self._client.delete_objects(
                    Bucket=self._bucket, Delete={"Objects": batch, "Quiet": True}
                )
                deleted += len(batch)
        except ClientError as exc:
            raise StorageDeleteError(
                f"S3 delete_prefix batch-delete failed for prefix {prefix!r}: {exc}",
                key=prefix,
                backend="s3",
                error_code="boto_client_error",
            ) from exc
        except (EndpointConnectionError, OSError) as exc:
            raise StorageDeleteError(
                f"S3 delete_prefix network error for prefix {prefix!r}: {exc}",
                key=prefix,
                backend="s3",
                error_code="network_error",
            ) from exc
        return deleted


# ---------------------------------------------------------------------------
# Local filesystem backend (tests only)
# ---------------------------------------------------------------------------


class LocalStorageBackend:
    """Filesystem backend for test isolation.

    Enabled by setting ``STORAGE_BACKEND=local`` in the test environment.
    Root defaults to ``/tmp/legalise-test-storage``; override with
    ``LOCAL_STORAGE_ROOT``.

    No external processes or network required. Not for production use.
    """

    def __init__(self, root: str | None = None) -> None:
        self._root = Path(
            root
            or os.environ.get("LOCAL_STORAGE_ROOT", "/tmp/legalise-test-storage")
        )

    def _path(self, key: str) -> Path:
        # Normalise and reject traversal attempts.
        resolved = (self._root / key).resolve()
        if not str(resolved).startswith(str(self._root.resolve())):
            raise ValueError(f"path traversal rejected: {key!r}")
        return resolved

    def put_bytes(
        self,
        key: str,
        data: bytes,
        content_type: str = "application/octet-stream",
        metadata: dict[str, str] | None = None,
    ) -> None:
        target = self._path(key)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)

    def get_bytes(self, key: str) -> bytes:
        target = self._path(key)
        if not target.is_file():
            raise KeyError(f"storage key not found: {key}")
        return target.read_bytes()

    def delete_object(self, key: str) -> None:
        target = self._path(key)
        if target.is_file():
            target.unlink()

    def exists(self, key: str) -> bool:
        return self._path(key).is_file()

    def presigned_get_url(self, key: str, ttl: int = 3600) -> str:
        raise NotImplementedError("LocalStorageBackend does not support presigned URLs")

    def list_keys(self, prefix: str) -> list[str]:
        root = self._root.resolve()
        prefix_path = (root / prefix).resolve()
        if not str(prefix_path).startswith(str(root)):
            raise ValueError(f"path traversal rejected: {prefix!r}")
        keys: list[str] = []
        if prefix_path.is_dir():
            for p in prefix_path.rglob("*"):
                if p.is_file():
                    keys.append(str(p.relative_to(root)))
        elif str(prefix_path).startswith(str(root)):
            # prefix is not a directory; scan parent and filter
            parent = prefix_path.parent
            if parent.is_dir():
                for p in parent.iterdir():
                    if p.is_file() and str(p.relative_to(root)).startswith(prefix):
                        keys.append(str(p.relative_to(root)))
        return keys

    def delete_prefix(self, prefix: str) -> int:
        keys = self.list_keys(prefix)
        for key in keys:
            self.delete_object(key)
        return len(keys)


# ---------------------------------------------------------------------------
# Singleton getter
# ---------------------------------------------------------------------------

_backend: StorageBackend | None = None


def get_storage_backend() -> StorageBackend:
    """Return the process-level storage backend singleton.

    Controlled by env var ``STORAGE_BACKEND``:
      ``s3``    (default) → S3StorageBackend (MinIO / R2 via config.py)
      ``local`` → LocalStorageBackend (tests only; root from LOCAL_STORAGE_ROOT)
    """
    global _backend
    if _backend is None:
        backend_type = os.environ.get("STORAGE_BACKEND", "s3").lower()
        if backend_type == "local":
            _backend = LocalStorageBackend()
        else:
            _backend = S3StorageBackend()
    return _backend


def _reset_backend() -> None:
    """Force re-creation of the singleton. Tests use this between cases."""
    global _backend
    _backend = None


def matter_prefix(user_id: uuid.UUID, matter_id: uuid.UUID) -> str:
    """Return the key prefix for all objects belonging to a matter.

    All uploaded documents and generated artefacts for a matter are stored
    under this prefix. Passing this to ``delete_prefix`` removes every
    storage object scoped to the matter.
    """
    return f"users/{user_id}/matters/{matter_id}/"


def document_prefix(
    user_id: uuid.UUID,
    matter_id: uuid.UUID,
    document_id: uuid.UUID,
) -> str:
    """Return the key prefix for all objects belonging to one document.

    Covers the uploaded binary (``uploaded_key``) and the editor's
    embedded assets (``document_asset_key``), both of which live under
    ``users/{user_id}/matters/{matter_id}/documents/{document_id}/``.
    Passing this to ``delete_prefix`` removes every storage object scoped
    to a single document — the per-document analogue of ``matter_prefix``.
    """
    return f"users/{user_id}/matters/{matter_id}/documents/{document_id}/"


__all__ = [
    "StorageError",
    "StorageWriteError",
    "StorageReadError",
    "StorageDeleteError",
    "StorageBackend",
    "S3StorageBackend",
    "LocalStorageBackend",
    "get_storage_backend",
    "_reset_backend",
    "uploaded_key",
    "generated_key",
    "document_asset_key",
    "matter_prefix",
    "document_prefix",
]
