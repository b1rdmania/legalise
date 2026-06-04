"""Documents API E2E coverage.

Read paths only. The Khan seed ships three documents with extracted
bodies, so `GET /api/documents/{id}/body` should return 200 for each.
"""

from __future__ import annotations

import pytest


TEST_EMAIL = "documents-e2e@example.com"
TEST_PASSWORD = "documents-e2e-password-2026"
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


@pytest.mark.asyncio
async def test_list_documents_returns_three_seeded_docs(client) -> None:
    await _signup_and_login(client)

    resp = await client.get(f"/api/matters/{KHAN_SLUG}/documents")
    assert resp.status_code == 200, resp.text

    body = resp.json()
    assert isinstance(body, list)
    assert len(body) == 3
    filenames = {d["filename"] for d in body}
    assert filenames == {
        "khan-dismissal-letter.pdf",
        "witness-statement-khan.docx",
        "synthetic-mutual-nda.docx",
    }
    for doc in body:
        assert "comment_count" in doc
        assert "open_comment_count" in doc
        assert "version_count" in doc
        assert "edit_count" in doc
        assert "pending_edit_count" in doc


@pytest.mark.asyncio
async def test_document_body_returns_extracted_text_for_each_seeded_doc(client) -> None:
    await _signup_and_login(client)

    docs_resp = await client.get(f"/api/matters/{KHAN_SLUG}/documents")
    assert docs_resp.status_code == 200
    docs = docs_resp.json()

    for doc in docs:
        body_resp = await client.get(f"/api/documents/{doc['id']}/body")
        assert body_resp.status_code == 200, (
            f"body fetch failed for {doc['filename']}: {body_resp.text}"
        )
        body = body_resp.json()
        assert body["document_id"] == doc["id"]
        assert body["kind"] == "extracted"
        assert isinstance(body["extracted_text"], str)
        assert body["extracted_text"], (
            f"extracted_text empty for {doc['filename']} — seed should populate it"
        )


@pytest.mark.asyncio
async def test_documents_listing_unknown_matter_returns_404(client) -> None:
    await _signup_and_login(client)
    resp = await client.get("/api/matters/this-slug-does-not-exist/documents")
    assert resp.status_code == 404
