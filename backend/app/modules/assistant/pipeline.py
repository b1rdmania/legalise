"""Assistant pipeline — assemble context, call gateway, persist + audit.

One turn per request. Reads matter facts + chronology summary + selected
or recent document bodies + enabled-skill tool list, calls the model
through the same gateway as every other module, parses the JSON envelope
through `app.core.structured_output.parse_model_json`, and persists both
user + assistant rows in one transaction.

The system prompt is hard-coded here — the assistant is the orchestration
surface, not a domain skill. v0.2 may move it to a forkable skill.
"""

from __future__ import annotations

import hashlib
import json
import re
import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any

from sqlalchemy import desc as sql_desc
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import retrieval
from app.core.advice_boundary import AdviceBoundaryDenied
from app.core.api import audit as audit_api
from app.core.api import audit_out_of_band
from app.core.capabilities import CapabilityDenied
from app.core.retrieval import RetrievalHit
from app.core.model_gateway import PrivilegePosture, ProviderKeyMissing
from app.core.model_gateway import gateway as model_gateway
from app.core.phase1_runtime.exceptions import Phase1Blocked
from app.core.posture_gate import PostureBlocked
from app.core.runtime import (
    CapabilityNotDeclared,
    EntrypointResolutionError,
    InvocationContext,
    ProviderResponse,
    dispatch_capability,
)
from app.core.structured_output import StructuredOutputError, parse_model_json
from app.models import (
    Document,
    Event,
    InstalledModule,
    Matter,
    MatterArtifact,
    MatterSignoff,
)
from app.models.assistant import ROLE_ASSISTANT, ROLE_USER, AssistantMessage
from app.models.document_body import BODY_KIND_EXTRACTED, DocumentBody

from .schemas import (
    AssistantPostRequest,
    AssistantResponseEnvelope,
    AssistantSource,
    AssistantToolCall,
    SuggestedAction,
)

SYSTEM_PROMPT = """You are inside Legalise. UK legal workspace. One matter at a time.

Answer questions about the matter, its documents, its chronology, and prior turns in the thread. Stay terse. Solicitor-cold-readable. Plain English. No marketing tone, no AI tics, no hedging, no em dashes.

If the user's intent is one of the structured workflows below, return a suggested_action chip instead of doing the work yourself in prose. Exception: if the user is clearly confirming a suggested action or says to run it now, and the Tools section exposes a matching installed tool, call that tool instead of returning the same chip again.

- anonymise_document: PII detection + redaction on a document

You see two document sections. "Document index" lists every document in the matter (id, date, filename, tag) but NOT its contents — these are the titles you can see. "Documents" carries the actual passages you have read. When the user has not attached specific documents, the Documents section holds the passages retrieved as most RELEVANT to their question, searched across the whole matter (not just the most recent documents) — but ONLY from documents that have finished indexing. Documents still pending or failed indexing are not searchable yet and will not appear there; if the answer might depend on one of those, say so plainly. When the user attaches specific documents, the Documents section instead holds the full extracted text of exactly those. You have only READ the text that appears in the Documents section. Do not claim to have read, summarised, quoted, or relied on any document that is only in the index. If a question needs a document you can see in the index but have not read, say so plainly and tell the user to attach it (or open it) by id. Never invent document contents. When the answer rests only on documents you have read, say which ones; if you could not see the whole matter, say so.

Cite document content with [doc:<document_id>] using the UUID from the document sections. Cite chronology with [chron:<event_id>] using the UUID from the Chronology section. IDs verbatim, never titles. The workspace resolves them to a clickable label.

England & Wales only. If asked about other jurisdictions, say so and stop.

Return JSON only, matching this shape:
{"content": "<reply text>", "suggested_actions": [{"type": "...", "label": "...", "params": {}}], "tool_calls": []}

You may ask the host to run ONE installed Legalise tool when the user clearly wants a skill run and the Tools section exposes a matching tool. Use provider-agnostic JSON, not vendor-native tool_use:
{"content": "I'll run <tool label>.", "suggested_actions": [], "tool_calls": [{"module_id": "...", "capability_id": "...", "args": {"input": "...", "document_ids": ["..."]}}]}

Only call tools listed in the Tools section. Put selected document UUIDs into args.document_ids when the user attached documents. If the user only asked a normal question, do not call a tool.
"""


