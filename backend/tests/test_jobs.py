"""Durable jobs substrate — Unit 2 of HANDOVER_SERIOUS_BACKEND.md §4.

Two surfaces:

- Pure-Python tests on `app.core.jobs` helpers (mocked session). These
  run without Postgres.
- E2E API tests via the `client` fixture. These skip when Postgres
  isn't reachable.

NOTE: The Pre-Motion and Contract Review router migration (replacing
the existing SSE endpoints with worker-backed job enqueues) is
deferred. The new `POST /api/matters/{slug}/{module}/jobs` endpoints
ship as an additive substrate; the worker process runs `app.worker`
when Redis is up.
"""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.core.jobs import (
    ActiveJobLimitReached,
    _module_name,
    get_active_job_count,
)
from app.models.job import (
    JOB_ACTIVE_STATUSES,
    JOB_KIND_CONTRACT_REVIEW,
    JOB_KIND_PRE_MOTION,
    JOB_STATUS_FAILED,
    JOB_STATUS_QUEUED,
    JOB_STATUS_RUNNING,
    JOB_STATUS_SUCCEEDED,
)


TEST_EMAIL = "jobs-e2e@example.com"
TEST_PASSWORD = "jobs-e2e-password-2026"
KHAN_SLUG = "khan-v-acme-trading-2026"


# ---------------------------------------------------------------------------
# Pure unit tests — no DB
# ---------------------------------------------------------------------------


class TestActiveJobLimit:
    def test_limit_default_via_canonical_source(self) -> None:
        """Per HANDOVER_SUBSTRATE_R2_REVIEW.md §Issue 2: enforcement and
        reporting must read the same value. The canonical source is
        `app.core.limits.get_limits().active_jobs`, env-overridable via
        `LEGALISE_LIMIT_ACTIVE_JOBS`."""
        from app.core.limits import Limits

        # Fresh dataclass — guarantees a non-cached read.
        assert Limits().active_jobs == 3

    def test_active_statuses(self) -> None:
        # Queued and running count toward the cap; terminal states do not.
        assert JOB_ACTIVE_STATUSES == {JOB_STATUS_QUEUED, JOB_STATUS_RUNNING}
        assert JOB_STATUS_SUCCEEDED not in JOB_ACTIVE_STATUSES
        assert JOB_STATUS_FAILED not in JOB_ACTIVE_STATUSES


class TestActiveJobLimitReached:
    def test_carries_user_count_and_limit(self) -> None:
        """The exception carries the resolved limit so 429 envelopes
        report the value that was actually enforced — no second
        re-read that could diverge."""
        user_id = uuid.uuid4()
        exc = ActiveJobLimitReached(user_id, count=3, limit=3)
        assert exc.user_id == user_id
        assert exc.count == 3
        assert exc.limit == 3
        assert str(user_id) in str(exc)


class TestModuleNameMapping:
    """Audit rows derive the `module=` kwarg from the job kind. The
    invariant in test_audit_module_kwarg.py asserts that every
    `module.*` action carries a kwarg; this is where the kwarg
    originates for job rows."""

    def test_pre_motion_kind(self) -> None:
        assert _module_name(JOB_KIND_PRE_MOTION) == "pre_motion"

    def test_contract_review_kind(self) -> None:
        assert _module_name(JOB_KIND_CONTRACT_REVIEW) == "contract_review"


class TestGetActiveJobCount:
    @pytest.mark.asyncio
    async def test_returns_scalar_count(self) -> None:
        session = AsyncMock()
        execute_result = MagicMock()
        execute_result.scalar_one = MagicMock(return_value=2)
        session.execute = AsyncMock(return_value=execute_result)

        count = await get_active_job_count(session, uuid.uuid4())
        assert count == 2
        session.execute.assert_called_once()


# ---------------------------------------------------------------------------
# E2E API tests — DB-backed, skip without Postgres
# ---------------------------------------------------------------------------


