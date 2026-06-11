from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from app.models import DocumentEdit, DocumentVersion

from .common import *  # noqa: F403


router = APIRouter()


class PendingEditsResponse(BaseModel):
    """Pending redlines for a document, surviving reload.

    `version` is the proposal version the edits hang on (None when no
    pending edits exist). The shape mirrors EditInstructionResponse's
    fields the editor needs, without the model-run metadata.
    """

    version: DocumentVersionRead | None
    pending_edits: list[DocumentEditRead]


@router.get(
    "/{document_id}/edits/pending", response_model=PendingEditsResponse
)
async def get_pending_edits(
    document_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> PendingEditsResponse:
    """Pending (unresolved) edits across the document's versions.

    The substrate stores proposed redlines in document_edits; before this
    endpoint they were only visible in the session that ran the edit
    instruction. Read-only; ownership enforced document → matter.
    """
    await _load_owned_document(document_id, session, user)

    rows = (
        await session.execute(
            select(DocumentEdit, DocumentVersion)
            .join(
                DocumentVersion,
                DocumentVersion.id == DocumentEdit.document_version_id,
            )
            .where(
                DocumentVersion.document_id == document_id,
                DocumentEdit.status == "pending",
            )
            .order_by(DocumentEdit.created_at.asc())
        )
    ).all()
    if not rows:
        return PendingEditsResponse(version=None, pending_edits=[])
    version = rows[0][1]
    return PendingEditsResponse(
        version=DocumentVersionRead.model_validate(version),
        pending_edits=[
            DocumentEditRead.model_validate(edit) for edit, _ in rows
        ],
    )


@router.post("/edits/{edit_id}/accept", response_model=EditResolutionResponse)
async def post_accept_edit(
    edit_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> EditResolutionResponse:
    """Accept a single pending edit. Returns 409 if already resolved."""
    return await _resolve_one(None, edit_id, "accept", session, user)


@router.post("/edits/{edit_id}/reject", response_model=EditResolutionResponse)
async def post_reject_edit(
    edit_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> EditResolutionResponse:
    """Reject a single pending edit. Returns 409 if already resolved."""
    return await _resolve_one(None, edit_id, "reject", session, user)


@router.post(
    "/versions/{version_id}/accept-all", response_model=BulkResolutionResponse
)
async def post_accept_all(
    version_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> BulkResolutionResponse:
    """Accept every pending edit on this version in a single transaction."""
    return await _resolve_all(version_id, "accept_all", session, user)


@router.post(
    "/versions/{version_id}/reject-all", response_model=BulkResolutionResponse
)
async def post_reject_all(
    version_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> BulkResolutionResponse:
    """Reject every pending edit on this version in a single transaction."""
    return await _resolve_all(version_id, "reject_all", session, user)
