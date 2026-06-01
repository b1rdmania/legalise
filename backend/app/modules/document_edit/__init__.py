"""Document edit-instruction module.

Structured edit-instruction input (textarea + mode + preset buttons)
→ model call returning a structured JSON `changes[]` envelope →
persisted `DocumentVersion` (kind=assistant_edit) + pending
`DocumentEdit` rows. Accept/reject UI is wired separately.

Five modes are supported, each with its own system prompt:
  - tighten              shorten + remove ambiguous timing language
  - rewrite              full rewrite preserving meaning
  - summarise            condense to 3 sentences
  - free-text            user-supplied instruction is authoritative
  - uk-jurisdiction-sweep   the wedge — UK-shape concerns (UCTA, CPR 36,
                            governing law, Scottish/NI quirks)
"""

from app.modules.document_edit.pipeline import propose_edits, EditInstructionResult
from app.modules.document_edit.prompts import EDIT_MODES, mode_system_prompt

__all__ = ["propose_edits", "EditInstructionResult", "EDIT_MODES", "mode_system_prompt"]
