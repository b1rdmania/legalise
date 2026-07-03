from __future__ import annotations

from fastapi import APIRouter

from .common import *  # noqa: F403


router = APIRouter()


@router.get("/generated/{file_uuid}")
async def download_generated_docx(
    file_uuid: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> FileResponse:
    """Stream a previously generated .docx.

    Authorisation walks the audit trail: the canonical handle on a
    generated file is the `document.generated` AuditEntry written by the
    `generate_docx` tool. We resolve the most recent matching row, walk
    to its `matter_id`, and 404 unless `matter.created_by_id == user.id`.
    No row → 404. File missing on disk → 404 (treat as gone).
    """
    entry = await session.scalar(
        select(AuditEntry)
        .where(
            AuditEntry.action == "document.generated",
            AuditEntry.resource_id == str(file_uuid),
        )
        .order_by(AuditEntry.timestamp.desc())
        .limit(1)
    )
    if entry is None or entry.matter_id is None:
        raise HTTPException(404, "generated document not found")

    matter = await session.scalar(
        select(Matter).where(Matter.id == entry.matter_id)
    )
    if matter is None or matter.created_by_id != user.id or matter.status == STATUS_ARCHIVED:
        raise HTTPException(404, "generated document not found")

    storage_uri = (entry.payload or {}).get("storage_uri")
    if not storage_uri:
        raise HTTPException(404, "generated document not found")

    from app.api import documents as documents_api

    storage = documents_api.get_storage_backend()
    try:
        data = storage.get_bytes(storage_uri)
    except KeyError:
        raise HTTPException(404, "generated document not found")
    except StorageReadError as exc:
        # Forensic provenance via `audit_failure` (separate committed
        # session) so the row survives the route's session rollback —
        # R3 review fix. Aligned with the upload-fail path.
        from app.core import api as api_module

        await api_module.audit_failure(
            session,
            "storage.get_bytes.failed",
            actor_id=user.id,
            matter_id=entry.matter_id,
            module="storage",
            resource_type="document",
            resource_id=str(file_uuid),
            payload={
                "storage_key": storage_uri,
                "backend": exc.backend,
                "error_code": exc.error_code,
            },
        )
        raise HTTPException(
            502,
            detail={
                "error": "storage_read_failed",
                "message": "The file for this generated document is no longer available. Generate it again.",
                "storage_key": storage_uri,
                "backend": exc.backend,
            },
        ) from exc

    filename = _safe_filename((entry.payload or {}).get("title"), str(file_uuid))
    return StreamingResponse(
        iter([data]),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Length": str(len(data)),
        },
    )


@router.get("/{document_id}/original")
async def get_document_original(
    document_id: uuid.UUID,
    download: int = Query(0),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> StreamingResponse:
    """Stream the original uploaded bytes for a matter document.

    Governed proxy (not a presigned URL): access stays behind the
    backend so auth, audit, and failure envelopes live inside the
    product boundary. **Owner-only** — matching the existing body /
    versions endpoints; there is deliberately no superuser/admin
    document-read shortcut (admin document inspection, if ever needed,
    must be a separate explicit policy, not smuggled into this path).
    Cross-user / archived / missing all return a uniform 404.
    `?download=1` switches the disposition from inline to attachment.
    Every successful access writes `document.original.accessed`.
    """
    doc = await session.scalar(select(Document).where(Document.id == document_id))
    if doc is None:
        raise HTTPException(404, "document not found")
    matter = await session.scalar(select(Matter).where(Matter.id == doc.matter_id))
    # Owner-only; archived is gone for everyone. Uniform 404 so we never
    # leak which documents exist for other users. No superuser branch by
    # design (see docstring).
    if (
        matter is None
        or matter.status == STATUS_ARCHIVED
        or matter.created_by_id != user.id
    ):
        raise HTTPException(404, "document not found")
    if not doc.storage_uri:
        raise HTTPException(404, "original file not available")

    from app.api import documents as documents_api

    storage = documents_api.get_storage_backend()
    try:
        data = storage.get_bytes(doc.storage_uri)
    except KeyError:
        raise HTTPException(404, "original file not available")
    except StorageReadError as exc:
        await documents_api.audit_failure(
            session,
            "storage.get_bytes.failed",
            actor_id=user.id,
            matter_id=doc.matter_id,
            module="storage",
            resource_type="document",
            resource_id=str(doc.id),
            payload={
                "storage_key": doc.storage_uri,
                "backend": exc.backend,
                "error_code": exc.error_code,
            },
        )
        raise HTTPException(
            502,
            detail={
                "error": "storage_read_failed",
                "message": "The original file for this document is no longer available.",
                "storage_key": doc.storage_uri,
                "backend": exc.backend,
            },
        ) from exc

    is_download = bool(download)
    await audit.log(
        session,
        "document.original.accessed",
        actor_id=user.id,
        matter_id=doc.matter_id,
        resource_type="document",
        resource_id=str(doc.id),
        payload={
            "filename": doc.filename,
            "sha256": doc.sha256,
            "mime_type": doc.mime_type,
            "size_bytes": doc.size_bytes,
            "download": is_download,
        },
    )
    await session.commit()

    filename = _safe_filename(doc.filename, str(doc.id))
    disposition = "attachment" if is_download else "inline"
    return StreamingResponse(
        iter([data]),
        media_type=doc.mime_type or "application/octet-stream",
        headers={
            "Content-Disposition": f'{disposition}; filename="{filename}"',
            "Content-Length": str(len(data)),
        },
    )
