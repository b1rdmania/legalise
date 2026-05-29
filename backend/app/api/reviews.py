"""Supervisor Review v1 — matter-scoped review/approval endpoints.

Three endpoints under ``/api/matters/{slug}/reviews``:

- ``POST``               — request review of one matter artifact.
- ``POST /{id}/decide``  — record a terminal decision (approve / reject /
                           request_changes / override).
- ``GET``                — list reviews on this matter (newest first).

Same strict matter-access predicate as grants/audit: matter owner OR
workspace superuser. Advisory + audited (ratified Q2): a decision is
recorded and reconstructs; it does not hard-gate downstream use.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import current_user
from app.core.db import get_session
from app.core.matter_artifacts import ArtifactBytesUnavailable
from app.core.reviews import (
    InvalidReviewDecision,
    InvalidReviewTransition,
    NoteRequired,
    ReviewAlreadyPending,
    ReviewNotEligible,
    ReviewerIsAuthor,
    decide_review,
    request_review,
)
from app.models import MatterArtifact, MatterReview, User
from app.models.matter import STATUS_ARCHIVED, Matter


router = APIRouter()


class RequestReviewBody(BaseModel):
    artifact_id: str


class DecideBody(BaseModel):
    decision: str
    note: str | None = None


class ReviewRead(BaseModel):
    id: str
    matter_id: str
    artifact_id: str
    invocation_id: str
    module_id: str
    capability_id: str
    kind: str
    artifact_hash: str
    state: str
    requested_by_id: str
    requested_at: str
    decided_by_id: str | None
    decided_at: str | None
    note: str | None


class ReviewListResponse(BaseModel):
    matter_id: str
    reviews: list[ReviewRead]


async def _load_matter_or_404(
    session: AsyncSession, *, slug: str, user: User
) -> Matter:
    matter = await session.scalar(
        select(Matter).where(
            Matter.slug == slug, Matter.created_by_id == user.id
        )
    )
    if matter is None and user.is_superuser:
        matter = await session.scalar(select(Matter).where(Matter.slug == slug))
    if matter is None or matter.status == STATUS_ARCHIVED:
        raise HTTPException(status_code=404, detail=f"matter not found: {slug}")
    return matter


def _to_read(r: MatterReview) -> ReviewRead:
    return ReviewRead(
        id=str(r.id),
        matter_id=str(r.matter_id),
        artifact_id=str(r.artifact_id),
        invocation_id=str(r.invocation_id),
        module_id=r.module_id,
        capability_id=r.capability_id,
        kind=r.kind,
        artifact_hash=r.artifact_hash,
        state=r.state,
        requested_by_id=str(r.requested_by_id),
        requested_at=r.requested_at.isoformat() if r.requested_at else "",
        decided_by_id=str(r.decided_by_id) if r.decided_by_id else None,
        decided_at=r.decided_at.isoformat() if r.decided_at else None,
        note=r.note,
    )


@router.post("/{slug}/reviews", response_model=ReviewRead, status_code=201)
async def request_review_endpoint(
    slug: str,
    body: RequestReviewBody,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> ReviewRead:
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
        review = await request_review(
            session, matter=matter, artifact=artifact, user=user
        )
    except ReviewNotEligible as exc:
        raise HTTPException(
            status_code=422,
            detail={"error": "artifact_not_review_eligible", "message": str(exc)},
        )
    except ReviewAlreadyPending as exc:
        raise HTTPException(
            status_code=409,
            detail={"error": "review_already_pending", "message": str(exc)},
        )
    except ArtifactBytesUnavailable as exc:
        raise HTTPException(
            status_code=422,
            detail={"error": "artifact_bytes_unavailable", "message": str(exc)},
        )

    await session.commit()
    return _to_read(review)


@router.post("/{slug}/reviews/{review_id}/decide", response_model=ReviewRead)
async def decide_review_endpoint(
    slug: str,
    review_id: str,
    body: DecideBody,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> ReviewRead:
    matter = await _load_matter_or_404(session, slug=slug, user=user)
    try:
        review_uuid = uuid.UUID(review_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="review_id is not a valid uuid")

    review = await session.scalar(
        select(MatterReview).where(
            MatterReview.id == review_uuid,
            MatterReview.matter_id == matter.id,
        )
    )
    if review is None:
        raise HTTPException(
            status_code=404, detail=f"review not found on matter: {review_id}"
        )

    try:
        decided = await decide_review(
            session,
            review=review,
            user=user,
            decision=body.decision,
            note=body.note,
        )
    except InvalidReviewDecision as exc:
        raise HTTPException(
            status_code=422,
            detail={"error": "invalid_decision", "message": str(exc)},
        )
    except NoteRequired as exc:
        raise HTTPException(
            status_code=422,
            detail={"error": "note_required", "message": str(exc)},
        )
    except ReviewerIsAuthor as exc:
        raise HTTPException(
            status_code=403,
            detail={"error": "reviewer_is_author", "message": str(exc)},
        )
    except InvalidReviewTransition as exc:
        raise HTTPException(
            status_code=409,
            detail={"error": "review_already_decided", "message": str(exc)},
        )

    await session.commit()
    return _to_read(decided)


@router.get("/{slug}/reviews", response_model=ReviewListResponse)
async def list_reviews_endpoint(
    slug: str,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> ReviewListResponse:
    matter = await _load_matter_or_404(session, slug=slug, user=user)
    rows = (
        await session.scalars(
            select(MatterReview)
            .where(MatterReview.matter_id == matter.id)
            .order_by(MatterReview.requested_at.desc())
        )
    ).all()
    return ReviewListResponse(
        matter_id=str(matter.id),
        reviews=[_to_read(r) for r in rows],
    )
