"""Assistant router — `GET`/`POST` `/api/matters/{slug}/assistant/messages`.

`GET` returns the matter's full conversation; `POST` appends a user
message, runs one turn, and returns both rows.
"""

from __future__ import annotations

import asyncio
import json
from typing import Any

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.api import PROVIDER_HTTP_EXCEPTIONS, provider_error_http_exception
from app.core.auth import current_user
from app.core.db import get_session
from app.core.limits import check_assistant_message
from app.core.matter_access import resolve_owned_open_matter
from app.models import Matter, User
from app.models.assistant import AssistantMessage as AssistantMessageRow

from .pipeline import run_assistant_turn
from .schemas import (
    AssistantMessage,
    AssistantPostRequest,
    AssistantPostResponse,
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
    return AssistantMessage(
        id=row.id,
        role=row.role,  # type: ignore[arg-type]
        content=row.content,
        suggested_actions=actions,
        created_at=row.created_at,
    )


@router.get(
    "/{slug}/assistant/messages",
    response_model=list[AssistantMessage],
)
async def list_messages(
    slug: str,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> list[AssistantMessage]:
    matter = await _resolve_matter(session, slug, user.id)
    rows = await session.scalars(
        select(AssistantMessageRow)
        .where(AssistantMessageRow.matter_id == matter.id)
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
    try:
        user_row, assistant_row = await run_assistant_turn(
            session=session,
            matter=matter,
            actor_id=user.id,
            actor_role=getattr(user, "role", "owner"),
            request=request,
        )
    except PROVIDER_HTTP_EXCEPTIONS as exc:
        raise provider_error_http_exception(exc) from exc

    return AssistantPostResponse(
        user=_to_schema(user_row),
        assistant=_to_schema(assistant_row),
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
                await queue.put({"event": "turn.start", "data": {"slug": slug}})
                try:
                    user_row, assistant_row = await run_assistant_turn(
                        session=bg_session,
                        matter=matter,
                        actor_id=user.id,
                        actor_role=getattr(user, "role", "owner"),
                        request=request_body,
                        on_event=on_event,
                    )
                except PROVIDER_HTTP_EXCEPTIONS as exc:
                    http_exc = provider_error_http_exception(exc)
                    await queue.put(
                        {
                            "event": "error",
                            "data": {
                                "message": str(http_exc.detail),
                                "code": http_exc.status_code,
                            },
                        }
                    )
                    return
                await queue.put(
                    {
                        "event": "result",
                        "data": AssistantPostResponse(
                            user=_to_schema(user_row),
                            assistant=_to_schema(assistant_row),
                        ).model_dump(mode="json"),
                    }
                )
        except Exception as exc:
            await queue.put({"event": "error", "data": {"message": str(exc)}})
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
