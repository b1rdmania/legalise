"""arq worker smoke test — export job round-trip.

Verifies that the arq worker can:
  1. Pick up a job id from Redis.
  2. Load the job + matter from Postgres.
  3. Execute the export pipeline (no model calls, no MinIO — uses
     LocalStorageBackend via STORAGE_BACKEND=local).
  4. Transition the job row to ``succeeded`` (or ``failed`` for a known-
     reason if the matter has no documents — the export still completes
     and writes a zip).

Skip behaviour when services are absent
----------------------------------------
The test probes Redis and Postgres before creating any state. If either
is unreachable the test is skipped cleanly. In the default ``backend``
CI job neither service is present (Redis has no service container there)
so the test skips. The dedicated ``worker-smoke`` CI job declares both
services and provides the correct env vars.

To run locally:

    # From the repo root with docker-compose running:
    POSTGRES_DSN=postgresql+psycopg://legalise:legalise@localhost:5432/legalise_test \\
    TEST_DATABASE_URL=postgresql+asyncpg://legalise:legalise@localhost:5432/legalise_test \\
    REDIS_URL=redis://localhost:6379/0 \\
    STORAGE_BACKEND=local \\
    MATTERS_ROOT=/tmp/matters-smoke \\
    LOCAL_STORAGE_ROOT=/tmp/storage-smoke \\
    pytest backend/tests/test_worker_smoke.py -v -s
"""

from __future__ import annotations

import asyncio
import os
import socket
import subprocess
import sys
import time
import uuid
from typing import Any

import pytest
import pytest_asyncio
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.models import (
    JOB_KIND_EXPORT,
    JOB_STATUS_FAILED,
    JOB_STATUS_QUEUED,
    JOB_STATUS_SUCCEEDED,
    Job,
    Matter,
)
from app.models.base import Base  # noqa: F401 — populates metadata
from app.models.user import User


# ---------------------------------------------------------------------------
# Probe helpers
# ---------------------------------------------------------------------------

_WORKER_DSN = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql+asyncpg://legalise:legalise@localhost:5432/legalise_test",
)
_REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
_POSTGRES_SYNC_DSN = os.environ.get(
    "POSTGRES_DSN",
    "postgresql+psycopg://legalise:legalise@localhost:5432/legalise_test",
)


def _probe_tcp(host: str, port: int, timeout: float = 2.0) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


def _parse_dsn_host_port(dsn: str) -> tuple[str, int]:
    """Rough host/port extraction for a postgres or redis DSN."""
    # Strip scheme(s) like postgresql+asyncpg:// or redis://
    without_scheme = dsn.split("://", 1)[-1]
    # Drop user:pass@ prefix if present
    if "@" in without_scheme:
        without_scheme = without_scheme.split("@", 1)[-1]
    # Drop /dbname suffix
    without_db = without_scheme.split("/")[0]
    if ":" in without_db:
        host, port_str = without_db.rsplit(":", 1)
        try:
            return host, int(port_str)
        except ValueError:
            pass
    return without_db, 5432


def _probe_postgres() -> bool:
    host, port = _parse_dsn_host_port(_WORKER_DSN)
    return _probe_tcp(host, port)


def _probe_redis() -> bool:
    host, port = _parse_dsn_host_port(_REDIS_URL)
    return _probe_tcp(host, port)


# ---------------------------------------------------------------------------
# Module-level skip guard
# ---------------------------------------------------------------------------

_SERVICES_UP = _probe_postgres() and _probe_redis()
_SKIP_REASON = (
    "Worker smoke tests skipped: "
    + ("Postgres" if not _probe_postgres() else "")
    + (" and " if not _probe_postgres() and not _probe_redis() else "")
    + ("Redis" if not _probe_redis() else "")
    + f" not reachable at {_WORKER_DSN} / {_REDIS_URL}. "
    "Set REDIS_URL + TEST_DATABASE_URL and run the worker-smoke CI job."
)
pytestmark = pytest.mark.skipif(not _SERVICES_UP, reason=_SKIP_REASON)


# ---------------------------------------------------------------------------
# DB fixtures for this module (independent of conftest.py's transaction-
# wrapping client fixture — the worker runs in a separate process and needs
# its writes to actually land in the DB, not be rolled back mid-run).
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture()
async def worker_engine():
    """Standalone engine that does NOT wrap tests in a rollback transaction."""
    eng = create_async_engine(_WORKER_DSN, echo=False, future=True)
    try:
        yield eng
    finally:
        await eng.dispose()


@pytest_asyncio.fixture()
async def worker_session(worker_engine) -> AsyncSession:
    """Session that auto-commits; changes must be cleaned up explicitly."""
    factory = async_sessionmaker(worker_engine, expire_on_commit=False)
    async with factory() as session:
        yield session


# ---------------------------------------------------------------------------
# Seed helpers
# ---------------------------------------------------------------------------


