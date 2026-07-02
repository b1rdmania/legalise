"""Hosted evaluation limits.

Unit 4 of HANDOVER_SERIOUS_BACKEND.md §4. Defends legalise.dev against
viral-signup abuse without introducing a paid plan. The doctrine line
is "Legalise is open source. The hosted site is a limited evaluation
environment."

Mixed test surface:

- Pure-Python tests on the `Limits` dataclass and the 429 helper.
  These run without Postgres.
- DB-backed E2E tests that exercise enforcement boundaries via the
  `client` fixture. These skip when Postgres isn't reachable.
"""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

from app.core import limits as limits_module
from app.core.limits import (
    Limits,
    _limit_exceeded,
    check_module_submission,
    get_limits,
)


TEST_EMAIL = "limits-e2e@example.com"
TEST_PASSWORD = "limits-e2e-password-2026"
KHAN_SLUG = "khan-v-acme-trading-2026"


# ---------------------------------------------------------------------------
# Pure unit tests — no DB required
# ---------------------------------------------------------------------------


class TestLimitsDataclass:
    """Default values match the launch-intent posture."""

    def test_defaults(self) -> None:
        # Force a fresh instance — `get_limits` is process-cached.
        lim = Limits()
        assert lim.matters_per_user == 5
        assert lim.documents_per_matter == 50
        assert lim.total_storage_bytes_per_user == 500 * 1024 * 1024
        assert lim.assistant_messages_per_day == 100
        assert lim.workflow_runs_per_day == 50
        assert lim.generated_artefacts_per_day == 50
        # Submissions disabled by default — operator opts in via env.
        assert lim.module_submissions_per_day == 0

    def test_get_limits_returns_singleton(self) -> None:
        a = get_limits()
        b = get_limits()
        assert a is b


class TestLimitExceededHelper:
    """The 429 envelope shape is the public contract for the frontend."""

    def test_shape(self) -> None:
        exc = _limit_exceeded("matters_per_user", current=5, maximum=5)
        assert isinstance(exc, HTTPException)
        assert exc.status_code == 429
        assert exc.detail["error"] == "evaluation_limit_reached"
        assert exc.detail["limit"] == "matters_per_user"
        assert exc.detail["current"] == 5
        assert exc.detail["max"] == 5
        assert "message" in exc.detail


