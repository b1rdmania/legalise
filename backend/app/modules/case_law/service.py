"""Case-law search service — invokes the `find-case-law` skill via the plugin
bridge and parses the markdown table the skill renders into structured cards.

Design call (per PHASE_C_DELTA.md): skill-bridge, not a direct model call.
The skill output is model-fabricated for v0.1; the UI surfaces a verify-on-
caselaw.nationalarchives banner. v0.2 swaps the transport for MCP-backed
real Find Case Law hits — the Python shape stays stable.

Parsing strategy: small in-file markdown-table parser (~30 LoC). The skill
emits a fixed-shape table — `| # | Neutral citation | Date | Court | Parties
| Link |` — but the model is prone to rearranging headers, inserting extra
columns, or dropping the leading index column. We index by header name where
possible, fall back to positional reads, and drop malformed rows. On hard
parse failure we still return a CaseLawSearchResponse with empty results and
a 500-char raw excerpt so the UI can render something diagnostic.
"""

from __future__ import annotations

import re
import uuid

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.adapters import plugin_bridge as plugin_bridge_module
from app.core.api import audit

from .schemas import CaseLawResult, CaseLawSearchResponse

logger = structlog.get_logger()


# Hard cap on results returned — the skill says "up to 10". Anything over this
# is dropped and `truncated` flips true.
MAX_RESULTS = 10

# `[label](url)` extractor. Greedy on the label up to the first `]`, then a
# parenthesised URL with no closing paren inside.
_LINK_RE = re.compile(r"\[([^\]]*?)\]\(([^)]+)\)")

# Header alias map — collapses skill output variation onto canonical keys.
_HEADER_ALIASES: dict[str, str] = {
    "#": "index",
    "no": "index",
    "no.": "index",
    "neutral citation": "citation",
    "citation": "citation",
    "case": "case",
    "case name": "case",
    "parties": "parties",
    "date": "date",
    "judgment date": "date",
    "court": "court",
    "link": "link",
    "url": "link",
    "source": "link",
    "summary": "summary",
}


def _strip_cell(cell: str) -> str:
    return cell.strip().strip("`").strip()


def _split_row(line: str) -> list[str] | None:
    """Split a markdown-table row into cell strings. Returns None if the
    line is clearly not a table row (no leading pipe, etc.)."""
    s = line.strip()
    if not s.startswith("|"):
        return None
    # Strip the outer pipes so split doesn't produce phantom empties at the
    # ends. `| a | b |` → `a | b`.
    inner = s.strip("|")
    return [_strip_cell(c) for c in inner.split("|")]


def _is_separator_row(cells: list[str]) -> bool:
    """The `|---|---|...|` row immediately under the header."""
    return all(c == "" or set(c) <= set("-:") for c in cells)


def _extract_link(cell: str) -> tuple[str | None, str | None]:
    """From a cell like `[Smith v Jones](https://...)`, return (label, url).
    If no markdown link, return (cell or None, None)."""
    m = _LINK_RE.search(cell)
    if m:
        label = m.group(1).strip() or None
        url = m.group(2).strip() or None
        return label, url
    return (cell or None, None)


