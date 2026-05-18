"""Assistant pipeline — assemble context, call gateway, persist + audit.

One turn per request. Reads matter facts + chronology summary + selected
or recent document bodies + installed-modules list, calls the model
through the same gateway as every other module, parses the JSON envelope
through `app.core.structured_output.parse_model_json`, and persists both
user + assistant rows in one transaction.

The system prompt is hard-coded here — the assistant is the orchestration
surface, not a domain skill. v0.2 may move it to a forkable skill.
"""

from __future__ import annotations

import json
import uuid
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.adapters.plugin_bridge import _parse_skill_md
from app.core.api import audit as audit_api
from app.core.config import settings
from app.core.model_gateway import PrivilegePosture, gateway as model_gateway
from app.core.structured_output import StructuredOutputError, parse_model_json
from app.models import Document, Event, Matter, WorkspaceDisabledSkill
from app.models.assistant import ROLE_ASSISTANT, ROLE_USER, AssistantMessage
from app.models.document_body import BODY_KIND_EXTRACTED, DocumentBody

from .schemas import (
    AssistantPostRequest,
    AssistantResponseEnvelope,
    SuggestedAction,
)


SYSTEM_PROMPT = """You are inside Legalise. UK legal workspace. One matter at a time.

Answer questions about the matter, its documents, its chronology, and prior turns in the thread. Stay terse. Solicitor-cold-readable. Plain English. No marketing tone, no AI tics, no hedging, no em dashes.

If the user's intent is one of the structured workflows below, return a suggested_action chip instead of doing the work yourself in prose:

- run_pre_motion: adversarial premortem of a pleading
- draft_letter: matter-shaped letter drafting (LBA etc)
- review_contract: clause/redline analysis of an uploaded contract
- anonymise_document: PII detection + redaction on a document

Cite document content with [doc:<document_id>] using the UUID from the Documents section. Cite chronology with [chron:<event_id>] using the UUID from the Chronology section. IDs verbatim, never titles. The workspace resolves them to a clickable label.

England & Wales only. If asked about other jurisdictions, say so and stop.

Return JSON only, matching this shape:
{"content": "<reply text>", "suggested_actions": [{"type": "...", "label": "...", "params": {}}]}
"""


# Approximate token budgeting — 4 chars per token is the standard rough
# heuristic used elsewhere in the workspace (e.g. StubProvider).
_CHARS_PER_TOKEN = 4
_HISTORY_MESSAGE_LIMIT = 20
_CHRONOLOGY_EVENT_LIMIT = 12
_RECENT_DOCUMENT_LIMIT = 3
_PER_DOCUMENT_CHAR_BUDGET = 3000 * _CHARS_PER_TOKEN
_DEFAULT_CONTEXT_TOKEN_BUDGET = 12000


def _truncate(text: str, char_budget: int) -> str:
    if char_budget <= 0:
        return ""
    if len(text) <= char_budget:
        return text
    return text[:char_budget].rstrip() + "…"


async def _load_history(
    session: AsyncSession, matter_id: uuid.UUID, limit: int
) -> list[AssistantMessage]:
    rows = await session.scalars(
        select(AssistantMessage)
        .where(AssistantMessage.matter_id == matter_id)
        .order_by(AssistantMessage.created_at.desc())
        .limit(limit)
    )
    history = list(rows.all())
    history.reverse()
    return history


async def _load_chronology(
    session: AsyncSession, matter_id: uuid.UUID
) -> list[Event]:
    rows = await session.scalars(
        select(Event)
        .where(Event.matter_id == matter_id)
        .order_by(Event.event_date.asc())
        .limit(_CHRONOLOGY_EVENT_LIMIT)
    )
    return list(rows.all())


