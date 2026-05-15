"""Claude fallback prompt + tolerant JSON parser.

Triggered only on the auto path when Presidio returns < 3 entities for
documents > 1KB. The model is asked to return a strict JSON envelope
listing the spans it found; the parser is lenient about markdown
fences and stray prose so a noisy response still produces *some*
structured output.
"""

from __future__ import annotations

import json
import re
from typing import Any

CLAUDE_ANON_SYSTEM_PROMPT = """You are a UK legal-data anonymisation assistant.

You will be given the extracted text of a single document from an employment
or civil matter. Identify every personally identifying span and return them
in a JSON envelope. The downstream system will tokenise the spans into
labels like [PARTY_1] and store the mapping privately.

Entity types you may use (pick the best fit per span):
  PARTY        — any named natural person
  ORG          — companies, charities, employers, public bodies
  ADDRESS      — street addresses, postcodes, named premises
  DATE         — any specific date or date-time
  EMAIL        — email addresses
  PHONE        — UK or international phone numbers
  NI           — UK National Insurance numbers
  NHS          — UK NHS numbers
  AMOUNT       — monetary amounts (with currency symbol/word)

Return exactly one JSON object, no prose, no markdown fences:
{
  "tokens": [
    {"original": "Jasmine Khan", "entity_type": "PARTY"},
    {"original": "Acme Logistics Limited", "entity_type": "ORG"}
  ],
  "spans": [
    {"start": 234, "end": 246, "original": "Jasmine Khan"}
  ]
}

`spans.start` and `spans.end` are character offsets into the document body
text exactly as supplied. If you cannot compute reliable offsets, omit the
"spans" array and the system will fall back to literal string search.

Be precise: do not redact generic role nouns ("employer", "claimant") or
references to legislation (e.g. "Equality Act 2010"). Do redact specific
named clients, witnesses, employers, addresses, and case-number-like
identifiers.
"""


_JSON_OBJECT_RE = re.compile(r"\{.*\}", re.DOTALL)


def parse_claude_envelope(raw: str) -> dict[str, Any]:
    """Tolerant parse: strip fences, then fall back to first {...} block.

    Always returns a dict shaped like the system prompt promises, but
    callers should treat the fields as best-effort and validate them
    before using them.
    """
    text = (raw or "").strip()
    if text.startswith("```"):
        text = re.sub(r"^```[a-zA-Z]*\n", "", text)
        text = re.sub(r"\n```\s*$", "", text)
    try:
        obj = json.loads(text)
        if isinstance(obj, dict):
            return obj
    except json.JSONDecodeError:
        pass
    match = _JSON_OBJECT_RE.search(text)
    if match:
        try:
            obj = json.loads(match.group(0))
            if isinstance(obj, dict):
                return obj
        except json.JSONDecodeError:
            pass
    return {"tokens": [], "spans": []}


__all__ = ["CLAUDE_ANON_SYSTEM_PROMPT", "parse_claude_envelope"]
