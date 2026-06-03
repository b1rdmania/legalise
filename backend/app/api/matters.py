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

from app.adapters import plugin_bridge as plugin_bridge_module
from app.adapters.plugin_bridge import SkillDisabled
from app.core.auth import current_user
from app.core.db import get_session
from app.core.limits import check_matter_create, check_document_upload
from app.core.document_uploads import (
    ALLOWED_UPLOAD_MIMES,
    MAX_UPLOAD_BYTES,
    MIME_TO_FORMAT,
    sniff_format,
)
from app.core.matter_fs import (
    append_history,
    materialise_matter,
    record_document,
)
from app.core.model_gateway import PrivilegePaused
from app.core.storage import (
    get_storage_backend,
    uploaded_key,
    matter_prefix,
    StorageWriteError,
    StorageDeleteError,
)
from app.core.text_extraction import extract as extract_text
from app.core.user_keys import ProviderKeyMissing, ProviderUpstreamError
from app.core.api import audit
from app.models import (
    AuditEntry,
    Document,
    DocumentComment,
    Job,
    Matter,
    User,
    PRIVILEGE_VALUES,
    PRIVILEGE_MIXED,
    STATUS_VALUES,  # noqa: F401 — exported for future endpoints
    STATUS_OPEN,
    STATUS_CLOSED,
    STATUS_ARCHIVED,
    TAG_VALUES,
    JOB_ACTIVE_STATUSES,
    JOB_KIND_EXPORT,
    JOB_STATUS_SUCCEEDED,
)
from app.models.document_body import DocumentBody, BODY_KIND_EXTRACTED
from app.models.document_version import DocumentVersion, VERSION_KIND_UPLOAD

router = APIRouter()


# ---------- schemas ---------------------------------------------------------

class MatterCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    matter_type: str = Field(default="employment_tribunal", max_length=64)
    cause: str | None = Field(default=None, max_length=255)
    case_theory: str | None = None
    pivot_fact: str | None = None
    privilege_posture: str = Field(default=PRIVILEGE_MIXED)
    default_model_id: str = Field(default="claude-opus-4-7", max_length=64)
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
    comment_count: int = 0

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
        default_model_id=body.default_model_id,
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

    if file.content_type not in ALLOWED_UPLOAD_MIMES:
        raise HTTPException(
            415,
            detail={
                "error": "unsupported_mime",
                "got": file.content_type,
                "allowed": sorted(ALLOWED_UPLOAD_MIMES),
            },
        )

    contents = await file.read()
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            413,
            detail={
                "error": "upload_too_large",
                "max_bytes": MAX_UPLOAD_BYTES,
                "got_bytes": len(contents),
            },
        )

    # Evaluation limits: checked after the 413 size cap so oversized bodies
    # produce 413 (not 429). Counts are read from Postgres against committed
    # data; the document is not yet inserted at this point.
    await check_document_upload(user.id, matter.id, len(contents), session)

    declared_format = MIME_TO_FORMAT[file.content_type or ""]
    inferred_format = sniff_format(contents[:1024])
    if inferred_format is None or declared_format != inferred_format:
        raise HTTPException(
            415,
            detail={
                "error": "magic_byte_mismatch",
                "declared_mime": file.content_type,
                "declared_format": declared_format,
                "inferred_format": inferred_format,
            },
        )

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
        from app.core.api import audit_failure
        await audit_failure(
            session,
            "storage.put_bytes.failed",
            actor_id=user.id,
            matter_id=matter.id,
            module="storage",
            resource_type="document",
            resource_id=str(doc.id),
            payload={
                "storage_key": obj_key,
                "backend": exc.backend,
                "error_code": exc.error_code,
            },
        )
        raise HTTPException(
            502,
            detail={
                "error": "storage_write_failed",
                "message": "Failed to write document to object storage.",
                "storage_key": obj_key,
                "backend": exc.backend,
            },
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
            storage_uri=None,
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
    rows = await session.execute(
        select(Document, func.count(DocumentComment.id).label("comment_count"))
        .outerjoin(DocumentComment, DocumentComment.document_id == Document.id)
        .where(Document.matter_id == matter.id)
        .group_by(Document.id)
        .order_by(Document.uploaded_at.desc())
    )
    return [
        DocumentRead.model_validate(doc).model_copy(
            update={"comment_count": int(comment_count or 0)}
        )
        for doc, comment_count in rows.all()
    ]


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


class PluginInvokeBody(BaseModel):
    plugin: str
    skill: str
    inputs: dict = Field(default_factory=dict)


class PluginInvokeResponse(BaseModel):
    plugin: str
    skill: str
    matter_slug: str
    response_text: str
    model_used: str
    token_count: int
    latency_ms: int


@router.post("/{slug}/invoke", response_model=PluginInvokeResponse)
async def invoke_plugin(
    slug: str,
    body: PluginInvokeBody,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> PluginInvokeResponse:
    """Invoke a claude-for-uk-legal skill against this matter.

    v0.1 direct skill rendering: SKILL.md → matter context → gateway →
    response. Two audit rows are written: `plugin.invoked` (this layer)
    and `model.call` (gateway). C_paused privilege posture blocks the
    call before any network traffic.
    """
    matter = await session.scalar(
        select(Matter).where(Matter.slug == slug, Matter.created_by_id == user.id)
    )
    if matter is None:
        raise HTTPException(404, f"matter not found: {slug}")

    bridge = plugin_bridge_module.bridge
    if bridge is None:
        raise HTTPException(503, "plugin bridge not initialised")

    try:
        result = await bridge.invoke(
            session=session,
            matter_id=matter.id,
            actor_id=user.id,
            plugin=body.plugin,
            skill=body.skill,
            inputs=body.inputs,
        )
    except FileNotFoundError as exc:
        raise HTTPException(404, str(exc)) from exc
    except SkillDisabled as exc:
        raise HTTPException(403, str(exc)) from exc
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
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc

    await session.commit()
    return PluginInvokeResponse(
        plugin=result.plugin,
        skill=result.skill,
        matter_slug=result.matter_slug,
        response_text=result.response_text,
        model_used=result.model_used,
        token_count=result.token_count,
        latency_ms=result.latency_ms,
    )


# ---------------------------------------------------------------------------
# Workflow catalogue per matter
#
# v0.1 surfaces five built-in workflows as the matter's Workflows tab.
# These are NOT installed plugins; they are in-app orchestration over
# the model gateway. The endpoint always returns the five entries.
# Treat this as a *built-in catalogue with workspace-level capability
# state*, not an install-state listing.
#
# Per workflow we derive:
#   - `grant`: does the workspace hold the runtime capability types this
#     workflow needs? Values: `granted` (all held), `partial` (some
#     held), `blocked` (none held). Union of `(plugin, skill, capability)`
#     grants across the user's workspace - workspace-level signal, not
#     per-skill enforcement. The runtime enforces at the per-call layer
#     regardless of what this endpoint says.
#   - `availability`: `ok` / `blocked-by-posture` / `blocked-by-grant`.
#     Computed from grant + matter posture.
#   - `last_run_at`: most recent audit timestamp whose `module` matches
#     one of the workflow's `audit_modules`. No denorm table.
#
# `declared_capabilities` carries ONLY runtime-vocabulary slugs (see
# `app.core.capabilities.CAPABILITY_VOCABULARY`). Audit emission is
# mandatory provenance, not a revocable permission; "writes a review
# table" / "uses network" is descriptive metadata in the human
# `description`, not a runtime capability.
# ---------------------------------------------------------------------------


class WorkflowDef(BaseModel):
    key: str
    title: str
    description: str
    declared_capabilities: list[str]
    audit_modules: list[str]


WORKFLOW_DEFS: list[WorkflowDef] = [
    WorkflowDef(
        key="premotion",
        title="Pre-Motion",
        description=(
            "Stress-test a claim with nine model calls. Reads the matter "
            "documents and chronology. Logs every step to the audit; writes "
            "no other artefacts."
        ),
        declared_capabilities=[
            "matter.read",
            "document.body.read",
            "chronology.read",
            "model.invoke",
        ],
        audit_modules=["pre_motion", "premotion"],
    ),
    WorkflowDef(
        key="letters",
        title="Letters",
        description=(
            "Draft a routing-aware letter (LBA for ET, CPR letter for civil). "
            "Reads matter metadata and the chronology. Outputs a draft "
            "document and an audit trail."
        ),
        declared_capabilities=[
            "matter.read",
            "chronology.read",
            "document.generated.write",
            "model.invoke",
        ],
        audit_modules=["letters"],
    ),
    WorkflowDef(
        key="contract-review",
        title="Contract review",
        description=(
            "Run a four-stage UK-focused review: parse, analyse against "
            "UCTA / CRA / UK GDPR / governing law / jurisdiction, redline, "
            "summarise."
        ),
        declared_capabilities=[
            "document.body.read",
            "document.generated.write",
            "model.invoke",
        ],
        audit_modules=["contract_review"],
    ),
    WorkflowDef(
        key="reviews",
        title="Tabular Review",
        description=(
            "Apply a structured column set across a document set. One row "
            "per document, one column per question; every cell cites its "
            "source passage."
        ),
        declared_capabilities=[
            "document.body.read",
            "model.invoke",
        ],
        audit_modules=["tabular_review"],
    ),
    WorkflowDef(
        key="research",
        title="Case law",
        description=(
            "Search reported UK authorities and cite them into the matter. "
            "v0.2 swaps in the Find Case Law MCP."
        ),
        declared_capabilities=[
            "matter.read",
            "citation.write",
            "model.invoke",
        ],
        audit_modules=["research", "case_law"],
    ),
]


class WorkflowState(BaseModel):
    key: str
    title: str
    description: str
    declared_capabilities: list[str]
    granted_capabilities: list[str]
    # `grant` reports workspace-level capability coverage: does the user
    # hold the runtime capability types this workflow needs anywhere in
    # their grant table? `granted` = all, `partial` = some, `blocked` =
    # none. v0.1 does not enumerate `not-installed`: every workflow is a
    # built-in in-app pipeline, always present.
    grant: str  # "granted" | "partial" | "blocked"
    last_run_at: datetime | None
    availability: str  # "ok" | "blocked-by-posture" | "blocked-by-grant"
    reason: str | None


class MatterWorkflowsResponse(BaseModel):
    workflows: list[WorkflowState]


def _compute_workflow_state(
    wf: WorkflowDef,
    user_granted: set[str],
    posture: str | None,
    last_run_at: datetime | None,
) -> WorkflowState:
    """Derive grant + availability + reason for one workflow.

    `user_granted` is the union of capabilities granted to the user
    across every (plugin, skill) row. This is a workspace-level signal -
    "does the workspace hold the runtime capability types this workflow
    needs?" - NOT a per-skill enforcement claim. The runtime gates each
    call at the per-(plugin, skill) capability layer; this endpoint just
    surfaces whether the workspace has the right shape for the workflow
    to be runnable.

    `declared` is asserted to be a non-empty subset of the runtime
    vocabulary - WORKFLOW_DEFS is authored against
    `app.core.capabilities.CAPABILITY_VOCABULARY`. The `not-installed`
    branch is unreachable in v0.1 (built-in catalogue) and intentionally
    omitted from the response enum.
    """
    declared = list(wf.declared_capabilities)
    granted = sorted(c for c in declared if c in user_granted)

    declared_set = set(declared)
    granted_set = set(granted)

    if granted_set == declared_set:
        grant = "granted"
    elif granted_set:
        grant = "partial"
    else:
        grant = "blocked"

    # Posture rule (v0.1): C_paused refuses cloud model calls, so any
    # workflow declaring `model.invoke` is blocked under that posture.
    # A_cleared and B_mixed permit cloud calls; A_cleared additionally
    # filters privileged content out of the prompt, but that's a runtime
    # concern, not a catalogue gate.
    if posture == "C_paused" and "model.invoke" in declared_set:
        return WorkflowState(
            key=wf.key,
            title=wf.title,
            description=wf.description,
            declared_capabilities=declared,
            granted_capabilities=granted,
            grant=grant,
            last_run_at=last_run_at,
            availability="blocked-by-posture",
            reason="posture C_paused refuses cloud model calls",
        )

    if grant == "granted":
        return WorkflowState(
            key=wf.key,
            title=wf.title,
            description=wf.description,
            declared_capabilities=declared,
            granted_capabilities=granted,
            grant=grant,
            last_run_at=last_run_at,
            availability="ok",
            reason=None,
        )

    missing = sorted(declared_set - granted_set)
    return WorkflowState(
        key=wf.key,
        title=wf.title,
        description=wf.description,
        declared_capabilities=declared,
        granted_capabilities=granted,
        grant=grant,
        last_run_at=last_run_at,
        availability="blocked-by-grant",
        reason=f"missing capabilities: {', '.join(missing)}",
    )


@router.get("/{slug}/workflows", response_model=MatterWorkflowsResponse)
async def list_matter_workflows(
    slug: str,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> MatterWorkflowsResponse:
    matter = await session.scalar(
        select(Matter).where(Matter.slug == slug, Matter.created_by_id == user.id)
    )
    if matter is None:
        raise HTTPException(404, f"matter not found: {slug}")

    from app.models import WorkspaceSkillCapabilityGrant

    grant_rows = await session.scalars(
        select(WorkspaceSkillCapabilityGrant.capability).where(
            WorkspaceSkillCapabilityGrant.user_id == user.id
        )
    )
    user_granted: set[str] = set(grant_rows.all())

    # Last run per workflow: scan the audit log for this matter, take the
    # most recent timestamp whose `module` matches one of the workflow's
    # `audit_modules`. v0.1: small audit logs, in-memory grouping. v0.2:
    # consider a denorm field if matter audit logs grow.
    audit_modules: set[str] = {m for wf in WORKFLOW_DEFS for m in wf.audit_modules}
    audit_rows = await session.scalars(
        select(AuditEntry)
        .where(AuditEntry.matter_id == matter.id, AuditEntry.module.in_(audit_modules))
        .order_by(AuditEntry.timestamp.desc())
    )
    last_run_by_module: dict[str, datetime] = {}
    for row in audit_rows.all():
        if row.module and row.module not in last_run_by_module:
            last_run_by_module[row.module] = row.timestamp

    workflows: list[WorkflowState] = []
    for wf in WORKFLOW_DEFS:
        last_run_at = max(
            (last_run_by_module[m] for m in wf.audit_modules if m in last_run_by_module),
            default=None,
        )
        workflows.append(
            _compute_workflow_state(
                wf=wf,
                user_granted=user_granted,
                posture=matter.privilege_posture,
                last_run_at=last_run_at,
            )
        )

    return MatterWorkflowsResponse(workflows=workflows)


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

    # Refuse if active jobs exist for this matter
    from sqlalchemy import func as sa_func
    active_count = (
        await session.scalar(
            select(sa_func.count(Job.id)).where(
                Job.matter_id == matter.id,
                Job.status.in_(JOB_ACTIVE_STATUSES),
            )
        )
    ) or 0
    if active_count > 0:
        raise HTTPException(
            409,
            detail={
                "error": "matter_has_active_jobs",
                "active_job_count": active_count,
                "message": (
                    "This matter has active jobs. Wait for them to complete "
                    "or cancel them before deleting the matter."
                ),
            },
        )

    # Warn if no successful export exists
    export_count = (
        await session.scalar(
            select(sa_func.count(Job.id)).where(
                Job.matter_id == matter.id,
                Job.kind == JOB_KIND_EXPORT,
                Job.status == JOB_STATUS_SUCCEEDED,
            )
        )
    ) or 0

    # Attempt storage cleanup FIRST, before writing the matter.deleted
    # audit row or setting status=archived. Per HANDOVER_SUBSTRATE_REVIEW_FIXES.md
    # §2 P1: a 204 response must mean the storage bytes are actually
    # gone, not "we tried and the matter is archived anyway." A
    # storage failure must leave the matter live and reachable so the
    # user can retry, and must not emit a `matter.deleted` row claiming
    # the delete happened.
    try:
        storage = get_storage_backend()
        prefix = matter_prefix(user.id, matter.id)
        storage.delete_prefix(prefix)
    except StorageDeleteError as exc:
        # No commit has been issued on this path yet; the request
        # session will roll back via the dependency teardown when
        # HTTPException propagates. We deliberately do NOT call
        # `session.rollback()` here because the test conftest wraps
        # each request in a SAVEPOINT and the explicit rollback
        # confuses that nesting.
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

    # Storage cleanup succeeded — write the deletion audit row(s) and
    # tombstone the matter in a single transaction. Tombstone design:
    # the matter row stays (with status=archived), so audit FKs
    # continue to resolve. No UPDATE on audit_entries (Unit 6 WORM
    # trigger forbids it, and there's no referential reason).
    await _write_audit(
        session,
        actor=user,
        matter=matter,
        action="matter.deleted",
        resource_type="matter",
        resource_id=matter.slug,
        payload={
            "title": matter.title,
            "had_export": export_count > 0,
            "export_count": export_count,
        },
    )
    if export_count == 0:
        await _write_audit(
            session,
            actor=user,
            matter=matter,
            action="matter.deleted_without_export",
            resource_type="matter",
            resource_id=matter.slug,
            payload={
                "warning": "Matter deleted without a prior successful export."
            },
        )

    matter.status = STATUS_ARCHIVED

    # Cascade grant revocation. Scoping is keyed on the first-class
    # scope_type/scope_id columns (backfilled from the snapshot JSONB
    # in migration 0019), so existing matter-scoped grants are picked
    # up; workspace-scoped grants (scope_type='workspace') are not.
    from app.models import (
        SCOPE_TYPE_MATTER,
        WorkspaceSkillCapabilityGrant as _WSCG,
    )

    grants_to_revoke = (
        await session.scalars(
            select(_WSCG).where(
                _WSCG.scope_type == SCOPE_TYPE_MATTER,
                _WSCG.scope_id == matter.id,
            )
        )
    ).all()
    revoked_count = 0
    for grant_row in grants_to_revoke:
        await session.delete(grant_row)
        revoked_count += 1
    if revoked_count:
        await audit.log(
            session,
            "module.grant.revoked",
            actor_id=user.id,
            matter_id=matter.id,
            module=None,
            resource_type="capability_grant",
            resource_id=matter.slug,
            payload={
                "count": revoked_count,
                "reason": "matter_archived",
            },
        )

    await session.commit()
    return Response(status_code=204)
