from __future__ import annotations

from fastapi import APIRouter

from .common import *  # noqa: F403


router = APIRouter()


@router.post("/{document_id}/assets", response_model=DocumentAssetUploadRead)
async def post_document_asset(
    document_id: uuid.UUID,
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> DocumentAssetUploadRead:
    """Upload an embedded editor image for a document.

    Assets live under the matter storage prefix and are retrieved through
    the backend, so auth and matter cleanup stay inside the existing
    document boundary. Reads are not audited because every render would
    otherwise create noisy rows; the upload itself is recorded.
    """
    doc, matter = await _owned_live_document(session, document_id, user)
    mime_type = file.content_type or "application/octet-stream"
    if mime_type not in IMAGE_ASSET_MIMES:
        raise HTTPException(415, "unsupported image type")
    data = await file.read()
    if not data:
        raise HTTPException(400, "empty image")
    if len(data) > MAX_DOCUMENT_ASSET_BYTES:
        raise HTTPException(413, "image too large")

    asset_id = uuid.uuid4()
    extension = {
        "image/gif": "gif",
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
    }[mime_type]
    filename = _safe_asset_filename(file.filename, f"{asset_id}.{extension}")
    if "." not in filename:
        filename = f"{filename}.{extension}"
    digest = hashlib.sha256(data).hexdigest()
    key = document_asset_key(user.id, matter.id, doc.id, asset_id, filename)
    try:
        get_storage_backend().put_bytes(
            key,
            data,
            content_type=mime_type,
            metadata={"sha256": digest, "document_id": str(doc.id)},
        )
    except StorageWriteError as exc:
        await audit_storage_write_failure(
            session,
            actor_id=user.id,
            matter_id=matter.id,
            resource_type="document_asset",
            resource_id=str(asset_id),
            storage_key=key,
            backend=exc.backend,
            error_code=exc.error_code,
        )
        raise storage_write_http_exception(
            message="Failed to store document image.",
            storage_key=key,
            backend=exc.backend,
        ) from exc

    await audit.log(
        session,
        "document.asset.uploaded",
        actor_id=user.id,
        matter_id=matter.id,
        module="document_editor",
        resource_type="document_asset",
        resource_id=str(asset_id),
        payload={
            "document_id": str(doc.id),
            "filename": filename,
            "mime_type": mime_type,
            "size_bytes": len(data),
            "sha256": digest,
        },
    )
    await session.commit()
    return DocumentAssetUploadRead(
        id=asset_id,
        filename=filename,
        mime_type=mime_type,
        size_bytes=len(data),
        sha256=digest,
        url=f"/api/documents/{doc.id}/assets/{asset_id}/{filename}",
    )


@router.get("/{document_id}/assets/{asset_id}/{filename}")
async def get_document_asset(
    document_id: uuid.UUID,
    asset_id: uuid.UUID,
    filename: str,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> StreamingResponse:
    doc, matter = await _owned_live_document(session, document_id, user)
    safe_filename = _safe_asset_filename(filename, f"{asset_id}")
    key = document_asset_key(user.id, matter.id, doc.id, asset_id, safe_filename)
    try:
        data = get_storage_backend().get_bytes(key)
    except KeyError:
        raise HTTPException(404, "document asset not found")
    except StorageReadError as exc:
        await audit_failure(
            session,
            "storage.get_bytes.failed",
            actor_id=user.id,
            matter_id=matter.id,
            module="storage",
            resource_type="document_asset",
            resource_id=str(asset_id),
            payload={
                "storage_key": key,
                "backend": exc.backend,
                "error_code": exc.error_code,
            },
        )
        raise HTTPException(
            502,
            detail={
                "error": "storage_read_failed",
                "message": "Failed to read document image.",
                "storage_key": key,
                "backend": exc.backend,
            },
        ) from exc

    suffix = safe_filename.rsplit(".", 1)[-1].lower() if "." in safe_filename else ""
    mime_type = {
        "gif": "image/gif",
        "jpg": "image/jpeg",
        "jpeg": "image/jpeg",
        "png": "image/png",
        "webp": "image/webp",
    }.get(suffix, "application/octet-stream")
    return StreamingResponse(
        iter([data]),
        media_type=mime_type,
        headers={"Content-Length": str(len(data))},
    )
