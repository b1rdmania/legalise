"""Source Anchors v1 — SA-1 contract + quote-in-source helper (no DB)."""

from __future__ import annotations

import pytest

from app.core.source_anchors import (
    UnsupportedSourceType,
    build_document_anchor,
    quote_found_in_source,
    require_supported_source_type,
)


def test_document_anchor_serialises_with_identity_and_body_hash() -> None:
    a = build_document_anchor(
        anchor_id="src_d1",
        document_id="11111111-1111-1111-1111-111111111111",
        filename="khan-dismissal-letter.pdf",
        sha256="deadbeef",
        body_text="Acme dismissed Ms Khan on 12 March 2026.",
    )
    assert a["id"] == "src_d1"
    assert a["source_type"] == "document"
    assert a["document_id"] == "11111111-1111-1111-1111-111111111111"
    assert a["filename"] == "khan-dismissal-letter.pdf"
    assert a["label"] == "Document · khan-dismissal-letter.pdf"
    assert len(a["body_sha256"]) == 64
    # No quote supplied → no quote_found_in_source flag (can't overclaim).
    assert "quote_found_in_source" not in a


def test_unsupported_source_type_fails_closed() -> None:
    require_supported_source_type("document")  # ok
    with pytest.raises(UnsupportedSourceType):
        require_supported_source_type("case_law")


def test_quote_found_when_present_normalised() -> None:
    body = "Acme   dismissed Ms Khan\non 12 March 2026."
    assert quote_found_in_source("Acme dismissed Ms Khan on 12 March 2026.", body) is True
    # Whitespace/case differences don't defeat the literal-presence check.
    assert quote_found_in_source("acme DISMISSED ms khan", body) is True


def test_fabricated_quote_marks_not_found() -> None:
    body = "Acme dismissed Ms Khan on 12 March 2026."
    a = build_document_anchor(
        anchor_id="src_d1",
        document_id="x",
        filename="f.pdf",
        sha256=None,
        body_text=body,
        quote="The contract was governed by New York law.",
    )
    assert a["quote_found_in_source"] is False
    # Empty quote can't be located.
    assert quote_found_in_source("", body) is False
