from __future__ import annotations

from fastapi import APIRouter

from .common import *  # noqa: F403


router = APIRouter()


@router.get("/{document_id}/body", response_model=DocumentBodyRead)
async def get_document_body(
    document_id: uuid.UUID,
    plugin: str | None = None,
    skill: str | None = None,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> DocumentBody:
    """Return the extracted body of a document.

    Authorisation: 404 if the document isn't found or its matter isn't
    owned by the current user.

    Body row semantics:
      - Row exists with `extraction_method='failed'` → 200 with empty
        text and `error_reason` populated. UI can surface the failure.
      - No row at all → 404 (extraction never ran).
    """
    row = await session.execute(
        select(Document, Matter)
        .join(Matter, Matter.id == Document.matter_id)
        .where(Document.id == document_id)
    )
    pair = row.first()
    if pair is None:
        raise HTTPException(404, "document not found")

    doc, matter = pair
    if matter.created_by_id != user.id or matter.status == STATUS_ARCHIVED:
        raise HTTPException(404, "document not found")

    # Module-attributed reads require `document.body.read` for the
    # `(plugin, skill)` triple. User-initiated UI reads (no plugin/skill
    # query params) keep the existing owner-only gate above.
    if plugin and skill:
        from app.core.capabilities import require_capability

        await require_capability(
            session,
            user_id=user.id,
            plugin=plugin,
            skill=skill,
            capability="document.body.read",
        )

    body = await session.scalar(
        select(DocumentBody).where(
            DocumentBody.document_id == doc.id,
            DocumentBody.kind == BODY_KIND_EXTRACTED,
        )
    )
    if body is None:
        raise HTTPException(404, "document body not available")
    return body
