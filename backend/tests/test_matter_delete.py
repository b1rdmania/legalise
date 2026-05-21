"""Unit 5 — matter delete endpoint.

Tests cover:
  - DELETE /api/matters/{slug} tombstones the matter (status=archived).
  - Tombstoned matter returns 404 on GET.
  - Tombstoned matter absent from list.
  - Cross-user delete returns 404.
  - Delete with active job returns 409.
  - Audit rows survive matter deletion (tombstone keeps the matter row;
    audit FKs continue to resolve against status=archived rows).
  - Account deletion succeeds after matter is deleted.

DB-backed tests skip when Postgres is unreachable (see conftest.py).
"""

from __future__ import annotations

import uuid
from unittest.mock import patch

import pytest
from sqlalchemy import select

from app.models import AuditEntry, Matter


EMAIL = "matter-delete@example.com"
PASSWORD = "matter-delete-password-2026"
EMAIL_OTHER = "matter-delete-other@example.com"
PASSWORD_OTHER = "matter-delete-other-password-2026"


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
async def test_delete_matter_tombstones(client, db_session) -> None:
    """DELETE /api/matters/{slug} sets status=archived."""
    await _signup_and_login(client, EMAIL, PASSWORD)

    create = await client.post(
        "/api/matters",
        json={"title": "Delete Me Matter"},
    )
    assert create.status_code == 201, create.text
    slug = create.json()["slug"]
    matter_id = uuid.UUID(create.json()["id"])

    resp = await client.delete(f"/api/matters/{slug}")
    assert resp.status_code == 204, resp.text

    matter = await db_session.scalar(select(Matter).where(Matter.id == matter_id))
    assert matter is not None
    assert matter.status == "archived"


@pytest.mark.asyncio
async def test_deleted_matter_returns_404_on_get(client) -> None:
    """GET /api/matters/{slug} returns 404 after delete."""
    await _signup_and_login(client, EMAIL, PASSWORD)

    create = await client.post(
        "/api/matters",
        json={"title": "Get After Delete"},
    )
    assert create.status_code == 201, create.text
    slug = create.json()["slug"]

    await client.delete(f"/api/matters/{slug}")

    resp = await client.get(f"/api/matters/{slug}")
    assert resp.status_code == 404, resp.text


@pytest.mark.asyncio
async def test_deleted_matter_absent_from_list(client) -> None:
    """GET /api/matters does not include archived matter."""
    await _signup_and_login(client, EMAIL, PASSWORD)

    create = await client.post(
        "/api/matters",
        json={"title": "Listed Then Deleted"},
    )
    assert create.status_code == 201, create.text
    slug = create.json()["slug"]

    list_before = await client.get("/api/matters")
    slugs_before = [m["slug"] for m in list_before.json()]
    assert slug in slugs_before

    await client.delete(f"/api/matters/{slug}")

    list_after = await client.get("/api/matters")
    slugs_after = [m["slug"] for m in list_after.json()]
    assert slug not in slugs_after


@pytest.mark.asyncio
async def test_delete_matter_cross_user_returns_404(client) -> None:
    """DELETE /api/matters/{slug} returns 404 for another user's matter."""
    await _signup_and_login(client, EMAIL, PASSWORD)
    create = await client.post(
        "/api/matters",
        json={"title": "Cross User Delete Matter"},
    )
    assert create.status_code == 201, create.text
    slug = create.json()["slug"]
    await client.post("/auth/logout")

    await _signup_and_login(client, EMAIL_OTHER, PASSWORD_OTHER)
    resp = await client.delete(f"/api/matters/{slug}")
    assert resp.status_code == 404, resp.text


@pytest.mark.asyncio
async def test_delete_matter_with_active_job_returns_409(client, db_session) -> None:
    """DELETE /api/matters/{slug} returns 409 when an active job exists."""
    from app.models import Job
    from app.models.job import JOB_KIND_PRE_MOTION, JOB_STATUS_RUNNING

    await _signup_and_login(client, EMAIL, PASSWORD)

    create = await client.post(
        "/api/matters",
        json={"title": "Active Job Delete Matter"},
    )
    assert create.status_code == 201, create.text
    slug = create.json()["slug"]
    matter_id = uuid.UUID(create.json()["id"])

    # Inject a running job directly
    from sqlalchemy import select as sa_select
    from app.models import User

    from app.core.auth import current_user as _cu  # noqa: F401
    user = await db_session.scalar(
        sa_select(User).where(User.email == EMAIL)
    )
    assert user is not None

    job = Job(
        id=uuid.uuid4(),
        matter_id=matter_id,
        created_by_id=user.id,
        kind=JOB_KIND_PRE_MOTION,
        status=JOB_STATUS_RUNNING,
        input_payload={},
    )
    db_session.add(job)
    await db_session.commit()

    resp = await client.delete(f"/api/matters/{slug}")
    assert resp.status_code == 409, resp.text
    assert resp.json()["detail"]["error"] == "matter_has_active_jobs"


