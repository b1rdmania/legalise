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
from app.adapters.plugin_bridge import SkillDisabled
from app.core.auth import current_user
from app.core.db import get_session
from app.core.limits import check_generated_artefact
from app.core.matter_access import resolve_owned_open_matter
from app.core.model_gateway import PrivilegePaused, gateway as model_gateway
from app.core.user_keys import ProviderKeyMissing, ProviderUpstreamError
from app.core.storage import StorageWriteError
from app.core.api import audit
from app.models import Matter, User

from .catalog import catalogue_for_matter_type, resolve
from .schemas import (
    LetterCatalogueResponse,
    LetterDraftDocxRequest,
    LetterDraftDocxResponse,
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
    matter = await resolve_owned_open_matter(session, slug, user.id)
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
    matter = await resolve_owned_open_matter(session, slug, user.id)
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
    except SkillDisabled as exc:
        raise HTTPException(403, str(exc)) from exc
    except PrivilegePaused as exc:
        raise HTTPException(409, str(exc)) from exc
    except ProviderKeyMissing as exc:
        raise HTTPException(
            422,
            detail={"error": "provider_key_missing", "provider": exc.provider, "message": str(exc)},
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


@router.post("/{slug}/letters/draft/docx", response_model=LetterDraftDocxResponse)
async def draft_letter_docx(
    slug: str,
    body: LetterDraftDocxRequest,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> LetterDraftDocxResponse:
    """Render an existing letter draft to .docx.

    Accepts the already-rendered markdown from the prior `/letters/draft`
    call rather than re-invoking the plugin — the user has already paid
    for one model call to get this text. Returns a download handle and
    writes a `module.letters.docx.exported` audit row.
    """
    matter = await resolve_owned_open_matter(session, slug, user.id)
    await check_generated_artefact(user.id, session)

    try:
        result = await model_gateway.invoke_tool(
            "generate_docx",
            session=session,
            actor_id=user.id,
            matter_id=matter.id,
            inputs={
                "title": body.title,
                "body_markdown": body.draft_markdown,
                "options": {
                    "matter_id": str(matter.id),
                    "matter_slug": matter.slug,
                },
            },
        )
    except PrivilegePaused as exc:
        raise HTTPException(409, str(exc)) from exc
    except StorageWriteError as exc:
        raise HTTPException(
            502,
            detail={
                "error": "storage_write_failed",
                "message": "Failed to write generated letter to object storage.",
            },
        ) from exc

    # Recover the file uuid from the storage path the tool wrote. The
    # tool's `document.generated` audit row already records this — but
    # the row's `id` is not surfaced via invoke_tool, so we re-derive
    # from the storage URI shape `generated/{segment}/{uuid}.docx`.
    storage_uri: str = result["storage_uri"]
    byte_count: int = result["byte_count"]
    file_uuid = storage_uri.rsplit("/", 1)[-1].removesuffix(".docx")

    await audit.log(
        session,
        "module.letters.docx.exported",
        actor_id=user.id,
        matter_id=matter.id,
        module="letters",
        resource_type="letter",
        resource_id=file_uuid,
        payload={
            "letter_type": body.letter_type,
            "file_uuid": file_uuid,
            "byte_count": byte_count,
        },
    )
    await session.commit()

    return LetterDraftDocxResponse(
        file_uuid=file_uuid,
        storage_uri=storage_uri,
        byte_count=byte_count,
        download_url=f"/api/documents/generated/{file_uuid}",
    )
