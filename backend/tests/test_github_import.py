"""GitHub Skill Importer — fetch + convert coverage.

Stubs the shared GitHub fetch seam (`lawve_import._github_get`, which
`github_import` calls through the module) so tests are deterministic +
offline. Mirrors the Lawve importer tests.
"""

from __future__ import annotations

import pytest

from app.core import github_import as ghi
from app.core import lawve_import as lwv

_SKILL_MD = """---
name: pre-motion
description: Adversarial premortem for UK litigation.
---

# Pre-Motion

Run the premortem.
"""

_LICENSE_APACHE = (
    "                                 Apache License\n"
    "                           Version 2.0, January 2004\n"
)

_TREE = {
    "tree": [
        {"path": "SKILL.md"},
        {"path": "README.md"},
        {"path": "LICENSE"},
    ]
}

_NESTED_TREE = {
    "tree": [
        {"path": "skills/sub-skill/SKILL.md"},
        {"path": "skills/sub-skill/scripts/run.py"},
        {"path": "LICENSE"},
    ]
}


@pytest.fixture(autouse=True)
def _stub_github(monkeypatch):
    lwv._CACHE.clear()

    async def _fake(url: str, *, as_json: bool):
        if url.endswith("/repos/owner/skill-repo"):
            return {"default_branch": "master"}
        if url.endswith("/repos/owner/empty-repo"):
            return {"default_branch": "main"}
        if url.endswith("/repos/owner/empty-repo/commits/main"):
            return {"sha": "0123456789ab"}
        if url.endswith("/repos/owner/skill-repo/commits/master"):
            return {"sha": "deadbeefcafe"}
        if url.endswith("/repos/owner/nested/commits/v1.2"):
            return {"sha": "feedface0000"}
        if "/repos/owner/skill-repo/git/trees/" in url:
            return _TREE
        if "/repos/owner/nested/git/trees/" in url:
            return _NESTED_TREE
        if url.endswith("/owner/skill-repo/deadbeefcafe/SKILL.md"):
            return _SKILL_MD
        if url.endswith("/owner/nested/feedface0000/skills/sub-skill/SKILL.md"):
            return _SKILL_MD
        if url.endswith("/owner/skill-repo/deadbeefcafe/LICENSE"):
            return _LICENSE_APACHE
        return None

    monkeypatch.setattr(lwv, "_github_get", _fake)


def test_parse_repo_url_shapes() -> None:
    assert ghi.parse_repo_url("https://github.com/owner/repo") == {
        "owner": "owner",
        "repo": "repo",
        "ref": None,
        "path": "",
    }
    assert ghi.parse_repo_url("owner/repo.git") == {
        "owner": "owner",
        "repo": "repo",
        "ref": None,
        "path": "",
    }
    parsed = ghi.parse_repo_url("https://github.com/owner/repo/tree/v1.2/skills/x")
    assert parsed["ref"] == "v1.2"
    assert parsed["path"] == "skills/x"
    with pytest.raises(ghi.GitHubSourceError):
        ghi.parse_repo_url("not a url at all !!")


@pytest.mark.asyncio
async def test_root_skill_md_pinned_and_licensed() -> None:
    detail = await ghi.get_remote_skill("https://github.com/owner/skill-repo")
    assert detail is not None
    assert detail["source"] == "github"
    assert detail["ref"] == "deadbeefcafe"  # pinned SHA, not branch name
    assert detail["name"] == "pre-motion"
    assert detail["license"] == "Apache-2.0"  # sniffed from LICENSE
    assert detail["has_scripts"] is False


@pytest.mark.asyncio
async def test_missing_skill_md_returns_none() -> None:
    detail = await ghi.get_remote_skill("https://github.com/owner/empty-repo")
    assert detail is None


@pytest.mark.asyncio
async def test_draft_validates_as_prompt_runtime() -> None:
    result = await ghi.build_github_draft("https://github.com/owner/skill-repo")
    assert result is not None
    assert result["valid"], result["errors"]
    m = result["manifest"]
    assert m["id"] == "github.owner.skill-repo"
    assert m["runtime"] == "prompt"
    assert m["entrypoint"]["prompt_source"] == "manifest"
    assert "Run the premortem." in m["entrypoint"]["instructions"]
    assert m["source_url"] == "https://github.com/owner/skill-repo/tree/deadbeefcafe"
    assert m["license"] == "Apache-2.0"
    assert [w["code"] for w in result["warnings"]] == []


@pytest.mark.asyncio
async def test_nested_path_with_ref_flags_scripts() -> None:
    result = await ghi.build_github_draft(
        "https://github.com/owner/nested/tree/v1.2/skills/sub-skill"
    )
    assert result is not None
    m = result["manifest"]
    assert m["id"] == "github.owner.nested.sub-skill"
    assert m["source_url"] == (
        "https://github.com/owner/nested/tree/feedface0000/skills/sub-skill"
    )
    codes = [w["code"] for w in result["warnings"]]
    assert "script_review" in codes  # scripts/ present, never executed
    assert "license_unknown" in codes  # nested dir has no LICENSE
