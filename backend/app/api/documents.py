"""Documents API — per-document endpoints (body, edit-instructions).

Workstream 1 ships the body endpoint. The edit-instructions endpoint is
added by Workstream 2; the router is exported so additional endpoints
can mount onto it without disturbing the wiring in `main.py`.
"""

from __future__ import annotations

import re
import uuid
from datetime import datetime

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import current_user
from app.core.db import get_session
from app.core.storage import get_storage_backend, StorageReadError
from app.core.model_gateway import PrivilegePaused, gateway as model_gateway
from app.core.user_keys import ProviderKeyMissing, ProviderUpstreamError
from app.core.api import audit, audit_failure
from app.models import AuditEntry, Document, DocumentEdit, DocumentVersion, Matter, User, STATUS_ARCHIVED
from app.models.document_body import DocumentBody, BODY_KIND_EXTRACTED
from app.models.document_edit import (
    EDIT_STATUS_ACCEPTED,
    EDIT_STATUS_PENDING,
    EDIT_STATUS_REJECTED,
)
from app.modules.document_edit import EDIT_MODES, propose_edits
from app.modules.document_edit.resolver import (
    EditAlreadyResolved,
    resolve_bulk,
    resolve_edit,
)
from app.models.document_body import BODY_KIND_REDACTED
from app.modules.anonymisation.pipeline import anonymise_document
from app.modules.anonymisation.schemas import (
    AnonymisationResult,
    AnonymiseRequest,
    MappingRead,
    TokenMapping,
)

router = APIRouter()


class DocumentBodyRead(BaseModel):
    document_id: uuid.UUID
    kind: str
    extracted_text: str
    extraction_method: str
    extracted_at: datetime
    char_count: int
    page_count: int | None
    error_reason: str | None = None

    model_config = {"from_attributes": True}


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


# -- Edit-instruction surface (Workstream 2) -------------------------------


EditMode = Literal["tighten", "rewrite", "summarise", "free-text", "uk-jurisdiction-sweep"]


class EditInstructionRequest(BaseModel):
    instruction: str = Field(min_length=4, max_length=2000)
    mode: EditMode = "free-text"


class DocumentVersionRead(BaseModel):
    id: uuid.UUID
    document_id: uuid.UUID
    version_number: int
    kind: str
    created_by_id: uuid.UUID
    created_at: datetime
    storage_uri: str | None
    notes: str | None

    model_config = {"from_attributes": True}


class DocumentEditRead(BaseModel):
    id: uuid.UUID
    document_version_id: uuid.UUID
    change_id: str
    correlation_id: str | None
    deleted_text: str
    inserted_text: str
    context_before: str
    context_after: str
    rationale: str | None
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class EditInstructionResponse(BaseModel):
    version: DocumentVersionRead
    pending_edits: list[DocumentEditRead]
    model_used: str
    model_notes: str
    instruction_hash: str
    parse_ok: bool


