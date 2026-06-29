"""Audit API E2E coverage.

The per-user Khan seed writes bootstrap audit rows under `module="seed"`
(1 matter + 3 docs + 7 events = 11 rows). Each row has `actor_id=None`
and `payload.kind == "seed"`. The route response model exposes those
fields, so we assert the shape end-to-end.
"""

from __future__ import annotations

import pytest


TEST_EMAIL = "audit-e2e@example.com"
TEST_PASSWORD = "audit-e2e-password-2026"
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
async def test_audit_returns_bootstrap_seed_rows_for_fresh_user(client) -> None:
    """Khan seed: 1 matter + 3 documents + 7 chronology events = 11 seed rows."""
    await _signup_and_login(client)

    resp = await client.get(f"/api/matters/{KHAN_SLUG}/audit?limit=200")
    assert resp.status_code == 200, resp.text

    body = resp.json()
    assert isinstance(body, list)

    seed_rows = [row for row in body if row.get("module") == "seed"]
    assert len(seed_rows) == 11, (
        f"expected 11 seed rows (1 matter + 3 docs + 7 events), got {len(seed_rows)}"
    )

    actions = {row["action"] for row in seed_rows}
    assert actions == {
        "seed.matter.created",
        "seed.document.ingested",
        "seed.chronology.ingested",
    }


@pytest.mark.asyncio
async def test_verify_endpoint_reports_intact_chain(client) -> None:
    """GET /audit/verify re-runs the hash chain for the matter scope and
    reports it intact, with matching audit/chain counts and no issues."""
    await _signup_and_login(client)

    resp = await client.get(f"/api/matters/{KHAN_SLUG}/audit/verify")
    assert resp.status_code == 200, resp.text

    body = resp.json()
    assert body["ok"] is True
    assert body["issues"] == []
    assert body["audit_entry_count"] > 0
    assert body["audit_entry_count"] == body["chain_entry_count"]
    assert body["scopes_verified"] >= 1


@pytest.mark.asyncio
async def test_verify_endpoint_404_for_unknown_matter(client) -> None:
    await _signup_and_login(client)
    resp = await client.get("/api/matters/no-such-matter/audit/verify")
    assert resp.status_code == 404, resp.text


@pytest.mark.asyncio
async def test_seed_audit_rows_are_system_actor_with_seed_payload(client) -> None:
    await _signup_and_login(client)

    resp = await client.get(f"/api/matters/{KHAN_SLUG}/audit?limit=200")
    assert resp.status_code == 200

    seed_rows = [row for row in resp.json() if row.get("module") == "seed"]
    assert seed_rows, "no seed rows surfaced on the audit endpoint"
    for row in seed_rows:
        assert row["actor_id"] is None, (
            f"row {row['action']!r} has actor_id={row['actor_id']}; "
            "seed rows must be system-actor (null)"
        )
        assert row["payload"].get("kind") == "seed"
        assert row["payload"].get("actor") == "system.bootstrap"


@pytest.mark.asyncio
async def test_audit_unknown_matter_returns_404(client) -> None:
    await _signup_and_login(client)
    resp = await client.get("/api/matters/this-slug-does-not-exist/audit")
    assert resp.status_code == 404
