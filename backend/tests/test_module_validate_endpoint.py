"""Module Standalone + Create Module v1 — POST /api/modules/validate.

Read-only manifest validation for the Create Module on-ramp. Same
validator as the install path; no DB write, no ceremony, no audit.
Authed (operator surface).
"""

from __future__ import annotations

import json
import uuid
from pathlib import Path

import pytest
from sqlalchemy import func, select

from app.models import AuditEntry

_VALID_MANIFEST = json.loads(
    (
        Path(__file__).resolve().parents[2]
        / "examples"
        / "modules"
        / "contract_review"
        / "module.json"
    ).read_text()
)


async def _register_and_login(client) -> None:
    email = f"mval-{uuid.uuid4().hex[:8]}@example.com"
    await client.post("/auth/register", json={"email": email, "password": "mval-2026"})
    await client.post(
        "/auth/login",
        data={"username": email, "password": "mval-2026"},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )


@pytest.mark.asyncio
async def test_valid_manifest_returns_valid(client, db_session) -> None:
    await _register_and_login(client)
    before = await db_session.scalar(select(func.count()).select_from(AuditEntry))

    resp = await client.post(
        "/api/modules/validate", json={"manifest": _VALID_MANIFEST}
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["valid"] is True
    assert body["errors"] == []

    # Read-only: no audit row written by validation.
    after = await db_session.scalar(select(func.count()).select_from(AuditEntry))
    assert after == before


@pytest.mark.asyncio
async def test_invalid_manifest_returns_errors(client) -> None:
    await _register_and_login(client)
    resp = await client.post("/api/modules/validate", json={"manifest": {}})
    assert resp.status_code == 200
    body = resp.json()
    assert body["valid"] is False
    assert len(body["errors"]) > 0
    # Each error carries path + message.
    for e in body["errors"]:
        assert "path" in e and "message" in e


@pytest.mark.asyncio
async def test_validate_requires_auth(client) -> None:
    client.cookies.clear()
    resp = await client.post("/api/modules/validate", json={"manifest": {}})
    assert resp.status_code == 401
