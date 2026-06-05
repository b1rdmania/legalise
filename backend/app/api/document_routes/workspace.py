from __future__ import annotations

from fastapi import APIRouter

from app.core.document_engine import (
    DocumentEngineNotFound,
    DocumentEngineUnavailable,
    DocumentSnapshot,
    load_document_snapshot,
)

from .common import *  # noqa: F403


router = APIRouter()


class DocumentBlockRead(BaseModel):
    id: str
    type: str
    ordinal: int
    text: str


class DocumentWorkspaceRead(BaseModel):
    document_id: uuid.UUID
    filename: str
    mime_type: str
    source: str
    source_version_id: uuid.UUID | None
    source_version_number: int | None
    extraction_method: str | None
    blocks: list[DocumentBlockRead]
    text: str
    char_count: int
    notes: list[str]


class DocumentWorkspaceSaveRequest(BaseModel):
    text: str = Field(min_length=1, max_length=500_000)
    notes: str | None = Field(default=None, max_length=500)
    resolved_json: dict[str, Any] | None = None


class DocumentWorkspaceSaveResponse(BaseModel):
    version: DocumentVersionRead
    workspace: DocumentWorkspaceRead


def _workspace_read(snapshot: DocumentSnapshot) -> DocumentWorkspaceRead:
    version = snapshot.source_version
    return DocumentWorkspaceRead(
        document_id=snapshot.document.id,
        filename=snapshot.document.filename,
        mime_type=snapshot.document.mime_type,
        source=snapshot.source,
        source_version_id=version.id if version else None,
        source_version_number=version.version_number if version else None,
        extraction_method=snapshot.extraction_method,
        blocks=[
            DocumentBlockRead(
                id=block.id,
                type=block.type,
                ordinal=block.ordinal,
                text=block.text,
            )
            for block in snapshot.blocks
        ],
        text=snapshot.text,
        char_count=snapshot.char_count,
        notes=snapshot.notes,
    )


@router.get("/{document_id}/workspace", response_model=DocumentWorkspaceRead)
async def get_document_workspace(
    document_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> DocumentWorkspaceRead:
    """Return the structured document workspace snapshot."""
    try:
        snapshot = await load_document_snapshot(
            session,
            document_id=document_id,
            actor_id=user.id,
        )
    except DocumentEngineNotFound as exc:
        raise HTTPException(404, "document not found") from exc
    except DocumentEngineUnavailable as exc:
        raise HTTPException(404, str(exc)) from exc
    return _workspace_read(snapshot)


@router.post("/{document_id}/workspace", response_model=DocumentWorkspaceSaveResponse)
async def save_document_workspace(
    document_id: uuid.UUID,
    body: DocumentWorkspaceSaveRequest,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> DocumentWorkspaceSaveResponse:
    """Save workspace text as a new immutable document version."""
    doc, matter = await _load_owned_document(document_id, session, user)
    version = await _create_user_edit_version(
        session,
        doc=doc,
        matter=matter,
        user=user,
        resolved_text=body.text,
        resolved_json=body.resolved_json,
        notes=body.notes or "Saved document workspace",
        audit_source="workspace",
    )
    await audit.log(
        session,
        "document.workspace.saved",
        actor_id=user.id,
        matter_id=matter.id,
        module="document_editor",
        resource_type="document_version",
        resource_id=str(version.id),
        payload={
            "document_id": str(doc.id),
            "version_number": version.version_number,
            "char_count": len(body.text),
        },
    )
    await session.commit()

    snapshot = await load_document_snapshot(
        session,
        document_id=document_id,
        actor_id=user.id,
    )
    return DocumentWorkspaceSaveResponse(
        version=DocumentVersionRead.model_validate(version),
        workspace=_workspace_read(snapshot),
    )
