"""Letters router — matter-type-aware draft surface over the plugin bridge.

Two endpoints:

- `GET  /api/matters/{slug}/letters/catalog` — letter types eligible for this
  matter, default first. Drives the frontend selector.
- `POST /api/matters/{slug}/letters/draft`   — resolves the catalogue id to a
  plugin/skill, invokes through the plugin bridge with matter context, returns
  the draft markdown.

Pre-Day-7 finding (UNADDRESSED until now): `cpr-letter-drafter` is civil-only
(PACC / sector protocols). Khan v Acme is ET. Routing is by `matter.matter_type`
via `catalog.resolve`; the catalogue endpoint shapes the selector accordingly.

Audit shape per draft: `plugin.invoked` + `model.call` (both via bridge) +
`http.post` (middleware) = three rows.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.adapters import plugin_bridge as plugin_bridge_module
from app.core.auth import current_user
from app.core.db import get_session
from app.core.model_gateway import PrivilegePaused
from app.core.user_keys import ProviderKeyMissing
from app.models import Matter, User

from .catalog import catalogue_for_matter_type, resolve
from .schemas import (
    LetterCatalogueResponse,
    LetterDraftRequest,
    LetterDraftResponse,
    LetterTypeRead,
)


router = APIRouter()


@router.get("/{slug}/letters/catalog", response_model=LetterCatalogueResponse)
async def letter_catalogue(
    slug: str,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> LetterCatalogueResponse:
    matter = await session.scalar(
        select(Matter).where(Matter.slug == slug, Matter.created_by_id == user.id)
    )
    if matter is None:
        raise HTTPException(404, f"matter not found: {slug}")

    eligible = catalogue_for_matter_type(matter.matter_type)
    return LetterCatalogueResponse(
        matter_slug=matter.slug,
        matter_type=matter.matter_type,
        letter_types=[
            LetterTypeRead(
                id=lt.id,
                label=lt.label,
                plugin=lt.plugin,
                skill=lt.skill,
                summary=lt.summary,
                is_default=matter.matter_type in lt.is_default_for,
            )
            for lt in eligible
        ],
    )


@router.post("/{slug}/letters/draft", response_model=LetterDraftResponse)
async def draft_letter(
    slug: str,
    body: LetterDraftRequest,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> LetterDraftResponse:
    matter = await session.scalar(
        select(Matter).where(Matter.slug == slug, Matter.created_by_id == user.id)
    )
    if matter is None:
        raise HTTPException(404, f"matter not found: {slug}")

    try:
        lt = resolve(body.letter_type, matter.matter_type)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc

    bridge = plugin_bridge_module.bridge
    if bridge is None:
        raise HTTPException(503, "plugin bridge not initialised")

    try:
        result = await bridge.invoke(
            session=session,
            matter_id=matter.id,
            actor_id=user.id,
            plugin=lt.plugin,
            skill=lt.skill,
            inputs=body.inputs,
        )
    except FileNotFoundError as exc:
        raise HTTPException(404, str(exc)) from exc
    except PrivilegePaused as exc:
        raise HTTPException(409, str(exc)) from exc
    except ProviderKeyMissing as exc:
        raise HTTPException(
            422,
            detail={"error": "provider_key_missing", "provider": exc.provider, "message": str(exc)},
        ) from exc
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc

    await session.commit()
    return LetterDraftResponse(
        matter_slug=result.matter_slug,
        letter_type=lt.id,
        plugin=result.plugin,
        skill=result.skill,
        draft_markdown=result.response_text,
        model_used=result.model_used,
        token_count=result.token_count,
        latency_ms=result.latency_ms,
    )
