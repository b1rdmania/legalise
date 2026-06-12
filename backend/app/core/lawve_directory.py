"""Lawve directory size — the honest gap strip.

lawve.ai is the catalogue of record for legal skills; the GitHub
marketplace repo we import from carries a subset. The shelf footer
states that gap plainly ("N skills on Lawve · M importable here
today"), so this module counts published skill pages on lawve.ai by
reading its public sitemap.

Design mirrors `lawve_import`:
- One fetch seam (`_fetch_sitemap`) so tests stub a single function.
- Pure parse helper (`count_skills_in_sitemap`) unit-tested offline.
- Small in-process TTL cache (1 hour — the directory moves slowly).
- An identified User-Agent, so Lawve can see who is reading and why.
- Failure raises `LawveSourceError`; callers degrade silently.
"""

from __future__ import annotations

import re
import time

import httpx

from app.core.lawve_import import LawveSourceError

LAWVE_SITEMAP_URL = "https://lawve.ai/sitemap.xml"
LAWVE_SKILLS_URL = "https://lawve.ai/en/skills"
_USER_AGENT = "legalise.dev catalogue (github.com/b1rdmania/legalise)"

_TTL_SECONDS = 3600.0
_cache: tuple[float, int] | None = None

# A skill detail page: /en/skills/{slug}. The bare /en/skills index and
# deeper paths (none exist today) are excluded; slugs are deduplicated.
_SKILL_LOC = re.compile(r"<loc>\s*https://lawve\.ai/en/skills/([^<\s/]+)\s*</loc>")


def count_skills_in_sitemap(xml_text: str) -> int:
    """Count distinct /en/skills/{slug} detail pages in a sitemap body."""
    return len({m.group(1) for m in _SKILL_LOC.finditer(xml_text)})


async def _fetch_sitemap() -> str:
    """GET the lawve.ai sitemap. The single seam tests stub."""
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                LAWVE_SITEMAP_URL, headers={"User-Agent": _USER_AGENT}
            )
    except httpx.HTTPError as exc:
        raise LawveSourceError(f"fetch failed: {LAWVE_SITEMAP_URL}: {exc}") from exc
    if resp.status_code >= 400:
        raise LawveSourceError(f"lawve.ai {resp.status_code} for {LAWVE_SITEMAP_URL}")
    return resp.text


async def directory_count() -> int:
    """Distinct published skills on lawve.ai, cached for an hour."""
    global _cache
    now = time.monotonic()
    if _cache is not None and (now - _cache[0]) < _TTL_SECONDS:
        return _cache[1]
    count = count_skills_in_sitemap(await _fetch_sitemap())
    _cache = (now, count)
    return count
