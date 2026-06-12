"""Gate 4 — demand capture at signup.

Two layers:

1. Unit — domain classifier + allowlist normalisers (no DB).
2. HTTP E2E — /auth/register stores persona / channel / derived domain
   fields, drops invalid values without failing the signup, and ignores
   client attempts to set the server-derived fields.
"""

from __future__ import annotations

import pytest
from sqlalchemy import select

from app.core.demand_capture import (
    DOMAIN_CLASS_FIRM,
    DOMAIN_CLASS_GENERIC,
    classify_email_domain,
    normalise_channel,
    normalise_persona,
)
from app.models import User


# ---------------------------------------------------------------------------
# Layer 1 — unit (no DB)
# ---------------------------------------------------------------------------


def test_generic_provider_classified_generic() -> None:
    assert classify_email_domain("jane@gmail.com") == ("gmail.com", DOMAIN_CLASS_GENERIC)
    assert classify_email_domain("J@Outlook.com") == ("outlook.com", DOMAIN_CLASS_GENERIC)


def test_firm_domain_classified_firm_like() -> None:
    assert classify_email_domain("partner@smithlaw.co.uk") == (
        "smithlaw.co.uk",
        DOMAIN_CLASS_FIRM,
    )


def test_malformed_email_classifies_to_none() -> None:
    assert classify_email_domain("not-an-email") == (None, None)
    assert classify_email_domain("") == (None, None)
    assert classify_email_domain("trailing@") == (None, None)


def test_persona_allowlist() -> None:
    assert normalise_persona("practising_solicitor") == "practising_solicitor"
    assert normalise_persona(" Engineer ") == "engineer"
    assert normalise_persona("growth_hacker") is None
    assert normalise_persona(None) is None
    assert normalise_persona("") is None


def test_channel_allowlist() -> None:
    assert normalise_channel("hn") == "hn"
    assert normalise_channel("LI") == "li"
    assert normalise_channel("tiktok") is None
    assert normalise_channel(None) is None


# ---------------------------------------------------------------------------
# Layer 2 — HTTP E2E (DB-backed; see conftest.py)
# ---------------------------------------------------------------------------

PASSWORD = "demand-capture-2026"


async def _user_row(db_session, email: str) -> User:
    user = await db_session.scalar(select(User).where(User.email == email))
    assert user is not None
    return user


@pytest.mark.asyncio
async def test_register_stores_persona_channel_and_derived_domain(
    client, db_session
) -> None:
    email = "capture-full@chancerylane-llp.co.uk"
    resp = await client.post(
        "/auth/register",
        json={
            "email": email,
            "password": PASSWORD,
            "persona": "practising_solicitor",
            "channel": "hn",
        },
    )
    assert resp.status_code == 201, resp.text

    user = await _user_row(db_session, email)
    assert user.persona == "practising_solicitor"
    assert user.signup_channel == "hn"
    assert user.email_domain == "chancerylane-llp.co.uk"
    assert user.domain_class == DOMAIN_CLASS_FIRM


@pytest.mark.asyncio
async def test_register_generic_mailbox_classified_generic(client, db_session) -> None:
    email = "capture-generic@gmail.com"
    resp = await client.post(
        "/auth/register", json={"email": email, "password": PASSWORD}
    )
    assert resp.status_code == 201, resp.text

    user = await _user_row(db_session, email)
    assert user.email_domain == "gmail.com"
    assert user.domain_class == DOMAIN_CLASS_GENERIC


@pytest.mark.asyncio
async def test_register_without_capture_fields_stores_nulls(client, db_session) -> None:
    """The fields are optional — a bare register stays exactly as before."""
    email = "capture-bare@example.com"
    resp = await client.post(
        "/auth/register", json={"email": email, "password": PASSWORD}
    )
    assert resp.status_code == 201, resp.text

    user = await _user_row(db_session, email)
    assert user.persona is None
    assert user.signup_channel is None


@pytest.mark.asyncio
async def test_register_invalid_capture_values_dropped_not_fatal(
    client, db_session
) -> None:
    """Junk persona/channel must not block the signup — normalised to None."""
    email = "capture-junk@example.com"
    resp = await client.post(
        "/auth/register",
        json={
            "email": email,
            "password": PASSWORD,
            "persona": "definitely-not-a-persona",
            "channel": "carrier-pigeon",
        },
    )
    assert resp.status_code == 201, resp.text

    user = await _user_row(db_session, email)
    assert user.persona is None
    assert user.signup_channel is None


@pytest.mark.asyncio
async def test_register_cannot_spoof_derived_domain_fields(client, db_session) -> None:
    """email_domain / domain_class are server-derived; payload values are
    ignored by the schema."""
    email = "capture-spoof@gmail.com"
    resp = await client.post(
        "/auth/register",
        json={
            "email": email,
            "password": PASSWORD,
            "email_domain": "magic-circle-llp.com",
            "domain_class": DOMAIN_CLASS_FIRM,
        },
    )
    assert resp.status_code == 201, resp.text

    user = await _user_row(db_session, email)
    assert user.email_domain == "gmail.com"
    assert user.domain_class == DOMAIN_CLASS_GENERIC
