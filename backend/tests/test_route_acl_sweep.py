"""Issue #3 — Route ACL sweep for non-matter (UUID-keyed) resources.

Verifies that every document endpoint that resolves by document UUID
(not by matter slug) still enforces:
  1. Ownership: another user cannot access your documents.
  2. Archived-matter gate: once the owning matter is tombstoned, 404.

DB-backed; skips when Postgres is unreachable (see conftest.py).
"""

from __future__ import annotations

import io
import uuid

import pytest


EMAIL_A = "acl-sweep-a@example.com"
PASSWORD_A = "acl-sweep-a-password-2026"
EMAIL_B = "acl-sweep-b@example.com"
PASSWORD_B = "acl-sweep-b-password-2026"

_PDF_MAGIC = b"%PDF-1.4 1 0 obj<</Type /Catalog>>stream\nHello\nendstream\nendobj"


async def _signup_and_login(client, email: str, password: str) -> None:
    reg = await client.post("/auth/register", json={"email": email, "password": password})
    assert reg.status_code == 201, reg.text
    login = await client.post(
        "/auth/login",
        data={"username": email, "password": password},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert login.status_code == 204, login.text


async def _create_matter_and_upload(client) -> tuple[str, str]:
    """Returns (matter_slug, document_id)."""
    create = await client.post(
        "/api/matters",
        json={"title": "ACL Sweep Matter"},
    )
    assert create.status_code == 201, create.text
    slug = create.json()["slug"]

    resp = await client.post(
        f"/api/matters/{slug}/documents",
        files={"file": ("test.pdf", io.BytesIO(_PDF_MAGIC), "application/pdf")},
        data={"tag": "correspondence"},
    )
    assert resp.status_code == 201, resp.text
    doc_id = resp.json()["id"]
    return slug, doc_id


# ---------------------------------------------------------------------------
# Cross-user ownership — 404 on all document UUID endpoints
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_document_body_cross_user_returns_404(client) -> None:
    """User B cannot read User A's document body by UUID."""
    await _signup_and_login(client, EMAIL_A, PASSWORD_A)
    _, doc_id = await _create_matter_and_upload(client)
    await client.post("/auth/logout")

    await _signup_and_login(client, EMAIL_B, PASSWORD_B)
    resp = await client.get(f"/api/documents/{doc_id}/body")
    assert resp.status_code == 404, resp.text


@pytest.mark.asyncio
async def test_get_document_versions_cross_user_returns_404(client) -> None:
    """User B cannot list User A's document versions by UUID."""
    await _signup_and_login(client, EMAIL_A, PASSWORD_A)
    _, doc_id = await _create_matter_and_upload(client)
    await client.post("/auth/logout")

    await _signup_and_login(client, EMAIL_B, PASSWORD_B)
    resp = await client.get(f"/api/documents/{doc_id}/versions")
    assert resp.status_code == 404, resp.text


@pytest.mark.asyncio
async def test_get_document_body_archived_matter_returns_404(client) -> None:
    """After the owning matter is archived, GET document body 404s."""
    await _signup_and_login(client, EMAIL_A, PASSWORD_A)
    slug, doc_id = await _create_matter_and_upload(client)

    # Confirm body is accessible while matter is live
    alive = await client.get(f"/api/documents/{doc_id}/body")
    assert alive.status_code == 200, alive.text

    # Tombstone the matter
    del_resp = await client.delete(f"/api/matters/{slug}")
    assert del_resp.status_code == 204, del_resp.text

    # Body endpoint must now 404
    resp = await client.get(f"/api/documents/{doc_id}/body")
    assert resp.status_code == 404, resp.text


@pytest.mark.asyncio
async def test_get_document_versions_archived_matter_returns_404(client) -> None:
    """After the owning matter is archived, GET document versions 404s."""
    await _signup_and_login(client, EMAIL_A, PASSWORD_A)
    slug, doc_id = await _create_matter_and_upload(client)

    # Confirm versions accessible while matter is live
    alive = await client.get(f"/api/documents/{doc_id}/versions")
    assert alive.status_code == 200, alive.text

    del_resp = await client.delete(f"/api/matters/{slug}")
    assert del_resp.status_code == 204, del_resp.text

    resp = await client.get(f"/api/documents/{doc_id}/versions")
    assert resp.status_code == 404, resp.text


@pytest.mark.asyncio
async def test_get_anonymise_document_archived_matter_returns_404(client) -> None:
    """GET /{doc_id}/anonymise 404s once the owning matter is archived."""
    await _signup_and_login(client, EMAIL_A, PASSWORD_A)
    slug, doc_id = await _create_matter_and_upload(client)

    del_resp = await client.delete(f"/api/matters/{slug}")
    assert del_resp.status_code == 204, del_resp.text

    resp = await client.get(f"/api/documents/{doc_id}/anonymise")
    assert resp.status_code == 404, resp.text


@pytest.mark.asyncio
async def test_get_anonymise_document_cross_user_returns_404(client) -> None:
    """User B cannot GET User A's anonymisation result by UUID."""
    await _signup_and_login(client, EMAIL_A, PASSWORD_A)
    _, doc_id = await _create_matter_and_upload(client)
    await client.post("/auth/logout")

    await _signup_and_login(client, EMAIL_B, PASSWORD_B)
    resp = await client.get(f"/api/documents/{doc_id}/anonymise")
    assert resp.status_code == 404, resp.text


@pytest.mark.asyncio
async def test_get_generated_docx_cross_user_returns_404(client) -> None:
    """GET /api/documents/generated/{uuid} returns 404 for a non-owner."""
    # Fabricate a UUID that doesn't correspond to any audit row
    bogus_uuid = uuid.uuid4()
    await _signup_and_login(client, EMAIL_A, PASSWORD_A)
    resp = await client.get(f"/api/documents/generated/{bogus_uuid}")
    assert resp.status_code == 404, resp.text
