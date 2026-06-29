"""Matters API — create, list, fetch, attach documents."""

from __future__ import annotations

import hashlib
import re
import uuid
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, UploadFile, File, Form, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import current_user
from app.core.config import settings
from app.core.db import get_session
from app.core.limits import check_matter_create, check_document_upload
from app.core.document_uploads import (
    validate_upload_magic_bytes,
    validate_upload_mime,
    validate_upload_size,
)
from app.core.matter_fs import (
    append_history,
    materialise_matter,
    record_document,
)
from app.core.storage import (
    get_storage_backend,
    uploaded_key,
    StorageWriteError,
    StorageDeleteError,
)
from app.core.audit_chain import verify_audit_chain
from app.core.matter_lifecycle import (
    MatterHasActiveJobsError,
    tombstone_matter,
)
from app.core.model_catalog import is_known_model, model_catalog
from app.core.indexing import index_document, reindex_matter
from app.core.text_extraction import extract as extract_text
from app.core.api import (
    PROVIDER_HTTP_EXCEPTIONS,
    audit,
    audit_storage_write_failure,
    provider_error_http_exception,
    storage_write_http_exception,
)
from app.models import (
    AuditChainEntry,
    AuditEntry,
    Document,
    DocumentComment,
    DocumentEdit,
    Matter,
    User,
    UserApiKey,
    PRIVILEGE_VALUES,
    PRIVILEGE_MIXED,
    STATUS_VALUES,  # noqa: F401 — exported for future endpoints
    STATUS_OPEN,
    STATUS_CLOSED,
    STATUS_ARCHIVED,
    TAG_VALUES,
)
from app.models.document_comment import COMMENT_STATUS_OPEN
from app.models.document_edit import EDIT_STATUS_PENDING
from app.models.document_body import DocumentBody, BODY_KIND_EXTRACTED
from app.models.document_version import DocumentVersion, VERSION_KIND_UPLOAD

router = APIRouter()

# Separate router for the model catalog. Mounted at /api/models in
# app.main (the matters_router lives under /api/matters, so the catalog
# can't hang off it). Kept here so the catalog schemas + endpoint sit
# next to the matter create/PATCH code that consumes the same catalog.
models_router = APIRouter()


# ---------- schemas ---------------------------------------------------------

class MatterCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    matter_type: str = Field(default="employment_tribunal", max_length=64)
    cause: str | None = Field(default=None, max_length=255)
    case_theory: str | None = None
    pivot_fact: str | None = None
    privilege_posture: str = Field(default=PRIVILEGE_MIXED)
    # None means "not specified" — create_matter resolves the effective model
    # from body -> the account default -> the settings default, so API callers
    # that omit it inherit the profile default instead of a hardcoded id.
    default_model_id: str | None = Field(default=None, max_length=64)
    facts: dict = Field(default_factory=dict)
    retention_until: date | None = None


class MatterRead(BaseModel):
    id: uuid.UUID
    slug: str
    title: str
    matter_type: str
    cause: str | None
    status: str
    case_theory: str | None
    pivot_fact: str | None
    privilege_posture: str
    default_model_id: str
    # Keyed provider the default model needs ("anthropic"/"openai"), or
    # null for keyless models. Frontend reads this for run-readiness
    # instead of re-deriving model families.
    required_provider: str | None
    facts: dict
    opened_at: datetime
    closed_at: datetime | None
    retention_until: date | None
    created_by_id: uuid.UUID

    model_config = {"from_attributes": True}


class PrivilegePatch(BaseModel):
    privilege_posture: str


class MatterModelPatch(BaseModel):
    """Body for changing a matter's model after creation.

    `default_model_id` is required and validated against the curated
    catalog (`is_known_model`) in the endpoint — unknown ids are 422.
    """

    default_model_id: str = Field(min_length=1, max_length=64)


class ModelCatalogEntryRead(BaseModel):
    id: str
    label: str
    # "anthropic" | "openai" | "ollama" | "none"
    provider: str
    requires_key: bool
    note: str
    # True for the curated recommended default, so the picker can mark it.
    recommended: bool = False
    # True when this entry needs no key, OR the current user has a stored
    # key for its provider. Lets the picker show "ready" vs "needs a key".
    key_configured: bool


