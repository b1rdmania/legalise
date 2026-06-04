from __future__ import annotations

from fastapi import APIRouter

from .common import *  # noqa: F403


router = APIRouter()


@router.get("/{document_id}/edit-sessions", response_model=list[DocumentEditSessionRead])
async def get_document_edit_sessions(
    document_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> list[DocumentEditSessionRead]:
    """List active editing sessions for this document."""
    doc, _matter = await _load_owned_document(document_id, session, user)
    return await _active_edit_sessions(session, doc.id)


@router.post("/{document_id}/edit-sessions", response_model=DocumentEditSessionResponse)
async def post_document_edit_session(
    document_id: uuid.UUID,
    body: DocumentEditSessionStart,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> DocumentEditSessionResponse:
    """Start or heartbeat a document editing session for this browser client."""
    doc, matter = await _load_owned_document(document_id, session, user)
    now = datetime.now(UTC)
    row = await session.scalar(
        select(DocumentEditSession).where(
            DocumentEditSession.document_id == doc.id,
            DocumentEditSession.user_id == user.id,
            DocumentEditSession.client_id == body.client_id,
            DocumentEditSession.ended_at.is_(None),
        )
    )
    started = False
    if row is None:
        row = DocumentEditSession(
            document_id=doc.id,
            user_id=user.id,
            client_id=body.client_id,
            started_at=now,
            last_seen_at=now,
        )
        session.add(row)
        started = True
    else:
        row.last_seen_at = now

    await session.flush()
    if started:
        await audit.log(
            session,
            "document.edit_session.started",
            actor_id=user.id,
            matter_id=matter.id,
            module="document_editor",
            resource_type="document",
            resource_id=str(doc.id),
            payload={"session_id": str(row.id)},
        )
    await session.commit()
    active = await _active_edit_sessions(session, doc.id)
    current = next((item for item in active if item.id == row.id), None)
    if current is None:
        current = DocumentEditSessionRead(
            id=row.id,
            document_id=row.document_id,
            user_id=row.user_id,
            client_id=row.client_id,
            user_label=user.name or user.email,
            started_at=row.started_at,
            last_seen_at=row.last_seen_at,
            ended_at=row.ended_at,
        )
    return DocumentEditSessionResponse(current=current, active=active)


@router.delete("/{document_id}/edit-sessions/{session_id}", status_code=204)
async def delete_document_edit_session(
    document_id: uuid.UUID,
    session_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> Response:
    """End this browser client's document editing session."""
    doc, matter = await _load_owned_document(document_id, session, user)
    row = await session.scalar(
        select(DocumentEditSession).where(
            DocumentEditSession.id == session_id,
            DocumentEditSession.document_id == doc.id,
            DocumentEditSession.user_id == user.id,
        )
    )
    if row is not None and row.ended_at is None:
        row.ended_at = datetime.now(UTC)
        row.last_seen_at = row.ended_at
        await audit.log(
            session,
            "document.edit_session.ended",
            actor_id=user.id,
            matter_id=matter.id,
            module="document_editor",
            resource_type="document",
            resource_id=str(doc.id),
            payload={"session_id": str(row.id)},
        )
        await session.commit()
    return Response(status_code=204)
