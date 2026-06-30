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

import logging
import uuid
from typing import Any

import arq
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings
from app.core.jobs import update_stage, update_status
from app.models import (
    JOB_KIND_EXPORT,
    JOB_KIND_INDEX,
    JOB_STATUS_FAILED,
    JOB_STATUS_RUNNING,
    JOB_STATUS_SUCCEEDED,
    Document,
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
            # The id was queued but its row isn't visible to this worker's
            # session. Callers commit the row before enqueuing (see
            # core.jobs.enqueue_or_mark_failed), so a brief absence can only be
            # replication/visibility lag — and arq will retry. A *persistent*
            # absence means the worker is connected to a different database
            # than the API (the failure mode the pre-eval gate F6 caught).
            #
            # Either way, do NOT return silently: a clean return marks the arq
            # job successful and leaves the DB row wedged at "queued" forever
            # with no error. Raise so arq retries, then records a hard failure
            # that surfaces the lag or the misconfiguration instead of hiding
            # it. (The export UI also times out a stuck job — see
            # MatterLifecycle — so the user isn't left on an eternal spinner.)
            logger.error(
                "run_job: job %s not found in this worker's database — row not "
                "yet visible, or worker connected to the wrong database",
                job_id,
            )
            raise RuntimeError(f"run_job: job {job_id} not found in worker database")

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
    if job.kind == JOB_KIND_EXPORT:
        return await _run_export(session, job, matter)
    if job.kind == JOB_KIND_INDEX:
        return await _run_index(session, job, matter)
    raise ValueError(f"unknown job kind: {job.kind}")


async def _run_export(
    session: AsyncSession, job: Job, matter: Matter
) -> dict[str, Any]:
    """Build the matter export zip and write it to storage.

    No model calls. No Redis content. Storage write only.
    """
    from app.core.exports import build_matter_export

    await update_stage(session, job, stage="building_zip", progress=10)
    await session.commit()

    export_key = await build_matter_export(session, matter, job.id)

    return {"export_key": export_key}


async def _run_index(
    session: AsyncSession, job: Job, matter: Matter
) -> dict[str, Any]:
    """Chunk + embed a single document out-of-band.

    Moved off the synchronous upload request: the upload now persists the
    bytes + extracted body, marks the document ``index_status='pending'``,
    and enqueues this job. Here we do the heavy work and flip the status to
    ``indexed`` / ``empty`` / ``failed``. The worker owns its own session, so
    the audit-chain advisory lock is never held across the upload request.
    """
    from app.core.api import audit
    from app.core.indexing import index_document

    document_id_str = job.input_payload.get("document_id")
    if not document_id_str:
        raise ValueError("index job is missing input_payload['document_id']")
    document_id = uuid.UUID(document_id_str)

    await update_stage(session, job, stage="embedding", progress=50)
    await session.commit()

    document = await session.scalar(
        select(Document).where(
            Document.id == document_id,
            Document.matter_id == matter.id,
        )
    )
    if document is None:
        # The document was deleted (or the matter forked away) between upload
        # and indexing. Fail the job cleanly rather than crash — there is
        # nothing left to index.
        raise ValueError(
            f"document {document_id} not found for matter {matter.id} — "
            "deleted before indexing ran"
        )

    index_status = await index_document(session, document)

    # The "document.indexed" audit row used to be written inline by the upload
    # route; it now belongs here, in the worker session that actually did the
    # indexing. index_document does not commit — run_job's terminal
    # update_status(SUCCEEDED) commit flushes the chunks, the status flip, and
    # this audit row together.
    await audit.log(
        session,
        "document.indexed",
        actor_id=job.created_by_id,
        matter_id=matter.id,
        module="retrieval",
        resource_type="document",
        resource_id=str(document.id),
        payload={
            "index_status": index_status,
            "embedding_backend": settings.embedding_backend,
        },
    )

    return {"document_id": str(document.id), "index_status": index_status}


# ---------------------------------------------------------------------------
# Scheduled task: retention sweep
# ---------------------------------------------------------------------------


async def scheduled_retention_sweep(ctx: dict[str, Any]) -> None:
    """Daily retention enforcement, gated behind LEGALISE_RETENTION_SWEEP_ENABLED.

    OFF by default — it purges matters past ``retention_until`` via the
    audited tombstone, so a deployment opts in explicitly. When enabled it
    applies with the configured blast-radius limit (longest-lapsed first).
    The dry-run CLI (`python -m app.tools.retention_sweep`) stays the way to
    preview before trusting the schedule.
    """
    if not settings.retention_sweep_enabled:
        return

    from datetime import date

    from app.tools.retention_sweep import run_retention_sweep

    session_factory: async_sessionmaker[AsyncSession] = ctx["session_factory"]
    async with session_factory() as session:
        code = await run_retention_sweep(
            session,
            apply=True,
            today=date.today(),
            limit=settings.retention_sweep_limit,
        )
    logger.info("scheduled retention sweep finished (exit=%s)", code)


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
    # Daily retention enforcement at the configured UTC hour. The function
    # is a no-op unless LEGALISE_RETENTION_SWEEP_ENABLED is set, so the cron
    # is always registered but harmless by default.
    cron_jobs = [
        arq.cron(
            scheduled_retention_sweep,
            hour=settings.retention_sweep_hour,
            minute=0,
        )
    ]
    on_startup = startup
    on_shutdown = shutdown
    redis_settings = arq.connections.RedisSettings.from_dsn(settings.redis_url)
    max_jobs = 10
    job_timeout = 600  # 10 minutes max per pipeline run
    keep_result = 3600  # keep result 1 hour in Redis (id only, not content)


if __name__ == "__main__":
    import arq.worker

    arq.worker.run_worker(WorkerSettings)