class AuditEntryRead(BaseModel):
    id: uuid.UUID
    timestamp: datetime
    actor_id: uuid.UUID | None
    matter_id: uuid.UUID | None
    action: str
    module: str | None
    resource_type: str | None
    resource_id: str | None
    model_used: str | None
    prompt_hash: str | None
    response_hash: str | None
    token_count: int | None
    latency_ms: int | None
    payload: dict

    model_config = {"from_attributes": True}


class AuditChainHeadRead(BaseModel):
    chain_hash: str
    scope_sequence: int
    entry_hash: str


class AuditChainIssueRead(BaseModel):
    code: str
    message: str
    audit_entry_id: uuid.UUID | None = None
    chain_id: int | None = None


class AuditChainStatusRead(BaseModel):
    verified: bool
    scope: str
    length: int
    head: AuditChainHeadRead | None
    issues: list[AuditChainIssueRead]


class DocumentRead(BaseModel):
    id: uuid.UUID
    matter_id: uuid.UUID
    filename: str
    mime_type: str
    size_bytes: int
    sha256: str
    tag: str | None
    from_disclosure: bool
    uploaded_at: datetime
    uploaded_by_id: uuid.UUID
    index_status: str
    indexed_at: datetime | None = None
    comment_count: int = 0
    open_comment_count: int = 0
    version_count: int = 0
    edit_count: int = 0
    pending_edit_count: int = 0

    model_config = {"from_attributes": True}


# ---------- helpers ---------------------------------------------------------

_SLUG_RE = re.compile(r"[^a-z0-9]+")


def slugify(title: str) -> str:
    s = _SLUG_RE.sub("-", title.lower()).strip("-")
    return s[:100] or "matter"


async def unique_slug(session: AsyncSession, base: str, user_id: uuid.UUID) -> str:
    """Append `-2`, `-3`... if `base` already exists for this user.

    Slug uniqueness is per-owner — two users can each hold a matter at
    `khan-v-acme-trading-2026` without collision.
    """
    candidate = base
    n = 2
    while await session.scalar(
        select(Matter.id).where(Matter.slug == candidate, Matter.created_by_id == user_id)
    ):
        candidate = f"{base}-{n}"
        n += 1
    return candidate


async def _write_audit(
    session: AsyncSession,
    *,
    actor: User,
    matter: Matter | None,
    action: str,
    module: str | None = None,
    resource_type: str | None = None,
    resource_id: str | None = None,
    payload: dict | None = None,
) -> None:
    await audit.log(
        session,
        action,
        actor_id=actor.id,
        matter_id=matter.id if matter else None,
        module=module,
        resource_type=resource_type,
        resource_id=resource_id,
        payload=payload,
    )


# ---------- endpoints -------------------------------------------------------

