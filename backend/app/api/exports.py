"""Export API — Unit 5 basic matter export bundle.

Export-after-delete policy (Issue #4):
    Exports are downloadable while the matter is live. Tombstoning the
    matter (DELETE /api/matters/{slug}) sets status=archived, which
    causes every call to `_resolve_matter_owned` → `resolve_owned_open_matter`
    to raise 404. This means:
      - POST /api/matters/{slug}/export           → 404 (cannot start new export)
      - GET  /api/matters/{slug}/export/{job_id}  → 404 (cannot download existing)
    Users must download their export before deleting the matter.
    See test_export_after_delete.py for the regression test.

v0.4 ships a BASIC matter export bundle (matter metadata, document
metadata, uploaded document bytes, audit log, job log). It is NOT
complete data portability — see ``app/core/exports.py`` for the
explicit out-of-scope list and HANDOVER_SUBSTRATE_REVIEW_FIXES.md §2
P2 for the narrowed claim.

Routes:
    POST /api/matters/{slug}/export
        Owner-scoped. Creates an export job using the Unit 2 jobs
        infrastructure. Returns the job row immediately. Client polls
        GET /api/matters/{slug}/jobs/{job_id} (existing endpoint).

    GET  /api/matters/{slug}/export/{export_job_id}
        Owner-scoped. Returns a presigned download URL (S3 backend) or
        streams the zip bytes (local backend).

Registration in app/main.py:
    from app.api.exports import router as exports_router
    app.include_router(exports_router, prefix="/api/matters", tags=["exports"])
"""

from __future__ import annotations

import logging
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import current_user
from app.core.api import audit
from app.core.db import get_session
from app.core.jobs import (
    ActiveJobLimitReached,
    create_job,
    enqueue_or_mark_failed,
)
from app.core.matter_access import resolve_owned_open_matter
from app.models import (
    Job,
    Matter,
    User,
)
from app.models.job import JOB_KIND_EXPORT, JOB_STATUS_SUCCEEDED

logger = logging.getLogger(__name__)


router = APIRouter()


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------


async def _resolve_matter_owned(
    session: AsyncSession, slug: str, user_id: uuid.UUID
) -> Matter:
    """Delegate to the shared archived-aware resolver. Archived matters
    return 404 — per HANDOVER_SUBSTRATE_R2_REVIEW.md §Issue 1, export
    routes must not be reachable for tombstoned matters."""
    return await resolve_owned_open_matter(session, slug, user_id)


def _job_row(job: Job) -> dict[str, Any]:
    return {
        "id": str(job.id),
        "matter_id": str(job.matter_id),
        "kind": job.kind,
        "status": job.status,
        "stage": job.stage,
        "progress": job.progress,
        "error_code": job.error_code,
        "error_message": job.error_message,
        "created_at": job.created_at.isoformat() if job.created_at else None,
        "started_at": job.started_at.isoformat() if job.started_at else None,
        "finished_at": job.finished_at.isoformat() if job.finished_at else None,
        "result_payload": job.result_payload,
    }


# ---------------------------------------------------------------------------
# POST /api/matters/{slug}/export
# ---------------------------------------------------------------------------


@router.post("/{slug}/export")
async def create_export_job(
    slug: str,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> dict[str, Any]:
    """Enqueue a matter export job. Returns the job row immediately.

    Client polls GET /api/matters/{slug}/jobs/{job_id} (existing endpoint from
    Unit 2) to track progress. When succeeded, result_payload contains
    ``{"export_key": "..."}`` — the storage key. Use
    GET /api/matters/{slug}/export/{job_id} to download.
    """
    matter = await _resolve_matter_owned(session, slug, user.id)

    try:
        job = await create_job(
            session,
            matter_id=matter.id,
            created_by_id=user.id,
            kind=JOB_KIND_EXPORT,
            input_payload={"matter_id": str(matter.id)},
        )
    except ActiveJobLimitReached as exc:
        raise HTTPException(
            429,
            detail={
                "error": "active_job_limit_reached",
                "limit": exc.limit,
                "message": (
                    f"You already have {exc.limit} active jobs. "
                    "Wait for one to complete before starting another."
                ),
            },
        )

    await session.commit()

    await enqueue_or_mark_failed(session, job)

    return _job_row(job)


# ---------------------------------------------------------------------------
# GET /api/matters/{slug}/export/{export_job_id}
# ---------------------------------------------------------------------------


@router.get("/{slug}/export/{export_job_id}")
async def download_export(
    slug: str,
    export_job_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> Response:
    """Return a presigned download URL or stream the zip.

    The export job must be in ``succeeded`` status. Returns:
      - S3 backend: 302 redirect to a presigned URL (1-hour TTL).
      - Local backend: raw zip bytes with appropriate headers.
    """
    matter = await _resolve_matter_owned(session, slug, user.id)

    job = await session.scalar(
        select(Job).where(
            Job.id == export_job_id,
            Job.matter_id == matter.id,
            Job.kind == JOB_KIND_EXPORT,
        )
    )
    if job is None:
        raise HTTPException(404, f"export job not found: {export_job_id}")

    if job.status != JOB_STATUS_SUCCEEDED:
        raise HTTPException(
            409,
            detail={
                "error": "export_not_ready",
                "status": job.status,
                "message": "The export isn't ready yet. Try again in a moment.",
            },
        )

    result = job.result_payload or {}
    export_key: str | None = result.get("export_key")
    if not export_key:
        # Internal precision goes to the log; the user just needs a way out.
        logger.error(
            "export job %s succeeded but result_payload has no export_key",
            export_job_id,
        )
        raise HTTPException(
            500,
            detail={
                "error": "export_key_missing",
                "message": "The export finished but its file can't be found. Run the export again.",
            },
        )

    # LMF-4: "who downloaded the export bundle" is part of the governance
    # story (existing audit source, no new source). Emitted only AFTER the
    # bytes / presigned URL are successfully produced — a storage/presign
    # failure must NOT leave a false "downloaded" row (reviewer redline).
    async def _audit_downloaded() -> None:
        await audit.log(
            session,
            "matter.export.downloaded",
            actor_id=user.id,
            matter_id=matter.id,
            resource_type="matter",
            resource_id=str(matter.id),
            payload={"export_job_id": str(export_job_id), "export_key": export_key},
        )
        await session.commit()

    from app.core.storage import get_storage_backend, LocalStorageBackend

    storage = get_storage_backend()

    if isinstance(storage, LocalStorageBackend):
        # Stream bytes directly (test / local dev path)
        try:
            data = storage.get_bytes(export_key)
        except KeyError:
            raise HTTPException(404, "export file not found in storage")
        await _audit_downloaded()  # bytes confirmed present
        filename = f"matter-{matter.slug}-export.zip"
        return Response(
            content=data,
            media_type="application/zip",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "Content-Length": str(len(data)),
            },
        )
    else:
        # S3-compatible: return presigned URL
        try:
            url = storage.presigned_get_url(export_key, ttl=3600)
        except Exception as exc:
            raise HTTPException(500, f"could not generate presigned URL: {exc}") from exc
        await _audit_downloaded()  # presigned URL successfully generated
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url=url, status_code=302)
