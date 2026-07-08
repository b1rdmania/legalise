"""Provider-readiness hint — the matter payload carries required_provider.

Single source of truth: the matter's ``required_provider`` is computed by
the same ``provider_for_model`` the runtime gateway uses, so the frontend
reads it for run-readiness instead of re-deriving model families (which
can drift from the backend).
"""

from __future__ import annotations

import pytest

from app.models import Matter


def test_required_provider_property_matches_gateway() -> None:
    # Pure property — no DB. The mapping is the gateway's, not a copy.
    assert Matter(default_model_id="claude-opus-4-7").required_provider == "anthropic"
    assert Matter(default_model_id="gpt-4o").required_provider == "openai"
    assert (
        Matter(default_model_id="anthropic/claude-sonnet-5").required_provider
        == "openrouter"
    )
    assert Matter(default_model_id="openai/gpt-5").required_provider == "openrouter"
    assert Matter(default_model_id="stub-echo").required_provider is None
    assert Matter(default_model_id="ollama-local").required_provider is None


async def _signup_and_login(client) -> None:
    import uuid

    email = f"prh-{uuid.uuid4().hex[:8]}@example.com"
    await client.post("/auth/register", json={"email": email, "password": "prh-2026-pass"})
    await client.post(
        "/auth/login",
        data={"username": email, "password": "prh-2026-pass"},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )


@pytest.mark.asyncio
async def test_matter_payload_exposes_required_provider(client) -> None:
    await _signup_and_login(client)

    keyless = await client.post(
        "/api/matters",
        json={"title": "Keyless Demo", "default_model_id": "stub-echo"},
    )
    assert keyless.status_code == 201, keyless.text
    assert keyless.json()["required_provider"] is None

    anthropic = await client.post(
        "/api/matters",
        json={"title": "Needs Anthropic", "default_model_id": "claude-opus-4-7"},
    )
    assert anthropic.status_code == 201, anthropic.text
    assert anthropic.json()["required_provider"] == "anthropic"

    # And it survives a GET (flows through MatterRead).
    got = await client.get(f"/api/matters/{anthropic.json()['slug']}")
    assert got.status_code == 200
    assert got.json()["required_provider"] == "anthropic"