@models_router.get("", response_model=list[ModelCatalogEntryRead])
async def list_models(
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> list[ModelCatalogEntryRead]:
    """Return the curated model catalog for the picker.

    Each entry is annotated with `key_configured` against THIS user's
    stored provider keys: keyless models (provider "ollama"/"none") are
    always ready; keyed models (anthropic/openai) are ready only when the
    user has a stored key for that provider.
    """
    rows = await session.scalars(
        select(UserApiKey.provider).where(UserApiKey.user_id == user.id)
    )
    configured_providers = set(rows.all())
    return [
        ModelCatalogEntryRead(
            id=entry.id,
            label=entry.label,
            provider=entry.provider,
            requires_key=entry.requires_key,
            note=entry.note,
            recommended=entry.recommended,
            key_configured=(
                not entry.requires_key
                or entry.provider in configured_providers
            ),
        )
        for entry in model_catalog()
    ]


@router.post("", response_model=MatterRead, status_code=status.HTTP_201_CREATED)
async def create_matter(
    body: MatterCreate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> Matter:
    if body.privilege_posture not in PRIVILEGE_VALUES:
        raise HTTPException(400, f"privilege_posture must be one of {sorted(PRIVILEGE_VALUES)}")

    await check_matter_create(user.id, session)

    base = slugify(body.title)
    slug = await unique_slug(session, base, user.id)

    matter = Matter(
        slug=slug,
        title=body.title,
        matter_type=body.matter_type,
        cause=body.cause,
        status=STATUS_OPEN,
        case_theory=body.case_theory,
        pivot_fact=body.pivot_fact,
        privilege_posture=body.privilege_posture,
        # body -> account default -> settings default. So the profile
        # "Default model" flows to new matters via the API too, not just the
        # new-matter form (gate finding F2).
        default_model_id=(
            body.default_model_id
            or user.default_model_id
            or settings.default_model_id
        ),
        facts=body.facts,
        retention_until=body.retention_until,
        created_by_id=user.id,
    )
    session.add(matter)
    await session.flush()

    await _write_audit(
        session,
        actor=user,
        matter=matter,
        action="matter.create",
        resource_type="matter",
        resource_id=matter.slug,
        payload={"title": matter.title, "type": matter.matter_type},
    )
    await session.commit()
    await session.refresh(matter)
    materialise_matter(matter)
    return matter


@router.get("", response_model=list[MatterRead])
async def list_matters(
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> list[Matter]:
    # Archived matters (tombstones) are excluded from the default list view.
    rows = await session.scalars(
        select(Matter)
        .where(Matter.created_by_id == user.id, Matter.status != STATUS_ARCHIVED)
        .order_by(Matter.opened_at.desc())
    )
    return list(rows.all())


@router.get("/{slug}", response_model=MatterRead)
async def get_matter(
    slug: str,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),  # noqa: ARG001
) -> Matter:
    matter = await session.scalar(
        select(Matter).where(Matter.slug == slug, Matter.created_by_id == user.id)
    )
    # Archived matters return 404 — same response cross-user to avoid information leak.
    if matter is None or matter.status == STATUS_ARCHIVED:
        raise HTTPException(404, f"matter not found: {slug}")
    return matter


@router.post("/{slug}/documents", response_model=DocumentRead, status_code=status.HTTP_201_CREATED)
async def upload_document(
    slug: str,
    file: UploadFile = File(...),
    tag: str | None = Form(default=None),
    from_disclosure: bool = Form(default=False),
    disclosure_proceedings_ref: str | None = Form(default=None),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> Document:
    matter = await session.scalar(
        select(Matter).where(Matter.slug == slug, Matter.created_by_id == user.id)
    )
    if matter is None:
        raise HTTPException(404, f"matter not found: {slug}")

    if tag is not None and tag not in TAG_VALUES:
        raise HTTPException(400, f"tag must be one of {sorted(TAG_VALUES)}")

    validate_upload_mime(file.content_type)
    contents = await file.read()
    validate_upload_size(contents)

    # Evaluation limits: checked after the 413 size cap so oversized bodies
    # produce 413 (not 429). Counts are read from Postgres against committed
    # data; the document is not yet inserted at this point.
    await check_document_upload(user.id, matter.id, len(contents), session)

    validate_upload_magic_bytes(file.content_type, contents)

    sha = hashlib.sha256(contents).hexdigest()

    doc = Document(
        matter_id=matter.id,
        filename=file.filename or "untitled",
        mime_type=file.content_type or "application/octet-stream",
        size_bytes=len(contents),
        sha256=sha,
        storage_uri=None,  # set after flush gives us doc.id
        tag=tag,
        from_disclosure=from_disclosure,
        disclosure_proceedings_ref=disclosure_proceedings_ref,
        uploaded_by_id=user.id,
    )
    session.add(doc)
    await session.flush()

    # Write bytes to object storage. Key uses canonical uploaded_key shape
    # so the object is scoped to user + matter + document + content-hash.
    # This happens after flush (we need doc.id) but before commit so a
    # storage failure rolls back the DB row rather than leaving an orphan.
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
                "filename": (file.filename or "untitled")[:200],
                "sha256": sha,
            },
        )
    except StorageWriteError as exc:
        # The request session's dependency teardown will roll back the
        # flushed Document row so no orphan exists. Forensic provenance
        # for the failure goes via `audit_failure` on a separate
        # committed session — survives the rollback — R3 review fix.
        await audit_storage_write_failure(
            session,
            actor_id=user.id,
            matter_id=matter.id,
            resource_type="document",
            resource_id=str(doc.id),
            storage_key=obj_key,
            backend=exc.backend,
            error_code=exc.error_code,
        )
        raise storage_write_http_exception(
            message="Failed to write document to object storage.",
            storage_key=obj_key,
            backend=exc.backend,
        ) from exc
    doc.storage_uri = obj_key

    # Establish the v1 `upload` version row immediately. Downstream
    # surfaces (edit-instruction, replicate_document) use
    # `max(version_number)+1`, which requires v1 to exist or assistant
    # edits would land as version 1 themselves. Invariant: every Document
    # has a corresponding v1 DocumentVersion of kind=upload.
    session.add(
        DocumentVersion(
            document_id=doc.id,
            version_number=1,
            kind=VERSION_KIND_UPLOAD,
            created_by_id=user.id,
            storage_uri=obj_key,
            filename=doc.filename,
            mime_type=doc.mime_type,
            size_bytes=doc.size_bytes,
            sha256=doc.sha256,
            notes=None,
        )
    )

    await _write_audit(
        session,
        actor=user,
        matter=matter,
        action="document.upload",
        resource_type="document",
        resource_id=str(doc.id),
        payload={"filename": doc.filename, "sha256": sha, "tag": tag, "from_disclosure": from_disclosure},
    )

    # Text extraction is synchronous for v0.1 so document bodies are
    # immediately available to modules after upload.
    extract_result = extract_text(contents, doc.mime_type, doc.filename)
    session.add(
        DocumentBody(
            document_id=doc.id,
            kind=BODY_KIND_EXTRACTED,
            extracted_text=extract_result.extracted_text,
            extraction_method=extract_result.extraction_method,
            char_count=extract_result.char_count,
            page_count=extract_result.page_count,
            error_reason=extract_result.error_reason,
        )
    )
    if extract_result.extraction_method == "failed":
        await _write_audit(
            session,
            actor=user,
            matter=matter,
            action="document.text_extraction_failed",
            module="document_ingestion",
            resource_type="document",
            resource_id=str(doc.id),
            payload={
                "reason": extract_result.error_reason,
                "mime_type": doc.mime_type,
            },
        )
    else:
        await _write_audit(
            session,
            actor=user,
            matter=matter,
            action="document.text_extracted",
            module="document_ingestion",
            resource_type="document",
            resource_id=str(doc.id),
            payload={
                "method": extract_result.extraction_method,
                "char_count": extract_result.char_count,
                "page_count": extract_result.page_count,
                "mime_type": doc.mime_type,
            },
        )

    # Retrieval indexing (P3). Runs inline in the upload transaction after a
    # successful extraction, but an indexing failure must NEVER break the
    # upload: the bytes + extracted body are already persisted; the document
    # is just not searchable yet (index_status stays 'failed', reindexable
    # later). The body must be flushed first so index_document can read it.
    if extract_result.extraction_method != "failed":
        await session.flush()
        try:
            index_status = await index_document(session, doc)
            await _write_audit(
                session,
                actor=user,
                matter=matter,
                action="document.indexed",
                module="retrieval",
                resource_type="document",
                resource_id=str(doc.id),
                payload={
                    "index_status": index_status,
                    "embedding_backend": settings.embedding_backend,
                },
            )
        except Exception:
            # index_document already set doc.index_status='failed' and logged.
            # Swallow so the upload still succeeds; the doc is reindexable.
            pass

    await session.commit()
    await session.refresh(doc)
    record_document(
        matter.slug, matter.created_by_id, str(doc.id), doc.filename, doc.sha256, doc.size_bytes, doc.tag
    )
    return doc


@router.get("/{slug}/documents", response_model=list[DocumentRead])
async def list_documents(
    slug: str,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),  # noqa: ARG001
) -> list[DocumentRead]:
    matter = await session.scalar(
        select(Matter).where(Matter.slug == slug, Matter.created_by_id == user.id)
    )
    if matter is None:
        raise HTTPException(404, f"matter not found: {slug}")
    comment_counts = (
        select(
            DocumentComment.document_id.label("document_id"),
            func.count(DocumentComment.id).label("comment_count"),
            func.count(DocumentComment.id)
            .filter(DocumentComment.status == COMMENT_STATUS_OPEN)
            .label("open_comment_count"),
        )
        .group_by(DocumentComment.document_id)
        .subquery()
    )
    version_counts = (
        select(
            DocumentVersion.document_id.label("document_id"),
            func.count(DocumentVersion.id).label("version_count"),
        )
        .group_by(DocumentVersion.document_id)
        .subquery()
    )
    edit_counts = (
        select(
            DocumentVersion.document_id.label("document_id"),
            func.count(DocumentEdit.id).label("edit_count"),
            func.count(DocumentEdit.id)
            .filter(DocumentEdit.status == EDIT_STATUS_PENDING)
            .label("pending_edit_count"),
        )
        .join(DocumentEdit, DocumentEdit.document_version_id == DocumentVersion.id)
        .group_by(DocumentVersion.document_id)
        .subquery()
    )
    rows = await session.execute(
        select(
            Document,
            comment_counts.c.comment_count,
            comment_counts.c.open_comment_count,
            version_counts.c.version_count,
            edit_counts.c.edit_count,
            edit_counts.c.pending_edit_count,
        )
        .outerjoin(comment_counts, comment_counts.c.document_id == Document.id)
        .outerjoin(version_counts, version_counts.c.document_id == Document.id)
        .outerjoin(edit_counts, edit_counts.c.document_id == Document.id)
        .where(Document.matter_id == matter.id)
        .order_by(Document.uploaded_at.desc())
    )
    return [
        DocumentRead.model_validate(doc).model_copy(
            update={
                "comment_count": int(comment_count or 0),
                "open_comment_count": int(open_comment_count or 0),
                "version_count": int(version_count or 0),
                "edit_count": int(edit_count or 0),
                "pending_edit_count": int(pending_edit_count or 0),
            }
        )
        for (
            doc,
            comment_count,
            open_comment_count,
            version_count,
            edit_count,
            pending_edit_count,
        ) in rows.all()
    ]