class TestModuleSubmissionGate:
    """Submission disablement is a hard 429 — the launch posture is
    'closed by default; operator opts in via env'."""

    @pytest.mark.asyncio
    async def test_zero_limit_raises_for_authed_user(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(
            limits_module,
            "_limits",
            Limits(module_submissions_per_day=0),
        )
        with pytest.raises(HTTPException) as exc_info:
            await check_module_submission(
                user_id=uuid.uuid4(),
                session=AsyncMock(),
            )
        assert exc_info.value.status_code == 429
        assert exc_info.value.detail["limit"] == "module_submissions_per_day"

    @pytest.mark.asyncio
    async def test_zero_limit_raises_for_anonymous(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(
            limits_module,
            "_limits",
            Limits(module_submissions_per_day=0),
        )
        with pytest.raises(HTTPException):
            await check_module_submission(user_id=None, session=AsyncMock())

    @pytest.mark.asyncio
    async def test_positive_limit_skips_anonymous_check(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """Anonymous submissions are gated by IP rate-limit in
        submissions.py, not by the per-user daily count here."""
        monkeypatch.setattr(
            limits_module,
            "_limits",
            Limits(module_submissions_per_day=5),
        )
        # Should return None without consulting the session.
        session = AsyncMock()
        await check_module_submission(user_id=None, session=session)
        session.scalar.assert_not_called()


# ---------------------------------------------------------------------------
# E2E boundary tests — DB-backed, skip without Postgres
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
async def test_usage_endpoint_shape(client) -> None:
    """`GET /api/me/usage` returns the current-vs-max counts."""
    await _signup_and_login(client)

    resp = await client.get("/api/me/usage")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    # Shape contract: usage response carries current + max for every
    # limit surface (matches UsageResponse in app.api.usage).
    for field_name in (
        "matters",
        "documents_per_matter",
        "total_storage_bytes",
        "assistant_messages_today",
        "generated_artefacts_today",
        "module_submissions_today",
        "workflow_runs_today",
        "active_jobs",
    ):
        assert field_name in body, f"missing {field_name}"
        assert "current" in body[field_name]
        assert "max" in body[field_name]


@pytest.mark.asyncio
async def test_matter_create_limit_blocks_at_max(
    client, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Creating one matter past the per-user cap returns 429.

    Signup auto-seeds the Khan v Acme demo matter, so the user already
    owns 1 matter. Limit is set to 2 so a second matter still succeeds
    and the third hits the cap.
    """
    monkeypatch.setattr(
        limits_module, "_limits", Limits(matters_per_user=2)
    )
    await _signup_and_login(client)

    # User owns Khan (auto-seeded). First user-created matter — should succeed.
    r1 = await client.post(
        "/api/matters",
        json={"title": "Matter A"},
    )
    assert r1.status_code == 201, r1.text

    # Second user-created matter — over the cap (Khan + Matter A + this).
    r2 = await client.post(
        "/api/matters",
        json={"title": "Matter B"},
    )
    assert r2.status_code == 429, r2.text
    detail = r2.json()["detail"]
    assert detail["error"] == "evaluation_limit_reached"
    assert detail["limit"] == "matters_per_user"


@pytest.mark.asyncio
async def test_archived_matter_frees_matter_cap(
    client, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Tombstoning a matter frees its slot under matters_per_user."""
    monkeypatch.setattr(
        limits_module, "_limits", Limits(matters_per_user=2)
    )
    await _signup_and_login(client)

    # Khan (auto-seeded) + Matter A = at the cap.
    r1 = await client.post("/api/matters", json={"title": "Matter A"})
    assert r1.status_code == 201, r1.text
    slug_a = r1.json()["slug"]

    r2 = await client.post("/api/matters", json={"title": "Matter B"})
    assert r2.status_code == 429, r2.text

    # Archive A — the slot comes back.
    resp = await client.delete(f"/api/matters/{slug_a}")
    assert resp.status_code == 204, resp.text
    r3 = await client.post("/api/matters", json={"title": "Matter B"})
    assert r3.status_code == 201, r3.text


@pytest.mark.asyncio
async def test_archived_matter_bytes_excluded_from_storage_cap(
    client, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Archived matters' purged document bytes stop counting against
    total_storage_bytes_per_user."""
    monkeypatch.setattr(
        limits_module,
        "_limits",
        Limits(total_storage_bytes_per_user=100, matters_per_user=10),
    )
    await _signup_and_login(client)

    # Archive the auto-seeded Khan matter so its seeded document bytes
    # cannot skew the arithmetic below.
    resp = await client.delete(f"/api/matters/{KHAN_SLUG}")
    assert resp.status_code == 204, resp.text

    body = b"x" * 80
    r_a = await client.post("/api/matters", json={"title": "Storage A"})
    assert r_a.status_code == 201
    slug_a = r_a.json()["slug"]
    up_a = await client.post(
        f"/api/matters/{slug_a}/documents",
        files={"file": ("a.txt", body, "text/plain")},
    )
    assert up_a.status_code == 201, up_a.text

    r_b = await client.post("/api/matters", json={"title": "Storage B"})
    assert r_b.status_code == 201
    slug_b = r_b.json()["slug"]

    # 80 (live A) + 80 (incoming) > 100 → blocked.
    up_b = await client.post(
        f"/api/matters/{slug_b}/documents",
        files={"file": ("b.txt", body, "text/plain")},
    )
    assert up_b.status_code == 429, up_b.text
    assert up_b.json()["detail"]["limit"] == "total_storage_bytes_per_user"

    # Archive A — its bytes stop counting; the same upload now fits.
    resp = await client.delete(f"/api/matters/{slug_a}")
    assert resp.status_code == 204, resp.text
    up_b2 = await client.post(
        f"/api/matters/{slug_b}/documents",
        files={"file": ("b.txt", body, "text/plain")},
    )
    assert up_b2.status_code == 201, up_b2.text


@pytest.mark.asyncio
async def test_docx_export_capped_by_generated_artefacts_limit(
    client, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The DOCX/PDF export routes enforce generated_artefacts_per_day."""
    import uuid as uuid_module

    monkeypatch.setattr(
        limits_module, "_limits", Limits(generated_artefacts_per_day=0)
    )
    await _signup_and_login(client)

    fake_doc = uuid_module.uuid4()
    fake_version = uuid_module.uuid4()
    resp = await client.get(
        f"/api/documents/{fake_doc}/versions/{fake_version}/docx"
    )
    assert resp.status_code == 429, resp.text
    assert resp.json()["detail"]["limit"] == "generated_artefacts_per_day"

    resp = await client.get(
        f"/api/documents/{fake_doc}/versions/{fake_version}/pdf"
    )
    assert resp.status_code == 429, resp.text
    assert resp.json()["detail"]["limit"] == "generated_artefacts_per_day"


@pytest.mark.asyncio
async def test_invocations_capped_by_workflow_runs_limit(
    client, monkeypatch: pytest.MonkeyPatch
) -> None:
    """POST /api/matters/{slug}/invocations enforces workflow_runs_per_day."""
    monkeypatch.setattr(
        limits_module, "_limits", Limits(workflow_runs_per_day=0)
    )
    await _signup_and_login(client)

    resp = await client.post(
        f"/api/matters/{KHAN_SLUG}/invocations",
        json={
            "module_id": "legalise.anything",
            "capability_id": "run",
            "args": {},
        },
    )
    assert resp.status_code == 429, resp.text
    assert resp.json()["detail"]["limit"] == "workflow_runs_per_day"
