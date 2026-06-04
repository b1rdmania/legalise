from __future__ import annotations

from fastapi import APIRouter

from .common import *  # noqa: F403


router = APIRouter()


@router.post("/{document_id}/edit-instructions", response_model=EditInstructionResponse)
async def post_edit_instruction(
    document_id: uuid.UUID,
    body: EditInstructionRequest,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> EditInstructionResponse:
    """Propose model edits to a document.

    Returns a new `assistant_edit` version + pending edits. The audit log carries
    a `module=document_edit, action=document.edit_instruction.invoked` row
    alongside the `model.call` row written by the gateway.
    """
    if body.mode not in EDIT_MODES:
        raise HTTPException(400, f"unknown mode: {body.mode}")

    try:
        result = await propose_edits(
            session=session,
            gateway=model_gateway,
            document_id=document_id,
            actor_id=user.id,
            instruction=body.instruction,
            mode=body.mode,
        )
    except LookupError as exc:
        raise HTTPException(404, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    except PROVIDER_HTTP_EXCEPTIONS as exc:
        raise provider_error_http_exception(exc) from exc

    await session.commit()
    return EditInstructionResponse(
        version=DocumentVersionRead.model_validate(result.version),
        pending_edits=[DocumentEditRead.model_validate(e) for e in result.pending_edits],
        model_used=result.model_used,
        model_notes=result.model_notes,
        instruction_hash=result.instruction_hash,
        parse_ok=result.parse_ok,
    )


@router.post("/{document_id}/versions/manual", response_model=DocumentVersionRead)
async def post_manual_document_version(
    document_id: uuid.UUID,
    body: ManualDocumentVersionRequest,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> DocumentVersionRead:
    """Save user-edited text as a new immutable document version."""
    doc, matter = await _load_owned_document(document_id, session, user)
    version = await _create_user_edit_version(
        session,
        doc=doc,
        matter=matter,
        user=user,
        resolved_text=body.resolved_text,
        resolved_json=body.resolved_json,
        notes=body.notes,
    )
    await session.commit()
    return DocumentVersionRead.model_validate(version)


@router.post("/{document_id}/versions/upload", response_model=DocumentVersionRead)
async def post_upload_document_version(
    document_id: uuid.UUID,
    file: UploadFile = File(...),
    notes: str | None = Form(default=None),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> DocumentVersionRead:
    """Upload a replacement binary and make it the active document version.

    This is the binary counterpart to manual editor saves: the document keeps
    its identity, but the active original file, hash, extracted body, and
    version history move forward together.
    """
    doc, matter = await _load_owned_document(document_id, session, user)

    validate_upload_mime(file.content_type)
    contents = await file.read()
    validate_upload_size(contents)
    validate_upload_magic_bytes(file.content_type, contents)

    sha = hashlib.sha256(contents).hexdigest()
    filename = file.filename or doc.filename or "untitled"
    obj_key = uploaded_key(
        user_id=user.id,
        matter_id=matter.id,
        document_id=doc.id,
        sha256=sha,
    )
    storage = get_storage_backend()
    try:
        storage.put_bytes(
            obj_key,
            contents,
            content_type=file.content_type or "application/octet-stream",
            metadata={
                "filename": filename[:200],
                "sha256": sha,
                "document_id": str(doc.id),
            },
        )
    except StorageWriteError as exc:
        await audit_storage_write_failure(
            session,
            actor_id=user.id,
            matter_id=matter.id,
            resource_type="document",
            resource_id=str(doc.id),
            storage_key=obj_key,
            backend=exc.backend,
            error_code=exc.error_code,
            version_upload=True,
        )
        raise storage_write_http_exception(
            message="Failed to write document version to object storage.",
            storage_key=obj_key,
            backend=exc.backend,
        ) from exc

    next_version = (
        await session.scalar(
            select(func.coalesce(func.max(DocumentVersion.version_number), 0) + 1)
            .where(DocumentVersion.document_id == doc.id)
        )
        or 1
    )
    extract_result = extract_text(
        contents,
        file.content_type or "application/octet-stream",
        filename,
    )
    version = DocumentVersion(
        document_id=doc.id,
        version_number=int(next_version),
        kind=VERSION_KIND_UPLOAD,
        created_by_id=user.id,
        storage_uri=obj_key,
        filename=filename,
        mime_type=file.content_type or "application/octet-stream",
        size_bytes=len(contents),
        sha256=sha,
        notes=notes or f"Uploaded replacement file: {filename}",
        resolved_text=(
            extract_result.extracted_text
            if extract_result.extraction_method != "failed"
            else None
        ),
    )
    session.add(version)

    doc.filename = filename
    doc.mime_type = file.content_type or "application/octet-stream"
    doc.size_bytes = len(contents)
    doc.sha256 = sha
    doc.storage_uri = obj_key
    doc.uploaded_at = datetime.now(UTC)
    doc.uploaded_by_id = user.id

    body = await session.scalar(
        select(DocumentBody).where(
            DocumentBody.document_id == doc.id,
            DocumentBody.kind == BODY_KIND_EXTRACTED,
        )
    )
    body_payload = {
        "extracted_text": extract_result.extracted_text,
        "extraction_method": extract_result.extraction_method,
        "char_count": extract_result.char_count,
        "page_count": extract_result.page_count,
        "error_reason": extract_result.error_reason,
        "extracted_at": datetime.now(UTC),
    }
    if body is None:
        session.add(
            DocumentBody(
                document_id=doc.id,
                kind=BODY_KIND_EXTRACTED,
                **body_payload,
            )
        )
    else:
        for key, value in body_payload.items():
            setattr(body, key, value)

    await session.flush()
    await audit.log(
        session,
        "document.version.uploaded",
        actor_id=user.id,
        matter_id=matter.id,
        module="document_editor",
        resource_type="document_version",
        resource_id=str(version.id),
        payload={
            "document_id": str(doc.id),
            "version_number": version.version_number,
            "filename": filename,
            "sha256": sha,
            "mime_type": doc.mime_type,
            "size_bytes": doc.size_bytes,
        },
    )
    await audit.log(
        session,
        (
            "document.text_extraction_failed"
            if extract_result.extraction_method == "failed"
            else "document.text_extracted"
        ),
        actor_id=user.id,
        matter_id=matter.id,
        module="document_ingestion",
        resource_type="document",
        resource_id=str(doc.id),
        payload={
            "version_id": str(version.id),
            "version_number": version.version_number,
            "method": extract_result.extraction_method,
            "char_count": extract_result.char_count,
            "page_count": extract_result.page_count,
            "mime_type": doc.mime_type,
            "reason": extract_result.error_reason,
        },
    )
    await session.commit()
    return DocumentVersionRead.model_validate(version)


@router.post("/{document_id}/versions/{version_id}/restore", response_model=DocumentVersionRead)
async def post_restore_document_version(
    document_id: uuid.UUID,
    version_id: uuid.UUID,
    body: RestoreDocumentVersionRequest,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> DocumentVersionRead:
    """Restore a prior saved version as the active document.

    The original history remains immutable: restore creates a new
    `restored` version row and updates the active document pointer/body
    to match the selected version.
    """
    doc, matter = await _load_owned_document(document_id, session, user)
    source = await session.scalar(
        select(DocumentVersion).where(
            DocumentVersion.id == version_id,
            DocumentVersion.document_id == doc.id,
        )
    )
    if source is None:
        raise HTTPException(404, "document version not found")
    if not source.storage_uri and not source.resolved_text:
        raise HTTPException(422, "document version has no restorable content")

    filename = source.filename or doc.filename
    mime_type = source.mime_type or doc.mime_type or "application/octet-stream"
    storage_uri = source.storage_uri
    size_bytes = source.size_bytes
    sha = source.sha256
    resolved_text = source.resolved_text
    resolved_json = source.resolved_json
    extraction_method = "passthrough"
    page_count: int | None = None
    error_reason: str | None = None

    if storage_uri:
        storage = get_storage_backend()
        try:
            contents = storage.get_bytes(storage_uri)
        except KeyError:
            raise HTTPException(
                410,
                detail={
                    "error": "document_version_original_unavailable",
                    "message": "This saved version points to a file that is no longer available.",
                },
            )
        except StorageReadError as exc:
            await audit_failure(
                session,
                "storage.get_bytes.failed",
                actor_id=user.id,
                matter_id=matter.id,
                module="storage",
                resource_type="document_version",
                resource_id=str(source.id),
                payload={
                    "storage_key": storage_uri,
                    "backend": exc.backend,
                    "error_code": exc.error_code,
                    "restore": True,
                },
            )
            raise HTTPException(
                410,
                detail={
                    "error": "document_version_original_unavailable",
                    "message": "This saved version points to a file that is no longer available.",
                },
            ) from exc
        size_bytes = len(contents)
        sha = hashlib.sha256(contents).hexdigest()
        extracted = extract_text(contents, mime_type, filename)
        resolved_text = (
            extracted.extracted_text
            if extracted.extraction_method != "failed"
            else resolved_text
        )
        extraction_method = extracted.extraction_method
        page_count = extracted.page_count
        error_reason = extracted.error_reason
    else:
        contents = (resolved_text or "").encode("utf-8")
        sha = hashlib.sha256(contents).hexdigest()
        size_bytes = len(contents)
        mime_type = "text/plain"
        if not filename.lower().endswith(".txt"):
            filename = f"{filename.rsplit('.', 1)[0]}-v{source.version_number}.txt"
        storage_uri = uploaded_key(
            user_id=user.id,
            matter_id=matter.id,
            document_id=doc.id,
            sha256=sha,
        )
        try:
            get_storage_backend().put_bytes(
                storage_uri,
                contents,
                content_type=mime_type,
                metadata={
                    "filename": filename[:200],
                    "sha256": sha,
                    "document_id": str(doc.id),
                    "restored_from_version_id": str(source.id),
                },
            )
        except StorageWriteError as exc:
            await audit_storage_write_failure(
                session,
                actor_id=user.id,
                matter_id=matter.id,
                resource_type="document_version",
                resource_id=str(source.id),
                storage_key=storage_uri,
                backend=exc.backend,
                error_code=exc.error_code,
                restore=True,
            )
            raise storage_write_http_exception(
                message="Failed to store restored document version.",
                storage_key=storage_uri,
                backend=exc.backend,
            ) from exc

    next_version = (
        await session.scalar(
            select(func.coalesce(func.max(DocumentVersion.version_number), 0) + 1)
            .where(DocumentVersion.document_id == doc.id)
        )
        or 1
    )
    restored = DocumentVersion(
        document_id=doc.id,
        version_number=int(next_version),
        kind=VERSION_KIND_RESTORED,
        created_by_id=user.id,
        storage_uri=storage_uri,
        filename=filename,
        mime_type=mime_type,
        size_bytes=size_bytes,
        sha256=sha,
        notes=body.notes or f"Restored from v{source.version_number}",
        resolved_text=resolved_text,
        resolved_json=resolved_json,
    )
    session.add(restored)

    doc.filename = filename
    doc.mime_type = mime_type
    doc.size_bytes = int(size_bytes or 0)
    doc.sha256 = sha or doc.sha256
    doc.storage_uri = storage_uri
    doc.uploaded_at = datetime.now(UTC)
    doc.uploaded_by_id = user.id

    active_body = await session.scalar(
        select(DocumentBody).where(
            DocumentBody.document_id == doc.id,
            DocumentBody.kind == BODY_KIND_EXTRACTED,
        )
    )
    body_payload = {
        "extracted_text": resolved_text or "",
        "extraction_method": extraction_method,
        "char_count": len(resolved_text or ""),
        "page_count": page_count,
        "error_reason": error_reason,
        "extracted_at": datetime.now(UTC),
    }
    if active_body is None:
        session.add(DocumentBody(document_id=doc.id, kind=BODY_KIND_EXTRACTED, **body_payload))
    else:
        for key, value in body_payload.items():
            setattr(active_body, key, value)

    await session.flush()
    await audit.log(
        session,
        "document.version.restored",
        actor_id=user.id,
        matter_id=matter.id,
        module="document_editor",
        resource_type="document_version",
        resource_id=str(restored.id),
        payload={
            "document_id": str(doc.id),
            "restored_version_number": restored.version_number,
            "source_version_id": str(source.id),
            "source_version_number": source.version_number,
            "filename": filename,
            "sha256": sha,
            "mime_type": mime_type,
            "size_bytes": size_bytes,
        },
    )
    await session.commit()
    return DocumentVersionRead.model_validate(restored)


@router.get("/{document_id}/versions/{version_id}/docx")
async def get_document_version_docx(
    document_id: uuid.UUID,
    version_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> StreamingResponse:
    """Download a saved document version as a Word document."""
    doc, matter = await _load_owned_document(document_id, session, user)
    version = await session.scalar(
        select(DocumentVersion).where(
            DocumentVersion.id == version_id,
            DocumentVersion.document_id == doc.id,
        )
    )
    if version is None:
        raise HTTPException(404, "document version not found")
    if not version.resolved_text:
        raise HTTPException(422, "document version has no resolved text")

    comments = (
        await session.execute(
            select(DocumentComment)
            .where(DocumentComment.document_id == doc.id)
            .order_by(DocumentComment.created_at.asc(), DocumentComment.id.asc())
        )
    ).scalars().all()
    data = (
        _render_tiptap_docx(
            doc.filename,
            version.resolved_json,
            version.resolved_text,
            comments,
            DocumentAssetContext(user.id, matter.id, doc.id),
        )
        if version.resolved_json
        else _render_resolved_text_docx(doc.filename, version.resolved_text, comments)
    )
    filename = _docx_export_filename(doc.filename, version.version_number)
    await audit.log(
        session,
        "document.version.docx.exported",
        actor_id=user.id,
        matter_id=matter.id,
        module="document_editor",
        resource_type="document_version",
        resource_id=str(version.id),
        payload={
            "document_id": str(doc.id),
            "version_number": version.version_number,
            "char_count": len(version.resolved_text),
            "byte_count": len(data),
            "format": "docx",
            "rich_json": version.resolved_json is not None,
            "review_note_count": len(comments),
        },
    )
    await session.commit()
    return StreamingResponse(
        iter([data]),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Length": str(len(data)),
        },
    )


@router.get("/{document_id}/versions/{version_id}/pdf")
async def get_document_version_pdf(
    document_id: uuid.UUID,
    version_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> StreamingResponse:
    """Download a saved document version as a print-ready PDF."""
    doc, matter = await _load_owned_document(document_id, session, user)
    version = await session.scalar(
        select(DocumentVersion).where(
            DocumentVersion.id == version_id,
            DocumentVersion.document_id == doc.id,
        )
    )
    if version is None:
        raise HTTPException(404, "document version not found")
    if not version.resolved_text:
        raise HTTPException(422, "document version has no resolved text")

    comments = (
        await session.execute(
            select(DocumentComment)
            .where(DocumentComment.document_id == doc.id)
            .order_by(DocumentComment.created_at.asc(), DocumentComment.id.asc())
        )
    ).scalars().all()
    html_doc = _render_document_version_html(
        doc.filename,
        version,
        comments,
        DocumentAssetContext(user.id, matter.id, doc.id),
    )
    try:
        data = await _html_to_pdf(html_doc)
    except RuntimeError as exc:
        raise HTTPException(
            502,
            detail={
                "error": "pdf_export_failed",
                "message": str(exc),
            },
        ) from exc
    filename = _pdf_export_filename(doc.filename, version.version_number)
    await audit.log(
        session,
        "document.version.pdf.exported",
        actor_id=user.id,
        matter_id=matter.id,
        module="document_editor",
        resource_type="document_version",
        resource_id=str(version.id),
        payload={
            "document_id": str(doc.id),
            "version_number": version.version_number,
            "char_count": len(version.resolved_text),
            "byte_count": len(data),
            "format": "pdf",
            "rich_json": version.resolved_json is not None,
            "review_note_count": len(comments),
        },
    )
    await session.commit()
    return StreamingResponse(
        iter([data]),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Length": str(len(data)),
        },
    )


@router.get("/{document_id}/versions/{version_id}/original")
async def get_document_version_original(
    document_id: uuid.UUID,
    version_id: uuid.UUID,
    download: int = Query(0),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> StreamingResponse:
    """Stream the original uploaded bytes for a saved upload version."""
    doc, matter = await _load_owned_document(document_id, session, user)
    version = await session.scalar(
        select(DocumentVersion).where(
            DocumentVersion.id == version_id,
            DocumentVersion.document_id == doc.id,
        )
    )
    if version is None:
        raise HTTPException(404, "document version not found")
    if not version.storage_uri:
        raise HTTPException(404, "version original file not available")

    storage = get_storage_backend()
    try:
        data = storage.get_bytes(version.storage_uri)
    except KeyError:
        raise HTTPException(404, "version original file not available")
    except StorageReadError as exc:
        await audit_failure(
            session,
            "storage.get_bytes.failed",
            actor_id=user.id,
            matter_id=matter.id,
            module="storage",
            resource_type="document_version",
            resource_id=str(version.id),
            payload={
                "document_id": str(doc.id),
                "storage_key": version.storage_uri,
                "backend": exc.backend,
                "error_code": exc.error_code,
            },
        )
        raise HTTPException(
            502,
            detail={
                "error": "storage_read_failed",
                "message": "Failed to read the version original from object storage.",
                "storage_key": version.storage_uri,
                "backend": exc.backend,
            },
        ) from exc

    is_download = bool(download)
    await audit.log(
        session,
        "document.version.original.accessed",
        actor_id=user.id,
        matter_id=matter.id,
        module="document_editor",
        resource_type="document_version",
        resource_id=str(version.id),
        payload={
            "document_id": str(doc.id),
            "version_number": version.version_number,
            "storage_key": version.storage_uri,
            "filename": version.filename or doc.filename,
            "sha256": version.sha256,
            "mime_type": version.mime_type or doc.mime_type,
            "size_bytes": version.size_bytes,
            "download": is_download,
        },
    )
    await session.commit()

    filename = _safe_filename(version.filename or doc.filename, str(version.id))
    disposition = "attachment" if is_download else "inline"
    return StreamingResponse(
        iter([data]),
        media_type=version.mime_type or doc.mime_type or "application/octet-stream",
        headers={
            "Content-Disposition": f'{disposition}; filename="{filename}"',
            "Content-Length": str(len(data)),
        },
    )


@router.get("/{document_id}/versions", response_model=list[DocumentVersionSummary])
async def get_document_versions(
    document_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> list[DocumentVersionSummary]:
    """List versions for a document with per-version edit counts.

    Returns versions ordered by `version_number` ascending. 404 if the
    document isn't owned by the current user.
    """
    pair = (
        await session.execute(
            select(Document, Matter)
            .join(Matter, Matter.id == Document.matter_id)
            .where(Document.id == document_id)
        )
    ).first()
    if pair is None:
        raise HTTPException(404, "document not found")
    _, matter = pair
    if matter.created_by_id != user.id or matter.status == STATUS_ARCHIVED:
        raise HTTPException(404, "document not found")

    versions = (
        await session.execute(
            select(DocumentVersion)
            .where(DocumentVersion.document_id == document_id)
            .order_by(DocumentVersion.version_number.asc())
        )
    ).scalars().all()

    if not versions:
        return []

    counts_rows = (
        await session.execute(
            select(
                DocumentEdit.document_version_id,
                DocumentEdit.status,
                func.count(DocumentEdit.id),
            )
            .where(
                DocumentEdit.document_version_id.in_([v.id for v in versions])
            )
            .group_by(DocumentEdit.document_version_id, DocumentEdit.status)
        )
    ).all()
    counts: dict[uuid.UUID, dict[str, int]] = {}
    for vid, status, n in counts_rows:
        counts.setdefault(vid, {})[status] = int(n)

    out: list[DocumentVersionSummary] = []
    for v in versions:
        c = counts.get(v.id, {})
        out.append(
            DocumentVersionSummary(
                version=DocumentVersionRead.model_validate(v),
                pending_count=c.get(EDIT_STATUS_PENDING, 0),
                accepted_count=c.get(EDIT_STATUS_ACCEPTED, 0),
                rejected_count=c.get(EDIT_STATUS_REJECTED, 0),
            )
        )
    return out
