"""Letters catalog E2E coverage.

The existing `test_letter_catalog.py` covers the in-process pipeline at
the catalog module level. This file is the HTTP-level coverage: a fresh
user with the seeded Khan ET matter should see the LBA letter type as
default in the catalogue response.
"""

from __future__ import annotations

import pytest


TEST_EMAIL = "letters-cat-e2e@example.com"
TEST_PASSWORD = "letters-cat-e2e-password-2026"
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
async def test_letters_catalog_returns_lba_default_for_khan(client) -> None:
    await _signup_and_login(client)

    resp = await client.get(f"/api/matters/{KHAN_SLUG}/letters/catalog")
    assert resp.status_code == 200, resp.text

    body = resp.json()
    assert body["matter_slug"] == KHAN_SLUG
    assert body["matter_type"] == "employment_tribunal"
    letter_types = body["letter_types"]
    assert isinstance(letter_types, list)
    assert letter_types, "expected at least the LBA entry for an ET matter"

    by_id = {lt["id"]: lt for lt in letter_types}
    assert "lba" in by_id, f"LBA missing from catalogue; got {list(by_id)}"
    lba = by_id["lba"]
    assert lba["is_default"] is True
    assert lba["plugin"] == "uk-employment-legal"
    assert lba["skill"] == "lba-drafter"


@pytest.mark.asyncio
async def test_letters_catalog_unknown_matter_returns_404(client) -> None:
    await _signup_and_login(client)
    resp = await client.get("/api/matters/this-slug-does-not-exist/letters/catalog")
    assert resp.status_code == 404
