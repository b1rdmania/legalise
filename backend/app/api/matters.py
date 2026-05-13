"""Matters API — create, list, fetch, attach documents.

v0.1 endpoints:
    POST   /api/matters                     create a matter
    GET    /api/matters                     list all matters for the user
    GET    /api/matters/{slug}              fetch a matter by slug
    POST   /api/matters/{slug}/documents    register a document on the matter
    GET    /api/matters/{slug}/documents    list documents on the matter

Document upload is metadata-only for v0.1; binary upload to MinIO/R2 lands
later in the build window (Week 1 Day 5+).
"""

from __future__ import annotations

import hashlib
import re
import uuid
from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import current_user
from app.core.db import get_session
from app.models import (
    AuditEntry,
    Document,
    Matter,
    User,
    PRIVILEGE_VALUES,
    PRIVILEGE_MIXED,
    STATUS_VALUES,  # noqa: F401 — exported for future endpoints
    STATUS_OPEN,
    TAG_VALUES,
)

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

    model_config = {"from_attributes": True}


# ---------- helpers ---------------------------------------------------------

_SLUG_RE = re.compile(r"[^a-z0-9]+")


def slugify(title: str) -> str:
    s = _SLUG_RE.sub("-", title.lower()).strip("-")
    return s[:100] or "matter"


async def unique_slug(session: AsyncSession, base: str) -> str:
    """Append `-2`, `-3`... if `base` already exists."""
    candidate = base
    n = 2
    while await session.scalar(select(Matter.id).where(Matter.slug == candidate)):
        candidate = f"{base}-{n}"
        n += 1
    return candidate


async def _write_audit(
    session: AsyncSession,
    *,
    actor: User,
    matter: Matter | None,
    action: str,
    resource_type: str | None = None,
    resource_id: str | None = None,
    payload: dict | None = None,
) -> None:
    entry = AuditEntry(
        actor_id=actor.id,
        matter_id=matter.id if matter else None,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        payload=payload or {},
    )
    session.add(entry)


# ---------- endpoints -------------------------------------------------------

@router.post("", response_model=MatterRead, status_code=status.HTTP_201_CREATED)
async def create_matter(
    body: MatterCreate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> Matter:
    if body.privilege_posture not in PRIVILEGE_VALUES:
        raise HTTPException(400, f"privilege_posture must be one of {sorted(PRIVILEGE_VALUES)}")

    base = slugify(body.title)
    slug = await unique_slug(session, base)

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
    return matter


@router.get("", response_model=list[MatterRead])
async def list_matters(
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),  # noqa: ARG001 — invoked for side effects
) -> list[Matter]:
    rows = await session.scalars(select(Matter).order_by(Matter.opened_at.desc()))
    return list(rows.all())


@router.get("/{slug}", response_model=MatterRead)
async def get_matter(
    slug: str,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),  # noqa: ARG001
) -> Matter:
    matter = await session.scalar(select(Matter).where(Matter.slug == slug))
    if matter is None:
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
    matter = await session.scalar(select(Matter).where(Matter.slug == slug))
    if matter is None:
        raise HTTPException(404, f"matter not found: {slug}")

    if tag is not None and tag not in TAG_VALUES:
        raise HTTPException(400, f"tag must be one of {sorted(TAG_VALUES)}")

    contents = await file.read()
    sha = hashlib.sha256(contents).hexdigest()

    doc = Document(
        matter_id=matter.id,
        filename=file.filename or "untitled",
        mime_type=file.content_type or "application/octet-stream",
        size_bytes=len(contents),
        sha256=sha,
        storage_uri=None,  # v0.1: metadata-only register; binary store lands later
        tag=tag,
        from_disclosure=from_disclosure,
        disclosure_proceedings_ref=disclosure_proceedings_ref,
        uploaded_by_id=user.id,
    )
    session.add(doc)
    await session.flush()

    await _write_audit(
        session,
        actor=user,
        matter=matter,
        action="document.upload",
        resource_type="document",
        resource_id=str(doc.id),
        payload={"filename": doc.filename, "sha256": sha, "tag": tag, "from_disclosure": from_disclosure},
    )
    await session.commit()
    await session.refresh(doc)
    return doc


@router.get("/{slug}/documents", response_model=list[DocumentRead])
async def list_documents(
    slug: str,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),  # noqa: ARG001
) -> list[Document]:
    matter = await session.scalar(select(Matter).where(Matter.slug == slug))
    if matter is None:
        raise HTTPException(404, f"matter not found: {slug}")
    rows = await session.scalars(
        select(Document).where(Document.matter_id == matter.id).order_by(Document.uploaded_at.desc())
    )
    return list(rows.all())


@router.patch("/{slug}/privilege", response_model=MatterRead)
async def set_privilege_posture(
    slug: str,
    body: PrivilegePatch,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> Matter:
    if body.privilege_posture not in PRIVILEGE_VALUES:
        raise HTTPException(400, f"privilege_posture must be one of {sorted(PRIVILEGE_VALUES)}")

    matter = await session.scalar(select(Matter).where(Matter.slug == slug))
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
    return matter


@router.get("/{slug}/audit", response_model=list[AuditEntryRead])
async def list_audit(
    slug: str,
    limit: int = 50,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),  # noqa: ARG001
) -> list[AuditEntry]:
    matter = await session.scalar(select(Matter).where(Matter.slug == slug))
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
