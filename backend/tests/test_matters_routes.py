"""Matters API E2E coverage.

Read paths only. The seed runs in `on_after_register`, so a fresh signup
yields one Khan matter for the user with three documents and seven
chronology events.
"""

from __future__ import annotations

import pytest


TEST_EMAIL = "matters-e2e@example.com"
TEST_PASSWORD = "matters-e2e-password-2026"
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
async def test_list_matters_returns_seeded_khan_for_fresh_user(client) -> None:
    await _signup_and_login(client)

    resp = await client.get("/api/matters")
    assert resp.status_code == 200, resp.text

    body = resp.json()
    assert isinstance(body, list)
    assert len(body) == 1
    matter = body[0]
    assert matter["slug"] == KHAN_SLUG
    assert matter["title"] == "Khan v Acme Trading Ltd"
    assert matter["matter_type"] == "employment_tribunal"


@pytest.mark.asyncio
async def test_get_matter_by_slug_returns_full_detail(client) -> None:
    await _signup_and_login(client)

    resp = await client.get(f"/api/matters/{KHAN_SLUG}")
    assert resp.status_code == 200, resp.text

    body = resp.json()
    assert body["slug"] == KHAN_SLUG
    assert body["case_theory"], "case_theory should be populated on the seeded matter"
    assert isinstance(body["facts"], dict)
    # Khan seed sets several known facts keys. Check the structure not the values.
    assert body["facts"], "facts dict should be populated on the seeded matter"
    assert body["status"] == "open"


@pytest.mark.asyncio
async def test_get_matter_unknown_slug_returns_404(client) -> None:
    await _signup_and_login(client)
    resp = await client.get("/api/matters/this-slug-does-not-exist")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_create_matter_then_list_returns_two(client) -> None:
    await _signup_and_login(client)

    payload = {
        "title": "Smith v Test Corp",
        "matter_type": "employment_tribunal",
        "cause": "s.94 ERA 1996",
        "case_theory": "Pretextual dismissal.",
        "facts": {"claimant": "Smith"},
    }
    create = await client.post("/api/matters", json=payload)
    assert create.status_code == 201, create.text
    created = create.json()
    assert created["title"] == payload["title"]
    assert created["slug"].startswith("smith-v-test-corp")

    listing = await client.get("/api/matters")
    assert listing.status_code == 200
    slugs = {m["slug"] for m in listing.json()}
    assert KHAN_SLUG in slugs
    assert created["slug"] in slugs
    assert len(slugs) == 2