async def _signup_and_login(client) -> None:
    reg = await client.post(
        "/auth/register",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD},
    )
    assert reg.status_code == 201, reg.text
    login = await client.post(
        "/auth/login",
        data={"username": TEST_EMAIL, "password": TEST_PASSWORD},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert login.status_code == 204, login.text


@pytest.mark.asyncio
async def test_get_unknown_job_returns_404(client) -> None:
    """Cross-user / non-existent jobs return 404, not 403."""
    await _signup_and_login(client)
    rogue_id = uuid.uuid4()
    resp = await client.get(f"/api/matters/{KHAN_SLUG}/jobs/{rogue_id}")
    assert resp.status_code == 404, resp.text


# ---------------------------------------------------------------------------
# Enqueue-failure handling — P1 review fix
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_pre_motion_enqueue_failure_marks_job_failed(
    client, monkeypatch: pytest.MonkeyPatch
) -> None:
    """If Redis enqueue raises after the job row is committed, the row
    must be transitioned to FAILED with error_code=enqueue_failed and
    the API must return 503 — never a silent success."""
    from app.api import jobs as jobs_api

    async def _explode(*_args, **_kwargs):
        raise RuntimeError("redis unreachable")

    monkeypatch.setattr(jobs_api, "_enqueue_job", _explode)
    await _signup_and_login(client)

    resp = await client.post(
        f"/api/matters/{KHAN_SLUG}/pre-motion/jobs",
        json={"depth": "fast"},
    )
    assert resp.status_code == 503, resp.text
    detail = resp.json()["detail"]
    assert detail["error"] == "job_enqueue_failed"
    assert "job_id" in detail


@pytest.mark.asyncio
async def test_enqueue_failed_job_does_not_consume_active_slot(
    client, db_session, monkeypatch: pytest.MonkeyPatch
) -> None:
    """ACTIVE_JOB_LIMIT excludes terminal states. A failed enqueue
    must free the slot so the user can retry without hitting 429."""
    from sqlalchemy import select

    from app.api import jobs as jobs_api
    from app.core.jobs import get_active_job_count
    from app.models import User

    async def _explode(*_args, **_kwargs):
        raise RuntimeError("redis unreachable")

    monkeypatch.setattr(jobs_api, "_enqueue_job", _explode)
    await _signup_and_login(client)

    user = await db_session.scalar(select(User).where(User.email == TEST_EMAIL))
    assert user is not None

    resp = await client.post(
        f"/api/matters/{KHAN_SLUG}/pre-motion/jobs",
        json={"depth": "fast"},
    )
    assert resp.status_code == 503, resp.text

    active = await get_active_job_count(db_session, user.id)
    assert active == 0, f"expected 0 active jobs, got {active}"


# ---------------------------------------------------------------------------
# Active-job limit single source of truth — R2 review Issue 2
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_active_job_limit_enforcement_matches_reporting(
    client, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Per HANDOVER_SUBSTRATE_R2_REVIEW.md §Issue 2: the cap enforced at
    create_job must match the value reported by /api/me/usage. Set
    limits.active_jobs=1, confirm:
      - first job queues (201/200)
      - second job 429s
      - /api/me/usage.active_jobs.max == 1
      - 429 envelope reports limit=1
    """
    from app.core import limits as limits_module

    monkeypatch.setattr(
        limits_module, "_limits", limits_module.Limits(active_jobs=1)
    )

    # Patch the Redis enqueue so we don't actually need Redis.
    from app.api import jobs as jobs_api

    async def _noop_enqueue(*_args, **_kwargs):
        return None

    monkeypatch.setattr(jobs_api, "_enqueue_job", _noop_enqueue)
    await _signup_and_login(client)

    # First job — succeeds.
    r1 = await client.post(
        f"/api/matters/{KHAN_SLUG}/pre-motion/jobs",
        json={"depth": "fast"},
    )
    assert r1.status_code == 200, r1.text

    # Second job — over the cap.
    r2 = await client.post(
        f"/api/matters/{KHAN_SLUG}/pre-motion/jobs",
        json={"depth": "fast"},
    )
    assert r2.status_code == 429, r2.text
    detail = r2.json()["detail"]
    assert detail["error"] == "active_job_limit_reached"
    assert detail["limit"] == 1, (
        "429 envelope must report the enforced value (1), not the old "
        "hard-coded 3 from models/job.py"
    )

    # Reporting endpoint surfaces the same value.
    usage = await client.get("/api/me/usage")
    assert usage.status_code == 200, usage.text
    assert usage.json()["active_jobs"]["max"] == 1, (
        "/api/me/usage.active_jobs.max must match enforcement"
    )
