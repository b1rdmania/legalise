"""Lawve Skill Importer v1 — fetch + parse + convert.

Imports legal-AI skills from the open-web `lawve-ai/awesome-legal-skills`
repo and converts a chosen skill into a **governed Legalise module
draft** — never an installed module, never executed scripts.

Design:
- Single GitHub fetch boundary (`_github_get`) so tests stub one seam.
- Live fetch (no DB cache) with a small in-process TTL cache for the
  shared marketplace + tree reads; per-skill SKILL.md fetched on detail.
- The source commit SHA is pinned for provenance + reproducibility.
- Draft generation is a pure transform + validation via the existing
  `validate_manifest_v2`. No DB writes, no audit rows, no install.
"""

from __future__ import annotations

import time
from typing import Any

import httpx
import yaml

from app.core.config import settings
from app.core.registry.validator import validate_manifest_v2

LAWVE_REPO = "lawve-ai/awesome-legal-skills"
_RAW = "https://raw.githubusercontent.com"
_API = "https://api.github.com"
_MARKETPLACE_PATH = ".claude-plugin/marketplace.json"

# Conservative conversion defaults (Build Brief — human confirms before
# signing/install; we never widen these silently).
DEFAULT_CAPABILITY_ID = "run"
DEFAULT_READS = ["document.body.read"]
DEFAULT_WRITES = ["matter.artifact.write"]
DEFAULT_GATES = ["privilege_posture"]
DEFAULT_ADVICE_TIER_MAX = "draft_advice"
DEFAULT_AUDIT_EVENTS = [
    "module.capability.invoked",
    "model.invoked",
    "module.capability.completed",
    "posture_gate.check.blocked",
]

# Licences that need explicit review before conversion/install.
_REVIEW_LICENSES = {"AGPL-3.0", "AGPL-3.0-only", "AGPL-3.0-or-later"}


class LawveSourceError(Exception):
    """Upstream fetch/parse failure (GitHub unreachable, bad JSON, etc.)."""


# ---------------------------------------------------------------------------
# Fetch boundary (the single seam tests stub)
# ---------------------------------------------------------------------------


async def _github_get(url: str, *, as_json: bool) -> Any:
    """GET a GitHub URL (raw or API). Returns parsed JSON or text.

    Raises ``LawveSourceError`` on transport/HTTP failure. Uses the
    optional submission token for a higher rate limit when present.
    """
    headers = {"User-Agent": "legalise-lawve-importer"}
    token = settings.github_submission_token
    if token and url.startswith(_API):
        headers["Authorization"] = f"Bearer {token}"
        headers["Accept"] = "application/vnd.github+json"
        headers["X-GitHub-Api-Version"] = "2022-11-28"
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(url, headers=headers)
    except httpx.HTTPError as exc:
        raise LawveSourceError(f"fetch failed: {url}: {exc}") from exc
    if resp.status_code == 404:
        return None
    if resp.status_code >= 400:
        raise LawveSourceError(f"GitHub {resp.status_code} for {url}")
    return resp.json() if as_json else resp.text


# ---------------------------------------------------------------------------
# Small in-process TTL cache for the shared (ref + marketplace + tree) reads
# ---------------------------------------------------------------------------

_CACHE: dict[str, tuple[float, Any]] = {}
_TTL_SECONDS = 300.0


def _cache_get(key: str) -> Any | None:
    hit = _CACHE.get(key)
    if hit and (time.monotonic() - hit[0]) < _TTL_SECONDS:
        return hit[1]
    return None


def _cache_put(key: str, value: Any) -> None:
    _CACHE[key] = (time.monotonic(), value)


async def _resolve_ref() -> str:
    """Resolve + pin the current `main` commit SHA for provenance."""
    cached = _cache_get("ref")
    if cached:
        return cached
    data = await _github_get(f"{_API}/repos/{LAWVE_REPO}/commits/main", as_json=True)
    sha = (data or {}).get("sha") if isinstance(data, dict) else None
    ref = sha or "main"
    _cache_put("ref", ref)
    return ref


async def _marketplace(ref: str) -> dict:
    cached = _cache_get(f"mkt:{ref}")
    if cached:
        return cached
    data = await _github_get(f"{_RAW}/{LAWVE_REPO}/{ref}/{_MARKETPLACE_PATH}", as_json=True)
    if not isinstance(data, dict):
        raise LawveSourceError("marketplace.json missing or malformed")
    _cache_put(f"mkt:{ref}", data)
    return data


