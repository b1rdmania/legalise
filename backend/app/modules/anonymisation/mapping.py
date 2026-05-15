"""First-occurrence tokenisation + idempotent re-run support.

`tokenise` walks the analyser spans in document order, assigns each
unique original to a stable `[<PREFIX>_<n>]` token, and produces both
the redacted text and a JSON-safe mapping payload for persistence.

When an `existing_mapping` is supplied (re-run case), previously-seen
originals reuse their tokens; new originals continue numbering from
where each entity-type counter left off. That preserves the invariant
that token assignments never change for a given matter without an
explicit DELETE-then-rerun.
"""

from __future__ import annotations

from typing import Any, Iterable

from app.modules.anonymisation.presidio_engine import AnalysedSpan

# Presidio (and Claude fallback) entity type → token prefix. Anything
# not in this map falls back to "ENTITY" so the result is well-formed
# even when a recogniser fires with a novel type.
ENTITY_PREFIX_MAP: dict[str, str] = {
    "PERSON": "PARTY",
    "ORG": "ORG",
    "ORGANIZATION": "ORG",
    "LOCATION": "ADDRESS",
    "GPE": "ADDRESS",
    "DATE_TIME": "DATE",
    "DATE": "DATE",
    "EMAIL_ADDRESS": "EMAIL",
    "PHONE_NUMBER": "PHONE",
    "UK_NHS": "NHS",
    "UK_NINO": "NI",
    "MONEY": "AMOUNT",
}


def _prefix_for(entity_type: str) -> str:
    return ENTITY_PREFIX_MAP.get(entity_type.upper(), "ENTITY")


def _seed_counters(
    existing_mapping: dict | None,
) -> tuple[dict[str, int], dict[tuple[str, str], str]]:
    """Reconstruct per-prefix counters + (prefix, original) → token cache.

    Counter values are the next index to assign — i.e. one past the max
    suffix observed for that prefix.
    """
    counters: dict[str, int] = {}
    cache: dict[tuple[str, str], str] = {}
    if not existing_mapping or not isinstance(existing_mapping, dict):
        return counters, cache

    tokens = existing_mapping.get("tokens")
    if not isinstance(tokens, dict):
        return counters, cache

    for token, meta in tokens.items():
        if not isinstance(token, str) or not isinstance(meta, dict):
            continue
        prefix = _prefix_for(str(meta.get("entity_type", "")))
        # Token shape: [PREFIX_n].
        try:
            suffix = int(token.strip("[]").rsplit("_", 1)[-1])
        except (ValueError, IndexError):
            continue
        counters[prefix] = max(counters.get(prefix, 0), suffix + 1)
        original = str(meta.get("original", ""))
        if original:
            cache[(prefix, original)] = token

    return counters, cache


def tokenise(
    text: str,
    spans: Iterable[AnalysedSpan],
    *,
    existing_mapping: dict | None = None,
) -> tuple[str, dict[str, Any]]:
    """Replace each analyser span with a stable [PREFIX_n] token.

    Returns:
        redacted_text — the input with spans replaced.
        mapping       — JSON payload: {tokens: {...}, spans: [...]}
    """
    # The caller already supplies spans sorted right-to-left for safe
    # in-place replacement, but we re-sort defensively here so callers
    # that build span lists by hand (Claude fallback) don't have to.
    span_list = list(spans)
    if not span_list:
        return text, {"tokens": {}, "spans": []}

    # First pass: document-order to assign tokens (first occurrence wins).
    by_doc_order = sorted(span_list, key=lambda s: s.start)
    counters, cache = _seed_counters(existing_mapping)
    tokens_meta: dict[str, dict[str, Any]] = {}

    # Preserve any tokens already known to the cache so re-runs that lose
    # an entity (model returned fewer hits) still keep the historical row.
    if existing_mapping and isinstance(existing_mapping.get("tokens"), dict):
        for tok, meta in existing_mapping["tokens"].items():
            if isinstance(tok, str) and isinstance(meta, dict):
                tokens_meta[tok] = {
                    "entity_type": str(meta.get("entity_type", "")),
                    "original": str(meta.get("original", "")),
                    "occurrences": 0,  # reset; we recount below.
                }

    span_tokens: list[tuple[AnalysedSpan, str]] = []
    for span in by_doc_order:
        prefix = _prefix_for(span.entity_type)
        key = (prefix, span.original)
        token = cache.get(key)
        if token is None:
            idx = counters.get(prefix, 1)
            token = f"[{prefix}_{idx}]"
            counters[prefix] = idx + 1
            cache[key] = token
            tokens_meta[token] = {
                "entity_type": span.entity_type,
                "original": span.original,
                "occurrences": 0,
            }
        else:
            # First-seen-this-run bookkeeping in case the entity_type
            # differs from the persisted value (e.g. recogniser changed).
            tokens_meta.setdefault(
                token,
                {
                    "entity_type": span.entity_type,
                    "original": span.original,
                    "occurrences": 0,
                },
            )
        tokens_meta[token]["occurrences"] += 1
        span_tokens.append((span, token))

    # Second pass: right-to-left in-place replacement.
    span_tokens.sort(key=lambda pair: pair[0].start, reverse=True)
    chars = list(text)
    for span, token in span_tokens:
        chars[span.start : span.end] = list(token)
    redacted = "".join(chars)

    # `spans` records the *original* (pre-replacement) offsets so the UI
    # can highlight tokens back onto the source text if it ever needs to.
    spans_payload = [
        {
            "start": s.start,
            "end": s.end,
            "token": tok,
            "original": s.original,
            "entity_type": s.entity_type,
        }
        for s, tok in sorted(span_tokens, key=lambda pair: pair[0].start)
    ]
    return redacted, {"tokens": tokens_meta, "spans": spans_payload}


__all__ = ["tokenise", "ENTITY_PREFIX_MAP"]
