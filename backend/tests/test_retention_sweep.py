"""Retention sweeper — `app.tools.retention_sweep`.

Covers the contract that matters:
  - Selection is exact: only ``retention_until < today`` AND not already
    archived are picked up (idempotent — tombstones are skipped).
  - DRY-RUN (default) changes nothing.
  - --apply tombstones the expired matter (status=archived) and writes a
    ``matter.retention.purged`` audit row with ``purged_by`` provenance,
    while leaving the non-expired matter untouched.

DB-backed; skips when Postgres is unreachable (see conftest.py).
"""

from __future__ import annotations

import uuid
from datetime import date, timedelta

import pytest
from sqlalchemy import select

from app.models import AuditEntry, Matter
from app.tools.retention_sweep import EXIT_OK, _select_expired, _sweep


EMAIL = "retention-sweep@example.com"
PASSWORD = "retention-sweep-password-2026"


async def _signup_and_login(client, email: str, password: str) -> None:
    reg = await client.post("/auth/register", json={"email": email, "password": password})
    assert reg.status_code == 201, reg.text
    login = await client.post(
        "/auth/login",
        data={"username": email, "password": password},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert login.status_code == 204, login.text


async def _make_matter(client, title: str, retention_until: date | None) -> uuid.UUID:
    payload: dict = {"title": title}
    if retention_until is not None:
        payload["retention_until"] = retention_until.isoformat()
    resp = await client.post("/api/matters", json=payload)
    assert resp.status_code == 201, resp.text
    return uuid.UUID(resp.json()["id"])


@pytest.mark.asyncio
async def test_select_expired_is_exact(client, db_session) -> None:
    """Only retention_until<today AND non-archived matters are selected."""
    await _signup_and_login(client, EMAIL, PASSWORD)
    today = date.today()

    expired_id = await _make_matter(client, "Expired Matter", today - timedelta(days=30))
    fresh_id = await _make_matter(client, "Fresh Matter", today + timedelta(days=365))
    none_id = await _make_matter(client, "No Retention Matter", None)

    selected = list((await db_session.scalars(_select_expired(today))).all())
    selected_ids = {m.id for m in selected}

    assert expired_id in selected_ids
    assert fresh_id not in selected_ids
    assert none_id not in selected_ids


@pytest.mark.asyncio
async def test_dry_run_changes_nothing(client, db_session) -> None:
    """Default (no --apply) prints but mutates nothing."""
    await _signup_and_login(client, EMAIL, PASSWORD)
    today = date.today()

    expired_id = await _make_matter(client, "Expired Dry Run", today - timedelta(days=5))

    code = await _sweep(db_session, apply=False, today=today)
    assert code == EXIT_OK

    matter = await db_session.scalar(select(Matter).where(Matter.id == expired_id))
    assert matter is not None
    assert matter.status != "archived"

    purged_rows = list(
        (
            await db_session.scalars(
                select(AuditEntry).where(
                    AuditEntry.matter_id == expired_id,
                    AuditEntry.action == "matter.retention.purged",
                )
            )
        ).all()
    )
    assert purged_rows == []


@pytest.mark.asyncio
async def test_apply_tombstones_expired_only(client, db_session) -> None:
    """--apply tombstones the expired matter + audits it; leaves the
    non-expired matter untouched."""
    await _signup_and_login(client, EMAIL, PASSWORD)
    today = date.today()

    expired_id = await _make_matter(client, "Expired Apply", today - timedelta(days=10))
    fresh_id = await _make_matter(client, "Fresh Apply", today + timedelta(days=10))

    code = await _sweep(db_session, apply=True, today=today)
    assert code == EXIT_OK

    expired = await db_session.scalar(select(Matter).where(Matter.id == expired_id))
    assert expired is not None
    assert expired.status == "archived"

    fresh = await db_session.scalar(select(Matter).where(Matter.id == fresh_id))
    assert fresh is not None
    assert fresh.status != "archived"

    purged_rows = list(
        (
            await db_session.scalars(
                select(AuditEntry).where(
                    AuditEntry.matter_id == expired_id,
                    AuditEntry.action == "matter.retention.purged",
                )
            )
        ).all()
    )
    assert len(purged_rows) == 1
    row = purged_rows[0]
    assert row.actor_id is None  # system actor
    assert row.payload.get("purged_by") == "retention_sweep"
    assert row.payload.get("retention_until") == (today - timedelta(days=10)).isoformat()

    # The non-expired matter got no purge row.
    fresh_purged = list(
        (
            await db_session.scalars(
                select(AuditEntry).where(
                    AuditEntry.matter_id == fresh_id,
                    AuditEntry.action == "matter.retention.purged",
                )
            )
        ).all()
    )
    assert fresh_purged == []
