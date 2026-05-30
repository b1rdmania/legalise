"""Source Anchors v1 — SA-2 prompt-runtime anchor logic (pure, no DB).

Covers the parts that decide honesty: always-on document anchors, lenient
parsing that never loses the answer, server-authoritative identity, and
the quote-in-source flag. The full invocation→payload path is covered by
test_prompt_runtime.py (DB-backed).
"""

from __future__ import annotations

from app.core.prompt_runtime import _build_source_anchors, _parse_model_output


def _doc(handle: str, body: str = "Acme dismissed Ms Khan on 12 March 2026."):
    return {
        "handle": handle,
        "document_id": f"id-{handle}",
        "filename": f"{handle}.pdf",
        "sha256": "deadbeef",
        "body_text": body,
    }


def test_parse_plain_text_is_the_answer() -> None:
    assert _parse_model_output("Just prose.") == ("Just prose.", [])


def test_parse_json_envelope_extracts_output_and_claims() -> None:
    text = '{"output": "Answer.", "claims": [{"text": "c", "source_handles": ["D1"]}]}'
    output, claims = _parse_model_output(text)
    assert output == "Answer."
    assert claims == [{"text": "c", "source_handles": ["D1"]}]


def test_parse_fenced_json_envelope_extracts_output_and_claims() -> None:
    text = (
        "Here is the answer:\n\n"
        '```json\n{"output": "Fenced answer.", "claims": [{"text": "c2"}]}\n```\n'
        "Hope that helps."
    )
    output, claims = _parse_model_output(text)
    assert output == "Fenced answer."
    assert claims == [{"text": "c2"}]


def test_parse_prose_prefixed_json_envelope_extracts_output() -> None:
    text = 'Result follows: {"output": "Inline answer.", "claims": []}'
    assert _parse_model_output(text) == ("Inline answer.", [])


def test_parse_malformed_json_never_loses_the_answer() -> None:
    # Starts with { but isn't valid JSON → keep the raw text as the answer.
    assert _parse_model_output('{"output": "oops') == ('{"output": "oops', [])
    # Valid JSON but no string output key → keep raw text.
    raw = '{"foo": 1}'
    assert _parse_model_output(raw) == (raw, [])


def test_parse_malformed_fenced_json_preserves_the_prose_answer() -> None:
    # Prose with a fenced JSON block whose contents are malformed: the
    # envelope must fall through and the *prose* answer must survive
    # (regression — the fenced extractor's safety contract).
    text = "Here's the answer.\n```json\n{\"output\": \"ok\n```"
    output, claims = _parse_model_output(text)
    assert output == text
    assert claims == []
    # Fenced block whose JSON is valid but has no string `output` key →
    # also fall through and preserve the surrounding prose.
    text2 = "Some prose\n```json\n{\"foo\": 1}\n```\nMore prose."
    output2, claims2 = _parse_model_output(text2)
    assert output2 == text2
    assert claims2 == []


def test_parse_fenced_json_envelope_extracts_output() -> None:
    # Positive case: a valid fenced envelope with `output` is correctly used.
    text = '```json\n{"output": "Answer.", "claims": []}\n```'
    output, claims = _parse_model_output(text)
    assert output == "Answer."
    assert claims == []
    # Fenced but malformed → keep raw text.
    fenced = '```json\n{"output": "oops"\n```'
    assert _parse_model_output(fenced) == (fenced, [])


def test_document_anchors_always_emitted_even_with_no_claims() -> None:
    anchors, claims = _build_source_anchors([_doc("D1"), _doc("D2")], [])
    assert [a["id"] for a in anchors] == ["src_d1", "src_d2"]
    assert all(a["source_type"] == "document" for a in anchors)
    assert claims == []
    # Server identity, no quote on baseline anchors (no overclaim).
    assert anchors[0]["document_id"] == "id-D1"
    assert "quote_found_in_source" not in anchors[0]


def test_claim_maps_known_handle_drops_unknown() -> None:
    anchors, claims = _build_source_anchors(
        [_doc("D1")],
        [{"text": "claim a", "source_handles": ["D1", "D9"]}],
    )
    assert claims[0]["text"] == "claim a"
    # D9 unknown → dropped; only D1's anchor referenced.
    assert claims[0]["anchor_ids"] == ["src_d1"]


def test_model_quote_becomes_checked_anchor() -> None:
    anchors, claims = _build_source_anchors(
        [_doc("D1")],
        [
            {"text": "real", "source_handles": ["D1"], "quote": "Acme dismissed Ms Khan"},
            {"text": "fake", "source_handles": ["D1"], "quote": "governed by New York law"},
        ],
    )
    quote_anchors = [a for a in anchors if a["id"].startswith("src_q")]
    found = {a["quote"]: a["quote_found_in_source"] for a in quote_anchors}
    assert found["Acme dismissed Ms Khan"] is True
    assert found["governed by New York law"] is False


def test_model_cannot_assert_identity() -> None:
    # A model-supplied document_id in the claim is ignored — anchors come
    # only from the server-loaded docs.
    anchors, claims = _build_source_anchors(
        [_doc("D1")],
        [{"text": "x", "source_handles": ["D1"], "document_id": "EVIL"}],
    )
    assert all(a["document_id"] == "id-D1" for a in anchors)