async def _load_document_snippets(
    session: AsyncSession,
    matter_id: uuid.UUID,
    selected_ids: list[uuid.UUID],
) -> list[tuple[Document, str]]:
    if selected_ids:
        rows = await session.scalars(
            select(Document).where(
                Document.matter_id == matter_id,
                Document.id.in_(selected_ids),
            )
        )
        documents = list(rows.all())
    else:
        rows = await session.scalars(
            select(Document)
            .where(Document.matter_id == matter_id)
            .order_by(Document.uploaded_at.desc())
            .limit(_RECENT_DOCUMENT_LIMIT)
        )
        documents = list(rows.all())

    out: list[tuple[Document, str]] = []
    for doc in documents:
        body = await session.scalar(
            select(DocumentBody).where(
                DocumentBody.document_id == doc.id,
                DocumentBody.kind == BODY_KIND_EXTRACTED,
            )
        )
        text = body.extracted_text if body and body.extracted_text else ""
        out.append((doc, _truncate(text, _PER_DOCUMENT_CHAR_BUDGET)))
    return out


def _load_installed_modules() -> list[tuple[str, str, str]]:
    """Return `(plugin, skill, description)` for every readable SKILL.md.

    Mirrors `app.api.modules._skill_paths` without the validation overhead
    — the assistant only needs names + one-liners for prompt assembly.
    Errors on individual manifests are silently skipped; a missing plugins
    root returns the empty list.
    """
    root = Path(settings.plugins_root)
    if not root.exists():
        return []
    out: list[tuple[str, str, str]] = []
    for path in sorted(root.glob("*/skills/*/SKILL.md")):
        try:
            plugin, _, skill, filename = path.relative_to(root).parts
        except ValueError:
            continue
        if filename != "SKILL.md":
            continue
        try:
            manifest = _parse_skill_md(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        out.append((plugin, skill, manifest.description))
    return out


async def _enabled_modules(
    session: AsyncSession, user_id: uuid.UUID
) -> list[tuple[str, str, str]]:
    installed = _load_installed_modules()
    disabled_rows = await session.scalars(
        select(WorkspaceDisabledSkill).where(
            WorkspaceDisabledSkill.user_id == user_id
        )
    )
    disabled = {(r.plugin, r.skill) for r in disabled_rows.all()}
    return [t for t in installed if (t[0], t[1]) not in disabled]


def _format_history(history: list[AssistantMessage]) -> str:
    if not history:
        return "(no prior turns)"
    lines: list[str] = []
    for msg in history:
        prefix = "User" if msg.role == ROLE_USER else "Assistant"
        lines.append(f"{prefix}: {msg.content}")
    return "\n".join(lines)


def _format_matter_facts(matter: Matter) -> str:
    counterparty = ""
    if isinstance(matter.facts, dict):
        counterparty = str(matter.facts.get("counterparty", "")).strip()
    parts = [
        f"Title: {matter.title}",
        f"Type: {matter.matter_type}",
        f"Privilege posture: {matter.privilege_posture}",
        f"Opened: {matter.opened_at.isoformat() if matter.opened_at else 'unknown'}",
    ]
    if counterparty:
        parts.append(f"Counterparty: {counterparty}")
    return "\n".join(parts)


def _format_chronology(events: list[Event]) -> str:
    if not events:
        return "(no chronology events)"
    return "\n".join(
        f"[chron:{event.id}] {event.event_date.isoformat()} - {event.description}"
        for event in events
    )


def _format_documents(snippets: list[tuple[Document, str]]) -> str:
    if not snippets:
        return "(no documents)"
    blocks: list[str] = []
    for doc, text in snippets:
        body = text if text else "(no extracted body)"
        blocks.append(
            f"[doc:{doc.id}] {doc.filename}\n{body}"
        )
    return "\n\n".join(blocks)


def _format_modules(modules: list[tuple[str, str, str]]) -> str:
    if not modules:
        return "(no installed modules)"
    return "\n".join(
        f"- {plugin}/{skill}: {description}"
        for plugin, skill, description in modules
    )


def _assemble_prompt(
    *,
    matter: Matter,
    history: list[AssistantMessage],
    events: list[Event],
    snippets: list[tuple[Document, str]],
    modules: list[tuple[str, str, str]],
    user_content: str,
    token_budget: int,
) -> str:
    # Context budget covers history + chronology + docs + modules + matter
    # facts. The new user message and the JSON instruction are appended
    # AFTER truncation so they survive even when the budget is exhausted.
    # Matter facts are tiny and always kept verbatim. The truncation order
    # below trims history/docs/chronology first if they overflow.
    context_sections = [
        "## Matter",
        _format_matter_facts(matter),
        "",
        "## Chronology",
        _format_chronology(events),
        "",
        "## Documents",
        _format_documents(snippets),
        "",
        "## Installed modules",
        _format_modules(modules),
        "",
        "## Conversation so far",
        _format_history(history),
    ]
    context = "\n".join(context_sections)
    char_budget = max(1, token_budget) * _CHARS_PER_TOKEN
    context = _truncate(context, char_budget)

    tail = "\n".join(
        [
            "",
            "## New user message",
            user_content,
            "",
            "Respond with JSON only matching the documented envelope.",
        ]
    )
    return context + tail


async def run_assistant_turn(
    *,
    session: AsyncSession,
    matter: Matter,
    actor_id: uuid.UUID,
    request: AssistantPostRequest,
    gateway=model_gateway,
    context_token_budget: int = _DEFAULT_CONTEXT_TOKEN_BUDGET,
) -> tuple[AssistantMessage, AssistantMessage]:
    """Persist the user turn, call the model, persist + audit the reply."""
    history = await _load_history(session, matter.id, _HISTORY_MESSAGE_LIMIT)
    events = await _load_chronology(session, matter.id)
    snippets = await _load_document_snippets(
        session, matter.id, list(request.selected_document_ids)
    )
    modules = await _enabled_modules(session, actor_id)

    prompt = _assemble_prompt(
        matter=matter,
        history=history,
        events=events,
        snippets=snippets,
        modules=modules,
        user_content=request.content,
        token_budget=context_token_budget,
    )

    user_row = AssistantMessage(
        matter_id=matter.id,
        actor_id=actor_id,
        role=ROLE_USER,
        content=request.content,
        suggested_actions=[],
    )
    session.add(user_row)
    await session.flush()

    result = await gateway.call(
        session=session,
        matter_id=matter.id,
        actor_id=actor_id,
        prompt=prompt,
        model=matter.default_model_id,
        posture=PrivilegePosture(matter.privilege_posture),
        system=SYSTEM_PROMPT,
        resource_type="assistant_message",
        resource_id=str(user_row.id),
        payload={"stage": "assistant", "module": "assistant"},
    )

    parse_failed = False
    try:
        envelope = parse_model_json(result.text, AssistantResponseEnvelope)
        content_out = envelope.content
        actions: list[SuggestedAction] = list(envelope.suggested_actions)
    except StructuredOutputError:
        # Show a controlled message in the chat thread. Raw provenance
        # (response hash + token count) lives on the gateway's audit row.
        # The module audit row gains `parse_failed: true` so this case is
        # filterable.
        parse_failed = True
        content_out = (
            "I couldn't structure that response. Try rephrasing your "
            "message, or check the model settings on this matter."
        )
        actions = []

    assistant_row = AssistantMessage(
        matter_id=matter.id,
        actor_id=actor_id,
        role=ROLE_ASSISTANT,
        content=content_out,
        suggested_actions=[a.model_dump(mode="json") for a in actions],
        model_used=result.model_used,
        prompt_hash=result.prompt_hash,
        response_hash=result.response_hash,
        token_count=result.token_count,
    )
    session.add(assistant_row)
    await session.flush()

    await audit_api.log(
        session,
        "module.assistant.message",
        actor_id=actor_id,
        matter_id=matter.id,
        module="assistant",
        resource_type="assistant_message",
        resource_id=str(assistant_row.id),
        payload={
            "suggested_action_count": len(actions),
            "history_message_count": len(history),
            "context_token_budget": context_token_budget,
            "selected_document_count": len(request.selected_document_ids),
            "parse_failed": parse_failed,
        },
    )
    await session.commit()
    await session.refresh(user_row)
    await session.refresh(assistant_row)
    return user_row, assistant_row


__all__ = ["run_assistant_turn", "SYSTEM_PROMPT"]
