"""Claude fallback prompt + tolerant JSON parser.

Triggered only on the auto path when Presidio returns < 3 entities for
documents > 1KB. The model is asked to return a strict JSON envelope
listing the spans it found; the parser is lenient about markdown
fences and stray prose so a noisy response still produces *some*
structured output.
"""

from __future__ import annotations

from typing import Any

from app.core.structured_output import StructuredOutputError, parse_model_json
from app.modules.anonymisation.schemas import AnonymisationEnvelope

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


def parse_claude_envelope(raw: str) -> dict[str, Any]:
    """Validate the Claude fallback JSON envelope via the central helper.

    Always returns a dict shaped like the system prompt promises;
    `_spans_from_claude` re-validates each entry defensively before
    use. Unparseable responses yield the empty-envelope default,
    matching the previous tolerant behaviour.
    """
    try:
        envelope = parse_model_json(raw, AnonymisationEnvelope)
        return envelope.model_dump()
    except StructuredOutputError:
        return {"tokens": [], "spans": []}


__all__ = ["CLAUDE_ANON_SYSTEM_PROMPT", "parse_claude_envelope"]
