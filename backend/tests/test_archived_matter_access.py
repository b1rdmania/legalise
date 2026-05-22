"""Archived matter access sweep — HANDOVER_SUBSTRATE_R2_REVIEW.md §Issue 1.

After a user tombstones a matter via DELETE /api/matters/{slug}, every
module, job, and export route on that matter must return 404. The
previous behaviour was that only the canonical GET /api/matters/{slug}
checked status; downstream routes fetched on slug+owner only.

These tests exercise the shared `resolve_owned_open_matter` helper via
each surface that uses it.
"""

from __future__ import annotations

import uuid

import pytest


EMAIL = "archived-access@example.com"
PASSWORD = "archived-access-password-2026"


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


async def _create_and_archive(client) -> str:
    create = await client.post(
        "/api/matters",
        json={"title": "Will Be Archived"},
    )
    assert create.status_code == 201, create.text
    slug = create.json()["slug"]
    delete_resp = await client.delete(f"/api/matters/{slug}")
    assert delete_resp.status_code == 204, delete_resp.text
    return slug


# ---------------------------------------------------------------------------
# Each route family — assert 404 on archived matter
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_matter_returns_404_when_archived(client) -> None:
    """Sanity check the existing matters.py behaviour we're aligning with."""
    await _signup_and_login(client)
    slug = await _create_and_archive(client)
    resp = await client.get(f"/api/matters/{slug}")
    assert resp.status_code == 404, resp.text


@pytest.mark.asyncio
async def test_pre_motion_job_create_returns_404_when_archived(client) -> None:
    """POST /api/matters/{slug}/pre-motion/jobs must 404 on archived matter."""
    await _signup_and_login(client)
    slug = await _create_and_archive(client)
    resp = await client.post(
        f"/api/matters/{slug}/pre-motion/jobs",
        json={"depth": "fast"},
    )
    assert resp.status_code == 404, resp.text


@pytest.mark.asyncio
async def test_contract_review_job_create_returns_404_when_archived(client) -> None:
    """POST /api/matters/{slug}/contract-review/jobs must 404 on archived matter."""
    await _signup_and_login(client)
    slug = await _create_and_archive(client)
    resp = await client.post(
        f"/api/matters/{slug}/contract-review/jobs",
        json={"document_id": str(uuid.uuid4())},
    )
    assert resp.status_code == 404, resp.text


@pytest.mark.asyncio
async def test_get_job_returns_404_when_matter_archived(client) -> None:
    """GET /api/matters/{slug}/jobs/{job_id} must 404 once the matter is
    archived, even if the job id is well-formed."""
    await _signup_and_login(client)
    slug = await _create_and_archive(client)
    fake_job = uuid.uuid4()
    resp = await client.get(f"/api/matters/{slug}/jobs/{fake_job}")
    assert resp.status_code == 404, resp.text


@pytest.mark.asyncio
async def test_export_create_returns_404_when_archived(client) -> None:
    """POST /api/matters/{slug}/export must 404 on archived matter — you
    cannot export what you have deleted."""
    await _signup_and_login(client)
    slug = await _create_and_archive(client)
    resp = await client.post(f"/api/matters/{slug}/export")
    assert resp.status_code == 404, resp.text


@pytest.mark.asyncio
async def test_export_download_returns_404_when_archived(client) -> None:
    """GET /api/matters/{slug}/export/{job_id} must 404 on archived matter."""
    await _signup_and_login(client)
    slug = await _create_and_archive(client)
    fake_job = uuid.uuid4()
    resp = await client.get(f"/api/matters/{slug}/export/{fake_job}")
    assert resp.status_code == 404, resp.text


@pytest.mark.asyncio
async def test_chronology_returns_404_when_archived(client) -> None:
    """GET /api/matters/{slug}/chronology must 404 on archived matter."""
    await _signup_and_login(client)
    slug = await _create_and_archive(client)
    resp = await client.get(f"/api/matters/{slug}/chronology")
    assert resp.status_code == 404, resp.text


@pytest.mark.asyncio
async def test_letters_catalog_returns_404_when_archived(client) -> None:
    """GET /api/matters/{slug}/letters/catalog must 404 on archived matter."""
    await _signup_and_login(client)
    slug = await _create_and_archive(client)
    resp = await client.get(f"/api/matters/{slug}/letters/catalog")
    assert resp.status_code == 404, resp.text


@pytest.mark.asyncio
async def test_assistant_messages_returns_404_when_archived(client) -> None:
    """GET /api/matters/{slug}/assistant/messages must 404 on archived matter."""
    await _signup_and_login(client)
    slug = await _create_and_archive(client)
    resp = await client.get(f"/api/matters/{slug}/assistant/messages")
    assert resp.status_code == 404, resp.text


# ---------------------------------------------------------------------------
# Sanity: live matters still work
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_live_matter_routes_unchanged_after_helper_swap(client) -> None:
    """The archived-aware resolver must not break the live-matter path
    (we replaced inline lookups in 9 router files; this is the regression
    guard)."""
    await _signup_and_login(client)
    create = await client.post(
        "/api/matters",
        json={"title": "Still Live Matter"},
    )
    assert create.status_code == 201, create.text
    slug = create.json()["slug"]

    # Smoke a representative read across the families.
    assert (await client.get(f"/api/matters/{slug}")).status_code == 200
    assert (await client.get(f"/api/matters/{slug}/chronology")).status_code == 200
    assert (await client.get(f"/api/matters/{slug}/letters/catalog")).status_code == 200
    assert (await client.get(f"/api/matters/{slug}/assistant/messages")).status_code == 200