# Approximate token budgeting — 4 chars per token is the standard rough
# heuristic used elsewhere in the workspace (e.g. StubProvider).
_CHARS_PER_TOKEN = 4
_HISTORY_MESSAGE_LIMIT = 20
_CHRONOLOGY_EVENT_LIMIT = 12
# How many chunks to retrieve per turn when no documents are attached. Hits
# are grouped by document, so this maps to a smaller number of documents.
_RETRIEVAL_K = 8
# The matter spine: a cheap, always-present orientation layer so the
# assistant knows the whole matter exists even though it only reads a few
# document bodies per turn. Metadata only — titles, not contents.
_DOCUMENT_INDEX_LIMIT = 80
_OUTPUT_SUMMARY_LIMIT = 12
_PER_DOCUMENT_CHAR_BUDGET = 3000 * _CHARS_PER_TOKEN
_DEFAULT_CONTEXT_TOKEN_BUDGET = 12000
_SUMMARY_INTENT_RE = re.compile(
    r"\b(summarise|summarize|summary|sum up|brief)\b", re.I
)
_INVOKABLE_KINDS: frozenset[str] = frozenset({"skill", "tool", "workflow"})
# Per-source excerpt length surfaced to the client under "Sources".
_SOURCE_SNIPPET_CHARS = 240

# One-line orientation lines for the Documents section, so the model knows
# whether it is reading retrieved passages or attached full bodies.
_RETRIEVED_DOCS_NOTE = (
    "Passages retrieved as most relevant to the new user message, searched "
    "across the whole matter. Only indexed documents are searchable; "
    "documents still pending or failed indexing are not shown here."
)
_SELECTED_DOCS_NOTE = "Full extracted text of the documents the user attached."

AssistantEventHandler = Callable[[str, dict[str, Any]], Awaitable[None]]


@dataclass(frozen=True)
class AssistantToolSpec:
    module_id: str
    capability_id: str
    label: str
    description: str
    args_schema: dict[str, Any]
    declaration: dict[str, Any]
    installed_module: InstalledModule


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


async def _load_selected_snippets(
    session: AsyncSession,
    matter_id: uuid.UUID,
    selected_ids: list[uuid.UUID],
) -> list[tuple[Document, str]]:
    """Full extracted bodies for the documents the user explicitly attached.

    The selected-documents path is deliberately unchanged from P2: when the
    user attaches documents, the assistant reads those whole, not retrieved
    fragments. The passive recent-3 fallback is gone — when nothing is
    attached the caller uses ``_load_retrieved_snippets`` instead.
    """
    if not selected_ids:
        return []
    rows = await session.scalars(
        select(Document).where(
            Document.matter_id == matter_id,
            Document.id.in_(selected_ids),
        )
    )
    out: list[tuple[Document, str]] = []
    for doc in rows.all():
        body = await session.scalar(
            select(DocumentBody).where(
                DocumentBody.document_id == doc.id,
                DocumentBody.kind == BODY_KIND_EXTRACTED,
            )
        )
        text = body.extracted_text if body and body.extracted_text else ""
        out.append((doc, _truncate(text, _PER_DOCUMENT_CHAR_BUDGET)))
    return out


async def _load_retrieved_snippets(
    session: AsyncSession,
    matter_id: uuid.UUID,
    query: str,
    k: int,
) -> tuple[list[tuple[Document, str]], list[RetrievalHit]]:
    """Hybrid retrieval across the matter, grouped into per-document snippets.

    Calls ``retrieval.search_documents`` (matter-scoped, indexed-only, hybrid),
    groups the returned chunk hits by their parent document, loads each parent
    ``Document``, and joins that document's relevant chunk text into a single
    snippet. The output shape matches the selected path — ``(Document, text)``
    — so the existing ``_format_documents`` / ``[doc:id]`` citation flow works
    unchanged. Documents appear in relevance order (the order their best chunk
    first surfaced in the fused ranking); chunks within a document are joined in
    reading order. Also returns the raw hits so the caller can audit them.
    """
    hits = await retrieval.search_documents(session, matter_id, query, k=k)
    if not hits:
        return [], []

    grouped: dict[uuid.UUID, list[RetrievalHit]] = {}
    for hit in hits:
        grouped.setdefault(hit.document_id, []).append(hit)

    rows = await session.scalars(
        select(Document).where(
            Document.matter_id == matter_id,
            Document.id.in_(grouped.keys()),
        )
    )
    documents = {doc.id: doc for doc in rows.all()}

    out: list[tuple[Document, str]] = []
    for document_id, doc_hits in grouped.items():
        doc = documents.get(document_id)
        if doc is None:
            continue
        ordered = sorted(doc_hits, key=lambda h: h.chunk_index)
        joined = "\n…\n".join(h.text for h in ordered if h.text)
        out.append((doc, _truncate(joined, _PER_DOCUMENT_CHAR_BUDGET)))
    return out, hits


def _build_sources(
    snippets: list[tuple[Document, str]],
    hits: list[RetrievalHit],
) -> list[AssistantSource]:
    """One ``AssistantSource`` per retrieval hit, in fused-rank order.

    Titles come from the parent ``Document`` objects already loaded for the
    snippets, so this adds no queries. Hits whose parent document was not
    surfaced (e.g. dropped during grouping) are skipped — we only cite
    passages the model actually saw.
    """
    titles = {str(doc.id): doc.filename for doc, _ in snippets}
    sources: list[AssistantSource] = []
    for hit in hits:
        document_id = str(hit.document_id)
        title = titles.get(document_id)
        if title is None:
            continue
        sources.append(
            AssistantSource(
                document_id=document_id,
                title=title,
                snippet=_truncate(hit.text, _SOURCE_SNIPPET_CHARS),
                char_start=hit.char_start,
                char_end=hit.char_end,
                score=hit.score,
            )
        )
    return sources


async def _audit_retrieval_search(
    session: AsyncSession,
    *,
    actor_id: uuid.UUID,
    matter_id: uuid.UUID,
    query: str,
    k: int,
    hits: list[RetrievalHit],
) -> None:
    """Record one ``retrieval.search`` row per turn: what the AI searched for.

    The raw query is never stored — only its SHA-256 hash, matching the
    model.call ``prompt_hash`` convention (so privileged matter content does
    not leak into the audit log). The payload carries the shape of the search
    and the distinct documents it surfaced.

    Written out-of-band (its own committed transaction) rather than on the
    request session. The search has genuinely already run by this point, so
    the row is honest on its own — and, load-bearing: it stops the request
    session from holding the audit chain's per-scope advisory lock (migration
    0030 trigger) across the subsequent model call. Holding it there deadlocks
    every model-failure path, which append their failure audit on a separate
    connection that would block forever on the lock the parked turn holds.
    """
    document_ids = sorted({str(hit.document_id) for hit in hits})
    await audit_out_of_band(
        session,
        "retrieval.search",
        actor_id=actor_id,
        matter_id=matter_id,
        module="assistant",
        resource_type="matter",
        resource_id=str(matter_id),
        prompt_hash=hashlib.sha256(query.encode("utf-8")).hexdigest(),
        payload={
            "source": "retrieval",
            "query_char_len": len(query),
            "k": k,
            "hit_count": len(hits),
            "document_ids": document_ids,
        },
    )


async def _load_document_index(
    session: AsyncSession, matter_id: uuid.UUID, limit: int
) -> tuple[list[Document], int]:
    """Every document in the matter, metadata only, newest first, capped.

    Returns (documents, total_count) so the prompt can be honest when the
    list is truncated.
    """
    total = (
        await session.scalar(
            select(func.count())
            .select_from(Document)
            .where(Document.matter_id == matter_id)
        )
    ) or 0
    rows = await session.scalars(
        select(Document)
        .where(Document.matter_id == matter_id)
        .order_by(Document.uploaded_at.desc())
        .limit(limit)
    )
    return list(rows.all()), int(total)


async def _chronology_total(session: AsyncSession, matter_id: uuid.UUID) -> int:
    total = (
        await session.scalar(
            select(func.count())
            .select_from(Event)
            .where(Event.matter_id == matter_id)
        )
    ) or 0
    return int(total)


async def _load_output_summary(
    session: AsyncSession, matter_id: uuid.UUID, limit: int
) -> list[tuple[MatterArtifact, str]]:
    """Recent generated outputs with their current sign-off decision.

    Current decision is the newest sign-off per artifact (matching the
    signoff state machine), or "awaiting sign-off" if none.
    """
    artifacts = list(
        (
            await session.scalars(
                select(MatterArtifact)
                .where(MatterArtifact.matter_id == matter_id)
                .order_by(MatterArtifact.created_at.desc())
                .limit(limit)
            )
        ).all()
    )
    if not artifacts:
        return []
    signoffs = (
        await session.scalars(
            select(MatterSignoff)
            .where(MatterSignoff.matter_id == matter_id)
            .order_by(MatterSignoff.signed_at.desc())
        )
    ).all()
    latest: dict[uuid.UUID, str] = {}
    for row in signoffs:
        latest.setdefault(row.artifact_id, row.decision)
    return [(a, latest.get(a.id, "awaiting sign-off")) for a in artifacts]


def _text(value: Any) -> str | None:
    return value if isinstance(value, str) and value.strip() else None


def _list_text(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, str)]


def _cap_label(capability: dict[str, Any], manifest: dict[str, Any]) -> str:
    ui = capability.get("ui")
    if isinstance(ui, dict):
        label = _text(ui.get("label"))
        if label:
            return label
    return _text(manifest.get("name")) or _text(capability.get("id")) or "Skill"


def _cap_description(capability: dict[str, Any], manifest: dict[str, Any]) -> str:
    ui = capability.get("ui")
    if isinstance(ui, dict):
        description = _text(ui.get("description"))
        if description:
            return description
    return _text(manifest.get("description")) or ""


async def _load_assistant_tools(session: AsyncSession) -> list[AssistantToolSpec]:
    """Return latest enabled matter-scope invokable installed capabilities.

    This mirrors the frontend's chat picker source of truth: v2
    InstalledModule manifests, not legacy SKILL.md discovery. The runtime
    still revalidates grants and posture during dispatch; this registry is
    just the model-visible menu.
    """
    rows = await session.scalars(
        select(InstalledModule)
        .where(InstalledModule.enabled.is_(True))
        .order_by(
            InstalledModule.module_id.asc(),
            sql_desc(InstalledModule.installed_at),
            sql_desc(InstalledModule.id),
        )
    )

    latest: dict[str, InstalledModule] = {}
    for row in rows.all():
        latest.setdefault(row.module_id, row)

    out: list[AssistantToolSpec] = []
    for installed in latest.values():
        manifest = installed.manifest_snapshot or {}
        capabilities = manifest.get("capabilities")
        if not isinstance(capabilities, list):
            continue
        for raw in capabilities:
            if not isinstance(raw, dict):
                continue
            capability_id = _text(raw.get("id"))
            if not capability_id:
                continue
            scope = _text(raw.get("scope")) or "workspace"
            kind = _text(raw.get("kind")) or "skill"
            if scope != "matter" or kind not in _INVOKABLE_KINDS:
                continue
            args_schema = raw.get("args_schema")
            out.append(
                AssistantToolSpec(
                    module_id=installed.module_id,
                    capability_id=capability_id,
                    label=_cap_label(raw, manifest),
                    description=_cap_description(raw, manifest),
                    args_schema=args_schema if isinstance(args_schema, dict) else {},
                    declaration=raw,
                    installed_module=installed,
                )
            )
    return sorted(out, key=lambda t: (t.label.lower(), t.module_id, t.capability_id))


def _format_history(history: list[AssistantMessage]) -> str:
    if not history:
        return "(no prior turns)"
    lines: list[str] = []
    for msg in history:
        prefix = "User" if msg.role == ROLE_USER else "Assistant"
        lines.append(f"{prefix}: {msg.content}")
    return "\n".join(lines)


def _format_matter_facts(matter: Matter) -> str:
    parts = [
        f"Title: {matter.title}",
        f"Type: {matter.matter_type}",
        f"Status: {matter.status}",
        f"Privilege posture: {matter.privilege_posture}",
        f"Opened: {matter.opened_at.isoformat() if matter.opened_at else 'unknown'}",
    ]
    if matter.cause:
        parts.append(f"Cause: {matter.cause}")
    if matter.retention_until:
        parts.append(f"Retention until: {matter.retention_until.isoformat()}")
    if isinstance(matter.facts, dict):
        client = str(matter.facts.get("client", "")).strip()
        counterparty = str(matter.facts.get("counterparty", "")).strip()
        if client:
            parts.append(f"Client: {client}")
        if counterparty:
            parts.append(f"Counterparty: {counterparty}")
    if matter.case_theory:
        parts.append(f"Case theory: {matter.case_theory}")
    if matter.pivot_fact:
        parts.append(f"Pivot fact: {matter.pivot_fact}")
    return "\n".join(parts)


def _format_chronology(events: list[Event], total: int) -> str:
    if not events:
        return "(no chronology events)"
    lines = [
        f"[chron:{event.id}] {event.event_date.isoformat()} - {event.description}"
        for event in events
    ]
    if total > len(events):
        lines.append(
            f"(showing {len(events)} of {total} events; ask to open the "
            "chronology for the rest)"
        )
    return "\n".join(lines)


def _format_document_index(documents: list[Document], total: int) -> str:
    if not documents:
        return "(no documents uploaded)"
    lines: list[str] = []
    for doc in documents:
        date = doc.uploaded_at.date().isoformat() if doc.uploaded_at else "unknown"
        bits = [f"[doc:{doc.id}]", date, doc.filename]
        if doc.tag:
            bits.append(f"({doc.tag})")
        if doc.from_disclosure:
            bits.append("[disclosure]")
        lines.append(" ".join(bits))
    header = f"{total} document(s) in this matter. Titles only — not contents."
    if len(documents) < total:
        header += (
            f" Showing the {len(documents)} most recent by upload date; ask to "
            "open or attach others by id."
        )
    return header + "\n" + "\n".join(lines)


def _format_outputs(outputs: list[tuple[MatterArtifact, str]]) -> str:
    if not outputs:
        return "(no generated outputs yet)"
    return "\n".join(
        f"{artifact.kind} ({artifact.created_at.date().isoformat()}): {decision}"
        for artifact, decision in outputs
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


def _format_tools(tools: list[AssistantToolSpec]) -> str:
    if not tools:
        return "(no installed Legalise tools are runnable from chat)"
    lines: list[str] = []
    for tool in tools:
        reads = _list_text(tool.declaration.get("reads"))
        writes = _list_text(tool.declaration.get("writes"))
        schema = json.dumps(tool.args_schema, sort_keys=True)
        parts = [
            f"- label: {tool.label}",
            f"  module_id: {tool.module_id}",
            f"  capability_id: {tool.capability_id}",
        ]
        if tool.description:
            parts.append(f"  description: {tool.description}")
        if reads:
            parts.append(f"  reads: {', '.join(reads)}")
        if writes:
            parts.append(f"  writes: {', '.join(writes)}")
        parts.append(f"  args_schema: {schema}")
        lines.append("\n".join(parts))
    return "\n".join(lines)


def _looks_like_summary_request(user_content: str) -> bool:
    return bool(_SUMMARY_INTENT_RE.search(user_content))


def _sentence_chunks(text: str) -> list[str]:
    compact = re.sub(r"\s+", " ", text).strip()
    if not compact:
        return []
    chunks = re.split(r"(?<=[.!?])\s+", compact)
    return [chunk.strip() for chunk in chunks if chunk.strip()]


def _document_summary_content(document: Document, text: str) -> str:
    sentences = _sentence_chunks(text)
    if not sentences:
        return (
            f"I couldn't find extracted text for {document.filename}. "
            f"Open the document to inspect the original file. [doc:{document.id}]"
        )

    lead = sentences[0]
    bullets = sentences[1:4]
    lines = [
        f"Summary of {document.filename}:",
        "",
        f"- {lead}",
    ]
    for sentence in bullets:
        lines.append(f"- {sentence}")
    lines.extend(
        [
            "",
            f"Source: [doc:{document.id}]",
            "",
            "Extract of the opening text, generated without a model. "
            "Add an API key in Settings → API Keys for real summaries.",
        ]
    )
    return "\n".join(lines)


_FILENAME_STOPWORDS = {"the", "a", "an", "of", "and", "doc", "docx", "pdf", "txt"}


def _match_requested_document(
    user_content: str,
    snippets: list[tuple[Document, str]],
) -> tuple[Document, str] | None:
    """Pick the document the user actually asked about.

    One document → that document. Otherwise score each candidate by
    filename/tag token overlap with the request and require a unique
    best match. No match → None (the model path handles ambiguity).
    """
    if not snippets:
        return None
    if len(snippets) == 1:
        return snippets[0]

    request_tokens = {
        t for t in re.split(r"[^a-z0-9]+", user_content.lower()) if len(t) > 2
    } - _FILENAME_STOPWORDS

    scored: list[tuple[int, tuple[Document, str]]] = []
    for doc, text in snippets:
        name_tokens = {
            t
            for t in re.split(r"[^a-z0-9]+", doc.filename.lower())
            if len(t) > 2
        } - _FILENAME_STOPWORDS
        if doc.tag:
            name_tokens |= {
                t
                for t in re.split(r"[^a-z0-9]+", doc.tag.lower())
                if len(t) > 2
            }
        scored.append((len(request_tokens & name_tokens), (doc, text)))

    scored.sort(key=lambda pair: pair[0], reverse=True)
    best_score = scored[0][0]
    if best_score == 0:
        return None
    if len(scored) > 1 and scored[1][0] == best_score:
        return None  # ambiguous — let the model disambiguate
    return scored[0][1]


def _maybe_deterministic_document_summary(
    *,
    user_content: str,
    snippets: list[tuple[Document, str]],
) -> tuple[str, list[SuggestedAction]] | None:
    if not snippets or not _looks_like_summary_request(user_content):
        return None
    matched = _match_requested_document(user_content, snippets)
    if matched is None:
        return None
    document, text = matched
    return (
        _document_summary_content(document, text),
        [
            SuggestedAction(
                type="view_document",
                label="Open document",
                params={"document_id": str(document.id)},
            )
        ],
    )


def _assemble_prompt(
    *,
    matter: Matter,
    history: list[AssistantMessage],
    events: list[Event],
    chronology_total: int,
    document_index: list[Document],
    document_total: int,
    outputs: list[tuple[MatterArtifact, str]],
    snippets: list[tuple[Document, str]],
    retrieval_used: bool,
    tools: list[AssistantToolSpec],
    user_content: str,
    token_budget: int,
) -> str:
    # The matter spine (facts, document index, chronology, outputs) is the
    # cheap always-present orientation layer and is ordered FIRST so it
    # survives the single tail truncation below. The expensive full document
    # bodies, tool list, and conversation history come after — they absorb
    # truncation when the budget overflows. The new user message and the JSON
    # instruction are appended AFTER truncation so they always survive.
    context_sections = [
        "## Matter",
        _format_matter_facts(matter),
        "",
        "## Document index",
        _format_document_index(document_index, document_total),
        "",
        "## Chronology",
        _format_chronology(events, chronology_total),
        "",
        "## Outputs",
        _format_outputs(outputs),
        "",
        "## Documents",
        _RETRIEVED_DOCS_NOTE if retrieval_used else _SELECTED_DOCS_NOTE,
        _format_documents(snippets),
        "",
        "## Tools",
        _format_tools(tools),
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


def _tool_index(tools: list[AssistantToolSpec]) -> dict[tuple[str, str], AssistantToolSpec]:
    return {(t.module_id, t.capability_id): t for t in tools}


def _normalise_tool_args(
    call: AssistantToolCall,
    *,
    request: AssistantPostRequest,
) -> dict[str, Any]:
    args = dict(call.args)
    selected = [str(d) for d in request.selected_document_ids]
    if selected and "document_ids" not in args and "document_id" not in args:
        args["document_ids"] = selected
    if "input" not in args and "question" not in args:
        args["input"] = request.content
    return args


def _make_assistant_provider_call(
    *,
    session: AsyncSession,
    matter: Matter,
    actor_id: uuid.UUID,
    module_id: str,
    capability_id: str,
    invocation_id: uuid.UUID,
    gateway,
):
    async def _provider_call(prompt: str, *, system: str | None = None) -> ProviderResponse:
        result = await gateway.call(
            session=session,
            matter_id=matter.id,
            actor_id=actor_id,
            prompt=prompt,
            model=matter.default_model_id,
            system=system,
            caller_module=module_id,
            payload={
                "capability_id": capability_id,
                "invocation_id": str(invocation_id),
                "source": "assistant_tool_loop",
            },
        )
        return ProviderResponse(
            text=result.text,
            model_id=matter.default_model_id or result.model_used,
            provider=result.model_used,
            tokens_in=result.token_count,
            tokens_out=0,
            cost_micros=None,
            currency=None,
        )

    return _provider_call


async def _dispatch_assistant_tool(
    *,
    session: AsyncSession,
    matter: Matter,
    actor_id: uuid.UUID,
    actor_role: str,
    request: AssistantPostRequest,
    call: AssistantToolCall,
    tools: list[AssistantToolSpec],
    gateway,
) -> tuple[dict[str, Any], uuid.UUID]:
    spec = _tool_index(tools).get((call.module_id, call.capability_id))
    if spec is None:
        raise ValueError(
            f"tool is not installed or not chat-runnable: "
            f"{call.module_id}/{call.capability_id}"
        )

    invocation_id = uuid.uuid4()
    context = InvocationContext(
        actor_user_id=actor_id,
        actor_role=actor_role,
        invocation_id=invocation_id,
    )
    provider_call = _make_assistant_provider_call(
        session=session,
        matter=matter,
        actor_id=actor_id,
        module_id=spec.module_id,
        capability_id=spec.capability_id,
        invocation_id=invocation_id,
        gateway=gateway,
    )
    result = await dispatch_capability(
        session,
        installed_module=spec.installed_module,
        capability_declaration=spec.declaration,
        matter=matter,
        context=context,
        args=_normalise_tool_args(call, request=request),
        provider_call=provider_call,
    )
    return result, invocation_id


def _tool_failure_message(exc: Exception) -> str:
    if isinstance(exc, CapabilityDenied):
        return (
            "I couldn't run that skill because this matter does not grant "
            f"{exc.capability} to {exc.plugin}/{exc.skill}."
        )
    if isinstance(exc, PostureBlocked):
        return "I couldn't run that skill because the matter posture blocked it."
    if isinstance(exc, Phase1Blocked):
        return "I couldn't run that skill because a runtime gate blocked it."
    if isinstance(exc, AdviceBoundaryDenied):
        return "I couldn't run that skill because the advice boundary blocked it."
    if isinstance(exc, (CapabilityNotDeclared, EntrypointResolutionError, ValueError)):
        return f"I couldn't run that skill: {exc}"
    return "I couldn't run that skill. Check Activity for the failed run."


def _final_tool_prompt(
    *,
    original_prompt: str,
    call: AssistantToolCall,
    invocation_id: uuid.UUID,
    result: dict[str, Any],
) -> str:
    return "\n".join(
        [
            original_prompt,
            "",
            "## Tool result",
            json.dumps(
                {
                    "module_id": call.module_id,
                    "capability_id": call.capability_id,
                    "invocation_id": str(invocation_id),
                    "result": result,
                },
                sort_keys=True,
                default=str,
            ),
            "",
            "Write the final assistant reply as JSON only. Do not request another tool. "
            "Mention the useful result and include a suggested action to view Activity "
            "when the run produced an invocation_id.",
        ]
    )


async def run_assistant_turn(
    *,
    session: AsyncSession,
    matter: Matter,
    actor_id: uuid.UUID,
    actor_role: str = "owner",
    request: AssistantPostRequest,
    gateway=model_gateway,
    context_token_budget: int = _DEFAULT_CONTEXT_TOKEN_BUDGET,
    on_event: AssistantEventHandler | None = None,
) -> tuple[AssistantMessage, AssistantMessage]:
    """Persist the user turn, call the model, persist + audit the reply."""
    history = await _load_history(session, matter.id, _HISTORY_MESSAGE_LIMIT)
    events = await _load_chronology(session, matter.id)
    chronology_total = await _chronology_total(session, matter.id)
    document_index, document_total = await _load_document_index(
        session, matter.id, _DOCUMENT_INDEX_LIMIT
    )
    outputs = await _load_output_summary(session, matter.id, _OUTPUT_SUMMARY_LIMIT)

    # Document context. Selected path (P2): attached documents read whole.
    # Otherwise: hybrid retrieval across the whole matter, indexed-only,
    # audited as the "what did the AI search for" trail.
    selected_ids = list(request.selected_document_ids)
    retrieval_used = not selected_ids
    retrieval_hits: list[RetrievalHit] = []
    if selected_ids:
        snippets = await _load_selected_snippets(session, matter.id, selected_ids)
    else:
        snippets, retrieval_hits = await _load_retrieved_snippets(
            session, matter.id, request.content, _RETRIEVAL_K
        )
        await _audit_retrieval_search(
            session,
            actor_id=actor_id,
            matter_id=matter.id,
            query=request.content,
            k=_RETRIEVAL_K,
            hits=retrieval_hits,
        )

    # Sources the answer rests on. Retrieval path only: one per hit. The
    # selected-docs path leaves this empty (the user chose the documents), as
    # does the deterministic-summary path below.
    message_sources = _build_sources(snippets, retrieval_hits)

    tools = await _load_assistant_tools(session)
    if on_event is not None:
        await on_event(
            "context.loaded",
            {
                "history_message_count": len(history),
                "chronology_event_count": len(events),
                "chronology_total": chronology_total,
                "document_index_count": len(document_index),
                "document_total": document_total,
                "output_count": len(outputs),
                "document_count": len(snippets),
                "retrieved_chunk_count": len(retrieval_hits),
                "retrieved_document_count": len(snippets) if retrieval_used else 0,
                "tool_count": len(tools),
            },
        )

    prompt = _assemble_prompt(
        matter=matter,
        history=history,
        events=events,
        chronology_total=chronology_total,
        document_index=document_index,
        document_total=document_total,
        outputs=outputs,
        snippets=snippets,
        retrieval_used=retrieval_used,
        tools=tools,
        user_content=request.content,
        token_budget=context_token_budget,
    )

    user_row = AssistantMessage(
        matter_id=matter.id,
        actor_id=actor_id,
        role=ROLE_USER,
        content=request.content,
        suggested_actions=[],
        sources=[],
    )
    session.add(user_row)
    await session.flush()
    if on_event is not None:
        await on_event("turn.accepted", {"user_message_id": str(user_row.id)})

    async def _persist_deterministic_summary(
        content_out: str, actions: list[SuggestedAction]
    ) -> AssistantMessage:
        assistant_row = AssistantMessage(
            matter_id=matter.id,
            actor_id=actor_id,
            role=ROLE_ASSISTANT,
            content=content_out,
            suggested_actions=[a.model_dump(mode="json") for a in actions],
            sources=[],
            model_used="deterministic-summary",
            prompt_hash=None,
            response_hash=None,
            token_count=0,
        )
        session.add(assistant_row)
        await session.flush()
        if on_event is not None:
            await on_event(
                "turn.deterministic",
                {
                    "assistant_message_id": str(assistant_row.id),
                    "kind": "document_summary",
                },
            )

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
                "parse_failed": False,
                "deterministic": "document_summary",
            },
        )
        await session.commit()
        await session.refresh(user_row)
        await session.refresh(assistant_row)
        return assistant_row

    if on_event is not None:
        await on_event("model.start", {"stage": "assistant"})
    try:
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
            caller_module="assistant",
        )
    except ProviderKeyMissing:
        # Keyless fallback: a summary-shaped request over an identifiable
        # document still answers deterministically (extract, honestly
        # labelled) so the demo loop works without a key. Anything else
        # propagates to the router's provider_key_missing envelope.
        deterministic = _maybe_deterministic_document_summary(
            user_content=request.content,
            snippets=snippets,
        )
        if deterministic is None:
            raise
        content_out, actions = deterministic
        assistant_row = await _persist_deterministic_summary(content_out, actions)
        return user_row, assistant_row

    parse_failed = False
    try:
        envelope = parse_model_json(result.text, AssistantResponseEnvelope)
        content_out = envelope.content
        actions: list[SuggestedAction] = list(envelope.suggested_actions)
        tool_calls = list(envelope.tool_calls)
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
        tool_calls = []

    tool_invocation_id: uuid.UUID | None = None
    tool_result: dict[str, Any] | None = None
    tool_failed = False
    if not parse_failed and tool_calls:
        call = tool_calls[0]
        try:
            if on_event is not None:
                await on_event(
                    "tool.start",
                    {
                        "module_id": call.module_id,
                        "capability_id": call.capability_id,
                    },
                )
            tool_result, tool_invocation_id = await _dispatch_assistant_tool(
                session=session,
                matter=matter,
                actor_id=actor_id,
                actor_role=actor_role,
                request=request,
                call=call,
                tools=tools,
                gateway=gateway,
            )
            if on_event is not None:
                await on_event(
                    "tool.end",
                    {
                        "module_id": call.module_id,
                        "capability_id": call.capability_id,
                        "invocation_id": str(tool_invocation_id),
                    },
                )
                await on_event("model.start", {"stage": "assistant.final"})
            final_result = await gateway.call(
                session=session,
                matter_id=matter.id,
                actor_id=actor_id,
                prompt=_final_tool_prompt(
                    original_prompt=prompt,
                    call=call,
                    invocation_id=tool_invocation_id,
                    result=tool_result,
                ),
                model=matter.default_model_id,
                posture=PrivilegePosture(matter.privilege_posture),
                system=SYSTEM_PROMPT,
                resource_type="assistant_message",
                resource_id=str(user_row.id),
                payload={
                    "stage": "assistant.final",
                    "module": "assistant",
                    "tool_module_id": call.module_id,
                    "tool_capability_id": call.capability_id,
                    "tool_invocation_id": str(tool_invocation_id),
                },
                caller_module="assistant",
            )
            try:
                final_envelope = parse_model_json(
                    final_result.text, AssistantResponseEnvelope
                )
                content_out = final_envelope.content
                actions = list(final_envelope.suggested_actions)
            except StructuredOutputError:
                content_out = (
                    "The skill ran, but I couldn't structure the final reply. "
                    "Open Activity to inspect the run."
                )
                actions = [
                    SuggestedAction(
                        type="view_audit",
                        label="Open Activity",
                        params={"invocation_id": str(tool_invocation_id)},
                    )
                ]
            result = final_result
        except Exception as exc:
            # Provider errors still need the router's normal HTTP translation.
            from app.core.api import PROVIDER_HTTP_EXCEPTIONS

            if isinstance(exc, PROVIDER_HTTP_EXCEPTIONS):
                raise
            tool_failed = True
            if on_event is not None:
                await on_event(
                    "tool.error",
                    {
                        "module_id": call.module_id,
                        "capability_id": call.capability_id,
                        "message": str(exc),
                    },
                )
            content_out = _tool_failure_message(exc)
            actions = [
                SuggestedAction(
                    type="view_audit",
                    label="Open Activity",
                    params={},
                )
            ]

    assistant_row = AssistantMessage(
        matter_id=matter.id,
        actor_id=actor_id,
        role=ROLE_ASSISTANT,
        content=content_out,
        suggested_actions=[a.model_dump(mode="json") for a in actions],
        sources=[s.model_dump(mode="json") for s in message_sources],
        model_used=result.model_used,
        prompt_hash=result.prompt_hash,
        response_hash=result.response_hash,
        token_count=result.token_count,
    )
    session.add(assistant_row)
    await session.flush()
    if on_event is not None:
        await on_event(
            "turn.end",
            {
                "assistant_message_id": str(assistant_row.id),
                "tool_invocation_id": str(tool_invocation_id) if tool_invocation_id else None,
                "tool_failed": tool_failed,
            },
        )

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
            "tool_call_count": len(tool_calls),
            "tool_invocation_id": str(tool_invocation_id) if tool_invocation_id else None,
            "tool_result": tool_result,
            "tool_failed": tool_failed,
        },
    )
    await session.commit()
    await session.refresh(user_row)
    await session.refresh(assistant_row)
    return user_row, assistant_row


__all__ = ["run_assistant_turn", "SYSTEM_PROMPT"]