async def _seed_user(session: AsyncSession) -> User:
    """Insert a minimal verified user and return it."""
    user = User(
        id=uuid.uuid4(),
        email=f"worker-smoke-{uuid.uuid4().hex[:8]}@example.com",
        hashed_password="!",
        is_active=True,
        is_superuser=False,
        is_verified=True,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


async def _seed_matter(session: AsyncSession, user_id: uuid.UUID) -> Matter:
    """Insert a minimal matter owned by user_id."""
    matter = Matter(
        id=uuid.uuid4(),
        slug=f"smoke-matter-{uuid.uuid4().hex[:8]}",
        title="Worker Smoke Test Matter",
        matter_type="employment_tribunal",
        created_by_id=user_id,
    )
    session.add(matter)
    await session.commit()
    await session.refresh(matter)
    return matter


async def _seed_job(session: AsyncSession, matter_id: uuid.UUID, user_id: uuid.UUID) -> Job:
    """Insert a queued export job (no model calls; uses storage only)."""
    job = Job(
        id=uuid.uuid4(),
        matter_id=matter_id,
        created_by_id=user_id,
        kind=JOB_KIND_EXPORT,
        status=JOB_STATUS_QUEUED,
        input_payload={},
    )
    session.add(job)
    await session.commit()
    await session.refresh(job)
    return job


async def _enqueue_arq_job(job_id: uuid.UUID) -> None:
    """Push the job id into the arq queue via Redis."""
    import arq

    redis_settings = arq.connections.RedisSettings.from_dsn(_REDIS_URL)
    async with await arq.create_pool(redis_settings) as pool:
        await pool.enqueue_job("run_job", str(job_id))


async def _wait_for_terminal(
    session: AsyncSession,
    job_id: uuid.UUID,
    *,
    timeout: float = 30.0,
    interval: float = 0.5,
) -> str:
    """Poll the DB until the job reaches a terminal status or timeout."""
    terminal = {JOB_STATUS_SUCCEEDED, JOB_STATUS_FAILED}
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        # Expire the cached row so we get a fresh read each iteration.
        await session.execute(text("SELECT 1"))  # keep connection alive
        row = await session.scalar(select(Job).where(Job.id == job_id))
        if row is not None and row.status in terminal:
            return row.status
        await asyncio.sleep(interval)
    raise TimeoutError(
        f"Job {job_id} did not reach a terminal state within {timeout}s"
    )


# ---------------------------------------------------------------------------
# Cleanup helper
# ---------------------------------------------------------------------------


async def _cleanup(session: AsyncSession, job_id: uuid.UUID, matter_id: uuid.UUID, user_id: uuid.UUID) -> None:
    """Remove seeded rows so the test DB stays clean across runs."""
    from sqlalchemy import delete
    from app.models.audit import AuditEntry

    await session.execute(delete(Job).where(Job.id == job_id))
    await session.execute(delete(AuditEntry).where(AuditEntry.matter_id == matter_id))
    await session.execute(delete(Matter).where(Matter.id == matter_id))
    await session.execute(delete(User).where(User.id == user_id))
    await session.commit()


# ---------------------------------------------------------------------------
# The test
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_worker_export_job_round_trip(
    worker_session: AsyncSession, tmp_path
) -> None:
    """The arq worker picks up a queued export job and reaches a terminal state.

    Steps:
      1. Seed a User + Matter + queued export Job directly in the DB.
      2. Push the job id into the arq queue.
      3. Boot the arq worker in --burst mode (subprocess); it drains the
         queue and exits.
      4. Poll the DB and assert the job is now ``succeeded`` or ``failed``.
         Export of a matter with zero documents still succeeds (writes an
         empty zip); failure means an unexpected pipeline error.
    """
    # --- 1. Seed ---
    user = await _seed_user(worker_session)
    matter = await _seed_matter(worker_session, user.id)
    job = await _seed_job(worker_session, matter.id, user.id)

    # NOTE: do NOT call session.expire_all() here. expire_on_commit=False
    # on the worker_session keeps the seeded `job.id` accessible without
    # a refresh. If we expire, the next `job.id` access triggers an async
    # refresh outside the SQLAlchemy greenlet context → MissingGreenlet.
    # `_wait_for_terminal` re-queries each iteration so freshness is
    # ensured there, not here.

    # --- 2. Enqueue ---
    await _enqueue_arq_job(job.id)

    # --- 3. Run the worker in burst mode ---
    env = {
        **os.environ,
        "POSTGRES_DSN": _POSTGRES_SYNC_DSN,
        "REDIS_URL": _REDIS_URL,
        # Use local filesystem storage so no MinIO is required here.
        "STORAGE_BACKEND": "local",
        "LOCAL_STORAGE_ROOT": str(tmp_path / "storage"),
        "MATTERS_ROOT": str(tmp_path / "matters"),
        # Keep the worker quiet in CI logs.
        "LOG_FORMAT": "console",
    }

    # arq CLI: `arq app.worker.WorkerSettings --burst`
    # Runs from the backend/ directory so `app.worker` is importable.
    # Wrap subprocess.run in asyncio.to_thread so the event loop stays
    # alive while the worker runs; otherwise the AsyncSession's greenlet
    # context gets torn down and the post-run DB reads MissingGreenlet.
    backend_dir = os.path.join(os.path.dirname(__file__), "..")
    result = await asyncio.to_thread(
        subprocess.run,
        [sys.executable, "-m", "arq", "app.worker.WorkerSettings", "--burst"],
        env=env,
        cwd=os.path.abspath(backend_dir),
        timeout=45,
        capture_output=True,
        text=True,
    )

    # The worker subprocess must exit cleanly (burst mode exits 0 after
    # draining the queue). A non-zero exit here means a startup failure
    # (e.g. bad import, Redis config error) — surface stdout/stderr.
    assert result.returncode == 0, (
        f"arq worker exited with code {result.returncode}\n"
        f"stdout:\n{result.stdout}\n"
        f"stderr:\n{result.stderr}"
    )

    # --- 4. Assert terminal state ---
    try:
        # The worker has already exited so the job should be terminal
        # immediately; the poll is a safety net for DB propagation lag.
        final_status = await _wait_for_terminal(worker_session, job.id, timeout=10.0)
    finally:
        # Always clean up seeded rows, even on failure.
        await _cleanup(worker_session, job.id, matter.id, user.id)

    assert final_status == JOB_STATUS_SUCCEEDED, (
        f"Expected export job to succeed, got status={final_status!r}. "
        "Check worker logs above for pipeline errors."
    )