async def _tree_paths(ref: str) -> list[str]:
    cached = _cache_get(f"tree:{ref}")
    if cached is not None:
        return cached
    data = await _github_get(
        f"{_API}/repos/{LAWVE_REPO}/git/trees/{ref}?recursive=1", as_json=True
    )
    paths = [
        t["path"]
        for t in (data or {}).get("tree", [])
        if isinstance(t, dict) and "path" in t
    ]
    _cache_put(f"tree:{ref}", paths)
    return paths


# ---------------------------------------------------------------------------
# Parsing helpers
# ---------------------------------------------------------------------------


def _slug_of(plugin: dict) -> str:
    src = str(plugin.get("source", ""))
    if src:
        return src.rstrip("/").split("/")[-1]
    return str(plugin.get("name", ""))


def _parse_frontmatter(skill_md: str) -> tuple[dict, str]:
    """Split a SKILL.md into (frontmatter dict, body). Tolerant of a
    missing/!YAML frontmatter — returns ({}, full text) then."""
    if skill_md.startswith("---"):
        parts = skill_md.split("---", 2)
        if len(parts) == 3:
            try:
                fm = yaml.safe_load(parts[1]) or {}
            except yaml.YAMLError:
                fm = {}
            if isinstance(fm, dict):
                return fm, parts[2].lstrip("\n")
    return {}, skill_md


def _skill_dir(slug: str) -> str:
    return f"skills/{slug}"


def _flags_for(slug: str, paths: list[str]) -> dict[str, bool]:
    prefix = f"{_skill_dir(slug)}/"
    has_refs = any(p.startswith(prefix + "references/") for p in paths)
    has_scripts = any(p.startswith(prefix + "scripts/") for p in paths)
    return {
        "has_references": has_refs,
        "has_scripts": has_scripts,
        "script_review_required": has_scripts,
    }


def _row(plugin: dict, slug: str, ref: str, flags: dict[str, bool]) -> dict:
    author = plugin.get("author") or {}
    return {
        "source": "lawve",
        "repo": LAWVE_REPO,
        "ref": ref,
        "slug": slug,
        "name": plugin.get("name") or slug,
        "description": plugin.get("description") or "",
        "version": plugin.get("version"),
        "author_name": author.get("name") if isinstance(author, dict) else None,
        "license": plugin.get("license"),
        "source_path": plugin.get("source"),
        **flags,
    }


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


async def list_skills() -> dict:
    ref = await _resolve_ref()
    mkt = await _marketplace(ref)
    paths = await _tree_paths(ref)
    plugins = mkt.get("plugins") or []
    rows = []
    for p in plugins:
        if not isinstance(p, dict):
            continue
        slug = _slug_of(p)
        rows.append(_row(p, slug, ref, _flags_for(slug, paths)))
    return {"source": "lawve", "repo": LAWVE_REPO, "ref": ref, "skills": rows}


async def get_skill(slug: str) -> dict | None:
    ref = await _resolve_ref()
    mkt = await _marketplace(ref)
    plugins = mkt.get("plugins") or []
    plugin = next((p for p in plugins if isinstance(p, dict) and _slug_of(p) == slug), None)
    if plugin is None:
        return None
    paths = await _tree_paths(ref)
    flags = _flags_for(slug, paths)
    skill_md = await _github_get(
        f"{_RAW}/{LAWVE_REPO}/{ref}/{_skill_dir(slug)}/SKILL.md", as_json=False
    )
    frontmatter, body = _parse_frontmatter(skill_md or "")
    license_text = await _github_get(
        f"{_RAW}/{LAWVE_REPO}/{ref}/{_skill_dir(slug)}/LICENSE.txt", as_json=False
    )
    prefix = f"{_skill_dir(slug)}/"
    references = sorted(p for p in paths if p.startswith(prefix + "references/"))
    scripts = sorted(p for p in paths if p.startswith(prefix + "scripts/"))
    return {
        **_row(plugin, slug, ref, flags),
        "skill_markdown": skill_md or "",
        "frontmatter": frontmatter,
        "references": references,
        "scripts": scripts,
        "license_text": license_text,
        "provenance": {
            "repo_url": f"https://github.com/{LAWVE_REPO}",
            "ref": ref,
            "source_path": plugin.get("source"),
        },
    }


def _effective_license(plugin_license: Any, frontmatter: dict) -> str | None:
    if plugin_license:
        return str(plugin_license)
    meta = frontmatter.get("metadata") if isinstance(frontmatter, dict) else None
    if isinstance(meta, dict) and meta.get("license"):
        return str(meta["license"])
    return None


