"""arq worker entry-point for durable pipeline jobs.

Runs as a separate process: `python -m app.worker`
Receives job ids from the arq queue. Redis never holds matter content
or document bodies — only the job id is queued.

Worker process uses the same BYO-key resolution path as the API server.
No server-paid model keys here.

To start the worker locally:
    cd backend && python -m app.worker

Or via docker-compose (worker service defined in infra/docker-compose.yml).
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from typing import Any

import arq
from arq import ArqRedis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings
from app.core.jobs import update_stage, update_status
from app.models import (
    JOB_KIND_CONTRACT_REVIEW,
    JOB_KIND_PRE_MOTION,
    JOB_STATUS_FAILED,
    JOB_STATUS_RUNNING,
    JOB_STATUS_SUCCEEDED,
    Job,
    Matter,
)
from app.models.base import Base  # noqa: F401 — needed to register models

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Task: run_job
# ---------------------------------------------------------------------------


async def run_job(ctx: dict[str, Any], job_id_str: str) -> None:
    """Execute the pipeline for the given job id.

    Reads all state from Postgres. Redis carried only this id.
    """
    job_id = uuid.UUID(job_id_str)
    session_factory: async_sessionmaker[AsyncSession] = ctx["session_factory"]

    async with session_factory() as session:
        job = await session.scalar(select(Job).where(Job.id == job_id))
        if job is None:
            logger.error("run_job: job %s not found — skipping", job_id)
            return

        matter = await session.scalar(
            select(Matter).where(Matter.id == job.matter_id)
        )
        if matter is None:
            logger.error("run_job: matter %s not found for job %s", job.matter_id, job_id)
            await update_status(
                session, job,
                JOB_STATUS_FAILED,
                error_code="matter_not_found",
                error_message=f"matter {job.matter_id} not found",
            )
            await session.commit()
            return

        # Transition to running
        await update_status(session, job, JOB_STATUS_RUNNING)
        await session.commit()

    # Run pipeline in its own session so commit cadence matches the
    # existing pipeline design (each stage commits its own audit rows).
    async with session_factory() as session:
        job = await session.scalar(select(Job).where(Job.id == job_id))
        matter = await session.scalar(select(Matter).where(Matter.id == job.matter_id))

        if job is None or matter is None:
            logger.error("run_job: row vanished for job %s", job_id)
            return

        try:
            result_payload = await _dispatch(session, job, matter)
        except Exception as exc:
            logger.exception("run_job: pipeline failed for job %s", job_id)
            await update_status(
                session,
                job,
                JOB_STATUS_FAILED,
                error_code="pipeline_error",
                error_message=str(exc),
            )
            await session.commit()
            return

        await update_status(
            session,
            job,
            JOB_STATUS_SUCCEEDED,
            result_payload=result_payload,
            stage="complete",
            progress=100,
        )
        await session.commit()


async def _dispatch(
    session: AsyncSession, job: Job, matter: Matter
) -> dict[str, Any]:
    """Route to the correct pipeline based on job.kind."""
    if job.kind == JOB_KIND_PRE_MOTION:
        return await _run_pre_motion(session, job, matter)
    if job.kind == JOB_KIND_CONTRACT_REVIEW:
        return await _run_contract_review(session, job, matter)
    raise ValueError(f"unknown job kind: {job.kind}")


async def _run_pre_motion(
    session: AsyncSession, job: Job, matter: Matter
) -> dict[str, Any]:
    from app.modules.pre_motion.pipeline import run_pre_motion
    from app.modules.pre_motion.schemas import PreMotionRunInputs

    inputs = PreMotionRunInputs(**job.input_payload)

    async def _on_event(name: str, payload: dict[str, Any]) -> None:
        stage = payload.get("stage") or name
        progress = _stage_progress_pre_motion(name, payload)
        await update_stage(session, job, stage=stage, progress=progress)
        await session.commit()

    result = await run_pre_motion(
        session=session,
        matter=matter,
        actor_id=job.created_by_id,
        inputs=inputs,
        on_event=_on_event,
    )
    return result.model_dump()


def _stage_progress_pre_motion(name: str, payload: dict[str, Any]) -> int | None:
    """Map stage events to a 0-100 progress int for Pre-Motion (4 stages)."""
    stage_name = payload.get("stage", "")
    index = payload.get("index")
    if name == "stage.start" and index is not None:
        return int((index - 1) / 4 * 100)
    if name == "stage.end" and index is not None:
        return int(index / 4 * 100)
    return None


async def _run_contract_review(
    session: AsyncSession, job: Job, matter: Matter
) -> dict[str, Any]:
    from app.core.model_gateway import gateway as model_gateway
    from app.modules.contract_review.pipeline import run_contract_review
    from app.modules.contract_review.schemas import ContractReviewInputs

    inputs = ContractReviewInputs(**job.input_payload)

    async def _on_event(name: str, payload: dict[str, Any]) -> None:
        stage = payload.get("stage") or name
        progress = _stage_progress_contract(name, payload)
        await update_stage(session, job, stage=stage, progress=progress)
        await session.commit()

    result = await run_contract_review(
        session=session,
        gateway=model_gateway,
        matter=matter,
        actor_id=job.created_by_id,
        inputs=inputs,
        on_event=_on_event,
    )
    return result.model_dump()


def _stage_progress_contract(name: str, payload: dict[str, Any]) -> int | None:
    """Map stage events to a 0-100 progress int for Contract Review (4 stages)."""
    stage_name = payload.get("stage", "")
    index = payload.get("index")
    if name == "stage.start" and index is not None:
        return int((index - 1) / 4 * 100)
    if name == "stage.end" and index is not None:
        return int(index / 4 * 100)
    return None


# ---------------------------------------------------------------------------
# arq WorkerSettings
# ---------------------------------------------------------------------------


async def startup(ctx: dict[str, Any]) -> None:
    """Create the SQLAlchemy async engine + session factory for the worker."""
    # Use the async DSN variant required by SQLAlchemy asyncpg driver
    dsn = settings.postgres_dsn.replace("postgresql+psycopg://", "postgresql+asyncpg://")
    engine = create_async_engine(dsn, echo=False, pool_pre_ping=True)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    ctx["engine"] = engine
    ctx["session_factory"] = factory
    logger.info("arq worker started — connected to Postgres")


async def shutdown(ctx: dict[str, Any]) -> None:
    """Dispose of the engine on worker shutdown."""
    engine = ctx.get("engine")
    if engine is not None:
        await engine.dispose()
    logger.info("arq worker shutdown complete")


class WorkerSettings:
    """arq worker configuration."""

    functions = [run_job]
    on_startup = startup
    on_shutdown = shutdown
    redis_settings = arq.connections.RedisSettings.from_dsn(settings.redis_url)
    max_jobs = 10
    job_timeout = 600  # 10 minutes max per pipeline run
    keep_result = 3600  # keep result 1 hour in Redis (id only, not content)


if __name__ == "__main__":
    import arq.worker

    arq.worker.run_worker(WorkerSettings)
