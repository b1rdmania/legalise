from __future__ import annotations

from fastapi import APIRouter

from .common import *  # noqa: F403


router = APIRouter()


@router.get("/{document_id}/draft", response_model=DocumentWorkingDraftRead)
async def get_document_working_draft(
    document_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> DocumentWorkingDraftRead:
    """Return the shared working draft for the document editor.

    If no mutable draft exists yet, return an initial draft derived from the
    latest saved text version or the extracted document body. This keeps
    initialisation server-owned without creating audit noise.
    """
    doc, _matter = await _load_owned_document(document_id, session, user)
    draft = await session.scalar(
        select(DocumentWorkingDraft).where(DocumentWorkingDraft.document_id == doc.id)
    )
    if draft is None:
        return await _initial_working_draft(session, doc)
    return DocumentWorkingDraftRead.model_validate(draft)


@router.put("/{document_id}/draft", response_model=DocumentWorkingDraftRead)
async def put_document_working_draft(
    document_id: uuid.UUID,
    body: DocumentWorkingDraftUpsert,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> DocumentWorkingDraftRead:
    """Autosave the mutable working draft for a document.

    Draft writes are intentionally not audit rows. The matter record should
    show saved versions and professional decisions, not keystroke persistence.
    """
    doc, _matter = await _load_owned_document(document_id, session, user)
    base_version_id = body.base_version_id
    if base_version_id is not None:
        exists = await session.scalar(
            select(DocumentVersion.id).where(
                DocumentVersion.id == base_version_id,
                DocumentVersion.document_id == doc.id,
            )
        )
        if exists is None:
            raise HTTPException(
                422,
                {
                    "error": "invalid_base_version",
                    "message": "The draft base version does not belong to this document.",
                },
            )

    now = datetime.now(UTC)
    draft = await session.scalar(
        select(DocumentWorkingDraft).where(DocumentWorkingDraft.document_id == doc.id)
    )
    if draft is None:
        if body.expected_version_counter not in (None, 0):
            raise HTTPException(
                409,
                {
                    "error": "working_draft_conflict",
                    "message": "The shared draft changed before this save. Reload the document before saving again.",
                    "current_version_counter": 0,
                    "current_client_id": None,
                },
            )
        draft = DocumentWorkingDraft(
            document_id=doc.id,
            updated_by_id=user.id,
            updated_at=now,
            plain_text=body.plain_text,
            editor_json=body.editor_json,
            base_version_id=base_version_id,
            version_counter=1,
            client_id=body.client_id,
        )
        session.add(draft)
    else:
        if (
            body.expected_version_counter is not None
            and body.expected_version_counter != draft.version_counter
        ):
            raise HTTPException(
                409,
                {
                    "error": "working_draft_conflict",
                    "message": "The shared draft changed before this save. Reload the document before saving again.",
                    "current_version_counter": draft.version_counter,
                    "current_client_id": draft.client_id,
                },
            )
        draft.updated_by_id = user.id
        draft.updated_at = now
        draft.plain_text = body.plain_text
        draft.editor_json = body.editor_json
        draft.base_version_id = base_version_id
        draft.client_id = body.client_id
        draft.version_counter += 1

    await session.commit()
    return DocumentWorkingDraftRead.model_validate(draft)


@router.post("/{document_id}/draft/commit", response_model=DocumentVersionRead)
async def post_document_working_draft_commit(
    document_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
    body: DocumentWorkingDraftCommitRequest = DocumentWorkingDraftCommitRequest(),
) -> DocumentVersionRead:
    """Commit the mutable working draft as an immutable document version."""
    doc, matter = await _load_owned_document(document_id, session, user)
    draft = await session.scalar(
        select(DocumentWorkingDraft).where(DocumentWorkingDraft.document_id == doc.id)
    )
    if draft is None or not draft.plain_text.strip():
        raise HTTPException(
            422,
            {
                "error": "working_draft_empty",
                "message": "There is no working draft text to save as a version.",
            },
        )
    if (
        body.expected_version_counter is not None
        and body.expected_version_counter != draft.version_counter
    ):
        raise HTTPException(
            409,
            {
                "error": "working_draft_conflict",
                "message": "The shared draft changed before this version save. Reload the document before saving again.",
                "current_version_counter": draft.version_counter,
                "current_client_id": draft.client_id,
            },
        )

    version = await _create_user_edit_version(
        session,
        doc=doc,
        matter=matter,
        user=user,
        resolved_text=draft.plain_text,
        resolved_json=draft.editor_json,
        notes=body.notes or "Saved working draft from Legalise document editor",
        audit_source="working_draft",
    )
    if body.clear_draft:
        await session.delete(draft)
    await session.commit()
    return DocumentVersionRead.model_validate(version)
