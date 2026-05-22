"""Issue #4 — Export-after-delete consistency.

Per the policy in app/api/exports.py:
    Exports are downloadable while the matter is live. Tombstoning the
    matter 404s the export download. Users must download before delete.

Test sequence:
  1. Create matter.
  2. Create export job (mock Redis enqueue).
  3. Fast-path the job to succeeded status with a real zip in storage.
  4. Confirm download returns 200/zip while matter is live.
  5. Delete (archive) the matter.
  6. Assert GET /api/matters/{slug}/export/{job_id} returns 404.
  7. Assert POST /api/matters/{slug}/export also returns 404.

DB-backed; skips when Postgres is unreachable (see conftest.py).
"""

from __future__ import annotations

import io
import os
import uuid
import zipfile
from unittest.mock import patch

import pytest


EMAIL = "export-after-delete@example.com"
PASSWORD = "export-after-delete-password-2026"


async def _signup_and_login(client) -> None:
    reg = await client.post(
        "/auth/register",
        json={"email": EMAIL, "password": PASSWORD},
    )
    assert reg.status_code == 201, reg.text
    login = await client.post(
        "/auth/login",
        data={"username": EMAIL, "password": PASSWORD},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert login.status_code == 204, login.text


def _make_zip_bytes() -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("matter_metadata.json", '{"test": true}')
        zf.writestr("audit.json", "[]")
        zf.writestr("jobs.json", "[]")
    return buf.getvalue()


@pytest.mark.asyncio
async def test_export_download_404_after_matter_deleted(
    client, db_session
) -> None:
    """Create → export job → succeed job → delete matter → download is 404."""
    from sqlalchemy import update as sa_update
    from app.models import Job, Matter
    from app.models.job import JOB_STATUS_SUCCEEDED
    from app.core.storage import get_storage_backend, _reset_backend

    # Use local storage so we can write the zip directly
    prev = os.environ.get("STORAGE_BACKEND")
    os.environ["STORAGE_BACKEND"] = "local"
    _reset_backend()

    try:
        await _signup_and_login(client)

        # 1. Create matter
        create = await client.post(
            "/api/matters",
            json={"title": "Export After Delete Matter"},
        )
        assert create.status_code == 201, create.text
        slug = create.json()["slug"]

        # 2. Create export job (mock Redis)
        with patch("app.api.exports._enqueue_job") as mock_enqueue:
            mock_enqueue.return_value = None
            export_resp = await client.post(f"/api/matters/{slug}/export")
        assert export_resp.status_code == 200, export_resp.text
        job_id = export_resp.json()["id"]

        # 3. Manually advance the job to succeeded with a zip in storage
        storage = get_storage_backend()
        zip_bytes = _make_zip_bytes()
        # Locate the matter id from the job row
        job_row = await db_session.get(Job, uuid.UUID(job_id))
        assert job_row is not None
        matter_id = job_row.matter_id
        export_key = f"exports/{matter_id}/{job_id}.zip"
        storage.put_bytes(export_key, zip_bytes, content_type="application/zip", metadata={})

        # Update job status + result_payload directly in the test session
        await db_session.execute(
            sa_update(Job)
            .where(Job.id == uuid.UUID(job_id))
            .values(
                status=JOB_STATUS_SUCCEEDED,
                result_payload={"export_key": export_key},
            )
        )
        await db_session.flush()

        # 4. Download succeeds while matter is live
        download = await client.get(f"/api/matters/{slug}/export/{job_id}")
        assert download.status_code == 200, download.text

        # 5. Delete (archive) the matter
        del_resp = await client.delete(f"/api/matters/{slug}")
        assert del_resp.status_code == 204, del_resp.text

        # 6. Download now 404s
        resp = await client.get(f"/api/matters/{slug}/export/{job_id}")
        assert resp.status_code == 404, resp.text

        # 7. New export creation also 404s
        with patch("app.api.exports._enqueue_job") as mock_enqueue2:
            mock_enqueue2.return_value = None
            new_export = await client.post(f"/api/matters/{slug}/export")
        assert new_export.status_code == 404, new_export.text

    finally:
        os.environ["STORAGE_BACKEND"] = prev if prev is not None else ""
        if prev is None:
            del os.environ["STORAGE_BACKEND"]
        _reset_backend()
