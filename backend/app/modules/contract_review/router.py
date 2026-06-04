"""Contract Review document export route.

Contract-review execution is durable-job backed via
``POST /api/matters/{slug}/contract-review/jobs`` in ``app.api.jobs``.
This router remains mounted only for the legacy-compatible DOCX export
surface, which round-trips a ``ContractReviewResult`` envelope to a
generated Word document until a generic artifact export path replaces it.
"""

from __future__ import annotations

import hashlib

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import current_user
from app.core.db import get_session
from app.core.matter_access import resolve_owned_open_matter
from app.core.limits import check_generated_artefact
from app.core.model_gateway import (
    PrivilegePaused,
    gateway as model_gateway,
)
from app.core.storage import StorageWriteError
from app.core.api import audit
from app.models import Matter, User

from .export import render_contract_review_markdown
from .schemas import ContractReviewResult


router = APIRouter()


async def _resolve_matter(session: AsyncSession, slug: str, user_id) -> Matter:
    matter = await resolve_owned_open_matter(session, slug, user_id)
    return matter


# ----- POST /docx ----------------------------------------------------------


@router.post("/{slug}/contract-review/docx")
async def export_docx(
    slug: str,
    result: ContractReviewResult,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> dict:
    """Render a ContractReviewResult to .docx via `generate_docx`.

    Body is the run envelope returned by the durable job result payload.
    Writes `module.contract_review.docx.exported`.
    """
    matter = await _resolve_matter(session, slug, user.id)
    if result.matter_slug != slug:
        raise HTTPException(
            400,
            f"run envelope matter_slug={result.matter_slug} does not match url slug={slug}",
        )

    await check_generated_artefact(user.id, session)

    body_markdown = render_contract_review_markdown(matter, result)
    title = f"Contract review — {result.document_filename or matter.title}"

    try:
        tool_result = await model_gateway.invoke_tool(
            "generate_docx",
            session=session,
            actor_id=user.id,
            matter_id=matter.id,
            inputs={
                "title": title,
                "body_markdown": body_markdown,
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
                "message": "Failed to write generated contract review to object storage.",
            },
        ) from exc

    storage_uri: str = tool_result["storage_uri"]
    byte_count: int = tool_result["byte_count"]
    file_uuid = storage_uri.rsplit("/", 1)[-1].removesuffix(".docx")

    envelope_hash = hashlib.sha256(
        result.model_dump_json(by_alias=False).encode("utf-8")
    ).hexdigest()

    await audit.log(
        session,
        "module.contract_review.docx.exported",
        actor_id=user.id,
        matter_id=matter.id,
        module="contract_review",
        resource_type="contract-review",
        resource_id=file_uuid,
        payload={
            "file_uuid": file_uuid,
            "byte_count": byte_count,
            "envelope_hash": envelope_hash,
            "document_id": result.document_id,
            "document_filename": result.document_filename,
            "total_token_count": result.total_token_count,
            "clause_count": len(result.parsed.clauses),
            "redline_count": len(result.redlines),
        },
    )
    await session.commit()

    return {
        "file_uuid": file_uuid,
        "storage_uri": storage_uri,
        "byte_count": byte_count,
        "download_url": f"/api/documents/generated/{file_uuid}",
    }
