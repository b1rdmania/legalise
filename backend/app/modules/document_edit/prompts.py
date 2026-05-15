"""Mode→system-prompt registry for the edit-instruction surface.

Each mode has its own system prompt rather than a single template that
takes mode as a variable. Keeps wedge content (uk-jurisdiction-sweep)
distinct and lets us tune individual modes without affecting others.

The model is asked to return JSON matching `OUTPUT_SCHEMA`. Parsing is
done by `pipeline.parse_changes_envelope`. If a real provider supports
structured-output tools (Anthropic `tools` param), the gateway can later
attach OUTPUT_SCHEMA as a tool input_schema for stricter enforcement;
v0.1 relies on prompt-level instruction + tolerant parsing.
"""

from __future__ import annotations


EDIT_MODES = (
    "tighten",
    "rewrite",
    "summarise",
    "free-text",
    "uk-jurisdiction-sweep",
)


OUTPUT_SCHEMA: dict = {
    "type": "object",
    "required": ["changes", "model_notes"],
    "additionalProperties": False,
    "properties": {
        "changes": {
            "type": "array",
            "minItems": 0,
            "maxItems": 50,
            "items": {
                "type": "object",
                "required": ["change_id", "deleted_text", "inserted_text", "context_before", "context_after"],
                "properties": {
                    "change_id": {"type": "string", "pattern": "^c[0-9]{1,4}$"},
                    "deleted_text": {"type": "string"},
                    "inserted_text": {"type": "string"},
                    "context_before": {"type": "string", "maxLength": 200},
                    "context_after": {"type": "string", "maxLength": 200},
                    "rationale": {"type": "string", "maxLength": 500},
                },
            },
        },
        "model_notes": {"type": "string", "maxLength": 1000},
    },
}


_COMMON_INSTRUCTION = """You propose edits to a legal document. Return a single
JSON object matching this shape:

  {
    "changes": [
      {
        "change_id": "c1",
        "deleted_text": "...",
        "inserted_text": "...",
        "context_before": "<= 200 chars from BEFORE the deletion>",
        "context_after":  "<= 200 chars from AFTER the deletion>",
        "rationale": "<= 500 chars on why the change>"
      }
    ],
    "model_notes": "<= 1000 chars of overall narrative"
  }

Rules:
- Return JSON ONLY — no markdown fences, no prose around the object.
- `change_id` is `c1`, `c2`, ... in the order changes appear.
- `deleted_text` is the exact substring being removed; "" means pure insertion.
- `inserted_text` is the replacement; "" means pure deletion.
- `context_before`/`context_after` are short anchors that let a downstream
  editor locate the change in the source. Keep them short but unique enough
  to disambiguate.
- Propose 0–10 changes. Quality over quantity. If no change is warranted,
  return `"changes": []` and explain in `model_notes`.
"""


_TIGHTEN = _COMMON_INSTRUCTION + """
Mode: TIGHTEN. Shorten prose, remove hedges, eliminate ambiguous timing
language (e.g. "in due course", "as soon as practicable" where a specific
date is available). Preserve legal meaning exactly. Do not introduce new
factual claims.
"""

_REWRITE = _COMMON_INSTRUCTION + """
Mode: REWRITE. Rewrite the passage in clearer modern English while
preserving every legal effect. Maintain defined terms, parties, dates,
and citations. Do not summarise — output should be comparable in length
to the source unless the user instruction explicitly asks otherwise.
"""

_SUMMARISE = _COMMON_INSTRUCTION + """
Mode: SUMMARISE. Condense the document to at most 3 sentences as a single
inserted block at the start. Express this as one change with
`deleted_text=""` and `inserted_text` = the summary. Set `context_before=""`
and `context_after` = the first ~120 chars of the source so the summary
inserts above the document.
"""

_FREE_TEXT = _COMMON_INSTRUCTION + """
Mode: FREE-TEXT. The user instruction is authoritative — follow it literally
within the rules above. If the instruction is ambiguous, prefer the more
conservative interpretation (fewer, smaller edits).
"""

_UK_JURISDICTION_SWEEP = _COMMON_INSTRUCTION + """
Mode: UK-JURISDICTION-SWEEP. Audit the document for England & Wales
jurisdiction issues. Look for:
- Governing-law / jurisdiction clauses that are missing, ambiguous, or
  refer to Scotland / Northern Ireland / "United Kingdom" instead of
  "England and Wales".
- Statutory citations to Scottish or NI equivalents where E&W law applies
  (e.g. citing Sale of Goods Act 1979 vs Consumer Rights Act 2015 where
  the latter governs).
- For civil matters: missing CPR Part 36 framing where settlement
  language exists.
- For consumer contracts: missing UCTA 1977 / Consumer Rights Act 2015
  references where exclusion clauses appear.
- GDPR / UK GDPR / Data Protection Act 2018 references that mix EU and
  post-Brexit framing.
Each finding is a `change` proposing the corrected text. If the document
is already E&W-clean, return `"changes": []` with a positive note.
"""


_MODE_PROMPTS: dict[str, str] = {
    "tighten": _TIGHTEN,
    "rewrite": _REWRITE,
    "summarise": _SUMMARISE,
    "free-text": _FREE_TEXT,
    "uk-jurisdiction-sweep": _UK_JURISDICTION_SWEEP,
}


def mode_system_prompt(mode: str) -> str:
    """Return the system prompt for `mode`. Raises ValueError on unknown mode."""
    try:
        return _MODE_PROMPTS[mode]
    except KeyError as exc:
        raise ValueError(f"unknown edit mode: {mode!r}") from exc
