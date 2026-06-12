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
async def test_draft_prompt_only_validates_as_prompt_runtime() -> None:
    # Prompt Runtime v1: a prompt-only SKILL.md maps honestly to the
    # first-class `prompt` runtime — instructions inline, no fabricated
    # native/mcp fields — and validates against the existing validator.
    res = await lwv.build_draft("contract-review-anthropic")
    assert res is not None
    assert res["valid"] is True, res["errors"]
    assert res["manifest"]["runtime"] == "prompt"
    entry = res["manifest"]["entrypoint"]
    assert entry["prompt_source"] == "manifest"
    # Instructions are the SKILL.md body, frontmatter stripped.
    assert "Review the contract clause by clause." in entry["instructions"]
    assert "---" not in entry["instructions"]
    # No leftover runtime-decision warning on the happy path.
    codes = {w["code"] for w in res["warnings"]}
    assert "needs_runtime_decision" not in codes
    # Conservative capability defaults + top-level provenance.
    caps = res["manifest"]["capabilities"]
    cap = caps[0]
    assert cap["reads"] == ["document.body.read"]
    assert cap["advice_tier_max"] == "draft_advice"
    # A prompt runtime always calls the model — declared honestly as
    # required, satisfied by the internal provider capability (mirrors the
    # first-party module pattern, keeps direct provider invocation blocked).
    assert cap["model_access"] == "required"
    assert any(c["kind"] == "provider" for c in caps)
    assert res["manifest"]["license"] == "Apache-2.0"
    assert res["manifest"]["source_url"].endswith(
        "/tree/abc123sha/skills/contract-review-anthropic"
    )
    assert res["source_provenance"]["ref"] == "abc123sha"


@pytest.mark.asyncio
async def test_draft_native_override_still_validates() -> None:
    # The human can still override to a native runtime + entrypoint; the
    # SAME draft validates against the existing validator.
    res = await lwv.build_draft(
        "contract-review-anthropic",
        {
            "runtime": "native",
            "entrypoint": {"entry": "X", "python_module": "examples.x"},
        },
    )
    assert res is not None
    assert res["valid"] is True, res["errors"]
    assert res["manifest"]["runtime"] == "native"


@pytest.mark.asyncio
async def test_warnings_license_and_scripts() -> None:
    agpl = await lwv.build_draft("agpl-skill")
    assert any(w["code"] == "license_review" for w in agpl["warnings"])

    scripted = await lwv.build_draft("office-processor")
    assert any(w["code"] == "script_review" for w in scripted["warnings"])


# ---------------------------------------------------------------------------
# Frontmatter parser (pure, fixture text)
# ---------------------------------------------------------------------------


def test_parse_frontmatter_full_vocabulary() -> None:
    # The real catalogue vocabulary (surveyed across all 42 skills):
    # name, description, metadata{author, license, version}. Nothing else.
    fm, body = lwv._parse_frontmatter(_SKILL_MD)
    assert fm["name"] == "contract-review-anthropic"
    assert fm["metadata"] == {
        "author": "Anthropic",
        "license": "Apache-2.0",
        "version": "2026.01.30",
    }
    assert body.startswith("# Contract Review Skill")


def test_parse_frontmatter_missing_returns_empty() -> None:
    text = "# No frontmatter here\nJust a body."
    fm, body = lwv._parse_frontmatter(text)
    assert fm == {}
    assert body == text


def test_parse_frontmatter_malformed_yaml_is_tolerated() -> None:
    text = "---\n: : not yaml [\n---\nbody"
    fm, body = lwv._parse_frontmatter(text)
    assert fm == {}
    assert body == "body"


@pytest.mark.asyncio
async def test_list_rows_carry_lawve_attribution_url() -> None:
    # Catalogue directory name == lawve.ai slug (verified against the
    # live sitemap), so every row links back to its directory page.
    res = await lwv.list_skills()
    by_slug = {r["slug"]: r for r in res["skills"]}
    assert (
        by_slug["contract-review-anthropic"]["lawve_url"]
        == "https://lawve.ai/en/skills/contract-review-anthropic"
    )
