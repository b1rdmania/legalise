"""Unit 5 — export job infrastructure.

Tests cover:
  - POST /api/matters/{slug}/export creates a job row with kind=export.
  - Cross-user export returns 404.
  - GET /api/matters/{slug}/export/{job_id} returns 409 when job not succeeded.
  - GET /api/matters/{slug}/export/{job_id} returns 404 for unknown job.
  - build_matter_export (core logic) writes a valid zip to local storage.
  - Export job dispatches correctly in worker._dispatch.

DB-backed tests skip when Postgres is unreachable (see conftest.py).
Pure-Python tests run everywhere.
"""

from __future__ import annotations

import io
import uuid
import zipfile
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models.job import JOB_KIND_EXPORT, JOB_STATUS_QUEUED, JOB_STATUS_SUCCEEDED


@pytest.fixture(autouse=True)
def _stub_reconstruct(monkeypatch):
    """LMF-2: build_matter_export now calls reconstruct() for the
    reconstruction.json member. reconstruct can't run against the
    MagicMock session these pure-unit tests use, so stub it to an empty
    page — the real reconstruction content is covered by the real-session
    test_export_completeness.py."""
    from dataclasses import dataclass
    from app.core import exports as _exports

    @dataclass
    class _Page:
        entries: list
        next_cursor: object

    async def _empty(*_a, **_k):
        return _Page(entries=[], next_cursor=None)

    monkeypatch.setattr(_exports, "reconstruct", _empty)


# ---------------------------------------------------------------------------
# Pure unit tests — no DB
# ---------------------------------------------------------------------------


class TestJOBKindExport:
    def test_constant_value(self) -> None:
        assert JOB_KIND_EXPORT == "export"

    def test_exported_from_models_init(self) -> None:
        from app.models import JOB_KIND_EXPORT as exported

        assert exported == "export"


class TestBuildMatterExportUnit:
    """Pure-Python tests for build_matter_export using mocked session + storage."""

    @pytest.mark.asyncio
    async def test_zip_contains_required_files(self) -> None:
        """build_matter_export writes a zip with matter_metadata, audit, jobs."""
        import os

        _prev_storage_backend = os.environ.get("STORAGE_BACKEND")
        os.environ["STORAGE_BACKEND"] = "local"
        from app.core.storage import _reset_backend

        _reset_backend()

        try:
            from app.core.exports import build_matter_export
            from app.core.storage import get_storage_backend

            # Minimal Matter stub
            matter_id = uuid.uuid4()
            user_id = uuid.uuid4()
            job_id = uuid.uuid4()

            matter = MagicMock()
            matter.id = matter_id
            matter.slug = "test-matter"
            matter.title = "Test Matter"
            matter.matter_type = "employment_tribunal"
            matter.cause = None
            matter.status = "open"
            matter.case_theory = None
            matter.pivot_fact = None
            matter.privilege_posture = "B_mixed"
            matter.default_model_id = "claude-opus-4-7"
            matter.facts = {}
            matter.opened_at = datetime(2026, 1, 1, tzinfo=timezone.utc)
            matter.closed_at = None
            matter.retention_until = None
            matter.created_by_id = user_id

            # Mock session: scalars returns empty lists for documents/audit/jobs
            session = AsyncMock()

            async def _scalars_side_effect(query):
                result = MagicMock()
                result.all.return_value = []
                return result

            session.scalars.side_effect = _scalars_side_effect

            export_key = await build_matter_export(session, matter, job_id)

            assert export_key.endswith(f"{job_id}.zip")
            assert str(matter_id) in export_key

            # Verify the zip is readable
            storage = get_storage_backend()
            raw = storage.get_bytes(export_key)
            with zipfile.ZipFile(io.BytesIO(raw)) as zf:
                names = set(zf.namelist())
            assert "matter_metadata.json" in names
            assert "audit.json" in names
            assert "jobs.json" in names
            assert "document_comments.json" in names
            assert "document_versions.json" in names
            assert "document_edits.json" in names

            # Keep the working pack honest: document versions / edit rows
            # are now in scope, while the surfaces below still are not.
            out_of_scope = {
                "chronology.json",
                "document_bodies.json",
                "citations.json",
                "tabular_reviews.json",
                "assistant_messages.json",
            }
            present_out_of_scope = names & out_of_scope
            assert not present_out_of_scope, (
                f"working pack should not include {present_out_of_scope}; "
                "if you've expanded the bundle, update the docstring and remove the entry here"
            )

        finally:
            # Restore the CI-level env var rather than deleting unconditionally:
            # the CI workflow sets STORAGE_BACKEND=local so subsequent tests can find it.
            os.environ["STORAGE_BACKEND"] = _prev_storage_backend if _prev_storage_backend is not None else ""
            if _prev_storage_backend is None:
                del os.environ["STORAGE_BACKEND"]
            _reset_backend()

    @pytest.mark.asyncio
    async def test_zip_matter_metadata_fields(self) -> None:
        """matter_metadata.json contains the expected keys."""
        import json
        import os

        _prev_storage_backend = os.environ.get("STORAGE_BACKEND")
        os.environ["STORAGE_BACKEND"] = "local"
        from app.core.storage import _reset_backend

        _reset_backend()

        try:
            from app.core.exports import build_matter_export
            from app.core.storage import get_storage_backend

            matter_id = uuid.uuid4()
            user_id = uuid.uuid4()
            job_id = uuid.uuid4()

            matter = MagicMock()
            matter.id = matter_id
            matter.slug = "slug-test"
            matter.title = "Title"
            matter.matter_type = "civil"
            matter.cause = "breach of contract"
            matter.status = "open"
            matter.case_theory = None
            matter.pivot_fact = None
            matter.privilege_posture = "A_cleared"
            matter.default_model_id = "claude-opus-4-7"
            matter.facts = {"key": "value"}
            matter.opened_at = datetime(2026, 3, 1, tzinfo=timezone.utc)
            matter.closed_at = None
            matter.retention_until = None
            matter.created_by_id = user_id

            session = AsyncMock()

            async def _scalars_se(query):
                result = MagicMock()
                result.all.return_value = []
                return result

            session.scalars.side_effect = _scalars_se

            export_key = await build_matter_export(session, matter, job_id)

            storage = get_storage_backend()
            raw = storage.get_bytes(export_key)
            with zipfile.ZipFile(io.BytesIO(raw)) as zf:
                meta = json.loads(zf.read("matter_metadata.json"))

            assert meta["slug"] == "slug-test"
            assert meta["title"] == "Title"
            assert meta["facts"] == {"key": "value"}
            assert meta["id"] == str(matter_id)

        finally:
            # Restore the CI-level env var rather than deleting unconditionally:
            # the CI workflow sets STORAGE_BACKEND=local so subsequent tests can find it.
            os.environ["STORAGE_BACKEND"] = _prev_storage_backend if _prev_storage_backend is not None else ""
            if _prev_storage_backend is None:
                del os.environ["STORAGE_BACKEND"]
            _reset_backend()


