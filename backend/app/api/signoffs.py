"""Professional Sign-Off v1 — matter-scoped author sign-off endpoints.

Three endpoints under ``/api/matters/{slug}/signoffs``:

- ``POST``        — sign an artifact (signed / signed_with_observations /
                    rejected). The signer may be the author unless
                    ``SIGNOFF_AUTHOR_MUST_DIFFER`` is set (403
                    ``author_cannot_sign``; self-rejection always allowed).
- ``GET``         — list sign-offs on this matter (newest first), each
                    flagged ``is_current`` (latest per artifact).
- ``GET /{id}``   — one sign-off (for the confirmation / deep-link page,
                    so a reload is stable).

Owner-only matter access. Every signed-in user can sign their own matter
outputs as themselves — no qualified-solicitor role gate and no
workspace-admin/superuser signing shortcut. Professional Sign-Off v1 is
personal ownership, not an admin override surface. Each read carries
``signer_is_author`` so a self-signed output is labelled as such rather
than presented as independent review.
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
    AuthorCannotSign,
    InvalidSignoffDecision,
    ReasoningRequired,
    create_signoff,
    current_signoff_ids,
    list_signoffs,
    record_review_opened,
    review_annotations,
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
    signer_is_author: bool
    signed_at: str
    is_current: bool
    # Review window (M13): seconds between the signer's first open of
    # the sign surface (output.review.opened audit row) and the
    # decision. None when no open-event exists (legacy sign-offs) —
    # surfaces render "—", never 0.
    review_seconds: int | None = None
    # Recorded at sign time against the artifact's word count
    # (docs/spec/SUPERVISION_LEGIBILITY_M13.md). Recorded, not blocked.
    implausible_speed: bool = False


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


def _to_read(
    s: MatterSignoff,
    *,
    is_current: bool,
    signer_email: str | None,
    signer_is_author: bool,
    review_seconds: int | None = None,
    implausible_speed: bool = False,
) -> SignoffRead:
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
        signer_is_author=signer_is_author,
        signed_at=s.signed_at.isoformat() if s.signed_at else "",
        is_current=is_current,
        review_seconds=review_seconds,
        implausible_speed=implausible_speed,
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


async def _artifact_authors(
    session: AsyncSession, artifact_ids: set[uuid.UUID]
) -> dict[uuid.UUID, uuid.UUID]:
    """Map artifact id → created_by_id, for the signer-is-author flag."""
    if not artifact_ids:
        return {}
    rows = await session.execute(
        select(MatterArtifact.id, MatterArtifact.created_by_id).where(
            MatterArtifact.id.in_(artifact_ids)
        )
    )
    return {aid: author_id for aid, author_id in rows.all()}


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
    except AuthorCannotSign as exc:
        raise HTTPException(
            status_code=403,
            detail={"error": "author_cannot_sign", "message": str(exc)},
        )
    except ArtifactBytesUnavailable as exc:
        raise HTTPException(
            status_code=422,
            detail={"error": "artifact_bytes_unavailable", "message": str(exc)},
        )

    await session.commit()
    annotations = await review_annotations(session, [signoff])
    review_seconds, implausible_speed = annotations.get(signoff.id, (None, False))
    # A newly created sign-off is always the current one for its artifact.
    return _to_read(
        signoff,
        is_current=True,
        signer_email=user.email,
        signer_is_author=artifact.created_by_id == user.id,
        review_seconds=review_seconds,
        implausible_speed=implausible_speed,
    )


class ReviewOpenBody(BaseModel):
    artifact_id: str


class ReviewOpenResponse(BaseModel):
    artifact_id: str
    # True when this call recorded the first open; False when an
    # earlier open already holds the window's start (idempotent).
    recorded: bool


@router.post("/{slug}/signoffs/review-open", response_model=ReviewOpenResponse)
async def review_open_endpoint(
    slug: str,
    body: ReviewOpenBody,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> ReviewOpenResponse:
    """Record the first open of an artifact's sign surface (M13).

    Called by the sign page when it loads its artifact. Idempotent per
    signer+artifact: the first open wins and starts the review window;
    repeat opens write nothing.
    """
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

    recorded = await record_review_opened(
        session, matter=matter, artifact=artifact, user=user
    )
    if recorded:
        await session.commit()
    return ReviewOpenResponse(artifact_id=str(artifact.id), recorded=recorded)


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
    authors = await _artifact_authors(session, {s.artifact_id for s in signoffs})
    annotations = await review_annotations(session, signoffs)
    return SignoffListResponse(
        matter_id=str(matter.id),
        signoffs=[
            _to_read(
                s,
                is_current=s.id in current,
                signer_email=emails.get(s.signer_id),
                signer_is_author=authors.get(s.artifact_id) == s.signer_id,
                review_seconds=annotations.get(s.id, (None, False))[0],
                implausible_speed=annotations.get(s.id, (None, False))[1],
            )
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
    authors = await _artifact_authors(session, {signoff.artifact_id})
    annotations = await review_annotations(session, [signoff])
    review_seconds, implausible_speed = annotations.get(signoff.id, (None, False))
    return _to_read(
        signoff,
        is_current=(latest == signoff.id),
        signer_email=emails.get(signoff.signer_id),
        signer_is_author=authors.get(signoff.artifact_id) == signoff.signer_id,
        review_seconds=review_seconds,
        implausible_speed=implausible_speed,
    )