class ReindexSummary(BaseModel):
    indexed: int
    empty: int
    failed: int


@router.post("/{slug}/reindex", response_model=ReindexSummary)
async def reindex_documents(
    slug: str,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> ReindexSummary:
    """Reindex every document in the matter for retrieval (P3).

    Owner-only. Chunks + embeds each document's extracted body into
    ``document_chunks`` (idempotent — existing chunks are swept first). Lets a
    fork backfill documents uploaded before retrieval existed. Returns the
    per-status count and emits a ``matter.reindexed`` audit row.
    """
    matter = await session.scalar(
        select(Matter).where(Matter.slug == slug, Matter.created_by_id == user.id)
    )
    if matter is None:
        raise HTTPException(404, f"matter not found: {slug}")

    summary = await reindex_matter(session, matter.id)

    await _write_audit(
        session,
        actor=user,
        matter=matter,
        action="matter.reindexed",
        module="retrieval",
        resource_type="matter",
        resource_id=matter.slug,
        payload={
            "indexed": summary["indexed"],
            "empty": summary["empty"],
            "failed": summary["failed"],
            "embedding_backend": settings.embedding_backend,
        },
    )
    await session.commit()

    return ReindexSummary(
        indexed=summary["indexed"],
        empty=summary["empty"],
        failed=summary["failed"],
    )


@router.patch("/{slug}/privilege", response_model=MatterRead)
async def set_privilege_posture(
    slug: str,
    body: PrivilegePatch,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> Matter:
    if body.privilege_posture not in PRIVILEGE_VALUES:
        raise HTTPException(400, f"privilege_posture must be one of {sorted(PRIVILEGE_VALUES)}")

    matter = await session.scalar(
        select(Matter).where(Matter.slug == slug, Matter.created_by_id == user.id)
    )
    if matter is None:
        raise HTTPException(404, f"matter not found: {slug}")

    previous = matter.privilege_posture
    if previous == body.privilege_posture:
        return matter

    matter.privilege_posture = body.privilege_posture

    await _write_audit(
        session,
        actor=user,
        matter=matter,
        action="privilege.set",
        resource_type="matter",
        resource_id=matter.slug,
        payload={"from": previous, "to": body.privilege_posture},
    )
    await session.commit()
    await session.refresh(matter)
    append_history(matter.slug, matter.created_by_id, "privilege.set", f"{previous} → {body.privilege_posture}")
    materialise_matter(matter)
    return matter


@router.patch("/{slug}", response_model=MatterRead)
async def update_matter(
    slug: str,
    body: MatterModelPatch,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> Matter:
    """Change a matter's model after creation (owner-only).

    Validates `default_model_id` against the curated catalog — an unknown
    id is rejected with 422 (unlike create, which stays lenient). Emits a
    `matter.model.changed` audit row carrying from/to, and returns the
    matter in the same shape as `GET /api/matters/{slug}`.
    """
    if not is_known_model(body.default_model_id):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"unknown model id: {body.default_model_id}",
        )

    matter = await session.scalar(
        select(Matter).where(Matter.slug == slug, Matter.created_by_id == user.id)
    )
    # Archived matters return 404 — same as the other matter endpoints.
    if matter is None or matter.status == STATUS_ARCHIVED:
        raise HTTPException(404, f"matter not found: {slug}")

    previous = matter.default_model_id
    if previous == body.default_model_id:
        return matter  # no-op — no duplicate audit row

    matter.default_model_id = body.default_model_id

    await _write_audit(
        session,
        actor=user,
        matter=matter,
        action="matter.model.changed",
        resource_type="matter",
        resource_id=matter.slug,
        payload={"from": previous, "to": body.default_model_id},
    )
    await session.commit()
    await session.refresh(matter)
    append_history(
        matter.slug,
        matter.created_by_id,
        "matter.model.changed",
        f"{previous} → {body.default_model_id}",
    )
    materialise_matter(matter)
    return matter


@router.post("/{slug}/close", response_model=MatterRead)
async def close_matter(
    slug: str,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> Matter:
    """Non-destructive close (LMF-3).

    Marks the matter ``closed`` while **retaining** its audit, storage,
    and access — it still lists and reads. This is distinct from
    ``DELETE`` (the destructive tombstone: ``status=archived`` + storage
    purge). Owner-only; no admin/superuser shortcut. Idempotent; a
    tombstoned (archived) matter cannot be closed. One-way in v1 (reopen
    is not implemented).
    """
    matter = await session.scalar(
        select(Matter).where(
            Matter.slug == slug, Matter.created_by_id == user.id
        )
    )
    if matter is None:
        raise HTTPException(404, f"matter not found: {slug}")
    if matter.status == STATUS_ARCHIVED:
        raise HTTPException(
            409,
            detail={
                "error": "matter_archived",
                "message": "A deleted (archived) matter cannot be closed.",
            },
        )
    if matter.status == STATUS_CLOSED:
        return matter  # idempotent — no duplicate audit row

    previous = matter.status
    matter.status = STATUS_CLOSED
    matter.closed_at = datetime.now(timezone.utc)
    await _write_audit(
        session,
        actor=user,
        matter=matter,
        action="matter.closed",
        resource_type="matter",
        resource_id=matter.slug,
        payload={"from": previous},
    )
    await session.commit()
    await session.refresh(matter)
    append_history(matter.slug, matter.created_by_id, "matter.closed", f"{previous} → closed")
    materialise_matter(matter)
    return matter


@router.get("/{slug}/audit", response_model=list[AuditEntryRead])
async def list_audit(
    slug: str,
    limit: int = 50,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),  # noqa: ARG001
) -> list[AuditEntry]:
    matter = await session.scalar(
        select(Matter).where(Matter.slug == slug, Matter.created_by_id == user.id)
    )
    if matter is None:
        raise HTTPException(404, f"matter not found: {slug}")
    limit = max(1, min(limit, 200))
    rows = await session.scalars(
        select(AuditEntry)
        .where(AuditEntry.matter_id == matter.id)
        .order_by(AuditEntry.timestamp.desc())
        .limit(limit)
    )
    return list(rows.all())


@router.get("/{slug}/audit/chain", response_model=AuditChainStatusRead)
async def get_audit_chain_status(
    slug: str,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> AuditChainStatusRead:
    """Verify this matter's audit hash chain and report its head.

    Read-only: recomputes every link in the matter scope via
    `verify_audit_chain` (the Python mirror of the PL/pgSQL recipe).
    The head `chain_hash` is the matter record's fingerprint — export
    it and any later verification proves the trail was not rewritten.
    """
    matter = await session.scalar(
        select(Matter).where(Matter.slug == slug, Matter.created_by_id == user.id)
    )
    if matter is None:
        raise HTTPException(404, f"matter not found: {slug}")

    verification = await verify_audit_chain(session, matter_id=matter.id)

    head_row = await session.scalar(
        select(AuditChainEntry)
        .where(AuditChainEntry.matter_id == matter.id)
        .order_by(AuditChainEntry.scope_sequence.desc())
        .limit(1)
    )
    head = (
        AuditChainHeadRead(
            chain_hash=head_row.chain_hash,
            scope_sequence=head_row.scope_sequence,
            entry_hash=head_row.entry_hash,
        )
        if head_row is not None
        else None
    )

    return AuditChainStatusRead(
        verified=verification.ok,
        scope="matter",
        length=verification.chain_entry_count,
        head=head,
        issues=[
            AuditChainIssueRead(
                code=i.code,
                message=i.message,
                audit_entry_id=i.audit_entry_id,
                chain_id=i.chain_id,
            )
            for i in verification.issues
        ],
    )


# ---------------------------------------------------------------------------
# DELETE /api/matters/{slug}
# ---------------------------------------------------------------------------


@router.delete("/{slug}", status_code=204, response_class=Response)
async def delete_matter(
    slug: str,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> Response:
    """Tombstone a matter (archive/delete).

    Design decisions:
      - Tombstone over hard delete: sets matter.status = 'archived'.
        Document and event rows kept in DB for referential integrity;
        binary bytes removed from storage.
      - Does NOT require a prior export. A warning audit row
        (`matter.deleted_without_export`) is written when no successful
        export exists.
      - Refuses with 409 if any jobs for this matter are currently
        queued or running.
      - Storage cleanup is the gate: if `storage.delete_prefix` raises,
        the endpoint returns 502 and the matter remains live + un-archived
        + no `matter.deleted` audit row is written (fail-closed semantics
        per HANDOVER_SUBSTRATE_REVIEW_FIXES.md §2 P1).
      - On success, writes a `matter.deleted` audit row and sets
        status=archived in a single transaction.
      - Audit FKs are preserved: the matter row stays as a tombstone, so
        `audit_entries.matter_id` continues to resolve. Unit 6 WORM
        trigger forbids UPDATE/DELETE on audit_entries, so we don't try.
      - After this call, GET /api/matters/{slug} returns 404.
      - Cross-user: 404 (no 403), same as other matter endpoints.
    """
    # Owner lookup — 404 for missing or already-archived
    matter = await session.scalar(
        select(Matter).where(Matter.slug == slug, Matter.created_by_id == user.id)
    )
    if matter is None or matter.status == STATUS_ARCHIVED:
        raise HTTPException(404, f"matter not found: {slug}")

    # The destructive tombstone (active-job gate, storage purge, audit
    # rows, status=archived, grant cascade) is the shared
    # `tombstone_matter` helper — the SAME path the retention sweeper
    # runs. The route only translates its domain errors into HTTP and
    # owns the commit. External behaviour is unchanged.
    try:
        await tombstone_matter(session, matter, actor_id=user.id)
    except MatterHasActiveJobsError as exc:
        raise HTTPException(
            409,
            detail={
                "error": "matter_has_active_jobs",
                "active_job_count": exc.active_count,
                "message": (
                    "This matter has active jobs. Wait for them to complete "
                    "or cancel them before deleting the matter."
                ),
            },
        ) from exc
    except StorageDeleteError as exc:
        # Fail-closed: a 204 must mean the storage bytes are actually
        # gone (HANDOVER_SUBSTRATE_REVIEW_FIXES.md §2 P1). No commit has
        # been issued, so the request session rolls back via dependency
        # teardown when this HTTPException propagates — the matter stays
        # live and un-archived. We deliberately do NOT call
        # `session.rollback()` here because the test conftest wraps each
        # request in a SAVEPOINT and an explicit rollback confuses that
        # nesting.
        raise HTTPException(
            502,
            detail={
                "error": "matter_storage_delete_failed",
                "matter_slug": matter.slug,
                "message": (
                    "Failed to delete matter storage objects. The matter "
                    "has NOT been archived; please retry. If the error "
                    "persists, contact the operator."
                ),
            },
        ) from exc

    await session.commit()
    return Response(status_code=204)
