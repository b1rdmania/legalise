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


@router.delete("/{document_id}", status_code=204, response_class=Response)
async def delete_document(
    document_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> Response:
    """Hard-delete a single document and its storage bytes.

    Authorisation: only the owning matter's creator may delete; any other
    user (or a missing document) gets 404, never 403 — same cross-user
    convention as the rest of the documents API.

    Hard delete: the ``documents`` row is removed outright. Every dependent
    table (``document_bodies``, ``document_versions``, ``document_edits``
    via versions, ``document_comments``, ``document_edit_sessions``,
    ``document_working_drafts``) carries ``ON DELETE CASCADE``, so Postgres
    sweeps the children. Audit rows reference documents by string
    ``resource_id`` (no FK) and stay intact as the historical record.

    Storage cleanup is the gate — mirroring the matter-delete path. The
    document's storage objects (uploaded binary + editor assets) are
    removed FIRST; if that fails we return 502, the document stays live,
    and no ``document.deleted`` audit row is written (fail-closed).
    """
    doc, matter = await _owned_live_document(session, document_id, user)

    # Capture identity before the row is deleted / expired.
    filename = doc.filename
    sha256 = doc.sha256
    doc_id_str = str(doc.id)

    # Storage cleanup first. A 204 must mean the bytes are actually gone;
    # a storage failure leaves the document reachable so the user can
    # retry, and emits no `document.deleted` row claiming success.
    try:
        storage = get_storage_backend()
        storage.delete_prefix(document_prefix(user.id, matter.id, doc.id))
    except StorageDeleteError as exc:
        raise HTTPException(
            502,
            detail={
                "error": "document_storage_delete_failed",
                "document_id": doc_id_str,
                "message": (
                    "The document's files could not be deleted, so the "
                    "document has NOT been removed. Try again; if it keeps "
                    "failing, contact the operator."
                ),
            },
        ) from exc

    await audit.log(
        session,
        "document.deleted",
        actor_id=user.id,
        matter_id=matter.id,
        resource_type="document",
        resource_id=doc_id_str,
        payload={"filename": filename, "sha256": sha256},
    )

    await session.delete(doc)
    await session.commit()
    return Response(status_code=204)