def _build_warnings(detail: dict) -> list[dict]:
    warnings: list[dict] = []
    lic = _effective_license(detail.get("license"), detail.get("frontmatter") or {})
    if lic is None:
        warnings.append({"code": "license_unknown", "message": "Licence could not be determined — review required before conversion/install."})
    elif lic in _REVIEW_LICENSES:
        warnings.append({"code": "license_review", "message": f"Licence {lic} is copyleft — review redistribution/use before install."})
    if detail.get("has_scripts"):
        warnings.append({"code": "script_review", "message": "This skill contains scripts — they are NOT imported or executed in v1; manual review required."})
    if detail.get("has_references"):
        warnings.append({"code": "references_present", "message": "References are included as source material for manual review, not as runtime code."})
    # Frontmatter vs marketplace consistency.
    fm = detail.get("frontmatter") or {}
    if isinstance(fm, dict):
        fm_name = fm.get("name")
        if fm_name and detail.get("name") and fm_name != detail.get("name"):
            warnings.append({"code": "provenance_mismatch", "message": "SKILL.md frontmatter name differs from marketplace metadata."})
    return warnings


def build_manifest_draft(detail: dict, overrides: dict | None = None) -> dict:
    """Pure transform: marketplace + SKILL.md + conservative defaults →
    a manifest-v2 draft. ``overrides`` are the human-confirmed mapping
    fields. No install, no persistence."""
    overrides = overrides or {}
    slug = detail["slug"]
    fm = detail.get("frontmatter") or {}
    meta = fm.get("metadata") if isinstance(fm, dict) else {}
    meta = meta if isinstance(meta, dict) else {}

    module_id = overrides.get("module_id") or f"lawve.{slug}"
    version = detail.get("version") or meta.get("version") or "0.0.0"
    publisher = detail.get("author_name") or meta.get("author") or "unknown"
    lic = _effective_license(detail.get("license"), fm)
    name = detail.get("name") or slug

    cap = overrides.get("capabilities") or {}
    capability_id = overrides.get("capability_id") or DEFAULT_CAPABILITY_ID
    audit_events = overrides.get("audit_events") or list(DEFAULT_AUDIT_EVENTS)

    # NB: the v2 schema forbids extra top-level keys (no `metadata`), so
    # import provenance/licence live in the draft *response* envelope
    # (source_provenance + warnings), not in the manifest itself.
    _ = lic  # surfaced via warnings/provenance, not the manifest
    manifest: dict[str, Any] = {
        "schema_version": "2.0.0",
        "id": module_id,
        "name": name,
        "version": str(version),
        "publisher": str(publisher),
        "visibility": "community",
        "capabilities": [
            {
                "id": capability_id,
                "kind": "skill",
                "scope": "matter",
                "reads": cap.get("reads") or list(DEFAULT_READS),
                "writes": cap.get("writes") or list(DEFAULT_WRITES),
                "model_access": cap.get("model_access") or "optional",
                "external_network": False,
                "data_movement": {"external_destinations": [], "local_only": True},
                "gates": cap.get("gates") or list(DEFAULT_GATES),
                "ui": {"slot": "matter.workflows", "label": name},
                "streaming_mode": "sync",
                "advice_tier_max": cap.get("advice_tier_max") or DEFAULT_ADVICE_TIER_MAX,
                "audit_events": audit_events,
            }
        ],
    }
    # runtime + entrypoint: the v2 schema only allows native|mcp, and an
    # MCP transport / native python_module. A prompt-only SKILL.md maps
    # to NEITHER honestly — fabricating one would be a dishonest field
    # (Build Brief forbids it; it's also an explicit stop condition). So
    # we only set them when the human supplies a real mapping via
    # overrides; otherwise they're omitted and the draft validates as
    # false with a `needs_runtime_decision` warning.
    if overrides.get("runtime"):
        manifest["runtime"] = overrides["runtime"]
    if overrides.get("entrypoint"):
        manifest["entrypoint"] = overrides["entrypoint"]
    return manifest


async def build_draft(slug: str, overrides: dict | None = None) -> dict | None:
    detail = await get_skill(slug)
    if detail is None:
        return None
    manifest = build_manifest_draft(detail, overrides)
    is_valid, errors = validate_manifest_v2(manifest)
    warnings = _build_warnings(detail)
    if "runtime" not in manifest or "entrypoint" not in manifest:
        warnings.append(
            {
                "code": "needs_runtime_decision",
                "message": (
                    "This is a prompt-only skill (SKILL.md instructions). The v2 "
                    "manifest schema only supports native/mcp runtimes, which a "
                    "prompt-only skill can't honestly claim — so the draft is "
                    "intentionally invalid until a runtime mapping is decided "
                    "(e.g. a 'prompt' runtime, or wrapping it in a native "
                    "prompt-runner). No runtime/entrypoint was fabricated."
                ),
            }
        )
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