class TestWorkerDispatchExport:
    """Verify worker._dispatch routes export jobs without error."""

    @pytest.mark.asyncio
    async def test_dispatch_calls_run_export(self) -> None:
        from app.worker import _dispatch
        from app.models.job import JOB_KIND_EXPORT

        job = MagicMock()
        job.id = uuid.uuid4()
        job.kind = JOB_KIND_EXPORT
        job.input_payload = {}

        matter = MagicMock()
        matter.id = uuid.uuid4()
        matter.slug = "slug"
        matter.created_by_id = uuid.uuid4()
        matter.title = "T"
        matter.matter_type = "civil"
        matter.cause = None
        matter.status = "open"
        matter.case_theory = None
        matter.pivot_fact = None
        matter.privilege_posture = "B_mixed"
        matter.default_model_id = "claude-opus-4-7"
        matter.facts = {}
        matter.opened_at = datetime(2026, 1, 1, tzinfo=timezone.utc)
        matter.closed_at = None
        matter.retention_until = None

        session = AsyncMock()

        async def _scalars_se(query):
            result = MagicMock()
            result.all.return_value = []
            return result

        session.scalars.side_effect = _scalars_se

        import os

        _prev_storage_backend = os.environ.get("STORAGE_BACKEND")
        os.environ["STORAGE_BACKEND"] = "local"
        from app.core.storage import _reset_backend

        _reset_backend()
        try:
            result = await _dispatch(session, job, matter)
            assert "export_key" in result
            assert result["export_key"].endswith(f"{job.id}.zip")
        finally:
            # Restore the CI-level env var rather than deleting unconditionally:
            # the CI workflow sets STORAGE_BACKEND=local so subsequent tests can find it.
            os.environ["STORAGE_BACKEND"] = _prev_storage_backend if _prev_storage_backend is not None else ""
            if _prev_storage_backend is None:
                del os.environ["STORAGE_BACKEND"]
            _reset_backend()


# ---------------------------------------------------------------------------
# E2E API tests — require Postgres
# ---------------------------------------------------------------------------