def _parse_markdown_table(text: str) -> list[CaseLawResult]:
    """Walk the response text, find the first markdown table whose header
    contains a recognised case-law column, and pull rows until the table
    breaks. Returns up to MAX_RESULTS structured rows."""
    lines = text.splitlines()
    results: list[CaseLawResult] = []

    i = 0
    while i < len(lines):
        cells = _split_row(lines[i])
        if cells is None or len(cells) < 2:
            i += 1
            continue

        # Header candidate?
        header_keys = [_HEADER_ALIASES.get(c.lower().strip()) for c in cells]
        if "citation" not in header_keys and "case" not in header_keys:
            i += 1
            continue

        # Separator row must follow.
        if i + 1 >= len(lines):
            break
        sep_cells = _split_row(lines[i + 1])
        if sep_cells is None or not _is_separator_row(sep_cells):
            i += 1
            continue

        # Walk data rows.
        i += 2
        while i < len(lines):
            row_cells = _split_row(lines[i])
            if row_cells is None:
                break
            if len(row_cells) != len(header_keys):
                # Tolerate drift if it's just an extra trailing empty cell.
                if len(row_cells) == len(header_keys) + 1 and row_cells[-1] == "":
                    row_cells = row_cells[:-1]
                else:
                    i += 1
                    continue

            row_map: dict[str, str] = {}
            for key, val in zip(header_keys, row_cells):
                if key is None:
                    continue
                row_map[key] = val

            citation_ref = row_map.get("citation", "")
            case_label = row_map.get("case", "") or row_map.get("parties", "")
            link_cell = row_map.get("link", "")
            parties_cell = row_map.get("parties", "")

            # If the case cell has a markdown link, prefer its label/url; the
            # `Link` column on its own often holds the url alone.
            case_label_clean, case_url = _extract_link(case_label) if case_label else (None, None)
            _, link_url = _extract_link(link_cell) if link_cell else (None, None)
            source_url = case_url or link_url

            # Citation refs sometimes arrive wrapped in a markdown link too.
            cit_label, cit_url = _extract_link(citation_ref) if citation_ref else (None, None)
            citation_ref_clean = cit_label or citation_ref
            source_url = source_url or cit_url

            parties_clean = parties_cell or None
            case_name = case_label_clean or parties_clean or citation_ref_clean

            if not case_name and not citation_ref_clean:
                i += 1
                continue

            results.append(
                CaseLawResult(
                    case_name=(case_name or "(unnamed)").strip(),
                    citation_ref=(citation_ref_clean or "").strip(),
                    court=(row_map.get("court") or None),
                    judgment_date=(row_map.get("date") or None),
                    parties=parties_clean,
                    summary=(row_map.get("summary") or None),
                    source_url=source_url,
                    relevance_score=None,
                )
            )
            if len(results) >= MAX_RESULTS:
                return results
            i += 1
        return results

    return results


async def search(
    *,
    session: AsyncSession,
    matter_id: uuid.UUID,
    actor_id: uuid.UUID | None,
    query: str,
    court: str | None = None,
    year: int | None = None,
) -> CaseLawSearchResponse:
    """Invoke `find-case-law` via the plugin bridge, parse, audit, return."""
    bridge = plugin_bridge_module.bridge
    if bridge is None:
        raise RuntimeError("plugin bridge not initialised")

    inputs: dict[str, str] = {
        "query": query,
        "court": court or "",
        "year": str(year) if year else "",
    }

    result = await bridge.invoke(
        session=session,
        matter_id=matter_id,
        actor_id=actor_id,
        plugin="uk-research-legal",
        skill="find-case-law",
        inputs=inputs,
    )

    parsed: list[CaseLawResult]
    raw_excerpt: str | None = None
    try:
        parsed = _parse_markdown_table(result.response_text)
    except Exception as exc:  # pragma: no cover — defensive belt
        logger.warning("case_law.parse_failed", error=str(exc))
        parsed = []

    if not parsed:
        # No structured rows recovered — surface a diagnostic excerpt so the
        # UI can show "the model didn't return a table" rather than silence.
        raw_excerpt = (result.response_text or "")[:500] or None

    truncated = len(parsed) >= MAX_RESULTS

    await audit.log(
        session,
        "module.case_law.search",
        actor_id=actor_id,
        matter_id=matter_id,
        module="case_law",
        resource_type="case_law_search",
        resource_id=None,
        payload={
            "query": query,
            "court": court,
            "year": year,
            "result_count": len(parsed),
            "truncated": truncated,
        },
    )

    return CaseLawSearchResponse(
        query=query,
        results=parsed,
        truncated=truncated,
        raw_response_excerpt=raw_excerpt,
        model_used=result.model_used,
        latency_ms=result.latency_ms,
    )
