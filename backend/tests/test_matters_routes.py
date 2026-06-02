"""Matters API E2E coverage.

Read paths only. The seed runs in `on_after_register`, so a fresh signup
yields one Khan matter for the user with three documents and seven
chronology events.
"""

from __future__ import annotations

from unittest.mock import patch

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
async def test_seeded_khan_has_v2_demo_skill_grants(client) -> None:
    await _signup_and_login(client)

    resp = await client.get(f"/api/matters/{KHAN_SLUG}/grants")
    assert resp.status_code == 200, resp.text

    grants = resp.json()["grants"]
    demo_grants = {
        (g["plugin"], g["skill"], g["capability"])
        for g in grants
        if g["plugin"] == "demo.guided-skill"
    }
    assert demo_grants == {
        ("demo.guided-skill", "summarise", "document.body.read"),
        ("demo.guided-skill", "summarise", "matter.artifact.write"),
    }


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


@pytest.mark.asyncio
async def test_invoke_returns_provider_key_missing_envelope(client) -> None:
    """A user with no Anthropic key invoking a keyed-model workflow must
    get the canonical 422 envelope `{error, provider, message}` so the
    frontend can render the inline "add a key in Settings" banner.

    Patches `bridge.invoke` to raise `ProviderKeyMissing("anthropic")`
    directly. That's the same exception `model_gateway.call()` raises
    when the user has no key and the dev fallback is not permitted, so
    asserting on the route's translation is the cleanest shape pin
    without dragging a real model call into the test.
    """
    await _signup_and_login(client)

    from unittest.mock import AsyncMock

    from app.adapters import plugin_bridge as plugin_bridge_module
    from app.core.user_keys import ProviderKeyMissing

    # The bridge is initialised in `main.lifespan`, which conftest does
    # not run. Stub the module attribute directly with an AsyncMock whose
    # `invoke` raises the exception we're pinning the envelope around.
    fake_bridge = AsyncMock()
    fake_bridge.invoke.side_effect = ProviderKeyMissing("anthropic")

    with patch.object(plugin_bridge_module, "bridge", fake_bridge):
        resp = await client.post(
            f"/api/matters/{KHAN_SLUG}/invoke",
            json={
                "plugin": "core-letters",
                "skill": "letter-before-action",
                "inputs": {},
            },
        )

    assert resp.status_code == 422, resp.text
    body = resp.json()
    # FastAPI wraps `HTTPException(detail=dict)` as `{"detail": {...}}`.
    detail = body["detail"]
    assert set(detail.keys()) == {"error", "provider", "message"}
    assert detail["error"] == "provider_key_missing"
    assert detail["provider"] == "anthropic"
    # Message is the exception's `str(exc)`. Pin substance, not full text,
    # so a future copy edit to ProviderKeyMissing's message doesn't break
    # this test. The frontend banner doesn't display this string; the
    # banner copy is built from `provider` alone.
    assert "anthropic" in detail["message"]
    assert "Settings" in detail["message"]
