"""GitHub Skill Importer v1 — drop in a skill from any public repo.

Same contract as the Lawve importer (`app.core.lawve_import`), pointed
at an arbitrary public GitHub repository instead of the Lawve catalogue:
fetch the SKILL.md, pin the commit SHA for provenance, and convert it
into a **governed Legalise module draft** — never an installed module,
never executed scripts. The draft still goes through the trust ceremony.

Accepted source shapes:
- ``https://github.com/owner/repo`` — SKILL.md at the repo root
- ``https://github.com/owner/repo/tree/<ref>/<path>`` — SKILL.md under
  ``<path>/`` at ``<ref>``
- bare ``owner/repo`` is also accepted

Reuses the Lawve importer's fetch boundary, frontmatter parser, draft
builder, and warning rules so the two sources cannot drift.
"""

from __future__ import annotations

import re

from app.core import lawve_import as _lwv
from app.core.lawve_import import (
    LawveSourceError,
    _API,
    _RAW,
    _build_warnings,
    _parse_frontmatter,
    build_manifest_draft,
)
from app.core.registry.validator import validate_manifest_v2

# Reuse the Lawve error type so API handlers treat both sources alike.
GitHubSourceError = LawveSourceError

_REPO_RE = re.compile(
    r"^(?:https?://github\.com/)?"
    r"(?P<owner>[A-Za-z0-9_.-]+)/(?P<repo>[A-Za-z0-9_.-]+?)(?:\.git)?"
    r"(?:/tree/(?P<ref>[^/]+)(?:/(?P<path>.+))?)?/?$"
)


def parse_repo_url(url: str) -> dict:
    """Parse a GitHub repo URL (or bare ``owner/repo``) into its parts.

    Raises ``GitHubSourceError`` on anything that does not look like a
    GitHub repository reference.
    """
    m = _REPO_RE.match(url.strip())
    if not m:
        raise GitHubSourceError(f"not a GitHub repository URL: {url!r}")
    return {
        "owner": m.group("owner"),
        "repo": m.group("repo"),
        "ref": m.group("ref"),
        "path": (m.group("path") or "").strip("/"),
    }


async def _resolve_ref(owner: str, repo: str, ref: str | None) -> str:
    """Pin the requested ref (or the default branch) to a commit SHA."""
    if ref is None:
        meta = await _lwv._github_get(f"{_API}/repos/{owner}/{repo}", as_json=True)
        if not isinstance(meta, dict):
            raise GitHubSourceError(f"repository not found: {owner}/{repo}")
        ref = meta.get("default_branch") or "main"
    data = await _lwv._github_get(f"{_API}/repos/{owner}/{repo}/commits/{ref}", as_json=True)
    sha = (data or {}).get("sha") if isinstance(data, dict) else None
    return sha or ref


async def _tree_paths(owner: str, repo: str, ref: str) -> list[str]:
    data = await _lwv._github_get(
        f"{_API}/repos/{owner}/{repo}/git/trees/{ref}?recursive=1", as_json=True
    )
    return [t["path"] for t in (data or {}).get("tree", []) if isinstance(t, dict) and "path" in t]


def _sniff_license(text: str | None) -> str | None:
    """Identify the common permissive licences from a LICENSE file's
    opening lines. Anything unrecognised stays None → the draft carries
    a license_unknown warning for human review."""
    if not text:
        return None
    head = text[:400].lower()
    if "apache license" in head and "version 2.0" in head:
        return "Apache-2.0"
    if "mit license" in head:
        return "MIT"
    if "bsd 3-clause" in head:
        return "BSD-3-Clause"
    if "mozilla public license" in head and "2.0" in head:
        return "MPL-2.0"
    return None


def _slug_for(repo: str, path: str) -> str:
    base = path.rstrip("/").split("/")[-1] if path else repo
    slug = re.sub(r"[^a-z0-9_.-]+", "-", base.lower()).strip("-.")
    return slug or "skill"