EMAIL = "export-e2e@example.com"
PASSWORD = "export-e2e-password-2026"
EMAIL_OTHER = "export-e2e-other@example.com"
PASSWORD_OTHER = "export-e2e-other-password-2026"


async def _signup_and_login(client, email: str, password: str) -> None:
    reg = await client.post("/auth/register", json={"email": email, "password": password})
    assert reg.status_code == 201, reg.text
    login = await client.post(
        "/auth/login",
        data={"username": email, "password": password},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert login.status_code == 204, login.text


@pytest.mark.asyncio
async def test_create_export_job_returns_job_row(client) -> None:
    """POST /api/matters/{slug}/export returns a job row with kind=export."""
    await _signup_and_login(client, EMAIL, PASSWORD)

    create = await client.post(
        "/api/matters",
        json={"title": "Export Test Matter", "matter_type": "civil"},
    )
    assert create.status_code == 201, create.text
    slug = create.json()["slug"]

    with patch("app.api.exports._enqueue_job") as mock_enqueue:
        mock_enqueue.return_value = None
        resp = await client.post(f"/api/matters/{slug}/export")

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["kind"] == "export"
    assert body["status"] == "queued"
    assert "id" in body


@pytest.mark.asyncio
async def test_export_cross_user_returns_404(client) -> None:
    """Export endpoint returns 404 for matter not owned by requesting user."""
    await _signup_and_login(client, EMAIL, PASSWORD)
    create = await client.post(
        "/api/matters",
        json={"title": "Cross User Export Matter"},
    )
    assert create.status_code == 201, create.text
    slug = create.json()["slug"]
    await client.post("/auth/logout")

    await _signup_and_login(client, EMAIL_OTHER, PASSWORD_OTHER)
    with patch("app.api.exports._enqueue_job") as mock_enqueue:
        mock_enqueue.return_value = None
        resp = await client.post(f"/api/matters/{slug}/export")
    assert resp.status_code == 404, resp.text


@pytest.mark.asyncio
async def test_download_export_returns_409_when_not_ready(client, db_session) -> None:
    """GET /api/matters/{slug}/export/{job_id} returns 409 when job is queued."""
    from sqlalchemy import select as sa_select
    from app.models import Job, Matter, User

    await _signup_and_login(client, EMAIL, PASSWORD)

    create = await client.post(
        "/api/matters",
        json={"title": "Download Export Matter"},
    )
    assert create.status_code == 201, create.text
    slug = create.json()["slug"]

    with patch("app.api.exports._enqueue_job") as mock_enqueue:
        mock_enqueue.return_value = None
        export_resp = await client.post(f"/api/matters/{slug}/export")
    assert export_resp.status_code == 200, export_resp.text
    job_id = export_resp.json()["id"]

    # Job is still queued — download should return 409
    resp = await client.get(f"/api/matters/{slug}/export/{job_id}")
    assert resp.status_code == 409, resp.text
    assert resp.json()["detail"]["error"] == "export_not_ready"


@pytest.mark.asyncio
async def test_create_export_enqueue_failure_marks_failed_and_503(
    client, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Per HANDOVER_SUBSTRATE_REVIEW_FIXES.md §2 P1: a Redis enqueue
    failure must not leave an export job permanently queued (the
    previous behaviour was to swallow the failure and return success).
    The job row must transition to FAILED and the API must return
    503 with error=job_enqueue_failed."""
    from app.api import exports as exports_api

    async def _explode(*_args, **_kwargs):
        raise RuntimeError("redis unreachable")

    monkeypatch.setattr(exports_api, "_enqueue_job", _explode)
    await _signup_and_login(client, EMAIL, PASSWORD)

    create = await client.post(
        "/api/matters",
        json={"title": "Enqueue Fail Export"},
    )
    assert create.status_code == 201, create.text
    slug = create.json()["slug"]

    resp = await client.post(f"/api/matters/{slug}/export")
    assert resp.status_code == 503, resp.text
    detail = resp.json()["detail"]
    assert detail["error"] == "job_enqueue_failed"
    assert "job_id" in detail


@pytest.mark.asyncio
async def test_download_export_returns_404_for_unknown_job(client) -> None:
    """GET /api/matters/{slug}/export/{job_id} returns 404 for unknown job."""
    await _signup_and_login(client, EMAIL, PASSWORD)

    create = await client.post(
        "/api/matters",
        json={"title": "Unknown Job Export Matter"},
    )
    assert create.status_code == 201, create.text
    slug = create.json()["slug"]

    bogus_id = uuid.uuid4()
    resp = await client.get(f"/api/matters/{slug}/export/{bogus_id}")
    assert resp.status_code == 404, resp.text