@pytest.mark.asyncio
async def test_delete_matter_audit_rows_survive(client, db_session) -> None:
    """Tombstone design: the matter row stays as `status=archived`, so
    audit FKs continue to resolve. The Unit 6 WORM trigger forbids
    UPDATE/DELETE on audit_entries, so we cannot — and don't need to —
    null out matter_id on delete."""
    await _signup_and_login(client, EMAIL, PASSWORD)

    create = await client.post(
        "/api/matters",
        json={"title": "Audit Survive Delete"},
    )
    assert create.status_code == 201, create.text
    slug = create.json()["slug"]
    matter_id = uuid.UUID(create.json()["id"])

    audit_before = list(
        (
            await db_session.scalars(
                select(AuditEntry).where(AuditEntry.matter_id == matter_id)
            )
        ).all()
    )
    assert len(audit_before) >= 1

    resp = await client.delete(f"/api/matters/{slug}")
    assert resp.status_code == 204, resp.text

    # Audit rows survive AND still point at the tombstoned matter.
    audit_after = list(
        (
            await db_session.scalars(
                select(AuditEntry).where(AuditEntry.matter_id == matter_id)
            )
        ).all()
    )
    assert len(audit_after) >= len(audit_before), (
        "audit rows must survive matter deletion (tombstone keeps FK live)"
    )
    actions = {row.action for row in audit_after}
    assert "matter.deleted" in actions


@pytest.mark.asyncio
async def test_delete_without_prior_export_writes_warning_audit(client, db_session) -> None:
    """Deleting without a prior export writes a matter.deleted_without_export audit row."""
    from sqlalchemy import select as sa_select
    from app.models import User

    await _signup_and_login(client, EMAIL, PASSWORD)

    create = await client.post(
        "/api/matters",
        json={"title": "No Export Delete"},
    )
    assert create.status_code == 201, create.text
    slug = create.json()["slug"]

    resp = await client.delete(f"/api/matters/{slug}")
    assert resp.status_code == 204, resp.text

    # Warning audit row should exist (matter_id was nulled, so query on action)
    warning_rows = list(
        (
            await db_session.scalars(
                select(AuditEntry).where(
                    AuditEntry.action == "matter.deleted_without_export"
                )
            )
        ).all()
    )
    assert len(warning_rows) >= 1


@pytest.mark.asyncio
async def test_delete_matter_storage_failure_fails_closed(
    client, db_session, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Per HANDOVER_SUBSTRATE_REVIEW_FIXES.md §2 P1: if
    storage.delete_prefix raises, the endpoint must return 5xx and
    leave the matter live + un-archived + no audit row claiming
    successful deletion. A 204 must only fire when storage objects
    are actually gone."""
    from sqlalchemy import select as sa_select

    from app.api import matters as matters_api
    from app.models import AuditEntry, Matter

    class _ExplodingStorage:
        def delete_prefix(self, prefix):
            raise RuntimeError("simulated R2 outage")

        def put_bytes(self, *a, **k):
            raise RuntimeError("unused")

        def get_bytes(self, *a, **k):
            raise RuntimeError("unused")

        def delete_object(self, *a, **k):
            raise RuntimeError("unused")

    monkeypatch.setattr(
        matters_api, "get_storage_backend", lambda: _ExplodingStorage()
    )

    await _signup_and_login(client, EMAIL, PASSWORD)
    create = await client.post(
        "/api/matters",
        json={"title": "Storage Fail Delete"},
    )
    assert create.status_code == 201, create.text
    slug = create.json()["slug"]
    matter_id = uuid.UUID(create.json()["id"])

    resp = await client.delete(f"/api/matters/{slug}")
    assert resp.status_code == 502, resp.text
    detail = resp.json()["detail"]
    assert detail["error"] == "matter_storage_delete_failed"

    # Matter must NOT be archived.
    matter = await db_session.scalar(
        sa_select(Matter).where(Matter.id == matter_id)
    )
    assert matter is not None
    assert matter.status != "archived"

    # No `matter.deleted` audit row was written.
    deleted_rows = list(
        (
            await db_session.scalars(
                sa_select(AuditEntry).where(
                    AuditEntry.matter_id == matter_id,
                    AuditEntry.action == "matter.deleted",
                )
            )
        ).all()
    )
    assert len(deleted_rows) == 0, (
        "matter.deleted audit row must NOT exist when storage cleanup failed"
    )


@pytest.mark.asyncio
async def test_account_deletion_succeeds_after_matter_deleted(client, db_session) -> None:
    """Account delete (DELETE /auth/users/me) succeeds after all matters archived."""
    from sqlalchemy import select as sa_select
    from app.models import Job, Matter, User

    await _signup_and_login(client, EMAIL, PASSWORD)

    # Get all matters for this user (including seeded ones)
    user = await db_session.scalar(sa_select(User).where(User.email == EMAIL))
    assert user is not None

    matters = list(
        (
            await db_session.scalars(
                sa_select(Matter).where(
                    Matter.created_by_id == user.id,
                    Matter.status != "archived",
                )
            )
        ).all()
    )

    for matter in matters:
        # Delete each matter via the API
        del_resp = await client.delete(f"/api/matters/{matter.slug}")
        assert del_resp.status_code == 204, f"Failed to delete {matter.slug}: {del_resp.text}"

    # Now account deletion should succeed
    resp = await client.delete("/auth/users/me")
    assert resp.status_code == 204, resp.text
