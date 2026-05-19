"""Upload validation guards for POST /api/matters/{slug}/documents.

Pre-launch hardening. Before these guards, the endpoint accepted any
content type and any size, so a 2 GB `.exe` was a valid request. The
backend now refuses unsupported MIME types (415) and bodies larger
than 25 MB (413). A normal PDF under the cap still succeeds.
"""

from __future__ import annotations

import pytest


TEST_EMAIL = "upload-validation-e2e@example.com"
TEST_PASSWORD = "upload-validation-e2e-password-2026"
KHAN_SLUG = "khan-v-acme-trading-2026"


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


# A minimal valid PDF body. Enough bytes to look like a real document
# without bloating the test suite.
_PDF_BYTES = (
    b"%PDF-1.4\n"
    b"1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
    b"2 0 obj<</Type/Pages/Count 0/Kids[]>>endobj\n"
    b"xref\n0 3\n0000000000 65535 f \n"
    b"trailer<</Size 3/Root 1 0 R>>\n"
    b"startxref\n0\n%%EOF\n"
)


@pytest.mark.asyncio
async def test_upload_rejects_disallowed_mime_with_415(client) -> None:
    await _signup_and_login(client)

    resp = await client.post(
        f"/api/matters/{KHAN_SLUG}/documents",
        files={"file": ("payload.exe", b"MZ\x90\x00", "application/x-msdownload")},
    )
    assert resp.status_code == 415, resp.text
    body = resp.json()
    detail = body["detail"]
    assert detail["error"] == "unsupported_mime"
    assert detail["got"] == "application/x-msdownload"
    assert "application/pdf" in detail["allowed"]


@pytest.mark.asyncio
async def test_upload_rejects_over_size_cap_with_413(client) -> None:
    await _signup_and_login(client)

    # 26 MB body, declared as PDF so the MIME gate passes and we hit
    # the size gate.
    oversize = b"A" * (26 * 1024 * 1024)
    resp = await client.post(
        f"/api/matters/{KHAN_SLUG}/documents",
        files={"file": ("huge.pdf", oversize, "application/pdf")},
    )
    assert resp.status_code == 413, resp.text
    detail = resp.json()["detail"]
    assert detail["error"] == "upload_too_large"
    assert detail["max_bytes"] == 25 * 1024 * 1024
    assert detail["got_bytes"] == len(oversize)


@pytest.mark.asyncio
async def test_upload_pdf_under_cap_succeeds(client) -> None:
    """Regression guard. The new gates must not break the normal path."""
    await _signup_and_login(client)

    resp = await client.post(
        f"/api/matters/{KHAN_SLUG}/documents",
        files={"file": ("note.pdf", _PDF_BYTES, "application/pdf")},
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["filename"] == "note.pdf"
    assert body["mime_type"] == "application/pdf"
    assert body["size_bytes"] == len(_PDF_BYTES)
