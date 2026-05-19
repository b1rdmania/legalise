"""Per-skill capability surfacing.

The bridge at `app/api/modules.py` resolves capabilities and trust
posture from the plugin's `module.json`. When the manifest carries a
top-level `skills.<slug>.capabilities` map, that wins over plugin-level
defaults for that skill. Skills absent from the map inherit the
plugin-level values.

This test isolates the bridge against a temp `plugins_root` so it does
not depend on the upstream `claude-for-uk-legal` SHA in CI.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

import pytest


SKILL_MD_TEMPLATE = """---
name: {name}
description: {description}
---

# /{name}
Body.
"""


def _write_skill(plugin_dir: Path, name: str, description: str) -> None:
    skill_dir = plugin_dir / "skills" / name
    skill_dir.mkdir(parents=True, exist_ok=True)
    (skill_dir / "SKILL.md").write_text(
        SKILL_MD_TEMPLATE.format(name=name, description=description),
        encoding="utf-8",
    )


def _write_manifest(plugin_dir: Path, payload: dict) -> None:
    (plugin_dir / "module.json").write_text(
        json.dumps(payload, indent=2), encoding="utf-8"
    )


@pytest.fixture
def isolated_plugins_root(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Point the modules API at a temp plugins root for the duration of one test.

    The bridge reads via `app.core.config.settings.plugins_root`. Override
    on the live settings object so the API resolves to our fixture tree.
    """
    from app.core.config import settings

    root = tmp_path / "plugins"
    root.mkdir()
    monkeypatch.setattr(settings, "plugins_root", str(root))
    return root


@pytest.mark.asyncio
async def test_per_skill_capabilities_override_plugin_defaults(
    client, isolated_plugins_root: Path
) -> None:
    """Plugin declares a union; one skill narrows the set via overrides."""
    plugin = isolated_plugins_root / "test-plugin"
    plugin.mkdir()
    _write_skill(plugin, "drafter", "Drafts something. Use when X.")
    _write_skill(plugin, "screener", "Screens a claim for viability.")
    _write_manifest(
        plugin,
        {
            "name": "test-plugin",
            "version": "0.1.0",
            "description": "Test plugin for per-skill capability surfacing.",
            "nav": {"label": "Test", "order": 99},
            "routes": {
                "backend_prefix": "/api/modules/test-plugin",
                "frontend_route": "/matters/$slug/test",
            },
            "capabilities": [
                "matter.read",
                "document.body.read",
                "document.generated.write",
                "model.invoke",
                "chronology.read",
            ],
            "trust_posture": "third_party",
            "skills": {
                "screener": {
                    "capabilities": [
                        "matter.read",
                        "document.body.read",
                        "model.invoke",
                        "chronology.read",
                    ],
                    "trust_posture": "trusted",
                }
            },
        },
    )

    # Auth required by /api/modules.
    await client.post(
        "/auth/register",
        json={"email": "modules-e2e@example.com", "password": "modules-e2e-pw-2026"},
    )
    await client.post(
        "/auth/login",
        data={"username": "modules-e2e@example.com", "password": "modules-e2e-pw-2026"},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )

    resp = await client.get("/api/modules")
    assert resp.status_code == 200, resp.text
    body = resp.json()

    assert body["broken"] == []
    by_skill = {s["skill"]: s for s in body["skills"]}
    assert set(by_skill) == {"drafter", "screener"}

    # `drafter` inherits the plugin-level union (5 caps) and trust posture.
    drafter = by_skill["drafter"]
    assert drafter["capabilities"] == [
        "matter.read",
        "document.body.read",
        "document.generated.write",
        "model.invoke",
        "chronology.read",
    ]
    assert drafter["trust_posture"] == "third_party"

    # `screener` overrides the union (no document.generated.write) and the
    # trust posture (third_party -> trusted).
    screener = by_skill["screener"]
    assert screener["capabilities"] == [
        "matter.read",
        "document.body.read",
        "model.invoke",
        "chronology.read",
    ]
    assert screener["trust_posture"] == "trusted"


@pytest.mark.asyncio
async def test_skills_map_missing_falls_back_to_plugin_level(
    client, isolated_plugins_root: Path
) -> None:
    """A manifest without `skills` still works. Plugin-level applies to all."""
    plugin = isolated_plugins_root / "thin-plugin"
    plugin.mkdir()
    _write_skill(plugin, "only-skill", "Does one thing.")
    _write_manifest(
        plugin,
        {
            "name": "thin-plugin",
            "version": "0.1.0",
            "description": "Thin manifest with no per-skill overrides.",
            "nav": {"label": "Thin", "order": 98},
            "routes": {
                "backend_prefix": "/api/modules/thin-plugin",
                "frontend_route": "/matters/$slug/thin",
            },
            "capabilities": ["matter.read", "chronology.read"],
            "trust_posture": "experimental",
        },
    )

    await client.post(
        "/auth/register",
        json={"email": "thin@example.com", "password": "thin-pw-2026"},
    )
    await client.post(
        "/auth/login",
        data={"username": "thin@example.com", "password": "thin-pw-2026"},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )

    resp = await client.get("/api/modules")
    assert resp.status_code == 200
    body = resp.json()

    assert body["broken"] == []
    only = body["skills"][0]
    assert only["skill"] == "only-skill"
    assert only["capabilities"] == ["matter.read", "chronology.read"]
    assert only["trust_posture"] == "experimental"
