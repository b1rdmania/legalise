"""Case-law lookup router.

Endpoints (mounted at `/api/matters`):

- `POST /{slug}/case-law/search`            — skill-bridge search, returns cards.
- `POST /{slug}/citations`                  — persist a citation.
- `GET  /{slug}/citations`                  — list citations for the matter.
- `DELETE /{slug}/citations/{citation_id}`  — remove a citation.

Matter ownership is enforced on every call via `created_by_id`, matching the
pattern in `letters/router.py`. Skill-bridge errors are translated to the
same HTTP shape as letters (404 for missing skill, 409 for paused privilege,
422 for missing provider key).
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.adapters.plugin_bridge import SkillDisabled
from app.core.auth import current_user
from app.core.db import get_session
from app.core.matter_access import resolve_owned_open_matter
from app.core.model_gateway import PrivilegePaused
from app.core.user_keys import ProviderKeyMissing, ProviderUpstreamError
from app.core.api import audit
from app.models import Matter, MatterCitation, User

from .schemas import (
    CaseLawSearchRequest,
    CaseLawSearchResponse,
    CitationCreateRequest,
    MatterCitationRead,
)
from .service import search as run_search


router = APIRouter()


async def _matter_or_404(
    slug: str, session: AsyncSession, user: User
) -> Matter:
    matter = await resolve_owned_open_matter(session, slug, user.id)
    return matter


@router.post("/{slug}/case-law/search", response_model=CaseLawSearchResponse)
async def case_law_search(
    slug: str,
    body: CaseLawSearchRequest,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> CaseLawSearchResponse:
    matter = await _matter_or_404(slug, session, user)

    try:
        resp = await run_search(
            session=session,
            matter_id=matter.id,
            actor_id=user.id,
            query=body.query,
            court=body.court,
            year=body.year,
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
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc

    await session.commit()
    return resp


@router.post("/{slug}/citations", response_model=MatterCitationRead)
async def create_citation(
    slug: str,
    body: CitationCreateRequest,
    plugin: str | None = None,
    skill: str | None = None,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> MatterCitationRead:
    matter = await _matter_or_404(slug, session, user)

    # Module-attributed citation writes require the `citation.write`
    # grant on the calling `(plugin, skill)`. User-initiated UI writes
    # (no plugin/skill query params) keep the existing owner-only gate.
    if plugin and skill:
        from app.core.capabilities import require_capability

        await require_capability(
            session,
            user_id=user.id,
            plugin=plugin,
            skill=skill,
            capability="citation.write",
        )

    cit = MatterCitation(
        matter_id=matter.id,
        case_name=body.case_name,
        citation_ref=body.citation_ref,
        citation_text=body.citation_text,
        added_by_id=user.id,
    )
    # `source_url` arrives via W2's 0006_phase_c migration. Set defensively
    # so this code is correct regardless of the merge order.
    if body.source_url is not None and hasattr(MatterCitation, "source_url"):
        setattr(cit, "source_url", body.source_url)

    session.add(cit)
    await session.flush()

    await audit.log(
        session,
        "module.citation.added",
        actor_id=user.id,
        matter_id=matter.id,
        module="case_law",
        resource_type="citation",
        resource_id=str(cit.id),
        payload={
            "case_name": body.case_name,
            "citation_ref": body.citation_ref,
            "has_source_url": body.source_url is not None,
        },
    )
    await session.commit()
    await session.refresh(cit)
    return MatterCitationRead.model_validate(cit)


@router.get("/{slug}/citations", response_model=list[MatterCitationRead])
async def list_citations(
    slug: str,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> list[MatterCitationRead]:
    matter = await _matter_or_404(slug, session, user)
    rows = (
        (
            await session.scalars(
                select(MatterCitation)
                .where(MatterCitation.matter_id == matter.id)
                .order_by(MatterCitation.added_at.desc())
            )
        )
        .all()
    )
    return [MatterCitationRead.model_validate(r) for r in rows]


@router.delete("/{slug}/citations/{citation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_citation(
    slug: str,
    citation_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> Response:
    matter = await _matter_or_404(slug, session, user)
    cit = await session.scalar(
        select(MatterCitation).where(
            MatterCitation.id == citation_id,
            MatterCitation.matter_id == matter.id,
        )
    )
    if cit is None:
        raise HTTPException(404, f"citation not found: {citation_id}")

    await session.delete(cit)

    await audit.log(
        session,
        "module.citation.deleted",
        actor_id=user.id,
        matter_id=matter.id,
        module="case_law",
        resource_type="citation",
        resource_id=str(citation_id),
        payload={
            "case_name": cit.case_name,
            "citation_ref": cit.citation_ref,
        },
    )
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
