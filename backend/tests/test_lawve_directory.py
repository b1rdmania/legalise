"""Lawve directory count — sitemap parse + fetch seam tests (offline)."""

from __future__ import annotations

import pytest

import app.core.lawve_directory as lwd
from app.core.lawve_import import LawveSourceError

_SITEMAP = """<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>https://lawve.ai/en</loc></url>
<url><loc>https://lawve.ai/en/skills</loc></url>
<url><loc>https://lawve.ai/fr/skills</loc></url>
<url><loc>https://lawve.ai/en/skills/contract-review-anthropic</loc></url>
<url><loc>https://lawve.ai/en/skills/nda-review-jamie-tso</loc></url>
<url><loc>https://lawve.ai/en/skills/nda-review-jamie-tso</loc></url>
<url><loc>https://lawve.ai/fr/skills/contract-review-anthropic</loc></url>
<url><loc>https://lawve.ai/en/mcp-servers/some-server</loc></url>
</urlset>
"""


@pytest.fixture(autouse=True)
def _reset_cache():
    lwd._cache = None
    yield
    lwd._cache = None


def test_count_skills_counts_only_en_detail_pages_deduped() -> None:
    # /en/skills index, /fr/* mirrors, and mcp-server pages don't count;
    # the duplicated slug counts once.
    assert lwd.count_skills_in_sitemap(_SITEMAP) == 2


def test_count_skills_empty_sitemap_is_zero() -> None:
    assert lwd.count_skills_in_sitemap("<urlset></urlset>") == 0


@pytest.mark.asyncio
async def test_directory_count_caches_the_fetch(monkeypatch) -> None:
    calls = {"n": 0}

    async def _fake() -> str:
        calls["n"] += 1
        return _SITEMAP

    monkeypatch.setattr(lwd, "_fetch_sitemap", _fake)
    assert await lwd.directory_count() == 2
    assert await lwd.directory_count() == 2
    assert calls["n"] == 1  # second read served from the 1h TTL cache


@pytest.mark.asyncio
async def test_directory_count_propagates_source_error(monkeypatch) -> None:
    async def _boom() -> str:
        raise LawveSourceError("lawve.ai 503 for sitemap")

    monkeypatch.setattr(lwd, "_fetch_sitemap", _boom)
    with pytest.raises(LawveSourceError):
        await lwd.directory_count()
