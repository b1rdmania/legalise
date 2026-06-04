from __future__ import annotations

from fastapi import APIRouter

from .common import *  # noqa: F403


router = APIRouter()


@router.get("/{document_id}/comments", response_model=list[DocumentCommentRead])
async def get_document_comments(
    document_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> list[DocumentCommentRead]:
    """List review notes for an owned, live document."""
    doc, _matter = await _load_owned_document(document_id, session, user)
    comments = (
        await session.scalars(
            select(DocumentComment)
            .where(DocumentComment.document_id == doc.id)
            .order_by(DocumentComment.created_at.asc(), DocumentComment.id.asc())
        )
    ).all()
    return [DocumentCommentRead.model_validate(comment) for comment in comments]


@router.post("/{document_id}/comments", response_model=DocumentCommentRead)
async def post_document_comment(
    document_id: uuid.UUID,
    body: DocumentCommentCreate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> DocumentCommentRead:
    """Add a human review note to an owned document."""
    doc, matter = await _load_owned_document(document_id, session, user)
    comment_body = body.body.strip()
    if len(comment_body) < 2:
        raise HTTPException(422, "comment body is required")
    quote_text = body.quote_text.strip() if body.quote_text else None
    anchor_start = body.anchor_start
    anchor_end = body.anchor_end
    body_sha256: str | None = None
    has_anchor = anchor_start is not None or anchor_end is not None
    if has_anchor:
        if anchor_start is None or anchor_end is None or anchor_end <= anchor_start:
            raise HTTPException(
                422,
                {
                    "error": "invalid_comment_anchor",
                    "message": "Comment anchors require start and end positions.",
                },
            )
        extracted = await extracted_body_for(session, doc.id)
        if extracted is None:
            raise HTTPException(
                422,
                {
                    "error": "document_body_unavailable",
                    "message": "The document text is not available for anchoring.",
                },
            )
        source_text = extracted.extracted_text
        body_sha256 = hashlib.sha256(source_text.encode("utf-8")).hexdigest()
        if body.body_sha256 and body.body_sha256 != body_sha256:
            raise HTTPException(
                409,
                {
                    "error": "document_body_changed",
                    "message": "The document text changed before the note was saved.",
                },
            )
        if anchor_end > len(source_text):
            raise HTTPException(
                422,
                {
                    "error": "invalid_comment_anchor",
                    "message": "The selected range is outside the document text.",
                },
            )
        anchored_quote = source_text[anchor_start:anchor_end].strip()
        if not quote_text and anchored_quote:
            quote_text = anchored_quote[:2000]
    comment = DocumentComment(
        document_id=doc.id,
        author_id=user.id,
        quote_text=quote_text or None,
        body_sha256=body_sha256,
        anchor_start=anchor_start if has_anchor else None,
        anchor_end=anchor_end if has_anchor else None,
        body=comment_body,
        status=COMMENT_STATUS_OPEN,
    )
    session.add(comment)
    await session.flush()
    await audit.log(
        session,
        "document.comment.created",
        actor_id=user.id,
        matter_id=matter.id,
        module="document_editor",
        resource_type="document_comment",
        resource_id=str(comment.id),
        payload={
            "document_id": str(doc.id),
            "has_quote": bool(comment.quote_text),
            "has_anchor": has_anchor,
            "body_sha256": comment.body_sha256,
            "anchor_start": comment.anchor_start,
            "anchor_end": comment.anchor_end,
        },
    )
    await session.commit()
    return DocumentCommentRead.model_validate(comment)


@router.patch(
    "/{document_id}/comments/{comment_id}",
    response_model=DocumentCommentRead,
)
async def patch_document_comment(
    document_id: uuid.UUID,
    comment_id: uuid.UUID,
    body: DocumentCommentUpdate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> DocumentCommentRead:
    """Update the body of an open document review note."""
    doc, matter = await _load_owned_document(document_id, session, user)
    comment = await session.scalar(
        select(DocumentComment).where(
            DocumentComment.id == comment_id,
            DocumentComment.document_id == doc.id,
        )
    )
    if comment is None:
        raise HTTPException(404, "document comment not found")
    if comment.status == COMMENT_STATUS_RESOLVED:
        raise HTTPException(
            409,
            {
                "error": "document_comment_resolved",
                "message": "Resolved review notes cannot be edited.",
            },
        )
    next_body = body.body.strip()
    if len(next_body) < 2:
        raise HTTPException(422, "comment body is required")
    if next_body != comment.body:
        previous_length = len(comment.body)
        comment.body = next_body
        await audit.log(
            session,
            "document.comment.updated",
            actor_id=user.id,
            matter_id=matter.id,
            module="document_editor",
            resource_type="document_comment",
            resource_id=str(comment.id),
            payload={
                "document_id": str(doc.id),
                "previous_length": previous_length,
                "next_length": len(next_body),
            },
        )
    await session.commit()
    return DocumentCommentRead.model_validate(comment)


@router.post(
    "/{document_id}/comments/{comment_id}/resolve",
    response_model=DocumentCommentRead,
)
async def post_resolve_document_comment(
    document_id: uuid.UUID,
    comment_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> DocumentCommentRead:
    """Resolve a document review note."""
    doc, matter = await _load_owned_document(document_id, session, user)
    comment = await session.scalar(
        select(DocumentComment).where(
            DocumentComment.id == comment_id,
            DocumentComment.document_id == doc.id,
        )
    )
    if comment is None:
        raise HTTPException(404, "document comment not found")
    if comment.status != COMMENT_STATUS_RESOLVED:
        comment.status = COMMENT_STATUS_RESOLVED
        comment.resolved_at = datetime.now(UTC)
        comment.resolved_by_id = user.id
        await audit.log(
            session,
            "document.comment.resolved",
            actor_id=user.id,
            matter_id=matter.id,
            module="document_editor",
            resource_type="document_comment",
            resource_id=str(comment.id),
            payload={"document_id": str(doc.id)},
        )
    await session.commit()
    return DocumentCommentRead.model_validate(comment)


@router.post(
    "/{document_id}/comments/{comment_id}/reopen",
    response_model=DocumentCommentRead,
)
async def post_reopen_document_comment(
    document_id: uuid.UUID,
    comment_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> DocumentCommentRead:
    """Reopen a resolved document review note."""
    doc, matter = await _load_owned_document(document_id, session, user)
    comment = await session.scalar(
        select(DocumentComment).where(
            DocumentComment.id == comment_id,
            DocumentComment.document_id == doc.id,
        )
    )
    if comment is None:
        raise HTTPException(404, "document comment not found")
    if comment.status == COMMENT_STATUS_RESOLVED:
        comment.status = COMMENT_STATUS_OPEN
        comment.resolved_at = None
        comment.resolved_by_id = None
        await audit.log(
            session,
            "document.comment.reopened",
            actor_id=user.id,
            matter_id=matter.id,
            module="document_editor",
            resource_type="document_comment",
            resource_id=str(comment.id),
            payload={"document_id": str(doc.id)},
        )
    await session.commit()
    return DocumentCommentRead.model_validate(comment)
