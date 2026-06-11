"""GET /api/documents/{id}/edits/pending — redlines survive reload.

DB-backed; skips locally without TEST_DATABASE_URL (CI runs it).
"""

from __future__ import annotations

import uuid

import pytest


@pytest.mark.asyncio
async def test_pending_edits_empty_for_fresh_document(client):
    reg = await client.post(
        "/auth/register",
        json={"email": f"pe-{uuid.uuid4().hex[:8]}@example.com", "password": "pe-pass-2026"},
    )
    assert reg.status_code == 201
    email = reg.json()["email"]
    login = await client.post(
        "/auth/login",
        data={"username": email, "password": "pe-pass-2026"},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert login.status_code == 204

    docs = await client.get("/api/matters/khan-v-acme-trading-2026/documents")
    assert docs.status_code == 200
    doc_id = docs.json()[0]["id"]

    resp = await client.get(f"/api/documents/{doc_id}/edits/pending")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body == {"version": None, "pending_edits": []}


@pytest.mark.asyncio
async def test_pending_edits_404_for_foreign_document(client):
    reg = await client.post(
        "/auth/register",
        json={"email": f"pe2-{uuid.uuid4().hex[:8]}@example.com", "password": "pe-pass-2026"},
    )
    email = reg.json()["email"]
    await client.post(
        "/auth/login",
        data={"username": email, "password": "pe-pass-2026"},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    resp = await client.get(f"/api/documents/{uuid.uuid4()}/edits/pending")
    assert resp.status_code == 404
