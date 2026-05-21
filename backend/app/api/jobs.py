"""Jobs API — durable pipeline run management.

Routes:
    POST /api/matters/{slug}/pre-motion/jobs
    POST /api/matters/{slug}/contract-review/jobs
    GET  /api/matters/{slug}/jobs/{job_id}
    GET  /api/matters/{slug}/jobs/{job_id}/events  (SSE status transport)

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

import arq
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import current_user
from app.core.config import settings
from app.core.db import get_session
from app.core.jobs import ActiveJobLimitReached, create_job, update_status
from app.core.model_gateway import PrivilegePosture, gateway as model_gateway
from app.core.user_keys import ProviderKeyMissing, get_user_provider_key
from app.models import (
    ACTIVE_JOB_LIMIT,
    JOB_KIND_CONTRACT_REVIEW,
    JOB_KIND_PRE_MOTION,
    Job,
    Matter,
    User,
)
from app.modules.contract_review.schemas import ContractReviewInputs
from app.modules.pre_motion.schemas import PreMotionRunInputs


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
    matter = await session.scalar(
        select(Matter).where(Matter.slug == slug, Matter.created_by_id == user_id)
    )
    if matter is None:
        raise HTTPException(404, f"matter not found: {slug}")
    return matter


async def _preflight_provider(
    session: AsyncSession,
    matter: Matter,
    user_id: uuid.UUID,
    module_label: str,
) -> None:
    """Check privilege posture and provider key before enqueuing."""
    posture = PrivilegePosture(matter.privilege_posture)
    if posture is PrivilegePosture.C_PAUSED:
        raise HTTPException(
            409,
            f"Matter privilege posture is C_paused — {module_label} blocked.",
        )
    selected_provider = model_gateway.select_provider_name(
        matter.default_model_id, posture
    )
    if model_gateway.is_keyed_provider(selected_provider):
        user_key = await get_user_provider_key(session, user_id, selected_provider)
        fallback_allowed = (
            settings.environment in {"development", "dev", "local"}
            and settings.allow_server_key_fallback
        )
        if user_key is None and not fallback_allowed:
            raise HTTPException(
                422,
                detail={
                    "error": "provider_key_missing",
                    "provider": selected_provider,
                    "message": (
                        f"Add a {selected_provider} API key in Settings → API Keys "
                        f"to run {module_label}."
                    ),
                },
            )


async def _enqueue_job(job_id: uuid.UUID, redis_url: str) -> None:
    """Push job_id onto the arq queue. Redis never receives matter content."""
    redis = await arq.create_pool(arq.connections.RedisSettings.from_dsn(redis_url))
    try:
        await redis.enqueue_job("run_job", str(job_id))
    finally:
        await redis.aclose()


# ---------------------------------------------------------------------------
# POST /api/matters/{slug}/pre-motion/jobs
# ---------------------------------------------------------------------------


@router.post("/{slug}/pre-motion/jobs")
async def create_pre_motion_job(
    slug: str,
    inputs: PreMotionRunInputs | None = None,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> dict[str, Any]:
    """Enqueue a Pre-Motion pipeline run. Returns the job row immediately."""
    matter = await _resolve_matter(session, slug, user.id)
    await _preflight_provider(session, matter, user.id, "Pre-Motion")

    body = inputs or PreMotionRunInputs()
    try:
        job = await create_job(
            session,
            matter_id=matter.id,
            created_by_id=user.id,
            kind=JOB_KIND_PRE_MOTION,
            input_payload=body.model_dump(),
        )
    except ActiveJobLimitReached:
        raise HTTPException(
            429,
            detail={
                "error": "active_job_limit_reached",
                "limit": ACTIVE_JOB_LIMIT,
                "message": (
                    f"You already have {ACTIVE_JOB_LIMIT} active jobs. "
                    "Wait for one to complete before starting another."
                ),
            },
        )

    await session.commit()

    await _enqueue_job(job.id, settings.redis_url)

    return _job_row(job)


# ---------------------------------------------------------------------------
# POST /api/matters/{slug}/contract-review/jobs
# ---------------------------------------------------------------------------


@router.post("/{slug}/contract-review/jobs")
async def create_contract_review_job(
    slug: str,
    inputs: ContractReviewInputs,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> dict[str, Any]:
    """Enqueue a Contract Review pipeline run. Returns the job row immediately."""
    matter = await _resolve_matter(session, slug, user.id)
    await _preflight_provider(session, matter, user.id, "Contract Review")

    try:
        job = await create_job(
            session,
            matter_id=matter.id,
            created_by_id=user.id,
            kind=JOB_KIND_CONTRACT_REVIEW,
            input_payload=inputs.model_dump(),
        )
    except ActiveJobLimitReached:
        raise HTTPException(
            429,
            detail={
                "error": "active_job_limit_reached",
                "limit": ACTIVE_JOB_LIMIT,
                "message": (
                    f"You already have {ACTIVE_JOB_LIMIT} active jobs. "
                    "Wait for one to complete before starting another."
                ),
            },
        )

    await session.commit()

    await _enqueue_job(job.id, settings.redis_url)

    return _job_row(job)


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

    # Validate matter ownership before opening the stream
    async with factory() as preflight:
        matter = await preflight.scalar(
            select(Matter).where(Matter.slug == slug, Matter.created_by_id == user.id)
        )
        if matter is None:
            raise HTTPException(404, f"matter not found: {slug}")
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
