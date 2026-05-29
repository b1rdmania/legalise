"""Supervisor Review v1 — service layer.

Request a human review over a matter artifact, then record one terminal
decision (approve / reject / request changes / override). Each
transition emits a ``review.*`` audit row in the caller's session so it
commits alongside the state change and shows up in matter
reconstruction (source ``audit``).

Design decisions (ratified — see docs/handovers/SUPERVISOR_REVIEW_V1_PLAN.md):
- Manual request (not auto-on-produce).
- Advisory + audited: a decision records and reconstructs, it does not
  hard-gate downstream use.
- Reviewer != author/requester by default; a superuser may override
  that, and the override is itself recorded in the audit row.
- Approved does not mean legally correct (a product/copy concern; the
  substrate only records that a decision was made).
"""

from __future__ import annotations

import hashlib
import uuid
from datetime import datetime, UTC

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.api import audit
from app.core.matter_artifacts import ArtifactBytesUnavailable, load_artifact_bytes
from app.models import (
    MatterArtifact,
    MatterReview,
    REVIEW_APPROVED,
    REVIEW_CHANGES_REQUESTED,
    REVIEW_ELIGIBLE_KINDS,
    REVIEW_OVERRIDDEN,
    REVIEW_PENDING,
    REVIEW_REJECTED,
)
from app.models.matter import Matter
from app.models.user import User


# Audit action vocabulary (dotted namespace — rides the existing
# reconstruction ``audit`` source, no new source needed).
REVIEW_ACTION_REQUESTED = "review.requested"
REVIEW_ACTION_APPROVED = "review.approved"
REVIEW_ACTION_REJECTED = "review.rejected"
REVIEW_ACTION_CHANGES_REQUESTED = "review.changes_requested"
REVIEW_ACTION_OVERRIDDEN = "review.overridden"

# Decision verb -> (terminal state, audit action, note_required).
DECISION_APPROVE = "approve"
DECISION_REJECT = "reject"
DECISION_REQUEST_CHANGES = "request_changes"
DECISION_OVERRIDE = "override"

_DECISION_MAP: dict[str, tuple[str, str, bool]] = {
    DECISION_APPROVE: (REVIEW_APPROVED, REVIEW_ACTION_APPROVED, False),
    DECISION_REJECT: (REVIEW_REJECTED, REVIEW_ACTION_REJECTED, True),
    DECISION_REQUEST_CHANGES: (
        REVIEW_CHANGES_REQUESTED,
        REVIEW_ACTION_CHANGES_REQUESTED,
        True,
    ),
    DECISION_OVERRIDE: (REVIEW_OVERRIDDEN, REVIEW_ACTION_OVERRIDDEN, True),
}

DECISION_VERBS = frozenset(_DECISION_MAP)


# Exceptions — the API layer maps these to HTTP status codes.
class ReviewError(Exception):
    """Base for review-service errors."""


class ReviewNotEligible(ReviewError):
    """Artifact kind is not review-eligible (422)."""


class ReviewAlreadyPending(ReviewError):
    """An open pending review already exists for this artifact (409)."""


class InvalidReviewDecision(ReviewError):
    """Unknown decision verb (422)."""


class InvalidReviewTransition(ReviewError):
    """Review is already decided; cannot decide again (409)."""


class ReviewerIsAuthor(ReviewError):
    """Reviewer is the author/requester and is not a superuser (403)."""


class NoteRequired(ReviewError):
    """Reject / request-changes / override require a note (422)."""


def compute_artifact_hash(storage_path: str) -> str:
    """sha256 (hex) of the artifact payload bytes.

    Pins exactly what the reviewer decided on; approval would otherwise
    drift if the underlying output were rewritten. Reads via the
    object-storage loader (LMF-1); raises ``ArtifactBytesUnavailable``
    for legacy local-fs / missing-object artifacts.
    """
    return hashlib.sha256(load_artifact_bytes(storage_path)).hexdigest()


async def request_review(
    session: AsyncSession,
    *,
    matter: Matter,
    artifact: MatterArtifact,
    user: User,
) -> MatterReview:
    """Open a pending review over ``artifact``. Caller commits."""
    if artifact.kind not in REVIEW_ELIGIBLE_KINDS:
        raise ReviewNotEligible(
            f"artifact kind '{artifact.kind}' is not review-eligible"
        )

    existing = await session.scalar(
        select(MatterReview).where(
            MatterReview.artifact_id == artifact.id,
            MatterReview.state == REVIEW_PENDING,
        )
    )
    if existing is not None:
        raise ReviewAlreadyPending(
            f"a pending review already exists for artifact {artifact.id}"
        )

    artifact_hash = compute_artifact_hash(artifact.storage_path)
    review = MatterReview(
        matter_id=matter.id,
        artifact_id=artifact.id,
        invocation_id=artifact.invocation_id,
        module_id=artifact.module_id,
        capability_id=artifact.capability_id,
        kind=artifact.kind,
        artifact_hash=artifact_hash,
        state=REVIEW_PENDING,
        requested_by_id=user.id,
        requested_at=datetime.now(UTC),
    )
    session.add(review)
    await session.flush()

    await audit.log(
        session,
        REVIEW_ACTION_REQUESTED,
        actor_id=user.id,
        matter_id=matter.id,
        module=artifact.module_id,
        resource_type="matter_review",
        resource_id=str(review.id),
        payload={
            "review_id": str(review.id),
            "artifact_id": str(artifact.id),
            "invocation_id": str(artifact.invocation_id),
            "artifact_hash": artifact_hash,
            "kind": artifact.kind,
        },
    )
    return review


async def decide_review(
    session: AsyncSession,
    *,
    review: MatterReview,
    user: User,
    decision: str,
    note: str | None = None,
) -> MatterReview:
    """Record one terminal decision on a pending review. Caller commits.

    Enforces: pending-only transition, reviewer != author/requester
    (superuser may override, recorded), note required for reject /
    request-changes / override.
    """
    if decision not in _DECISION_MAP:
        raise InvalidReviewDecision(f"unknown decision '{decision}'")
    if review.state != REVIEW_PENDING:
        raise InvalidReviewTransition(
            f"review {review.id} is already {review.state}"
        )

    target_state, action, note_required = _DECISION_MAP[decision]
    clean_note = (note or "").strip()
    if note_required and not clean_note:
        raise NoteRequired(f"decision '{decision}' requires a note")

    # Reviewer != author/requester. The author is the artifact producer;
    # the requester is whoever sent it for review. A superuser may
    # override the separation, but we record that they did.
    artifact = await session.get(MatterArtifact, review.artifact_id)
    author_ids = {review.requested_by_id}
    if artifact is not None:
        author_ids.add(artifact.created_by_id)
    is_author = user.id in author_ids
    self_review_override = False
    if is_author:
        if not user.is_superuser:
            raise ReviewerIsAuthor(
                "reviewer must differ from the author/requester"
            )
        self_review_override = True

    review.state = target_state
    review.decided_by_id = user.id
    review.decided_at = datetime.now(UTC)
    review.note = clean_note or None
    await session.flush()

    await audit.log(
        session,
        action,
        actor_id=user.id,
        matter_id=review.matter_id,
        module=review.module_id,
        resource_type="matter_review",
        resource_id=str(review.id),
        payload={
            "review_id": str(review.id),
            "artifact_id": str(review.artifact_id),
            "invocation_id": str(review.invocation_id),
            "artifact_hash": review.artifact_hash,
            "kind": review.kind,
            "decision": decision,
            "note": clean_note or None,
            "self_review_superuser_override": self_review_override,
        },
    )
    return review
