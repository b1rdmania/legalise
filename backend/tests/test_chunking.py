"""Pure text chunking — offsets, boundaries, and overlap (no DB)."""

from __future__ import annotations

import pytest

from app.core.chunking import Chunk, chunk_text


def test_empty_input_returns_no_chunks() -> None:
    assert chunk_text("") == []


def test_whitespace_only_input_returns_no_chunks() -> None:
    assert chunk_text("   \n\t  \n ") == []


def test_short_input_is_a_single_chunk_over_whole_text() -> None:
    text = "Acme dismissed Ms Khan on 12 March 2026."
    chunks = chunk_text(text, target_chars=2000)
    assert len(chunks) == 1
    only = chunks[0]
    assert only == Chunk(index=0, text=text, char_start=0, char_end=len(text))
    assert text[only.char_start : only.char_end] == only.text


def test_input_exactly_target_is_single_chunk() -> None:
    text = "x" * 50
    chunks = chunk_text(text, target_chars=50)
    assert len(chunks) == 1
    assert chunks[0].char_start == 0
    assert chunks[0].char_end == 50


def test_invalid_target_raises() -> None:
    with pytest.raises(ValueError):
        chunk_text("anything", target_chars=0)


def _long_text() -> str:
    # ~30 paragraphs, sentences and blank lines, well over target.
    paras = []
    for p in range(30):
        sentences = " ".join(
            f"Paragraph {p} sentence {s} states a fact." for s in range(6)
        )
        paras.append(sentences)
    return "\n\n".join(paras)


def test_long_input_produces_multiple_chunks() -> None:
    text = _long_text()
    chunks = chunk_text(text, target_chars=500, overlap_chars=80)
    assert len(chunks) > 1


def test_chunks_respect_rough_size_bound() -> None:
    text = _long_text()
    target = 500
    chunks = chunk_text(text, target_chars=target, overlap_chars=80)
    # Hard cut caps each chunk at target; natural breaks only shorten it.
    for c in chunks:
        assert len(c.text) <= target


def test_offsets_reconstruct_source_slices() -> None:
    text = _long_text()
    chunks = chunk_text(text, target_chars=500, overlap_chars=80)
    for c in chunks:
        assert text[c.char_start : c.char_end] == c.text


def test_offsets_are_within_bounds_and_ordered() -> None:
    text = _long_text()
    n = len(text)
    chunks = chunk_text(text, target_chars=500, overlap_chars=80)
    prev_start = -1
    for i, c in enumerate(chunks):
        assert c.index == i
        assert 0 <= c.char_start < c.char_end <= n
        # char_start strictly increases → guaranteed forward progress.
        assert c.char_start > prev_start
        prev_start = c.char_start
    # The final chunk reaches the end of the source.
    assert chunks[-1].char_end == n


def test_consecutive_chunks_overlap() -> None:
    text = _long_text()
    overlap = 80
    chunks = chunk_text(text, target_chars=500, overlap_chars=overlap)
    assert len(chunks) > 1
    for prev, nxt in zip(chunks, chunks[1:]):
        # Ranges intersect: the next chunk starts before the previous ends.
        assert nxt.char_start < prev.char_end
        overlap_len = prev.char_end - nxt.char_start
        assert 0 < overlap_len <= overlap


def test_no_overlap_when_overlap_zero() -> None:
    text = _long_text()
    chunks = chunk_text(text, target_chars=500, overlap_chars=0)
    assert len(chunks) > 1
    for prev, nxt in zip(chunks, chunks[1:]):
        # Adjacent, non-overlapping ranges that tile the source.
        assert nxt.char_start == prev.char_end


def test_prefers_paragraph_boundaries() -> None:
    # Two fat paragraphs; a 700-char target should break on the blank line.
    para_a = "A" * 600
    para_b = "B" * 600
    text = f"{para_a}\n\n{para_b}"
    chunks = chunk_text(text, target_chars=700, overlap_chars=50)
    # First chunk ends right after the paragraph break (offset 602).
    assert chunks[0].char_end == len(para_a) + 2
    assert chunks[0].text.endswith("\n\n")


def test_hard_cut_when_no_boundary_available() -> None:
    # No paragraph/line/sentence boundaries → must hard-cut at target.
    text = "z" * 1200
    chunks = chunk_text(text, target_chars=400, overlap_chars=40)
    assert len(chunks) > 1
    assert chunks[0].char_start == 0
    assert chunks[0].char_end == 400
    # Reconstruction still holds for hard cuts.
    for c in chunks:
        assert text[c.char_start : c.char_end] == c.text


def test_large_overlap_is_clamped_and_still_progresses() -> None:
    # overlap >= target would stall; it must be clamped and still terminate.
    text = "y" * 1000
    chunks = chunk_text(text, target_chars=100, overlap_chars=500)
    assert len(chunks) > 1
    starts = [c.char_start for c in chunks]
    assert starts == sorted(set(starts))  # strictly increasing, no repeats
    assert chunks[-1].char_end == len(text)
