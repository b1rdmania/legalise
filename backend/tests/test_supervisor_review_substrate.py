"""Supervisor Review v1 (SR-1) — substrate unit tests.

Covers the review service: request_review eligibility + hashing +
review.requested audit; decide_review transitions, reviewer != author
guard (+ superuser override), note-required rules, and the
already-decided 409 path. Each transition must emit the matching
review.* audit row.
"""

from __future__ import annotations

import hashlib
import uuid
from pathlib import Path

import pytest
from sqlalchemy import select

from app.core.matter_artifacts import write_artifact
from app.core.reviews import (
    DECISION_APPROVE,
    DECISION_OVERRIDE,
    DECISION_REJECT,
    DECISION_REQUEST_CHANGES,
    InvalidReviewTransition,
    NoteRequired,
    ReviewAlreadyPending,
    ReviewNotEligible,
    ReviewerIsAuthor,
    decide_review,
    request_review,
)
from app.models import (
    AuditEntry,
    Matter,
    PRIVILEGE_CLEARED,
    REVIEW_APPROVED,
    REVIEW_CHANGES_REQUESTED,
    REVIEW_OVERRIDDEN,
    REVIEW_PENDING,
    REVIEW_REJECTED,
    STATUS_OPEN,
    User,
)


@pytest.fixture(autouse=True)
def _writable_matters_root(tmp_path, monkeypatch):
    """write_artifact materialises payloads under settings.matters_root,
    which defaults to the container path /data/matters (read-only on a
    dev host). Point it at a tmp dir so the artifact write succeeds
    locally and in CI alike."""
    from app.core.config import settings

    monkeypatch.setattr(settings, "matters_root", str(tmp_path), raising=False)


async def _make_user(db_session, *, superuser: bool = False) -> User:
    user = User(
        id=uuid.uuid4(),
        email=f"sr1-{uuid.uuid4().hex[:8]}@example.com",
        hashed_password="x" * 32,
        is_active=True,
        is_verified=True,
        is_superuser=superuser,
        role="solicitor",
    )
    db_session.add(user)
    await db_session.flush()
    return user


async def _make_matter(db_session, user) -> Matter:
    matter = Matter(
        id=uuid.uuid4(),
        slug=f"sr1-{uuid.uuid4().hex[:8]}",
        title="SR1 Test",
        matter_type="employment_tribunal",
        status=STATUS_OPEN,
        privilege_posture=PRIVILEGE_CLEARED,
        default_model_id="claude-opus-4-7",
        created_by_id=user.id,
    )
    db_session.add(matter)
    await db_session.flush()
    return matter


async def _make_findings_artifact(db_session, matter, author, *, kind="findings_pack"):
    return await write_artifact(
        db_session,
        matter=matter,
        capability_id="review",
        module_id="examples.contract-review",
        invocation_id=uuid.uuid4(),
        kind=kind,
        payload={"findings": [{"clause": "x", "severity": "high"}]},
        actor_user_id=author.id,
    )


async def _audit_actions(db_session, matter_id) -> list[str]:
    rows = (
        await db_session.scalars(
            select(AuditEntry).where(AuditEntry.matter_id == matter_id)
        )
    ).all()
    return [r.action for r in rows]


@pytest.mark.asyncio
async def test_request_review_creates_pending_and_hashes(db_session) -> None:
    author = await _make_user(db_session)
    matter = await _make_matter(db_session, author)
    artifact = await _make_findings_artifact(db_session, matter, author)

    review = await request_review(
        db_session, matter=matter, artifact=artifact, user=author
    )

    assert review.state == REVIEW_PENDING
    assert review.kind == "findings_pack"
    # Hash pins the on-disk payload.
    expected = hashlib.sha256(Path(artifact.storage_path).read_bytes()).hexdigest()
    assert review.artifact_hash == expected
    assert "review.requested" in await _audit_actions(db_session, matter.id)


@pytest.mark.asyncio
async def test_request_review_rejects_ineligible_kind(db_session) -> None:
    author = await _make_user(db_session)
    matter = await _make_matter(db_session, author)
    artifact = await _make_findings_artifact(
        db_session, matter, author, kind="citation_pack"
    )
    with pytest.raises(ReviewNotEligible):
        await request_review(
            db_session, matter=matter, artifact=artifact, user=author
        )


@pytest.mark.asyncio
async def test_request_review_blocks_double_pending(db_session) -> None:
    author = await _make_user(db_session)
    matter = await _make_matter(db_session, author)
    artifact = await _make_findings_artifact(db_session, matter, author)
    await request_review(db_session, matter=matter, artifact=artifact, user=author)
    with pytest.raises(ReviewAlreadyPending):
        await request_review(
            db_session, matter=matter, artifact=artifact, user=author
        )


@pytest.mark.asyncio
async def test_decide_approve_by_other_user(db_session) -> None:
    author = await _make_user(db_session)
    reviewer = await _make_user(db_session)
    matter = await _make_matter(db_session, author)
    artifact = await _make_findings_artifact(db_session, matter, author)
    review = await request_review(
        db_session, matter=matter, artifact=artifact, user=author
    )

    decided = await decide_review(
        db_session, review=review, user=reviewer, decision=DECISION_APPROVE
    )
    assert decided.state == REVIEW_APPROVED
    assert decided.decided_by_id == reviewer.id
    assert "review.approved" in await _audit_actions(db_session, matter.id)


@pytest.mark.asyncio
async def test_decide_blocks_author_self_review(db_session) -> None:
    author = await _make_user(db_session)
    matter = await _make_matter(db_session, author)
    artifact = await _make_findings_artifact(db_session, matter, author)
    review = await request_review(
        db_session, matter=matter, artifact=artifact, user=author
    )
    with pytest.raises(ReviewerIsAuthor):
        await decide_review(
            db_session, review=review, user=author, decision=DECISION_APPROVE
        )


@pytest.mark.asyncio
async def test_superuser_self_review_override_recorded(db_session) -> None:
    su = await _make_user(db_session, superuser=True)
    matter = await _make_matter(db_session, su)
    artifact = await _make_findings_artifact(db_session, matter, su)
    review = await request_review(
        db_session, matter=matter, artifact=artifact, user=su
    )
    decided = await decide_review(
        db_session,
        review=review,
        user=su,
        decision=DECISION_APPROVE,
    )
    assert decided.state == REVIEW_APPROVED
    row = await db_session.scalar(
        select(AuditEntry).where(
            AuditEntry.matter_id == matter.id,
            AuditEntry.action == "review.approved",
        )
    )
    assert row is not None
    assert row.payload.get("self_review_superuser_override") is True


@pytest.mark.asyncio
async def test_cannot_decide_twice(db_session) -> None:
    author = await _make_user(db_session)
    reviewer = await _make_user(db_session)
    matter = await _make_matter(db_session, author)
    artifact = await _make_findings_artifact(db_session, matter, author)
    review = await request_review(
        db_session, matter=matter, artifact=artifact, user=author
    )
    await decide_review(
        db_session, review=review, user=reviewer, decision=DECISION_APPROVE
    )
    with pytest.raises(InvalidReviewTransition):
        await decide_review(
            db_session, review=review, user=reviewer, decision=DECISION_REJECT,
            note="too late",
        )


@pytest.mark.asyncio
async def test_reject_requires_note(db_session) -> None:
    author = await _make_user(db_session)
    reviewer = await _make_user(db_session)
    matter = await _make_matter(db_session, author)
    artifact = await _make_findings_artifact(db_session, matter, author)
    review = await request_review(
        db_session, matter=matter, artifact=artifact, user=author
    )
    with pytest.raises(NoteRequired):
        await decide_review(
            db_session, review=review, user=reviewer, decision=DECISION_REJECT
        )


@pytest.mark.asyncio
async def test_request_changes_and_override_states(db_session) -> None:
    # request_changes
    author = await _make_user(db_session)
    reviewer = await _make_user(db_session)
    matter = await _make_matter(db_session, author)
    art1 = await _make_findings_artifact(db_session, matter, author)
    r1 = await request_review(db_session, matter=matter, artifact=art1, user=author)
    d1 = await decide_review(
        db_session, review=r1, user=reviewer,
        decision=DECISION_REQUEST_CHANGES, note="tighten clause 4",
    )
    assert d1.state == REVIEW_CHANGES_REQUESTED

    # override (different artifact → new review)
    art2 = await _make_findings_artifact(db_session, matter, author)
    r2 = await request_review(db_session, matter=matter, artifact=art2, user=author)
    d2 = await decide_review(
        db_session, review=r2, user=reviewer,
        decision=DECISION_OVERRIDE, note="accept despite flagged risk",
    )
    assert d2.state == REVIEW_OVERRIDDEN
    actions = await _audit_actions(db_session, matter.id)
    assert "review.changes_requested" in actions
    assert "review.overridden" in actions
