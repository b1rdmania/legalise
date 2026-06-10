"""Jobs API — durable job status surface.

Routes:
    GET  /api/matters/{slug}/jobs/{job_id}
    GET  /api/matters/{slug}/jobs/{job_id}/events  (SSE status transport)

Job creation lives with the surfaces that own the work (e.g. exports).

The job row is the canonical source of truth. SSE is a transport layer
only — the client may poll GET .../jobs/{job_id} instead if SSE is
unavailable. Audit rows are written by core/jobs.py regardless of whether
the client is connected.

Registration note for integrator (app/main.py):
    from app.api.jobs import router as jobs_router
    app.include_router(jobs_router, prefix="/api/matters", tags=["jobs"])
"""

from __future__ import annotations

import asyncio
import json
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import current_user
from app.core.db import get_session
from app.core.matter_access import resolve_owned_open_matter
from app.models import Job, Matter, User

router = APIRouter()


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------


def _job_row(job: Job) -> dict[str, Any]:
    """Serialise a Job for API responses."""
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


async def _resolve_matter(
    session: AsyncSession, slug: str, user_id: uuid.UUID
) -> Matter:
    """Delegate to the shared archived-aware resolver. Archived matters
    return 404 — per HANDOVER_SUBSTRATE_R2_REVIEW.md §Issue 1, job
    surfaces must not be reachable for tombstoned matters."""
    return await resolve_owned_open_matter(session, slug, user_id)


# ---------------------------------------------------------------------------
# GET /api/matters/{slug}/jobs/{job_id}
# ---------------------------------------------------------------------------


@router.get("/{slug}/jobs/{job_id}")
async def get_job(
    slug: str,
    job_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> dict[str, Any]:
    """Fetch current job state. Client may poll this instead of using SSE."""
    matter = await _resolve_matter(session, slug, user.id)
    job = await session.scalar(
        select(Job).where(Job.id == job_id, Job.matter_id == matter.id)
    )
    if job is None:
        raise HTTPException(404, f"job not found: {job_id}")
    return _job_row(job)


# ---------------------------------------------------------------------------
# GET /api/matters/{slug}/jobs/{job_id}/events  (SSE status transport)
# ---------------------------------------------------------------------------


def _sse_frame(event: str, data: dict[str, Any]) -> bytes:
    return f"event: {event}\ndata: {json.dumps(data, default=str)}\n\n".encode()


@router.get("/{slug}/jobs/{job_id}/events")
async def job_events(
    slug: str,
    job_id: uuid.UUID,
    request: Request,
    user: User = Depends(current_user),
) -> StreamingResponse:
    """SSE transport for job status updates.

    Polls the job row every second and emits `status` events until the job
    reaches a terminal state. The job row remains the canonical record — this
    channel is a convenience transport only.
    """
    factory = request.app.state.session_factory

    # Validate matter ownership before opening the stream. Archived
    # matters return 404 here too — SSE channel is a job-status
    # transport on a live matter.
    async with factory() as preflight:
        matter = await resolve_owned_open_matter(preflight, slug, user.id)
        job = await preflight.scalar(
            select(Job).where(Job.id == job_id, Job.matter_id == matter.id)
        )
        if job is None:
            raise HTTPException(404, f"job not found: {job_id}")

    terminal = {"succeeded", "failed", "cancelled"}

    async def event_stream():
        poll_interval = 1.0  # seconds
        while True:
            if await request.is_disconnected():
                break
            async with factory() as s:
                row = await s.scalar(select(Job).where(Job.id == job_id))
            if row is None:
                yield _sse_frame("error", {"message": "job row vanished"})
                break
            yield _sse_frame("status", _job_row(row))
            if row.status in terminal:
                yield _sse_frame("done", {"status": row.status})
                break
            await asyncio.sleep(poll_interval)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )
