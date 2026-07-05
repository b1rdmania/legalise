"""Assistant router — `GET`/`POST` `/api/matters/{slug}/assistant/messages`.

`GET` returns the matter's full conversation; `POST` appends a user
message, runs one turn, and returns both rows.
"""

from __future__ import annotations

import asyncio
import json
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.api import PROVIDER_HTTP_EXCEPTIONS, audit, provider_error_http_exception
from app.core.auth import current_user
from app.core.db import get_session
from app.core.limits import check_assistant_message
from app.core.matter_access import resolve_owned_open_matter
from app.core.matter_artifacts import write_artifact
from app.models import Matter, MatterArtifact, User
from app.models.assistant import ROLE_ASSISTANT
from app.models.assistant import AssistantMessage as AssistantMessageRow
from app.models.assistant import AssistantThread as AssistantThreadRow

from .pipeline import derive_thread_title, run_assistant_turn
from .schemas import (
    AssistantDraftSaveResponse,
    AssistantMessage,
    AssistantPostRequest,
    AssistantPostResponse,
    AssistantSource,
    AssistantThread,
    AssistantThreadCreateRequest,
    SuggestedAction,
)

router = APIRouter()
_SSE_SENTINEL: dict[str, Any] = {"__done__": True}


def _sse_format(event: str, data: dict[str, Any]) -> bytes:
    return f"event: {event}\ndata: {json.dumps(data, default=str)}\n\n".encode()


async def _resolve_matter(session: AsyncSession, slug: str, user_id) -> Matter:
    """Delegate to the shared archived-aware resolver — assistant
    surfaces are not reachable on tombstoned matters."""
    return await resolve_owned_open_matter(session, slug, user_id)


def _to_schema(row: AssistantMessageRow) -> AssistantMessage:
    actions = [
        SuggestedAction.model_validate(a)
        for a in (row.suggested_actions or [])
        if isinstance(a, dict)
    ]
    sources = [
        AssistantSource.model_validate(s)
        for s in (row.sources or [])
        if isinstance(s, dict)
    ]
    return AssistantMessage(
        id=row.id,
        role=row.role,  # type: ignore[arg-type]
        content=row.content,
        suggested_actions=actions,
        sources=sources,
        model_used=row.model_used,
        created_at=row.created_at,
    )


async def _validate_thread(
    session: AsyncSession, matter: Matter, thread_id: uuid.UUID
) -> AssistantThreadRow:
    """Fetch a thread, 404 if it does not belong to this matter."""
    thread = await session.scalar(
        select(AssistantThreadRow).where(
            AssistantThreadRow.id == thread_id,
            AssistantThreadRow.matter_id == matter.id,
        )
    )
    if thread is None:
        raise HTTPException(status_code=404, detail="Thread not found")
    return thread


async def _create_thread(
    session: AsyncSession,
    matter: Matter,
    user_id: uuid.UUID,
    *,
    title: str | None,
) -> AssistantThreadRow:
    """Create a thread, flush so it has an id, and audit the creation."""
    thread = AssistantThreadRow(
        matter_id=matter.id,
        title=title,
        created_by_id=user_id,
    )
    session.add(thread)
    await session.flush()
    await audit.log(
        session,
        "assistant.thread.created",
        actor_id=user_id,
        matter_id=matter.id,
        module="assistant",
        resource_type="assistant_thread",
        resource_id=str(thread.id),
        payload={"has_title": title is not None},
    )
    return thread


async def _resolve_or_create_thread(
    session: AsyncSession,
    matter: Matter,
    user_id: uuid.UUID,
    request: AssistantPostRequest,
) -> AssistantThreadRow:
    """For a turn: use the requested thread (validated) or open a new one.

    A new thread is titled from the first ~6 words of the user message, so
    the thread list reads sensibly from its very first turn.
    """
    if request.thread_id is not None:
        return await _validate_thread(session, matter, request.thread_id)
    return await _create_thread(
        session,
        matter,
        user_id,
        title=derive_thread_title(request.content),
    )


async def _latest_thread_id(
    session: AsyncSession, matter_id: uuid.UUID
) -> uuid.UUID | None:
    """The thread of the matter's most recent message, or None."""
    return await session.scalar(
        select(AssistantMessageRow.thread_id)
        .where(AssistantMessageRow.matter_id == matter_id)
        .order_by(AssistantMessageRow.created_at.desc())
        .limit(1)
    )


@router.get(
    "/{slug}/assistant/threads",
    response_model=list[AssistantThread],
)
async def list_threads(
    slug: str,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> list[AssistantThread]:
    matter = await _resolve_matter(session, slug, user.id)
    threads = (
        await session.scalars(
            select(AssistantThreadRow).where(
                AssistantThreadRow.matter_id == matter.id
            )
        )
    ).all()
    rollups = (
        await session.execute(
            select(
                AssistantMessageRow.thread_id,
                func.count().label("message_count"),
                func.max(AssistantMessageRow.created_at).label("last_message_at"),
            )
            .where(AssistantMessageRow.matter_id == matter.id)
            .group_by(AssistantMessageRow.thread_id)
        )
    ).all()
    counts = {row.thread_id: (row.message_count, row.last_message_at) for row in rollups}

    out: list[AssistantThread] = []
    for thread in threads:
        message_count, last_message_at = counts.get(thread.id, (0, None))
        out.append(
            AssistantThread(
                id=thread.id,
                title=thread.title,
                created_at=thread.created_at,
                message_count=message_count,
                last_message_at=last_message_at,
            )
        )
    # Most-recently-active first; threads with no messages yet sort last,
    # then by creation time.
    out.sort(
        key=lambda t: (
            t.last_message_at is not None,
            t.last_message_at or t.created_at,
            t.created_at,
        ),
        reverse=True,
    )
    return out


@router.post(
    "/{slug}/assistant/threads",
    response_model=AssistantThread,
)
async def create_thread(
    slug: str,
    request: AssistantThreadCreateRequest,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> AssistantThread:
    matter = await _resolve_matter(session, slug, user.id)
    thread = await _create_thread(
        session, matter, user.id, title=request.title or None
    )
    await session.commit()
    await session.refresh(thread)
    return AssistantThread(
        id=thread.id,
        title=thread.title,
        created_at=thread.created_at,
        message_count=0,
        last_message_at=None,
    )


@router.get(
    "/{slug}/assistant/threads/{thread_id}/messages",
    response_model=list[AssistantMessage],
)
async def list_thread_messages(
    slug: str,
    thread_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> list[AssistantMessage]:
    matter = await _resolve_matter(session, slug, user.id)
    await _validate_thread(session, matter, thread_id)
    rows = await session.scalars(
        select(AssistantMessageRow)
        .where(AssistantMessageRow.thread_id == thread_id)
        .order_by(AssistantMessageRow.created_at.asc())
    )
    return [_to_schema(r) for r in rows.all()]


@router.get(
    "/{slug}/assistant/messages",
    response_model=list[AssistantMessage],
)
async def list_messages(
    slug: str,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> list[AssistantMessage]:
    """Back-compat single-thread read: the most-recently-active thread.

    Pre-threads clients call this without a thread id. We scope to the
    latest thread so the response stays a single coherent conversation
    rather than every thread's messages interleaved.
    """
    matter = await _resolve_matter(session, slug, user.id)
    latest_thread_id = await _latest_thread_id(session, matter.id)
    if latest_thread_id is None:
        return []
    rows = await session.scalars(
        select(AssistantMessageRow)
        .where(AssistantMessageRow.thread_id == latest_thread_id)
        .order_by(AssistantMessageRow.created_at.asc())
    )
    return [_to_schema(r) for r in rows.all()]


@router.post(
    "/{slug}/assistant/messages",
    response_model=AssistantPostResponse,
)
async def post_message(
    slug: str,
    request: AssistantPostRequest,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> AssistantPostResponse:
    matter = await _resolve_matter(session, slug, user.id)
    await check_assistant_message(user.id, session)
    thread = await _resolve_or_create_thread(session, matter, user.id, request)
    # Commit the thread (and its `assistant.thread.created` audit row) before
    # running the turn. The audit insert takes the per-scope audit-chain
    # advisory lock and holds it until commit; the turn then writes
    # `retrieval.search` out-of-band on a separate connection, which would
    # deadlock against that held lock. Committing here releases it first.
    await session.commit()
    try:
        user_row, assistant_row = await run_assistant_turn(
            session=session,
            matter=matter,
            actor_id=user.id,
            thread_id=thread.id,
            actor_role=getattr(user, "role", "owner"),
            request=request,
        )
    except PROVIDER_HTTP_EXCEPTIONS as exc:
        raise provider_error_http_exception(exc) from exc

    return AssistantPostResponse(
        user=_to_schema(user_row),
        assistant=_to_schema(assistant_row),
        thread_id=thread.id,
    )


# Artifact kind for an assistant reply saved as a draft output. Listed in
# REVIEW_ELIGIBLE_KINDS (matter_review.py) so the saved draft enters the
# existing review/sign-off flow with no special-casing downstream.
CHAT_DRAFT_KIND = "chat_draft"
SAVE_DRAFT_MODULE_ID = "assistant"
SAVE_DRAFT_CAPABILITY_ID = "assistant.save_draft"


def _draft_payload(row: AssistantMessageRow) -> dict[str, Any]:
    """Artifact payload for a chat-saved draft.

    Shape matches `skill_response` (`output` + `model_id` +
    `source_anchors`) so the existing preview/review/sign surfaces render
    it without new code paths, plus explicit chat provenance: the source
    message id, hashes, and the retrieval sources exactly as persisted on
    the message. `model_id` may be null (keyless / extractive answers) —
    the provenance records what happened, it does not gate.
    """
    sources = [s for s in (row.sources or []) if isinstance(s, dict)]
    anchors: list[dict[str, Any]] = []
    for i, s in enumerate(sources):
        anchors.append(
            {
                "id": f"src-{i + 1}",
                "source_type": "document",
                "document_id": s.get("document_id"),
                "filename": s.get("title"),
                "label": s.get("title"),
                "quote": s.get("snippet"),
            }
        )
    return {
        "output": row.content,
        "model_id": row.model_used,
        "saved_from": "assistant_message",
        "source_message_id": str(row.id),
        "thread_id": str(row.thread_id) if row.thread_id else None,
        "prompt_hash": row.prompt_hash,
        "response_hash": row.response_hash,
        "sources": sources,
        "source_anchors": anchors,
    }


@router.post(
    "/{slug}/assistant/messages/{message_id}/save-draft",
    response_model=AssistantDraftSaveResponse,
    status_code=201,
)
async def save_message_as_draft(
    slug: str,
    message_id: uuid.UUID,
    response: Response,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> AssistantDraftSaveResponse:
    """Save an assistant reply as a draft output on the matter.

    Creates a `chat_draft` matter artifact from the persisted message —
    content plus provenance (source message id, model, hashes, retrieval
    sources). The artifact is the same first-class output the review and
    sign-off endpoints already operate on, so the saved draft flows into
    draft → review → sign with no special-casing.

    Idempotent per message: saving the same reply again returns the
    existing draft (200, `already_existed=true`). Uses the shared
    archived-aware matter resolver — no drafts on tombstoned matters.
    """
    matter = await _resolve_matter(session, slug, user.id)
    row = await session.scalar(
        select(AssistantMessageRow).where(
            AssistantMessageRow.id == message_id,
            AssistantMessageRow.matter_id == matter.id,
        )
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Message not found")
    if row.role != ROLE_ASSISTANT:
        raise HTTPException(
            status_code=422,
            detail="Only assistant replies can be saved as drafts",
        )

    # Idempotency: the message id doubles as the artifact's invocation id,
    # and (invocation_id, kind) is unique — one draft per message.
    existing = await session.scalar(
        select(MatterArtifact).where(
            MatterArtifact.invocation_id == row.id,
            MatterArtifact.kind == CHAT_DRAFT_KIND,
            MatterArtifact.matter_id == matter.id,
        )
    )
    if existing is not None:
        response.status_code = 200
        return AssistantDraftSaveResponse(
            artifact_id=existing.id, kind=existing.kind, already_existed=True
        )

    artifact = await write_artifact(
        session,
        matter=matter,
        capability_id=SAVE_DRAFT_CAPABILITY_ID,
        module_id=SAVE_DRAFT_MODULE_ID,
        invocation_id=row.id,
        kind=CHAT_DRAFT_KIND,
        payload=_draft_payload(row),
        actor_user_id=user.id,
    )
    # Supervision legibility (M13): the record states that this draft was
    # prepared by AI in chat and which message it came from.
    await audit.log(
        session,
        "assistant.draft.saved",
        actor_id=user.id,
        matter_id=matter.id,
        module=SAVE_DRAFT_MODULE_ID,
        resource_type="matter_artifact",
        resource_id=str(artifact.id),
        payload={
            "source_message_id": str(row.id),
            "thread_id": str(row.thread_id) if row.thread_id else None,
            "model_used": row.model_used,
            "prompt_hash": row.prompt_hash,
            "response_hash": row.response_hash,
            "source_count": len(row.sources or []),
            "kind": CHAT_DRAFT_KIND,
        },
    )
    await session.commit()
    return AssistantDraftSaveResponse(
        artifact_id=artifact.id, kind=artifact.kind, already_existed=False
    )


@router.post(
    "/{slug}/assistant/messages/stream",
)
async def post_message_stream(
    slug: str,
    request_body: AssistantPostRequest,
    request: Request,
    user: User = Depends(current_user),
) -> StreamingResponse:
    """SSE progress variant of POST /assistant/messages.

    This is progress streaming, not token streaming. The assistant loop emits
    context/model/tool milestones and a final `result` frame with the same
    response envelope the normal POST returns.
    """
    factory = request.app.state.session_factory
    queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()

    async def on_event(name: str, payload: dict[str, Any]) -> None:
        await queue.put({"event": name, "data": payload})

    async def run_turn() -> None:
        try:
            async with factory() as bg_session:
                matter = await _resolve_matter(bg_session, slug, user.id)
                await check_assistant_message(user.id, bg_session)
                try:
                    thread = await _resolve_or_create_thread(
                        bg_session, matter, user.id, request_body
                    )
                except HTTPException as exc:
                    await queue.put(
                        {
                            "event": "error",
                            "data": {
                                "message": str(exc.detail),
                                "code": exc.status_code,
                            },
                        }
                    )
                    return
                # See post_message: commit the thread + its audit row before
                # the turn so the audit-chain advisory lock isn't held across
                # the out-of-band retrieval.search write (deadlock otherwise).
                await bg_session.commit()
                await queue.put(
                    {
                        "event": "turn.start",
                        "data": {"slug": slug, "thread_id": str(thread.id)},
                    }
                )
                try:
                    user_row, assistant_row = await run_assistant_turn(
                        session=bg_session,
                        matter=matter,
                        actor_id=user.id,
                        thread_id=thread.id,
                        actor_role=getattr(user, "role", "owner"),
                        request=request_body,
                        on_event=on_event,
                    )
                except PROVIDER_HTTP_EXCEPTIONS as exc:
                    http_exc = provider_error_http_exception(exc)
                    detail = http_exc.detail
                    if isinstance(detail, dict):
                        error_data = {
                            **detail,
                            "message": str(detail.get("message") or detail),
                            "code": http_exc.status_code,
                        }
                    else:
                        error_data = {
                            "message": str(detail),
                            "code": http_exc.status_code,
                        }
                    await queue.put(
                        {
                            "event": "error",
                            "data": error_data,
                        }
                    )
                    return
                await queue.put(
                    {
                        "event": "result",
                        "data": AssistantPostResponse(
                            user=_to_schema(user_row),
                            assistant=_to_schema(assistant_row),
                            thread_id=thread.id,
                        ).model_dump(mode="json"),
                    }
                )
        except Exception as exc:
            # Never emit a blank error: some exceptions (notably
            # cryptography's InvalidTag on a key that can't be decrypted)
            # stringify to "", which surfaces as an empty error bubble in
            # the chat. Fall back to the exception type so the user always
            # gets something actionable.
            message = str(exc).strip() or (
                f"The model call failed ({type(exc).__name__}). "
                "Check your provider key in Settings."
            )
            await queue.put({"event": "error", "data": {"message": message}})
        finally:
            await queue.put(_SSE_SENTINEL)

    asyncio.create_task(run_turn())

    async def event_stream():
        while True:
            item = await queue.get()
            if item is _SSE_SENTINEL or item.get("__done__"):
                break
            yield _sse_format(item["event"], item["data"])

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache"},
    )
