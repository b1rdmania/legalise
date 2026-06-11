"""GET /api/matters/{slug}/audit/chain — notary-minimal verification.

Happy path rides the per-user Khan seed (11 audit rows → 11 matter-scope
chain links). The tamper test corrupts a chain row directly: the WORM
trigger forbids UPDATE on `audit_chain`, so the test (as table owner)
disables the trigger inside the rolled-back test transaction, rewrites
one `chain_hash`, re-enables it, and expects the endpoint to report the
break. This mirrors the fixtures in test_audit_chain.py.
"""

from __future__ import annotations

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection


KHAN_SLUG = "khan-v-acme-trading-2026"


async def _signup_and_login(client, email: str) -> None:
    password = "audit-chain-endpoint-pw-2026"
    reg = await client.post("/auth/register", json={"email": email, "password": password})
    assert reg.status_code == 201, reg.text
    login = await client.post(
        "/auth/login",
        data={"username": email, "password": password},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert login.status_code == 204, login.text


@pytest.mark.asyncio
async def test_chain_endpoint_happy_path(client) -> None:
    await _signup_and_login(client, "chain-happy@example.com")

    resp = await client.get(f"/api/matters/{KHAN_SLUG}/audit/chain")
    assert resp.status_code == 200, resp.text

    body = resp.json()
    assert body["verified"] is True, body["issues"]
    assert body["scope"] == "matter"
    # Khan seed writes 11 audit rows; later activity can only add links.
    assert body["length"] >= 11
    assert body["issues"] == []

    head = body["head"]
    assert head is not None
    assert len(head["chain_hash"]) == 64
    assert len(head["entry_hash"]) == 64
    assert head["scope_sequence"] == body["length"]


@pytest.mark.asyncio
async def test_chain_endpoint_unknown_matter_404(client) -> None:
    await _signup_and_login(client, "chain-404@example.com")
    resp = await client.get("/api/matters/this-slug-does-not-exist/audit/chain")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_chain_endpoint_requires_auth(client) -> None:
    resp = await client.get(f"/api/matters/{KHAN_SLUG}/audit/chain")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_chain_endpoint_detects_tampered_chain_hash(
    client, db_connection: AsyncConnection
) -> None:
    await _signup_and_login(client, "chain-tamper@example.com")

    matter_id = await db_connection.scalar(
        text("SELECT id FROM matters WHERE slug = :slug"),
        {"slug": KHAN_SLUG},
    )
    assert matter_id is not None

    # Corrupt the newest matter-scope link. WORM forbids UPDATE, so
    # drop the guard inside this (rolled-back) transaction only.
    await db_connection.execute(
        text("ALTER TABLE audit_chain DISABLE TRIGGER enforce_audit_chain_worm")
    )
    updated = await db_connection.execute(
        text(
            """
            UPDATE audit_chain
               SET chain_hash = repeat('0', 64)
             WHERE id = (
                SELECT id FROM audit_chain
                 WHERE matter_id = :mid
                 ORDER BY scope_sequence DESC
                 LIMIT 1
             )
            """
        ),
        {"mid": str(matter_id)},
    )
    assert updated.rowcount == 1
    await db_connection.execute(
        text("ALTER TABLE audit_chain ENABLE TRIGGER enforce_audit_chain_worm")
    )

    resp = await client.get(f"/api/matters/{KHAN_SLUG}/audit/chain")
    assert resp.status_code == 200, resp.text

    body = resp.json()
    assert body["verified"] is False
    assert body["issues"], "tampered chain must surface issues"
    codes = {issue["code"] for issue in body["issues"]}
    assert "chain_hash_mismatch" in codes
    # Head reports the (corrupted) stored value — the endpoint never
    # invents a clean head over a broken chain.
    assert body["head"]["chain_hash"] == "0" * 64
