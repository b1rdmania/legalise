"""Edit-instruction pipeline.

`propose_edits` is the single entry point used by the API router. It:

1. Loads the document, its owning matter, and the latest extracted body.
2. Builds a user prompt from the body text (truncated) + the instruction.
3. Picks the system prompt for `mode`.
4. Calls `gateway.call()` — posture-gated, audited like any model call.
5. Parses the JSON envelope back into a `ChangesEnvelope`.
6. Creates a new `DocumentVersion` (kind=assistant_edit) and one
   `DocumentEdit` row per parsed change, all `status=pending`.
7. Returns an `EditInstructionResult` envelope.

The stub provider returns echo text, not JSON. In that case we still
persist a new version with zero pending edits and surface the
`model_notes` describing the stub state — keeps smoke tests green
without an API key.
"""

from __future__ import annotations

import hashlib
import uuid
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.api import audit
from app.core.model_gateway import ModelGateway
from app.core.structured_output import StructuredOutputError, parse_model_json
from app.models import (
    Document,
    DocumentBody,
    DocumentEdit,
    DocumentVersion,
    Matter,
)
from app.models.document_body import BODY_KIND_EXTRACTED
from app.models.document_version import VERSION_KIND_ASSISTANT_EDIT
from app.models.document_edit import EDIT_STATUS_PENDING
from app.modules.document_edit.prompts import EDIT_MODES, mode_system_prompt
from app.modules.document_edit.schemas import ChangesEnvelope


# Hard cap on document body bytes sent to the model. ~32k chars covers
# nearly all ET / civil correspondence; larger documents are truncated
# with a marker. Tracked for future paging into v0.2.
MAX_BODY_CHARS = 32_000


@dataclass
class EditInstructionResult:
    version: DocumentVersion
    pending_edits: list[DocumentEdit]
    model_used: str
    model_notes: str
    instruction_hash: str
    parse_ok: bool


def _instruction_hash(instruction: str, mode: str) -> str:
    payload = f"{mode}\n{instruction}".encode("utf-8")
    return hashlib.sha256(payload).hexdigest()[:32]


def _truncate(text: str) -> tuple[str, bool]:
    if len(text) <= MAX_BODY_CHARS:
        return text, False
    head = text[: MAX_BODY_CHARS - 200]
    return head + "\n\n[... truncated for context window ...]", True


def _parse_envelope(raw: str) -> tuple[ChangesEnvelope, bool]:
    """Validate the model's JSON envelope via the central helper.

    Returns (envelope, parsed_ok). On parse failure returns an empty
    envelope with a `model_notes` echo of the raw head so the caller
    can still persist a version row.
    """
    try:
        envelope = parse_model_json(raw, ChangesEnvelope)
        return envelope, True
    except StructuredOutputError as exc:
        head = (exc.raw_text or "")[:240]
        return ChangesEnvelope(changes=[], model_notes=f"unparseable response: {head}"), False


async def _next_version_number(session: AsyncSession, document_id: uuid.UUID) -> int:
    current = await session.scalar(
        select(func.coalesce(func.max(DocumentVersion.version_number), 0)).where(
            DocumentVersion.document_id == document_id
        )
    )
    return int(current or 0) + 1


async def propose_edits(
    *,
    session: AsyncSession,
    gateway: ModelGateway,
    document_id: uuid.UUID,
    actor_id: uuid.UUID,
    instruction: str,
    mode: str,
) -> EditInstructionResult:
    """Run an edit-instruction pass. Caller commits the session."""
    if mode not in EDIT_MODES:
        raise ValueError(f"unknown mode: {mode!r}")

    pair = (
        await session.execute(
            select(Document, Matter)
            .join(Matter, Matter.id == Document.matter_id)
            .where(Document.id == document_id)
        )
    ).first()
    if pair is None:
        raise LookupError("document not found")
    doc, matter = pair
    if matter.created_by_id != actor_id:
        raise LookupError("document not found")

    body = await session.scalar(
        select(DocumentBody).where(
            DocumentBody.document_id == doc.id,
            DocumentBody.kind == BODY_KIND_EXTRACTED,
        )
    )
    if body is None or body.extraction_method == "failed" or not body.extracted_text:
        raise ValueError("document body not available for editing")

    body_text, truncated = _truncate(body.extracted_text)

    system_prompt = mode_system_prompt(mode)
    user_prompt = (
        f"Instruction: {instruction.strip()}\n"
        f"Mode: {mode}\n"
        f"Document filename: {doc.filename}\n"
        f"--- DOCUMENT BODY ---\n{body_text}\n"
        f"--- END DOCUMENT BODY ---\n"
        + ("(note: body was truncated for context window)\n" if truncated else "")
        + "\nReturn the JSON envelope now."
    )

    instr_hash = _instruction_hash(instruction, mode)

    result = await gateway.call(
        session=session,
        matter_id=matter.id,
        actor_id=actor_id,
        prompt=user_prompt,
        system=system_prompt,
        resource_type="document",
        resource_id=str(doc.id),
        payload={"module": "document_edit", "mode": mode, "instruction_hash": instr_hash},
    )

    envelope, parse_ok = _parse_envelope(result.text)
    changes = [entry.model_dump() for entry in (envelope.changes or [])]
    model_notes = envelope.model_notes or ""

    version_number = await _next_version_number(session, doc.id)
    version = DocumentVersion(
        id=uuid.uuid4(),
        document_id=doc.id,
        version_number=version_number,
        kind=VERSION_KIND_ASSISTANT_EDIT,
        created_by_id=actor_id,
        created_at=datetime.utcnow(),
        storage_uri=None,
        notes=f"edit-instruction mode={mode} model={result.model_used}",
    )
    session.add(version)
    await session.flush()

    pending: list[DocumentEdit] = []
    for change in changes[:50]:
        if not isinstance(change, dict):
            continue
        edit = DocumentEdit(
            id=uuid.uuid4(),
            document_version_id=version.id,
            change_id=str(uuid.uuid4()),
            correlation_id=str(change.get("change_id"))[:32] if change.get("change_id") else None,
            deleted_text=str(change.get("deleted_text", "")),
            inserted_text=str(change.get("inserted_text", "")),
            context_before=str(change.get("context_before", ""))[:2000],
            context_after=str(change.get("context_after", ""))[:2000],
            rationale=(str(change.get("rationale"))[:2000] if change.get("rationale") else None),
            status=EDIT_STATUS_PENDING,
            created_at=datetime.utcnow(),
        )
        session.add(edit)
        pending.append(edit)

    # Module-level audit row separate from the `model.call` row that
    # `gateway.call()` writes. Lets the matter audit tab show one row
    # per user invocation, with the model call as a child fact.
    await audit.log(
        session,
        "document.edit_instruction.invoked",
        actor_id=actor_id,
        matter_id=matter.id,
        module="document_edit",
        resource_type="document",
        resource_id=str(doc.id),
        payload={
            "mode": mode,
            "instruction_hash": instr_hash,
            "version_id": str(version.id),
            "pending_count": len(pending),
            "parse_ok": parse_ok,
            "truncated": truncated,
        },
    )

    await session.flush()
    return EditInstructionResult(
        version=version,
        pending_edits=pending,
        model_used=result.model_used,
        model_notes=model_notes,
        instruction_hash=instr_hash,
        parse_ok=parse_ok,
    )