async def get_remote_skill(url: str) -> dict | None:
    """Fetch one skill from a public GitHub repo. Returns the same
    detail shape the Lawve importer produces, or None when no SKILL.md
    exists at the resolved location."""
    parts = parse_repo_url(url)
    owner, repo, path = parts["owner"], parts["repo"], parts["path"]
    ref = await _resolve_ref(owner, repo, parts["ref"])
    full = f"{owner}/{repo}"
    prefix = f"{path}/" if path else ""

    skill_md = await _lwv._github_get(f"{_RAW}/{full}/{ref}/{prefix}SKILL.md", as_json=False)
    if skill_md is None:
        return None
    frontmatter, _body = _parse_frontmatter(skill_md)

    paths = await _tree_paths(owner, repo, ref)
    scoped = [p for p in paths if p.startswith(prefix)] if prefix else paths
    has_refs = any(p.startswith(prefix + "references/") for p in scoped)
    has_scripts = any(p.startswith(prefix + "scripts/") for p in scoped)

    license_text = None
    for candidate in ("LICENSE.txt", "LICENSE", "LICENSE.md"):
        license_text = await _lwv._github_get(
            f"{_RAW}/{full}/{ref}/{prefix}{candidate}", as_json=False
        )
        if license_text is None and prefix:
            license_text = await _lwv._github_get(f"{_RAW}/{full}/{ref}/{candidate}", as_json=False)
        if license_text is not None:
            break

    slug = _slug_for(repo, path)
    license_id = _sniff_license(license_text)
    name = str(frontmatter.get("name") or slug)
    description = str(frontmatter.get("description") or "")
    meta = frontmatter.get("metadata") if isinstance(frontmatter, dict) else None
    meta = meta if isinstance(meta, dict) else {}

    return {
        "source": "github",
        "repo": full,
        "ref": ref,
        "slug": slug,
        "name": name,
        "description": description,
        "version": meta.get("version"),
        "author_name": meta.get("author") or owner,
        "license": meta.get("license") or license_id,
        "source_path": path or None,
        "has_references": has_refs,
        "has_scripts": has_scripts,
        "script_review_required": has_scripts,
        "skill_markdown": skill_md,
        "frontmatter": frontmatter,
        "references": sorted(p for p in scoped if p.startswith(prefix + "references/")),
        "scripts": sorted(p for p in scoped if p.startswith(prefix + "scripts/")),
        "license_text": license_text,
        "provenance": {
            "repo_url": f"https://github.com/{full}",
            "ref": ref,
            "source_path": path or None,
        },
    }


async def build_github_draft(url: str, overrides: dict | None = None) -> dict | None:
    """Fetch + convert in one step. Mirrors ``lawve_import.build_draft``."""
    detail = await get_remote_skill(url)
    if detail is None:
        return None
    overrides = dict(overrides or {})
    overrides.setdefault(
        "module_id",
        f"github.{detail['repo'].replace('/', '.').lower()}"
        + (f".{detail['slug']}" if detail.get("source_path") else ""),
    )
    manifest = build_manifest_draft(detail, overrides)
    # build_manifest_draft writes a Lawve source_url; repoint provenance.
    tree_path = f"/tree/{detail['ref']}" + (
        f"/{detail['source_path']}" if detail.get("source_path") else ""
    )
    manifest["source_url"] = f"https://github.com/{detail['repo']}{tree_path}"
    is_valid, errors = validate_manifest_v2(manifest)
    warnings = _build_warnings(detail)
    return {
        "manifest": manifest,
        "valid": is_valid,
        "errors": errors,
        "warnings": warnings,
        "source_provenance": detail.get("provenance"),
        "next_steps": [
            "Review the proposed permissions + audit events; edit if needed.",
            "A valid draft must be signed and installed through the trust ceremony — the importer never installs.",
            "Scripts (if any) are not imported or executed; review them manually at the source.",
        ],
    }