@router.post("/{document_id}/edit-instructions", response_model=EditInstructionResponse)
async def post_edit_instruction(
    document_id: uuid.UUID,
    body: EditInstructionRequest,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> EditInstructionResponse:
    """Propose model edits to a document.

    Returns a new `assistant_edit` version + pending edits. Accept/reject
    UI (and the matching endpoint) lands in Phase B. The audit log carries
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
    except PrivilegePaused as exc:
        raise HTTPException(409, str(exc)) from exc
    except ProviderKeyMissing as exc:
        raise HTTPException(
            422,
            detail={"error": "provider_key_missing", "provider": exc.provider, "message": str(exc)},
        ) from exc
    except ProviderUpstreamError as exc:
        raise HTTPException(
            502,
            detail={
                "error": exc.code,
                "provider": exc.provider,
                "upstream_status": exc.upstream_status,
                "message": str(exc),
            },
        ) from exc

    await session.commit()
    return EditInstructionResponse(
        version=DocumentVersionRead.model_validate(result.version),
        pending_edits=[DocumentEditRead.model_validate(e) for e in result.pending_edits],
        model_used=result.model_used,
        model_notes=result.model_notes,
        instruction_hash=result.instruction_hash,
        parse_ok=result.parse_ok,
    )


# -- Generated .docx download (Phase B W1) ---------------------------------


_FILENAME_SAFE_RE = re.compile(r"[^A-Za-z0-9._-]+")


def _safe_filename(title: str | None, file_uuid: str) -> str:
    """Derive a human-readable .docx filename from the audit `title` payload.

    Falls back to `generated-{uuid8}.docx` when title is empty or sanitises
    to nothing. The slugified title is bounded at 80 chars.
    """
    if title:
        cleaned = _FILENAME_SAFE_RE.sub("-", title).strip("-._")
        cleaned = cleaned[:80].rstrip("-._")
        if cleaned:
            return f"{cleaned}.docx"
    return f"generated-{file_uuid[:8]}.docx"


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

    storage = get_storage_backend()
    try:
        data = storage.get_bytes(storage_uri)
    except KeyError:
        raise HTTPException(404, "generated document not found")
    except StorageReadError as exc:
        # Forensic provenance via `audit_failure` (separate committed
        # session) so the row survives the route's session rollback —
        # R3 review fix. Aligned with the upload-fail path.
        from app.core.api import audit_failure
        await audit_failure(
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
                "message": "Failed to read generated document from object storage.",
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


# -- Original file retrieval (streamed backend proxy) ----------------------


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

    storage = get_storage_backend()
    try:
        data = storage.get_bytes(doc.storage_uri)
    except KeyError:
        raise HTTPException(404, "original file not available")
    except StorageReadError as exc:
        await audit_failure(
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
                "message": "Failed to read the original document from object storage.",
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


# -- Accept/reject + versions (Workstream 2) -------------------------------


class EditResolutionResponse(BaseModel):
    edit: DocumentEditRead
    new_version: DocumentVersionRead | None = None
    resolved_text: str | None = None


class BulkResolutionResponse(BaseModel):
    affected_count: int
    new_version: DocumentVersionRead
    resolved_text: str


class DocumentVersionSummary(BaseModel):
    version: DocumentVersionRead
    pending_count: int
    accepted_count: int
    rejected_count: int


async def _resolve_one(
    document_id_unused: None,
    edit_id: uuid.UUID,
    action: Literal["accept", "reject"],
    session: AsyncSession,
    user: User,
) -> EditResolutionResponse:
    try:
        updated, new_version, resolved_text = await resolve_edit(
            session,
            edit_id=edit_id,
            actor_id=user.id,
            action=action,
        )
    except LookupError as exc:
        raise HTTPException(404, str(exc)) from exc
    except EditAlreadyResolved as exc:
        raise HTTPException(409, str(exc)) from exc

    await session.commit()
    return EditResolutionResponse(
        edit=DocumentEditRead.model_validate(updated),
        new_version=(
            DocumentVersionRead.model_validate(new_version) if new_version else None
        ),
        resolved_text=resolved_text,
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


async def _resolve_all(
    version_id: uuid.UUID,
    action: Literal["accept_all", "reject_all"],
    session: AsyncSession,
    user: User,
) -> BulkResolutionResponse:
    try:
        affected, new_version, resolved_text = await resolve_bulk(
            session,
            version_id=version_id,
            actor_id=user.id,
            action=action,
        )
    except LookupError as exc:
        raise HTTPException(404, str(exc)) from exc
    await session.commit()
    return BulkResolutionResponse(
        affected_count=affected,
        new_version=DocumentVersionRead.model_validate(new_version),
        resolved_text=resolved_text,
    )


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


# -- Anonymisation (Phase C / Workstream 2) --------------------------------


async def _load_owned_document(
    document_id: uuid.UUID, session: AsyncSession, user: User
) -> tuple[Document, Matter]:
    """Resolve a document the current user owns, else 404.

    Walks document → matter → ownership in one round trip. Shared by
    every anonymisation endpoint so the auth shape doesn't drift.
    """
    row = (
        await session.execute(
            select(Document, Matter)
            .join(Matter, Matter.id == Document.matter_id)
            .where(Document.id == document_id)
        )
    ).first()
    if row is None:
        raise HTTPException(404, "document not found")
    doc, matter = row
    if matter.created_by_id != user.id or matter.status == STATUS_ARCHIVED:
        raise HTTPException(404, "document not found")
    return doc, matter


def _result_from_redacted(body: DocumentBody) -> AnonymisationResult:
    """Reconstruct an AnonymisationResult from the persisted redacted body."""
    tokens: list[TokenMapping] = []
    mapping = body.mapping if isinstance(body.mapping, dict) else {}
    token_map = mapping.get("tokens") if isinstance(mapping, dict) else None
    if isinstance(token_map, dict):
        for token, meta in token_map.items():
            if not isinstance(token, str) or not isinstance(meta, dict):
                continue
            tokens.append(
                TokenMapping(
                    token=token,
                    entity_type=str(meta.get("entity_type", "")),
                    original=str(meta.get("original", "")),
                    occurrences=int(meta.get("occurrences", 0) or 0),
                )
            )
    tokens.sort(key=lambda t: (t.token.split("_", 1)[0], t.token))
    return AnonymisationResult(
        document_id=body.document_id,
        redacted_text=body.extracted_text,
        engine=body.engine or body.extraction_method or "unknown",
        anonymised_at=body.anonymised_at or body.extracted_at,
        char_count=body.char_count,
        entity_count=len(tokens),
        tokens=tokens,
    )


@router.post("/{document_id}/anonymise", response_model=AnonymisationResult)
async def post_anonymise_document(
    document_id: uuid.UUID,
    body: AnonymiseRequest,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> AnonymisationResult:
    """Run anonymisation and UPSERT the `redacted` DocumentBody."""
    try:
        result = await anonymise_document(
            session=session,
            gateway=model_gateway,
            document_id=document_id,
            actor_id=user.id,
            engine=body.engine,
            entity_types=body.entity_types,
            threshold=body.threshold,
        )
    except LookupError as exc:
        raise HTTPException(404, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    except PrivilegePaused as exc:
        raise HTTPException(409, str(exc)) from exc
    except ProviderKeyMissing as exc:
        raise HTTPException(
            422,
            detail={
                "error": "provider_key_missing",
                "provider": exc.provider,
                "message": str(exc),
            },
        ) from exc
    except ProviderUpstreamError as exc:
        raise HTTPException(
            502,
            detail={
                "error": exc.code,
                "provider": exc.provider,
                "upstream_status": exc.upstream_status,
                "message": str(exc),
            },
        ) from exc
    except RuntimeError as exc:
        # Presidio not installed in this environment. 503 communicates
        # "service is real but disabled" more honestly than 500.
        raise HTTPException(503, f"anonymisation engine unavailable: {exc}") from exc

    await session.commit()
    return result


@router.get("/{document_id}/anonymise", response_model=AnonymisationResult)
async def get_anonymise_document(
    document_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> AnonymisationResult:
    """Return the most recent redacted body for this document."""
    await _load_owned_document(document_id, session, user)
    redacted = await session.scalar(
        select(DocumentBody).where(
            DocumentBody.document_id == document_id,
            DocumentBody.kind == BODY_KIND_REDACTED,
        )
    )
    if redacted is None:
        raise HTTPException(404, "no anonymised body for this document")
    return _result_from_redacted(redacted)


@router.get("/{document_id}/anonymise/mapping", response_model=MappingRead)
async def get_anonymise_mapping(
    document_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> MappingRead:
    """Return the token → original mapping. Matter-owner-only.

    `_load_owned_document` already enforces owner-only via 404; we
    additionally write a `module.anonymisation.viewed` audit row so
    mapping reveals are traceable.
    """
    doc, matter = await _load_owned_document(document_id, session, user)
    redacted = await session.scalar(
        select(DocumentBody).where(
            DocumentBody.document_id == doc.id,
            DocumentBody.kind == BODY_KIND_REDACTED,
        )
    )
    if redacted is None:
        raise HTTPException(404, "no anonymised body for this document")

    mapping = redacted.mapping if isinstance(redacted.mapping, dict) else {}
    token_map = mapping.get("tokens") if isinstance(mapping, dict) else None
    tokens: list[TokenMapping] = []
    if isinstance(token_map, dict):
        for token, meta in token_map.items():
            if not isinstance(token, str) or not isinstance(meta, dict):
                continue
            tokens.append(
                TokenMapping(
                    token=token,
                    entity_type=str(meta.get("entity_type", "")),
                    original=str(meta.get("original", "")),
                    occurrences=int(meta.get("occurrences", 0) or 0),
                )
            )
    tokens.sort(key=lambda t: (t.token.split("_", 1)[0], t.token))

    raw_spans = mapping.get("spans") if isinstance(mapping, dict) else None
    spans = raw_spans if isinstance(raw_spans, list) else []

    await audit.log(
        session,
        "module.anonymisation.viewed",
        actor_id=user.id,
        matter_id=matter.id,
        module="anonymisation",
        resource_type="document",
        resource_id=str(doc.id),
        payload={"token_count": len(tokens)},
    )
    await session.commit()

    return MappingRead(document_id=doc.id, tokens=tokens, spans=spans)


@router.delete(
    "/{document_id}/anonymise",
    status_code=204,
    response_class=Response,
)
async def delete_anonymise_document(
    document_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> Response:
    """Delete the redacted DocumentBody so the next run starts cold."""
    doc, matter = await _load_owned_document(document_id, session, user)
    redacted = await session.scalar(
        select(DocumentBody).where(
            DocumentBody.document_id == doc.id,
            DocumentBody.kind == BODY_KIND_REDACTED,
        )
    )
    if redacted is None:
        return Response(status_code=204)
    await session.delete(redacted)
    await audit.log(
        session,
        "module.anonymisation.deleted",
        actor_id=user.id,
        matter_id=matter.id,
        module="anonymisation",
        resource_type="document",
        resource_id=str(doc.id),
        payload={"engine": redacted.engine},
    )
    await session.commit()
    return Response(status_code=204)
