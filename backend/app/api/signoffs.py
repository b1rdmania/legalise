"""Professional Sign-Off v1 — matter-scoped author sign-off endpoints.

Three endpoints under ``/api/matters/{slug}/signoffs``:

- ``POST``        — sign an artifact (signed / signed_with_observations /
                    rejected). The signer may be the author.
- ``GET``         — list sign-offs on this matter (newest first), each
                    flagged ``is_current`` (latest per artifact).
- ``GET /{id}``   — one sign-off (for the confirmation / deep-link page,
                    so a reload is stable).

Owner-only matter access. Every signed-in user can sign their own matter
outputs as themselves — no qualified-solicitor role gate and no
workspace-admin/superuser signing shortcut. Professional Sign-Off v1 is
personal ownership, not an admin override surface.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import current_user
from app.core.db import get_session
from app.core.matter_artifacts import ArtifactBytesUnavailable
from app.core.signoff import (
    InvalidSignoffDecision,
    ReasoningRequired,
    create_signoff,
    current_signoff_ids,
    list_signoffs,
)
from app.models import MatterArtifact, MatterSignoff, User
from app.models.matter import STATUS_ARCHIVED, Matter

router = APIRouter()


class CreateSignoffBody(BaseModel):
    artifact_id: str
    decision: str
    reasoning: str | None = None


class SignoffRead(BaseModel):
    id: str
    matter_id: str
    artifact_id: str
    invocation_id: str
    module_id: str
    capability_id: str
    kind: str
    artifact_hash: str
    decision: str
    reasoning: str | None
    signer_id: str
    signer_email: str | None
    signed_at: str
    is_current: bool


class SignoffListResponse(BaseModel):
    matter_id: str
    signoffs: list[SignoffRead]


async def _load_matter_or_404(
    session: AsyncSession, *, slug: str, user: User
) -> Matter:
    matter = await session.scalar(
        select(Matter).where(Matter.slug == slug, Matter.created_by_id == user.id)
    )
    if matter is None or matter.status == STATUS_ARCHIVED:
        raise HTTPException(status_code=404, detail=f"matter not found: {slug}")
    return matter


def _to_read(s: MatterSignoff, *, is_current: bool, signer_email: str | None) -> SignoffRead:
    return SignoffRead(
        id=str(s.id),
        matter_id=str(s.matter_id),
        artifact_id=str(s.artifact_id),
        invocation_id=str(s.invocation_id),
        module_id=s.module_id,
        capability_id=s.capability_id,
        kind=s.kind,
        artifact_hash=s.artifact_hash,
        decision=s.decision,
        reasoning=s.reasoning,
        signer_id=str(s.signer_id),
        signer_email=signer_email,
        signed_at=s.signed_at.isoformat() if s.signed_at else "",
        is_current=is_current,
    )


async def _signer_emails(
    session: AsyncSession, signer_ids: set[uuid.UUID]
) -> dict[uuid.UUID, str]:
    if not signer_ids:
        return {}
    rows = await session.execute(
        select(User.id, User.email).where(User.id.in_(signer_ids))
    )
    return {uid: email for uid, email in rows.all()}


@router.post("/{slug}/signoffs", response_model=SignoffRead, status_code=201)
async def create_signoff_endpoint(
    slug: str,
    body: CreateSignoffBody,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> SignoffRead:
    matter = await _load_matter_or_404(session, slug=slug, user=user)
    try:
        artifact_uuid = uuid.UUID(body.artifact_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="artifact_id is not a valid uuid")

    artifact = await session.scalar(
        select(MatterArtifact).where(
            MatterArtifact.id == artifact_uuid,
            MatterArtifact.matter_id == matter.id,
        )
    )
    if artifact is None:
        raise HTTPException(
            status_code=404, detail=f"artifact not found on matter: {body.artifact_id}"
        )

    try:
        signoff = await create_signoff(
            session,
            matter=matter,
            artifact=artifact,
            user=user,
            decision=body.decision,
            reasoning=body.reasoning,
        )
    except InvalidSignoffDecision as exc:
        raise HTTPException(
            status_code=422, detail={"error": "invalid_decision", "message": str(exc)}
        )
    except ReasoningRequired as exc:
        raise HTTPException(
            status_code=422, detail={"error": "reasoning_required", "message": str(exc)}
        )
    except ArtifactBytesUnavailable as exc:
        raise HTTPException(
            status_code=422,
            detail={"error": "artifact_bytes_unavailable", "message": str(exc)},
        )

    await session.commit()
    # A newly created sign-off is always the current one for its artifact.
    return _to_read(signoff, is_current=True, signer_email=user.email)


@router.get("/{slug}/signoffs", response_model=SignoffListResponse)
async def list_signoffs_endpoint(
    slug: str,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> SignoffListResponse:
    matter = await _load_matter_or_404(session, slug=slug, user=user)
    signoffs = await list_signoffs(session, matter=matter)
    current = current_signoff_ids(signoffs)
    emails = await _signer_emails(session, {s.signer_id for s in signoffs})
    return SignoffListResponse(
        matter_id=str(matter.id),
        signoffs=[
            _to_read(s, is_current=s.id in current, signer_email=emails.get(s.signer_id))
            for s in signoffs
        ],
    )


@router.get("/{slug}/signoffs/{signoff_id}", response_model=SignoffRead)
async def get_signoff_endpoint(
    slug: str,
    signoff_id: str,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> SignoffRead:
    matter = await _load_matter_or_404(session, slug=slug, user=user)
    try:
        signoff_uuid = uuid.UUID(signoff_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="signoff_id is not a valid uuid")

    signoff = await session.scalar(
        select(MatterSignoff).where(
            MatterSignoff.id == signoff_uuid, MatterSignoff.matter_id == matter.id
        )
    )
    if signoff is None:
        raise HTTPException(
            status_code=404, detail=f"sign-off not found on matter: {signoff_id}"
        )

    # is_current: this is the latest sign-off for its artifact.
    latest = await session.scalar(
        select(MatterSignoff.id)
        .where(MatterSignoff.artifact_id == signoff.artifact_id)
        .order_by(MatterSignoff.signed_at.desc(), MatterSignoff.id.desc())
        .limit(1)
    )
    emails = await _signer_emails(session, {signoff.signer_id})
    return _to_read(
        signoff,
        is_current=(latest == signoff.id),
        signer_email=emails.get(signoff.signer_id),
    )
