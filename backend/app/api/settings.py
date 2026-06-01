"""Settings router — user-scoped configuration.

Endpoints:
- GET    /api/settings/keys                 list user's keys (masked)
- POST   /api/settings/keys                 upsert a provider key
- DELETE /api/settings/keys/{provider}      remove a provider key
- GET    /api/settings/profile              fastapi-users' /users/me alias
- PATCH  /api/settings/profile              fastapi-users' /users/me alias

Keys are never returned in plaintext after write. The response gives a
masked tail (last 4 chars), provider, and timestamps.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import current_user
from app.core.db import get_session
from app.core.user_keys import upsert_user_provider_key
from app.models import User, UserApiKey


router = APIRouter()


SUPPORTED_PROVIDERS = ("anthropic", "openai")
Provider = Literal["anthropic", "openai"]


class UserApiKeyRead(BaseModel):
    provider: str
    last_used_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class UserApiKeyUpsert(BaseModel):
    provider: Provider
    api_key: str = Field(min_length=8, max_length=512)


@router.get("/keys", response_model=list[UserApiKeyRead])
async def list_keys(
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> list[UserApiKey]:
    rows = await session.scalars(
        select(UserApiKey)
        .where(UserApiKey.user_id == user.id)
        .order_by(UserApiKey.provider)
    )
    return list(rows.all())


@router.post("/keys", response_model=UserApiKeyRead, status_code=status.HTTP_201_CREATED)
async def upsert_key(
    body: UserApiKeyUpsert,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> UserApiKey:
    if body.provider not in SUPPORTED_PROVIDERS:
        raise HTTPException(400, f"provider must be one of {SUPPORTED_PROVIDERS}")
    # Detect whether this is a fresh insert or a rotation, before the upsert
    # collapses the row.
    existing = await session.scalar(
        select(UserApiKey.provider).where(
            UserApiKey.user_id == user.id, UserApiKey.provider == body.provider
        )
    )
    is_rotation = existing is not None
    row = await upsert_user_provider_key(session, user.id, body.provider, body.api_key)
    # Audit row.
    from app.core.api import audit

    await audit.log(
        session,
        "user.key.configured",
        actor_id=user.id,
        module="core.settings",
        resource_type="user_api_key",
        resource_id=str(row.id),
        payload={
            "provider": body.provider,
            "action": "rotated" if is_rotation else "added",
        },
    )
    await session.commit()
    await session.refresh(row)
    return row


@router.delete(
    "/keys/{provider}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
)
async def delete_key(
    provider: str,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> Response:
    if provider not in SUPPORTED_PROVIDERS:
        raise HTTPException(400, f"provider must be one of {SUPPORTED_PROVIDERS}")
    result = await session.execute(
        delete(UserApiKey).where(
            UserApiKey.user_id == user.id, UserApiKey.provider == provider
        )
    )
    if result.rowcount == 0:
        raise HTTPException(404, f"no key found for provider: {provider}")
    # Audit row.
    from app.core.api import audit

    await audit.log(
        session,
        "user.key.revoked",
        actor_id=user.id,
        module="core.settings",
        resource_type="user_api_key",
        resource_id=None,
        payload={"provider": provider},
    )
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
