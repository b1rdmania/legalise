"""Matter artifact listing + read.

Two endpoints, both under ``/api/matters/{slug}/``:

  GET  /api/matters/{slug}/artifacts        — list artifacts on this matter
  GET  /api/matters/{slug}/artifacts/{id}   — read a single artifact's payload

**Reads do NOT emit an audit row.** Reads aren't load-bearing state
changes; ``audit.reconstruction.viewed`` already captures navigation to
the trail. Per-read auditing would balloon the log with low-signal
events. If a future regulator needs read-tracking, it lands as a
deliberate feature with consent/disclosure UX, not a silent server-side
row.

Matter-access predicate: matter owner OR workspace superuser. Uniform
404 for non-owner so the endpoint never leaks which matters exist.
"""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import current_user
from app.core.db import get_session
from app.core.matter_artifacts import (
    ArtifactBytesUnavailable,
    load_artifact_payload,
)
from app.models import Matter, MatterArtifact, User
from app.models.matter import STATUS_ARCHIVED


router = APIRouter()


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class ArtifactSummary(BaseModel):
    id: str
    matter_id: str
    module_id: str
    capability_id: str
    invocation_id: str
    kind: str
    created_by_id: str
    created_at: str
    size_bytes: int


class ArtifactRead(ArtifactSummary):
    payload: dict[str, Any]


# ---------------------------------------------------------------------------
# Matter-access predicate — same shape as Phase 5 + Phase 7
# ---------------------------------------------------------------------------


async def _load_matter_or_404(
    session: AsyncSession, *, slug: str, user: User
) -> Matter:
    matter = await session.scalar(
        select(Matter).where(
            Matter.slug == slug, Matter.created_by_id == user.id
        )
    )
    if matter is None and user.is_superuser:
        matter = await session.scalar(
            select(Matter).where(Matter.slug == slug)
        )
    if matter is None or matter.status == STATUS_ARCHIVED:
        raise HTTPException(
            status_code=404, detail=f"matter not found: {slug}"
        )
    return matter


def _row_to_summary(row: MatterArtifact) -> ArtifactSummary:
    return ArtifactSummary(
        id=str(row.id),
        matter_id=str(row.matter_id),
        module_id=row.module_id,
        capability_id=row.capability_id,
        invocation_id=str(row.invocation_id),
        kind=row.kind,
        created_by_id=str(row.created_by_id),
        created_at=row.created_at.isoformat(),
        size_bytes=row.size_bytes,
    )


# ---------------------------------------------------------------------------
# GET /api/matters/{slug}/artifacts
# ---------------------------------------------------------------------------


@router.get(
    "/{slug}/artifacts",
    response_model=list[ArtifactSummary],
)
async def list_artifacts_endpoint(
    slug: str,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> list[ArtifactSummary]:
    matter = await _load_matter_or_404(session, slug=slug, user=user)
    rows = (
        await session.scalars(
            select(MatterArtifact)
            .where(MatterArtifact.matter_id == matter.id)
            .order_by(MatterArtifact.created_at.desc())
        )
    ).all()
    return [_row_to_summary(r) for r in rows]


# ---------------------------------------------------------------------------
# GET /api/matters/{slug}/artifacts/{artifact_id}
# ---------------------------------------------------------------------------


@router.get(
    "/{slug}/artifacts/{artifact_id}",
    response_model=ArtifactRead,
)
async def read_artifact_endpoint(
    slug: str,
    artifact_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> ArtifactRead:
    matter = await _load_matter_or_404(session, slug=slug, user=user)
    row = await session.scalar(
        select(MatterArtifact).where(
            MatterArtifact.id == artifact_id,
            MatterArtifact.matter_id == matter.id,
        )
    )
    if row is None:
        raise HTTPException(
            status_code=404, detail=f"artifact not found: {artifact_id}"
        )

    try:
        payload = load_artifact_payload(row.storage_path)
    except ArtifactBytesUnavailable:
        # Forward-only object-storage cutover: a legacy local-fs artifact
        # (or a missing object) is surfaced cleanly as Gone, not a crash.
        raise HTTPException(
            status_code=410,
            detail={
                "error": "legacy_artifact_unavailable",
                "artifact_id": str(row.id),
                "message": (
                    "This artifact predates object storage (or its object "
                    "is missing) and is no longer retrievable. Its metadata "
                    "and audit trail remain."
                ),
            },
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=500,
            detail={
                "error": "artifact_file_corrupt",
                "artifact_id": str(row.id),
                "message": f"artifact did not parse as JSON: {exc}",
            },
        ) from exc

    summary = _row_to_summary(row)
    return ArtifactRead(**summary.model_dump(), payload=payload)
