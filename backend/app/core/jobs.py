"""Job lifecycle helpers for durable pipeline runs.

These are the canonical write-paths for the jobs table:
- create_job: insert a queued row and enforce per-user active limit.
- update_stage: tick stage / progress during execution.
- update_status: transition to running / succeeded / failed / cancelled.
- append_event: helper callers use to record sub-step detail in the audit log.

Active-job limit (ACTIVE_JOB_LIMIT = 3): queued + running count for the
requesting user must not exceed the cap. The 4th request returns a
structured 429 — callers should raise HTTPException with the body below.

Redis never holds matter content. Workers receive only the job id from
the queue and read everything else from Postgres.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterable
from datetime import datetime, timezone
from typing import Any

import arq
from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.api import audit as audit_api
from app.core.config import settings
from app.models.job import (
    JOB_ACTIVE_STATUSES,
    JOB_KIND_INDEX,
    JOB_STATUS_CANCELLED,
    JOB_STATUS_FAILED,
    JOB_STATUS_RUNNING,
    JOB_STATUS_SUCCEEDED,
    Job,
)


# Background (system-spawned) job kinds. These are NOT user-initiated, so they
# must not be throttled by — nor consume slots in — the interactive active-job
# ceiling, which exists to bound concurrent *user-initiated* pipeline runs
# (exports). A bulk upload can spawn one index job per document; throttling
# those would wedge uploads and starve a user's real export slot.
BACKGROUND_JOB_KINDS = frozenset({JOB_KIND_INDEX})


class ActiveJobLimitReached(Exception):
    """Raised when a user has too many queued/running jobs.

    The ``limit`` field carries the resolved cap at the time of the
    exception (from `get_limits().active_jobs`). Callers should use
    this to construct the 429 envelope rather than re-reading the
    limit, so the reported value matches the value that was enforced.
    """

    def __init__(self, user_id: uuid.UUID, count: int, limit: int) -> None:
        self.user_id = user_id
        self.count = count
        self.limit = limit
        super().__init__(
            f"User {user_id} already has {count} active jobs (limit {limit})."
        )


async def get_active_job_count(
    session: AsyncSession,
    user_id: uuid.UUID,
    *,
    exclude_kinds: Iterable[str] = (),
) -> int:
    """Return the number of queued or running jobs for this user.

    ``exclude_kinds`` drops background/system kinds (e.g. index) from the
    count so they do not crowd out a user's interactive active-job slots.
    """
    conditions = [
        Job.created_by_id == user_id,
        Job.status.in_(JOB_ACTIVE_STATUSES),
    ]
    exclude = tuple(exclude_kinds)
    if exclude:
        conditions.append(Job.kind.notin_(exclude))
    result = await session.execute(select(func.count(Job.id)).where(*conditions))
    return result.scalar_one()


async def create_job(
    session: AsyncSession,
    *,
    matter_id: uuid.UUID,
    created_by_id: uuid.UUID,
    kind: str,
    input_payload: dict[str, Any],
) -> Job:
    """Insert a queued job row.

    Raises ActiveJobLimitReached if the user is at the cap.
    Caller must commit the session after this returns.

    The cap is read from `get_limits().active_jobs` at call time so
    env overrides and test monkeypatches take effect — per
    HANDOVER_SUBSTRATE_R2_REVIEW.md §Issue 2, enforcement and the
    `/api/me/usage` reporting endpoint now share one source of truth.
    """
    # Background kinds (index) are exempt from the interactive ceiling: they
    # are spawned automatically by the upload hot path, not by a user clicking
    # "run", so they must neither be throttled nor count against a user's
    # interactive slots. We skip the cap check for them AND exclude them from
    # the active count so a bulk upload's pending index jobs never 429 a later
    # export.
    if kind not in BACKGROUND_JOB_KINDS:
        # Local import: avoid a top-level cycle with core.limits which
        # itself imports from app.models.job for ACTIVE_JOBS_LIMIT.
        from app.core.limits import get_limits

        cap = get_limits().active_jobs
        active = await get_active_job_count(
            session, created_by_id, exclude_kinds=BACKGROUND_JOB_KINDS
        )
        if active >= cap:
            raise ActiveJobLimitReached(created_by_id, active, cap)

    job = Job(
        id=uuid.uuid4(),
        matter_id=matter_id,
        created_by_id=created_by_id,
        kind=kind,
        input_payload=input_payload,
    )
    session.add(job)

    module_name = _module_name(kind)
    await audit_api.log(
        session,
        f"module.{module_name}.job.queued",
        actor_id=created_by_id,
        matter_id=matter_id,
        module=module_name,
        resource_type="job",
        resource_id=str(job.id),
        payload={"kind": kind, "job_id": str(job.id)},
    )

    return job


async def update_status(
    session: AsyncSession,
    job: Job,
    status: str,
    *,
    stage: str | None = None,
    progress: int | None = None,
    result_payload: dict[str, Any] | None = None,
    error_code: str | None = None,
    error_message: str | None = None,
) -> None:
    """Transition job status and write matching audit row.

    Caller must commit after this returns.
    """
    now = datetime.now(timezone.utc)
    job.status = status

    if status == JOB_STATUS_RUNNING:
        job.started_at = now
    elif status in {JOB_STATUS_SUCCEEDED, JOB_STATUS_FAILED, JOB_STATUS_CANCELLED}:
        job.finished_at = now

    if stage is not None:
        job.stage = stage
    if progress is not None:
        job.progress = progress
    if result_payload is not None:
        job.result_payload = result_payload
    if error_code is not None:
        job.error_code = error_code
    if error_message is not None:
        job.error_message = error_message

    module_name = _module_name(job.kind)
    action_suffix = {
        JOB_STATUS_RUNNING: "started",
        JOB_STATUS_SUCCEEDED: "completed",
        JOB_STATUS_FAILED: "failed",
        JOB_STATUS_CANCELLED: "cancelled",
    }.get(status, status)

    payload: dict[str, Any] = {"job_id": str(job.id), "status": status}
    if error_code:
        payload["error_code"] = error_code
    if error_message:
        payload["error_message"] = error_message

    await audit_api.log(
        session,
        f"module.{module_name}.job.{action_suffix}",
        actor_id=job.created_by_id,
        matter_id=job.matter_id,
        module=module_name,
        resource_type="job",
        resource_id=str(job.id),
        payload=payload,
    )


async def update_stage(
    session: AsyncSession,
    job: Job,
    *,
    stage: str,
    progress: int | None = None,
) -> None:
    """Update stage/progress without changing status. No audit row — called
    frequently during execution; callers should commit as appropriate."""
    job.stage = stage
    if progress is not None:
        job.progress = progress


async def append_event(
    session: AsyncSession,
    job: Job,
    action: str,
    *,
    payload: dict[str, Any] | None = None,
) -> None:
    """Write a free-form audit row linked to this job.

    action should start with 'module.<name>.' to satisfy the module kwarg
    invariant test.
    """
    module_name = _module_name(job.kind)
    await audit_api.log(
        session,
        action,
        actor_id=job.created_by_id,
        matter_id=job.matter_id,
        module=module_name,
        resource_type="job",
        resource_id=str(job.id),
        payload=payload or {},
    )


async def enqueue_job(job_id: uuid.UUID) -> None:
    """Push ``job_id`` onto the arq queue. Redis never receives matter content
    — only the id; the worker reads everything else from Postgres."""
    redis = await arq.create_pool(
        arq.connections.RedisSettings.from_dsn(settings.redis_url)
    )
    try:
        await redis.enqueue_job("run_job", str(job_id))
    finally:
        await redis.aclose()


async def enqueue_or_mark_failed(session: AsyncSession, job: Job) -> None:
    """Enqueue ``job`` for the worker. On Redis failure, transition the job to
    FAILED with ``error_code="enqueue_failed"`` and raise 503.

    Shared by the export route and the upload-indexing path. Per
    HANDOVER_SUBSTRATE_REVIEW_FIXES.md §2 P1 — replaces the previous
    silent-pass which left jobs queued forever when Redis was unreachable.

    The caller MUST have already committed the job row before calling this so
    the worker can see it. For the upload path this also means the request
    session is not holding the audit-chain advisory lock across the enqueue.
    """
    try:
        await enqueue_job(job.id)
    except Exception as exc:
        await update_status(
            session,
            job,
            JOB_STATUS_FAILED,
            error_code="enqueue_failed",
            error_message=f"Failed to enqueue {job.kind} job: {type(exc).__name__}",
        )
        await session.commit()
        raise HTTPException(
            503,
            detail={
                "error": "job_enqueue_failed",
                "job_id": str(job.id),
                "message": (
                    "The job couldn't be queued. Try again — the failed "
                    "attempt does not count against your active jobs."
                ),
            },
        ) from exc


def _module_name(kind: str) -> str:
    """Map job kind to module audit namespace."""
    return kind  # e.g. "export"
