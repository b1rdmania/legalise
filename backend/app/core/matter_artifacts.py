"""Matter artifact write helper.

Single public function: ``write_artifact`` writes a JSON payload to
the matter filesystem atomically and inserts a ``matter_artifacts``
row referencing it.

Atomic-write contract:
1. Compute a target path under ``{matter_dir}/artifacts/{capability_id}/{invocation_id}_{kind}.json``.
2. Write to ``<target>.tmp``.
3. ``fsync`` the temp file's fd.
4. Atomic ``os.replace`` to the final path.
5. ``fsync`` the parent directory's fd (so the rename is durable).
6. Insert the DB row.

If any step fails before the rename, the temp file may remain — a
periodic cleanup job can sweep them. The DB row only
lands once the file is in place, so the row is the authoritative
existence check.

The helper does NOT commit. Caller commits — same contract as
``audit.log``. The row is added to the caller's session so it
participates in the same transaction as the work that produced it.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, UTC
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.storage import artifact_key, get_storage_backend
from app.models import Matter, MatterArtifact


class ArtifactBytesUnavailable(Exception):
    """The artifact's bytes can't be retrieved.

    Two cases, both surfaced cleanly (never crash) per the forward-only
    object-storage cutover (LMF-1):
    - **legacy**: the row predates object storage — ``storage_path`` is
      an absolute local filesystem path (Fly fs is ephemeral, so the
      bytes are gone). No backfill was done.
    - **missing**: a new S3-keyed object is absent (integrity issue).
    """


def _is_legacy_path(storage_path: str) -> bool:
    # New artifacts store an object-storage KEY (``users/...``); legacy
    # rows stored an absolute local fs path (``/data/matters/...``).
    return storage_path.startswith("/")


def _serialise(payload: dict[str, Any]) -> bytes:
    return json.dumps(
        payload, indent=2, sort_keys=True, ensure_ascii=False
    ).encode("utf-8")


def load_artifact_bytes(storage_path: str) -> bytes:
    """Load an artifact's bytes from object storage.

    Raises ``ArtifactBytesUnavailable`` for legacy local-fs rows (no
    backfill) and for new keys whose object is missing — callers surface
    "artifact bytes unavailable" cleanly rather than crashing.
    """
    if _is_legacy_path(storage_path):
        raise ArtifactBytesUnavailable(f"legacy local-fs artifact: {storage_path}")
    try:
        return get_storage_backend().get_bytes(storage_path)
    except KeyError as exc:
        raise ArtifactBytesUnavailable(
            f"artifact object missing: {storage_path}"
        ) from exc


def load_artifact_payload(storage_path: str) -> dict[str, Any]:
    """Load + JSON-parse an artifact payload. Raises
    ``ArtifactBytesUnavailable`` (legacy/missing) or ``ValueError`` on
    corrupt JSON."""
    return json.loads(load_artifact_bytes(storage_path).decode("utf-8"))


async def write_artifact(
    session: AsyncSession,
    *,
    matter: Matter,
    capability_id: str,
    module_id: str,
    invocation_id: uuid.UUID,
    kind: str,
    payload: dict[str, Any],
    actor_user_id: uuid.UUID | None,
) -> MatterArtifact:
    """Write an artifact to OBJECT STORAGE + insert the DB row.

    Forward-only object-storage cutover (LMF-1): bytes go to S3/MinIO
    under ``artifact_key(...)`` (which lives beneath ``matter_prefix`` so
    the existing matter-delete ``delete_prefix`` sweep cleans artifacts
    too), and ``storage_path`` now holds the object KEY, not a local
    path. Legacy rows keep their old absolute fs paths and read back as
    ``ArtifactBytesUnavailable``.

    The WORM row is still the authoritative existence check; the id is
    generated first so the key is unique per row.
    The helper does NOT commit — caller commits.
    """
    artifact_id = uuid.uuid4()
    key = artifact_key(
        matter.created_by_id,
        matter.id,
        artifact_id,
        capability_id,
        kind,
    )
    content = _serialise(payload)
    get_storage_backend().put_bytes(key, content, content_type="application/json")
    row = MatterArtifact(
        id=artifact_id,
        matter_id=matter.id,
        module_id=module_id,
        capability_id=capability_id,
        invocation_id=invocation_id,
        kind=kind,
        storage_path=key,
        created_by_id=actor_user_id,
        created_at=datetime.now(UTC),
        size_bytes=len(content),
    )
    session.add(row)
    await session.flush()
    return row


__all__ = [
    "write_artifact",
    "load_artifact_bytes",
    "load_artifact_payload",
    "ArtifactBytesUnavailable",
]
