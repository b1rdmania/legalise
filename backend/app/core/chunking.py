"""Pure text chunking (P3 foundation).

Splits an extracted document body into overlapping chunks of roughly
``target_chars`` characters, preferring to break on natural boundaries
(paragraph → line → sentence → hard cut) so a chunk rarely ends mid-word.

The only contract that matters downstream is the offset pair: every chunk
carries ``char_start`` / ``char_end`` as offsets into the *original* input
string, so ``text[chunk.char_start:chunk.char_end] == chunk.text`` always
holds and a later feature can map a chunk back to its source. Consecutive
chunks overlap by ``overlap_chars`` — their ranges intersect on purpose.

No external dependencies; standard library only.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

__all__ = ["Chunk", "chunk_text"]


@dataclass(frozen=True)
class Chunk:
    """A contiguous slice of the source text.

    ``char_start`` / ``char_end`` are offsets into the *original* input string
    (``end`` exclusive), so ``source[char_start:char_end] == text``.
    """

    index: int
    text: str
    char_start: int
    char_end: int


# Sentence terminator optionally followed by a closing quote/bracket, with a
# whitespace lookahead so we only break where a sentence actually ends.
_SENTENCE_END = re.compile(r"""[.!?]["')\]]?(?=\s)""")


def _best_break(text: str, min_break: int, hard_end: int) -> int:
    """Return the preferred end offset in ``(min_break, hard_end]``.

    Tries, in order: the last double-newline, the last single newline, the
    last sentence terminator. Falls back to ``hard_end`` (a hard cut) when no
    natural boundary sits inside the window.
    """
    if min_break >= hard_end:
        return hard_end

    # Paragraph boundary: end the chunk just after the blank line.
    i = text.rfind("\n\n", min_break, hard_end)
    if i != -1:
        return i + 2

    # Line boundary.
    i = text.rfind("\n", min_break, hard_end)
    if i != -1:
        return i + 1

    # Sentence boundary: include the terminator and the following space.
    window = text[min_break:hard_end]
    matches = list(_SENTENCE_END.finditer(window))
    if matches:
        # +1 to swallow the whitespace the lookahead matched.
        return min_break + matches[-1].end() + 1

    return hard_end


def chunk_text(
    text: str,
    *,
    target_chars: int = 2000,
    overlap_chars: int = 200,
) -> list[Chunk]:
    """Split ``text`` into overlapping chunks of roughly ``target_chars``.

    Args:
        text: The source string. Offsets in the result index into this string.
        target_chars: Desired chunk size in characters. Must be positive.
        overlap_chars: Characters of overlap between consecutive chunks.
            Clamped to ``[0, target_chars - 1]`` so progress is guaranteed.

    Returns:
        Chunks in document order. Empty or whitespace-only input yields ``[]``.
        Input no longer than ``target_chars`` yields a single chunk covering
        ``[0, len(text)]``.

    Invariants:
        * ``text[c.char_start:c.char_end] == c.text`` for every chunk.
        * ``char_start`` values are strictly increasing.
        * Consecutive chunks intersect by up to ``overlap_chars``.
    """
    if target_chars <= 0:
        raise ValueError("target_chars must be positive")

    n = len(text)
    # Empty or whitespace-only → nothing worth indexing.
    if not text.strip():
        return []

    # Short enough to be a single chunk over the whole input.
    if n <= target_chars:
        return [Chunk(index=0, text=text, char_start=0, char_end=n)]

    overlap = max(0, min(overlap_chars, target_chars - 1))

    chunks: list[Chunk] = []
    pos = 0
    index = 0
    while pos < n:
        hard_end = min(pos + target_chars, n)
        if hard_end >= n:
            end = n
        else:
            # Prefer a boundary in the back half of the window so chunks stay
            # close to target size rather than collapsing to tiny fragments.
            min_break = pos + target_chars // 2
            end = _best_break(text, min_break, hard_end)

        chunks.append(
            Chunk(
                index=index,
                text=text[pos:end],
                char_start=pos,
                char_end=end,
            )
        )
        index += 1

        if end >= n:
            break

        # Step back by the overlap, but always make forward progress.
        next_pos = end - overlap
        if next_pos <= pos:
            next_pos = pos + 1
        pos = next_pos

    return chunks
