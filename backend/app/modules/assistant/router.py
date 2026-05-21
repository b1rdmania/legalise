"""Assistant router — `GET`/`POST` `/api/matters/{slug}/assistant/messages`.

`GET` returns the matter's full conversation; `POST` appends a user
message, runs one turn, and returns both rows.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import current_user
from app.core.db import get_session
from app.core.limits import check_assistant_message
from app.core.model_gateway import PrivilegePaused
from app.core.user_keys import ProviderKeyMissing, ProviderUpstreamError
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


async def _resolve_matter(session: AsyncSession, slug: str, user_id) -> Matter:
    matter = await session.scalar(
        select(Matter).where(Matter.slug == slug, Matter.created_by_id == user_id)
    )
    if matter is None:
        raise HTTPException(404, f"matter not found: {slug}")
    return matter


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
            request=request,
        )
    except PrivilegePaused as exc:
        raise HTTPException(409, str(exc)) from exc
    except ProviderKeyMissing as exc:
        raise HTTPException(
            422,
            detail={
                "error": "provider_key_missing",
                "provider": exc.provider,
                "message": str(exc),
            },
        ) from exc
    except ProviderUpstreamError as exc:
        raise HTTPException(
            502,
            detail={
                "error": exc.code,
                "provider": exc.provider,
                "upstream_status": exc.upstream_status,
                "message": str(exc),
            },
        ) from exc

    return AssistantPostResponse(
        user=_to_schema(user_row),
        assistant=_to_schema(assistant_row),
    )
