"""Chronology route coverage.

Two layers:

1. **Module-binding smoke** (sync). Catches the NameError regression
   from `08f0f0b` (AuditEntry referenced but not imported) without
   needing DB infra.
2. **HTTP E2E** (async, DB). Register a user, dev-autoverify seeds
   Khan, GET chronology, assert 200 + 7 events + gate state shape.

Run the E2E layer inside the backend container per conftest.py.
"""

from __future__ import annotations

import asyncio

import pytest


# ---------------------------------------------------------------------------
# Layer 1 — module-level smoke (no DB)
# ---------------------------------------------------------------------------


def test_chronology_router_binds_audit_entry() -> None:
    from app.modules.chronology import router

    assert hasattr(router, "AuditEntry"), (
        "AuditEntry not in scope in chronology.router. _gate_state will "
        "NameError on any matter with at least one disclosure-tainted "
        "chronology event."
    )


def test_gate_state_zero_tainted_path_runs_clean() -> None:
    from app.modules.chronology.router import GateState, _gate_state

    class _Session:
        async def scalar(self, *args, **kwargs):  # noqa: ARG002
            return None

    class _Matter:
        id = "00000000-0000-0000-0000-000000000000"

    class _Actor:
        id = "00000000-0000-0000-0000-000000000000"

    result = asyncio.run(_gate_state(_Session(), _Matter(), _Actor(), tainted_count=0))
    assert isinstance(result, GateState)
    assert result.required is False
    assert result.confirmed is False
    assert result.tainted_event_count == 0


# ---------------------------------------------------------------------------
# Layer 2 — HTTP E2E (DB-backed)
# ---------------------------------------------------------------------------


TEST_EMAIL = "chron-e2e@example.com"
TEST_PASSWORD = "chron-e2e-password-2026"
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
async def test_chronology_get_returns_200_with_seven_khan_events(client) -> None:
    """The bug at 08f0f0b 500'd this route on the tainted-event path.

    Khan has one disclosure-tainted event (the dismissal letter), so this
    test exercises the exact code path that NameError'd before the fix.
    """
    await _signup_and_login(client)

    resp = await client.get(f"/api/matters/{KHAN_SLUG}/chronology")
    assert resp.status_code == 200, resp.text

    body = resp.json()
    assert "events" in body
    assert len(body["events"]) == 7

    # The SoF variant strips priv_flag entries. Khan has none on the
    # seed, so all 7 events round-trip into the SoF list.
    sof = body.get("statement_of_facts_variant")
    assert sof is not None
    assert len(sof) == 7


@pytest.mark.asyncio
async def test_chronology_gate_state_surfaces_one_tainted_event(client) -> None:
    """Khan's dismissal letter is from disclosure. The gate must reflect that.

    Pre-fix this query 500'd because `_gate_state` references
    `AuditEntry.timestamp` and the symbol was unbound.
    """
    await _signup_and_login(client)

    resp = await client.get(f"/api/matters/{KHAN_SLUG}/chronology")
    assert resp.status_code == 200

    gate = resp.json().get("gate", {})
    assert gate.get("required") is True
    assert gate.get("confirmed") is False
    assert gate.get("tainted_event_count") == 1


@pytest.mark.asyncio
async def test_chronology_unknown_matter_returns_404(client) -> None:
    await _signup_and_login(client)
    resp = await client.get("/api/matters/this-slug-does-not-exist/chronology")
    assert resp.status_code == 404
