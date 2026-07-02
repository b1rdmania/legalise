"""Documents API — shared namespace hub for the document route groups.

Every sibling route module does `from .common import *`, so this module
deliberately re-exports three things:

1. the shared DTOs (``.schemas``) and DOCX/PDF/HTML rendering helpers
   (``.rendering``) split out of this file,
2. the third-party / app-core imports the route groups rely on, and
3. the cross-cutting DB/ownership helpers defined below.

Keep new domain logic in the route modules (or a new sibling module);
only genuinely cross-cutting helpers belong here.
"""

from __future__ import annotations

import base64
import hashlib
import html
import io
import re
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any, Literal
from urllib.parse import unquote, urlparse

import httpx
from docx import Document as DocxDocument
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_COLOR_INDEX
from docx.shared import Inches, RGBColor
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.api import (
    PROVIDER_HTTP_EXCEPTIONS,
    audit,
    audit_failure,
    audit_storage_write_failure,
    provider_error_http_exception,
    storage_write_http_exception,
)
from app.core.auth import current_user
from app.core.config import settings
from app.core.db import get_session
from app.core.limits import check_generated_artefact
from app.core.document_uploads import (
    validate_upload_magic_bytes,
    validate_upload_mime,
    validate_upload_size,
)
from app.core.model_gateway import gateway as model_gateway
from app.core.storage import (
    StorageDeleteError,
    StorageReadError,
    StorageWriteError,
    document_asset_key,
    document_prefix,
    get_storage_backend,
    uploaded_key,
)
from app.core.text_extraction import extract as extract_text
from app.models import (
    COMMENT_STATUS_OPEN,
    COMMENT_STATUS_RESOLVED,
    STATUS_ARCHIVED,
    AuditEntry,
    Document,
    DocumentComment,
    DocumentEdit,
    DocumentEditSession,
    DocumentVersion,
    DocumentWorkingDraft,
    Matter,
    User,
)
from app.models.document_body import (
    BODY_KIND_EXTRACTED,
    BODY_KIND_REDACTED,
    DocumentBody,
    extracted_body_for,
)
from app.models.document_edit import (
    EDIT_STATUS_ACCEPTED,
    EDIT_STATUS_PENDING,
    EDIT_STATUS_REJECTED,
)
from app.models.document_version import (
    VERSION_KIND_RESTORED,
    VERSION_KIND_UPLOAD,
    VERSION_KIND_USER_EDIT,
)
from app.modules.anonymisation.pipeline import anonymise_document
from app.modules.anonymisation.schemas import (
    AnonymisationResult,
    AnonymiseRequest,
    MappingRead,
    TokenMapping,
)
from app.modules.document_edit import EDIT_MODES, propose_edits
from app.modules.document_edit.resolver import (
    EditAlreadyResolved,
    resolve_bulk,
    resolve_edit,
)

from .rendering import *  # noqa: F403
from .schemas import *  # noqa: F403


async def _latest_text_version(
    session: AsyncSession,
    document_id: uuid.UUID,
) -> DocumentVersion | None:
    return await session.scalar(
        select(DocumentVersion)
        .where(
            DocumentVersion.document_id == document_id,
            DocumentVersion.resolved_text.is_not(None),
        )
        .order_by(DocumentVersion.version_number.desc(), DocumentVersion.created_at.desc())
        .limit(1)
    )


async def _initial_working_draft(
    session: AsyncSession,
    doc: Document,
) -> DocumentWorkingDraftRead:
    latest = await _latest_text_version(session, doc.id)
    if latest is not None:
        return DocumentWorkingDraftRead(
            document_id=doc.id,
            updated_by_id=None,
            updated_at=None,
            plain_text=latest.resolved_text or "",
            editor_json=latest.resolved_json,
            base_version_id=latest.id,
            version_counter=0,
            client_id=None,
        )

    body = await extracted_body_for(session, doc.id)
    return DocumentWorkingDraftRead(
        document_id=doc.id,
        updated_by_id=None,
        updated_at=None,
        plain_text=body.extracted_text if body is not None else "",
        editor_json=None,
        base_version_id=None,
        version_counter=0,
        client_id=None,
    )


async def _create_user_edit_version(
    session: AsyncSession,
    *,
    doc: Document,
    matter: Matter,
    user: User,
    resolved_text: str,
    resolved_json: dict[str, Any] | None,
    notes: str | None,
    audit_source: str = "manual",
) -> DocumentVersion:
    next_version = (
        await session.scalar(
            select(func.coalesce(func.max(DocumentVersion.version_number), 0) + 1)
            .where(DocumentVersion.document_id == doc.id)
        )
        or 1
    )
    version = DocumentVersion(
        document_id=doc.id,
        version_number=int(next_version),
        kind=VERSION_KIND_USER_EDIT,
        created_by_id=user.id,
        filename=doc.filename,
        mime_type="text/plain",
        size_bytes=len(resolved_text.encode("utf-8")),
        sha256=hashlib.sha256(resolved_text.encode("utf-8")).hexdigest(),
        resolved_text=resolved_text,
        resolved_json=resolved_json,
        notes=notes or "Edited in Legalise document editor",
    )
    session.add(version)
    await session.flush()
    await audit.log(
        session,
        "document.version.saved",
        actor_id=user.id,
        matter_id=matter.id,
        module="document_editor",
        resource_type="document_version",
        resource_id=str(version.id),
        payload={
            "document_id": str(doc.id),
            "version_number": version.version_number,
            "kind": version.kind,
            "char_count": len(resolved_text),
            "rich_json": resolved_json is not None,
            "source": audit_source,
        },
    )
    return version


async def _owned_live_document(
    session: AsyncSession,
    document_id: uuid.UUID,
    user: User,
) -> tuple[Document, Matter]:
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
    return doc, matter


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


__all__ = [name for name in globals() if not name.startswith("__")]
