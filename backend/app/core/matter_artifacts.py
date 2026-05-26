"""Phase 6 — matter artifact write helper.

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
periodic cleanup job (Phase 7+) can sweep them. The DB row only
lands once the file is in place, so the row is the authoritative
existence check.

The helper does NOT commit. Caller commits — same contract as
``audit.log``. The row is added to the caller's session so it
participates in the same transaction as the work that produced it.
"""

from __future__ import annotations

import json
import os
import uuid
from datetime import datetime, UTC
from pathlib import Path
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.matter_fs import matter_dir
from app.models import Matter, MatterArtifact


def _artifact_path(
    matter: Matter,
    *,
    capability_id: str,
    artifact_id: uuid.UUID,
    kind: str,
) -> Path:
    """Compute the deterministic on-disk path for an artifact.

    Reviewer Phase 6 R2 P1 #1: previously the path was derived from
    ``(invocation_id, kind)``. That made the path collide for any
    duplicate write — the file got overwritten BEFORE the DB
    UNIQUE(invocation_id, kind) rejected the row. The WORM row
    survived intact, but the file it pointed at had different bytes.

    Fix: path keyed by ``artifact_id`` (the new row's uuid4). Two
    writes for the same (invocation_id, kind) get two distinct
    paths; the first file is preserved; the second insert fails the
    UNIQUE constraint and the second file becomes an orphan that a
    periodic Phase 7+ sweep can clean up.
    """
    base = matter_dir(matter.slug, matter.created_by_id)
    # Sanitise capability_id so filesystem traversal is impossible.
    safe_cap = capability_id.replace("/", "_").replace("..", "_")
    artifact_root = base / "artifacts" / safe_cap
    artifact_root.mkdir(parents=True, exist_ok=True)
    safe_kind = kind.replace("/", "_").replace("..", "_")
    return artifact_root / f"{artifact_id}_{safe_kind}.json"


def _atomic_write_json(target: Path, payload: dict[str, Any]) -> int:
    """Write JSON to target atomically. Returns size in bytes."""
    tmp = target.with_suffix(target.suffix + ".tmp")
    content = json.dumps(
        payload, indent=2, sort_keys=True, ensure_ascii=False
    ).encode("utf-8")
    # Write + fsync the file.
    with tmp.open("wb") as fh:
        fh.write(content)
        fh.flush()
        os.fsync(fh.fileno())
    # Atomic rename.
    os.replace(tmp, target)
    # fsync the parent directory so the rename itself is durable.
    parent_fd = os.open(str(target.parent), os.O_RDONLY)
    try:
        os.fsync(parent_fd)
    finally:
        os.close(parent_fd)
    return len(content)


async def write_artifact(
    session: AsyncSession,
    *,
    matter: Matter,
    capability_id: str,
    module_id: str,
    invocation_id: uuid.UUID,
    kind: str,
    payload: dict[str, Any],
    actor_user_id: uuid.UUID,
) -> MatterArtifact:
    """Write an artifact to the matter store + insert the DB row.

    Returns the freshly-added ``MatterArtifact`` (with id populated
    after ``session.flush()`` so the caller can reference it
    immediately without committing).

    Raises:
    - ``OSError`` from the filesystem write
    - ``IntegrityError`` from a duplicate (invocation_id, kind) — the
      same invocation cannot write the same kind twice. Re-invocation
      requires a new invocation_id.
    """
    # Generate the row id FIRST so the on-disk path is unique per
    # row, not per (invocation_id, kind) (Reviewer R2 P1 #1).
    artifact_id = uuid.uuid4()
    target = _artifact_path(
        matter,
        capability_id=capability_id,
        artifact_id=artifact_id,
        kind=kind,
    )
    size_bytes = _atomic_write_json(target, payload)
    row = MatterArtifact(
        id=artifact_id,
        matter_id=matter.id,
        module_id=module_id,
        capability_id=capability_id,
        invocation_id=invocation_id,
        kind=kind,
        storage_path=str(target),
        created_by_id=actor_user_id,
        created_at=datetime.now(UTC),
        size_bytes=size_bytes,
    )
    session.add(row)
    await session.flush()
    return row


__all__ = ["write_artifact"]
