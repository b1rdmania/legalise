"""Lawve Skill Importer v1 — service tests (stubbed GitHub).

Pure fetch+transform; no DB, no audit, no install. The single GitHub
seam (`_github_get`) is stubbed so tests are deterministic + offline.
"""

from __future__ import annotations

import json

import pytest

import app.core.lawve_import as lwv

_MARKETPLACE = {
    "name": "lawvable",
    "version": "1.0.0",
    "plugins": [
        {
            "name": "contract-review-anthropic",
            "description": "Review contracts against a playbook.",
            "version": "2026.01.30",
            "author": {"name": "Anthropic"},
            "license": "Apache-2.0",
            "source": "./skills/contract-review-anthropic",
        },
        {
            "name": "agpl-skill",
            "description": "A copyleft skill.",
            "version": "2025.12.01",
            "author": {"name": "Someone"},
            "license": "AGPL-3.0",
            "source": "./skills/agpl-skill",
        },
        {
            "name": "office-processor",
            "description": "Has scripts.",
            "version": "2026.02.01",
            "author": {"name": "Vendor"},
            # license intentionally omitted (fills from SKILL.md metadata)
            "source": "./skills/office-processor",
        },
    ],
}

_TREE = {
    "tree": [
        {"path": "skills/contract-review-anthropic/SKILL.md"},
        {"path": "skills/contract-review-anthropic/references/KEY_CLAUSES.md"},
        {"path": "skills/agpl-skill/SKILL.md"},
        {"path": "skills/office-processor/SKILL.md"},
        {"path": "skills/office-processor/scripts/run.py"},
    ]
}

_SKILL_MD = """---
name: contract-review-anthropic
description: Review contracts against a playbook.
metadata:
  author: Anthropic
  license: Apache-2.0
  version: 2026.01.30
---

# Contract Review Skill

Review the contract clause by clause.
"""


@pytest.fixture(autouse=True)
def _stub_github(monkeypatch):
    lwv._CACHE.clear()

    async def _fake(url: str, *, as_json: bool):
        if url.endswith("/commits/main"):
            return {"sha": "abc123sha"}
        if url.endswith("/.claude-plugin/marketplace.json"):
            return _MARKETPLACE
        if "/git/trees/" in url:
            return _TREE
        if url.endswith("/contract-review-anthropic/SKILL.md"):
            return _SKILL_MD
        if url.endswith("/office-processor/SKILL.md"):
            return "---\nname: office-processor\nmetadata:\n  license: Proprietary\n---\nbody"
        if url.endswith("/agpl-skill/SKILL.md"):
            return "---\nname: agpl-skill\n---\nbody"
        if url.endswith("/LICENSE.txt"):
            return "MIT-ish license text"
        return None

    monkeypatch.setattr(lwv, "_github_get", _fake)


@pytest.mark.asyncio
async def test_list_skills_parses_marketplace_and_flags() -> None:
    res = await lwv.list_skills()
    assert res["source"] == "lawve"
    assert res["ref"] == "abc123sha"
    by_slug = {r["slug"]: r for r in res["skills"]}
    assert set(by_slug) == {"contract-review-anthropic", "agpl-skill", "office-processor"}
    assert by_slug["contract-review-anthropic"]["has_references"] is True
    assert by_slug["contract-review-anthropic"]["has_scripts"] is False
    assert by_slug["office-processor"]["has_scripts"] is True
    assert by_slug["office-processor"]["script_review_required"] is True
    assert by_slug["contract-review-anthropic"]["license"] == "Apache-2.0"


@pytest.mark.asyncio
async def test_get_skill_parses_frontmatter_and_provenance() -> None:
    d = await lwv.get_skill("contract-review-anthropic")
    assert d is not None
    assert d["frontmatter"]["metadata"]["author"] == "Anthropic"
    assert d["skill_markdown"].startswith("---")
    assert d["references"] == ["skills/contract-review-anthropic/references/KEY_CLAUSES.md"]
    assert d["scripts"] == []
    assert d["provenance"]["ref"] == "abc123sha"
    assert d["provenance"]["repo_url"].endswith("lawve-ai/awesome-legal-skills")


@pytest.mark.asyncio
async def test_get_skill_unknown_returns_none() -> None:
    assert await lwv.get_skill("does-not-exist") is None


@pytest.mark.asyncio
async def test_draft_prompt_only_is_invalid_with_runtime_warning() -> None:
    # Honest stop-condition behaviour: a prompt-only skill has no honest
    # native/mcp runtime, so the draft omits runtime/entrypoint and is
    # invalid with a needs_runtime_decision warning — no fabricated fields.
    res = await lwv.build_draft("contract-review-anthropic")
    assert res is not None
    assert res["valid"] is False
    assert "runtime" not in res["manifest"]
    assert "entrypoint" not in res["manifest"]
    codes = {w["code"] for w in res["warnings"]}
    assert "needs_runtime_decision" in codes
    # Conservative defaults are present; provenance lives in the response
    # envelope (the v2 schema forbids extra top-level keys).
    cap = res["manifest"]["capabilities"][0]
    assert cap["reads"] == ["document.body.read"]
    assert cap["advice_tier_max"] == "draft_advice"
    assert "metadata" not in res["manifest"]
    assert res["source_provenance"]["ref"] == "abc123sha"


@pytest.mark.asyncio
async def test_draft_validates_once_a_runtime_is_supplied() -> None:
    # When the human supplies a real runtime + entrypoint, the SAME draft
    # validates against the existing validator — proving the path works
    # once the runtime-representation decision is made.
    res = await lwv.build_draft(
        "contract-review-anthropic",
        {
            "runtime": "native",
            "entrypoint": {"entry": "X", "python_module": "examples.x"},
        },
    )
    assert res is not None
    assert res["valid"] is True, res["errors"]


@pytest.mark.asyncio
async def test_warnings_license_and_scripts() -> None:
    agpl = await lwv.build_draft("agpl-skill")
    assert any(w["code"] == "license_review" for w in agpl["warnings"])

    scripted = await lwv.build_draft("office-processor")
    assert any(w["code"] == "script_review" for w in scripted["warnings"])
