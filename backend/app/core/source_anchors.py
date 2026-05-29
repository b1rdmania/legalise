"""Source Anchors v1 — the shared anchor contract + the one honest check.

A source anchor records *what an output cited*, without pretending the
citation proves the claim. v1 supports `document` anchors only.

Two honesty rules are enforced here, not in the model:

1. **Server-authoritative identity.** A model may say it used handle
   "D1"; only the server fills `document_id` / `filename` / `sha256` /
   `body_sha256` from the documents actually loaded for the invocation. A
   model-supplied id is never trusted.

2. **`quote_found_in_source` is the only factual check v1 makes.** It is a
   normalised substring match of the model's quote against the extracted
   document text the runtime actually read. `false` means "the quoted text
   was not located in the source body Legalise holds" — NOT "the legal
   claim is false". There is deliberately no `verified` / `proven` flag.
"""

from __future__ import annotations

import hashlib
from typing import Any

SUPPORTED_SOURCE_TYPES = frozenset({"document"})


class UnsupportedSourceType(ValueError):
    """A module tried to emit a source type v1 does not support."""


def require_supported_source_type(source_type: str) -> None:
    """Fail closed on unsupported source types (v1 = document only)."""
    if source_type not in SUPPORTED_SOURCE_TYPES:
        raise UnsupportedSourceType(
            f"source_type {source_type!r} is not supported in v1 "
            f"(supported: {sorted(SUPPORTED_SOURCE_TYPES)})"
        )


def normalize_for_match(text: str) -> str:
    """Lowercase + collapse all whitespace runs to single spaces. Makes the
    quote check tolerant of reflow/indentation without being a fuzzy
    semantic match — it stays a literal-text presence check."""
    return " ".join((text or "").lower().split())


def quote_found_in_source(quote: str, body_text: str) -> bool:
    """True iff the (normalised) quote text occurs in the (normalised)
    document body. Empty quote → False (nothing to locate)."""
    q = normalize_for_match(quote)
    if not q:
        return False
    return q in normalize_for_match(body_text)


def body_sha256(body_text: str) -> str:
    """sha256 of the extracted text the runtime actually read — pins the
    body so a later version/body drift is detectable from the anchor."""
    return hashlib.sha256((body_text or "").encode("utf-8")).hexdigest()


def document_label(filename: str) -> str:
    """Human-facing label; never a raw UUID."""
    return f"Document · {filename}"


def build_document_anchor(
    *,
    anchor_id: str,
    document_id: str,
    filename: str,
    sha256: str | None,
    body_text: str,
    quote: str | None = None,
) -> dict[str, Any]:
    """Build a document source anchor. Identity fields come from the
    server (the caller passes the loaded document's real values), never
    from a model. When ``quote`` is supplied, the anchor carries the
    factual ``quote_found_in_source`` flag."""
    anchor: dict[str, Any] = {
        "id": anchor_id,
        "source_type": "document",
        "document_id": str(document_id),
        "filename": filename,
        "sha256": sha256,
        "body_sha256": body_sha256(body_text),
        "label": document_label(filename),
        "quote": quote,
        "page": None,
    }
    if quote is not None:
        anchor["quote_found_in_source"] = quote_found_in_source(quote, body_text)
    return anchor


__all__ = [
    "SUPPORTED_SOURCE_TYPES",
    "UnsupportedSourceType",
    "build_document_anchor",
    "body_sha256",
    "document_label",
    "normalize_for_match",
    "quote_found_in_source",
    "require_supported_source_type",
]
