"""Professional Sign-Off v1 — service layer.

The author sign-off gate: a solicitor records that they reviewed an
AI-prepared work product and stand behind it (``signed``), stand behind it
with noted points (``signed_with_observations``), or do not
(``rejected``). By default the signer may be the artifact author — this is
the sole-practitioner / small-firm hero loop, not supervisor review. No
qualified-solicitor role wall: every signed-in user signs as themselves.
Deployments that need four-eyes set ``SIGNOFF_AUTHOR_MUST_DIFFER``, which
blocks self-*signing* only (self-rejection is always permitted).

Each sign-off emits an ``output.*`` audit row in the caller's session so
it commits with the row and surfaces in matter reconstruction (the
Activity Trail) as a first-class decision event.

The signed ``artifact_hash`` is the sha256 of canonical JSON
``{artifact_id, kind, payload}`` — it pins the exact output payload the
signer saw, so the signature cannot silently come to mean something else.
"""

from __future__ import annotations

import hashlib
import json
import uuid
from datetime import datetime, UTC

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.api import audit
from app.core.config import settings
from app.core.matter_artifacts import load_artifact_bytes
from app.models import (
    AuditEntry,
    MatterArtifact,
    MatterSignoff,
    SIGNOFF_DECISIONS,
    SIGNOFF_REASONING_REQUIRED,
    SIGNOFF_REJECTED,
    SIGNOFF_SIGNED,
    SIGNOFF_SIGNED_WITH_OBSERVATIONS,
)
from app.models.matter import Matter
from app.models.user import User


# Audit action vocabulary (dotted; rides the existing reconstruction
# ``audit`` source — no new source). These read as decision events in
# the Activity Trail, not background rows.
SIGNOFF_ACTION_BY_DECISION: dict[str, str] = {
    SIGNOFF_SIGNED: "output.signed",
    SIGNOFF_SIGNED_WITH_OBSERVATIONS: "output.signed_with_observations",
    SIGNOFF_REJECTED: "output.sign_rejected",
}

# First open of an artifact's sign surface by a signer. Idempotent per
# (signer, artifact): first open wins, repeat opens write nothing. The
# review window = this row's timestamp → the sign-off decision's
# ``signed_at``; latency is derived from the two at read time
# (docs/spec/SUPERVISION_LEGIBILITY_M13.md). No new tables.
REVIEW_OPENED_ACTION = "output.review.opened"


# Implausible-speed threshold (docs/spec/SUPERVISION_LEGIBILITY_M13.md,
# closing diligence gates G-A3/G-A4). The economics analysis baselines
# real review at ~10 minutes per 1,000 words. A sign-off faster than ONE
# QUARTER of that baseline is flagged ``implausible_speed`` — generous
# to skim-and-reject, suspicious of skim-and-sign. The 120s floor stops
# tiny outputs from making any signature speed "plausible". Recorded,
# not blocked: the register testifies; it does not nanny.
IMPLAUSIBLE_SPEED_FLOOR_SECONDS = 120
IMPLAUSIBLE_SPEED_SECONDS_PER_WORD = (10 * 60 / 1000) * 0.25  # 0.15 s/word


def implausible_speed_threshold_seconds(word_count: int) -> float:
    """Seconds below which a review of ``word_count`` words is implausible."""
    return max(
        IMPLAUSIBLE_SPEED_FLOOR_SECONDS,
        word_count * IMPLAUSIBLE_SPEED_SECONDS_PER_WORD,
    )


def count_payload_words(payload: object) -> int:
    """Whitespace-delimited word count across every string in ``payload``.

    Walks the artifact payload JSON and counts words in string values
    only — keys, numbers and structure don't cost review time. This is
    an estimate feeding a generous threshold, not a billing meter.
    """
    if isinstance(payload, str):
        return len(payload.split())
    if isinstance(payload, dict):
        return sum(count_payload_words(v) for v in payload.values())
    if isinstance(payload, (list, tuple)):
        return sum(count_payload_words(v) for v in payload)
    return 0


async def record_review_opened(
    session: AsyncSession,
    *,
    matter: Matter,
    artifact: MatterArtifact,
    user: User,
) -> bool:
    """Record the first open of ``artifact``'s sign surface by ``user``.

    Idempotent per signer+artifact: if an ``output.review.opened`` row
    already exists for this (actor, artifact), nothing is written and
    False is returned. Caller commits.
    """
    existing = await session.scalar(
        select(AuditEntry.id)
        .where(
            AuditEntry.action == REVIEW_OPENED_ACTION,
            AuditEntry.actor_id == user.id,
            AuditEntry.resource_type == "matter_artifact",
            AuditEntry.resource_id == str(artifact.id),
        )
        .limit(1)
    )
    if existing is not None:
        return False
    await audit.log(
        session,
        REVIEW_OPENED_ACTION,
        actor_id=user.id,
        matter_id=matter.id,
        module=artifact.module_id,
        resource_type="matter_artifact",
        resource_id=str(artifact.id),
        payload={
            "artifact_id": str(artifact.id),
            "invocation_id": str(artifact.invocation_id),
            "kind": artifact.kind,
        },
    )
    return True


async def review_opened_at_map(
    session: AsyncSession,
    *,
    pairs: set[tuple[uuid.UUID, uuid.UUID]],
) -> dict[tuple[uuid.UUID, uuid.UUID], datetime]:
    """Earliest ``output.review.opened`` timestamp per (signer, artifact).

    Takes MIN(timestamp) so a duplicate row (e.g. a lost race on the
    idempotency check) can never shorten the review window.
    """
    if not pairs:
        return {}
    artifact_ids = {str(a) for _, a in pairs}
    rows = await session.execute(
        select(
            AuditEntry.actor_id,
            AuditEntry.resource_id,
            func.min(AuditEntry.timestamp),
        )
        .where(
            AuditEntry.action == REVIEW_OPENED_ACTION,
            AuditEntry.resource_type == "matter_artifact",
            AuditEntry.resource_id.in_(artifact_ids),
        )
        .group_by(AuditEntry.actor_id, AuditEntry.resource_id)
    )
    out: dict[tuple[uuid.UUID, uuid.UUID], datetime] = {}
    for actor_id, resource_id, opened_at in rows.all():
        if actor_id is None:
            continue
        key = (actor_id, uuid.UUID(resource_id))
        if key in pairs:
            out[key] = opened_at
    return out


def review_latency_seconds(
    opened_at: datetime | None, signed_at: datetime | None
) -> int | None:
    """Review latency in whole seconds, or None when underivable.

    A missing open-event (legacy sign-offs) yields None — the surfaces
    render "—", never 0. A negative delta (clock skew, backfilled rows)
    also yields None rather than lying with a 0.
    """
    if opened_at is None or signed_at is None:
        return None
    delta = (signed_at - opened_at).total_seconds()
    if delta < 0:
        return None
    return int(delta)


class SignoffError(Exception):
    """Base for sign-off service errors."""


class InvalidSignoffDecision(SignoffError):
    """Unknown decision verb (422)."""


class ReasoningRequired(SignoffError):
    """signed_with_observations / rejected require reasoning (422)."""


class AuthorCannotSign(SignoffError):
    """SIGNOFF_AUTHOR_MUST_DIFFER is on and the signer authored the
    artifact (403). Rejection of one's own work is always allowed."""


def compute_signoff_hash(artifact: MatterArtifact) -> str:
    """sha256 (hex) of canonical JSON ``{artifact_id, kind, payload}``.

    Hashes the artifact *payload* (the output content), not rendered HTML
    or mutable display metadata — "this exact output payload was signed".
    Reads the payload via the object-storage loader; raises
    ``ArtifactBytesUnavailable`` for legacy/missing objects.
    """
    payload = json.loads(load_artifact_bytes(artifact.storage_path))
    return _canonical_payload_hash(artifact, payload)


def _canonical_payload_hash(artifact: MatterArtifact, payload: object) -> str:
    canonical = json.dumps(
        {"artifact_id": str(artifact.id), "kind": artifact.kind, "payload": payload},
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


async def create_signoff(
    session: AsyncSession,
    *,
    matter: Matter,
    artifact: MatterArtifact,
    user: User,
    decision: str,
    reasoning: str | None = None,
) -> MatterSignoff:
    """Record one author sign-off over ``artifact``. Caller commits.

    Append-only: never mutates a prior sign-off. By default any signed-in
    user may sign (author included) — the sole-practitioner hero loop. The
    record states the relationship instead of hiding it: ``signer_is_author``
    is computed against the artifact's ``created_by_id`` and written
    into the audit payload, so a self-signed output reads as exactly
    that in the Activity Trail and any export.

    When ``settings.signoff_author_must_differ`` is on (deployable
    four-eyes), the author may not *sign* their own output
    (``AuthorCannotSign``, 403) — rejecting it stays allowed, because
    refusal is always permitted.
    """
    if decision not in SIGNOFF_DECISIONS:
        raise InvalidSignoffDecision(f"unknown decision '{decision}'")

    clean_reasoning = (reasoning or "").strip()
    if decision in SIGNOFF_REASONING_REQUIRED and not clean_reasoning:
        raise ReasoningRequired(f"decision '{decision}' requires reasoning")

    signer_is_author = artifact.created_by_id == user.id
    if (
        settings.signoff_author_must_differ
        and signer_is_author
        and decision in (SIGNOFF_SIGNED, SIGNOFF_SIGNED_WITH_OBSERVATIONS)
    ):
        raise AuthorCannotSign(
            "This workspace requires a second pair of eyes: you prepared "
            "this output, so someone else must sign it. You can still "
            "reject your own draft."
        )

    payload = json.loads(load_artifact_bytes(artifact.storage_path))
    artifact_hash = _canonical_payload_hash(artifact, payload)

    # Review latency (M13): first open of the sign surface → this
    # decision. Derived from the output.review.opened audit row; a
    # missing open-event (legacy / direct-API sign-offs) yields None and
    # never flags. The implausible-speed flag is recorded on the audit
    # payload, not enforced.
    signed_at = datetime.now(UTC)
    opened = await review_opened_at_map(
        session, pairs={(user.id, artifact.id)}
    )
    review_seconds = review_latency_seconds(
        opened.get((user.id, artifact.id)), signed_at
    )
    implausible_speed = (
        review_seconds is not None
        and review_seconds
        < implausible_speed_threshold_seconds(count_payload_words(payload))
    )

    signoff = MatterSignoff(
        matter_id=matter.id,
        artifact_id=artifact.id,
        invocation_id=artifact.invocation_id,
        module_id=artifact.module_id,
        capability_id=artifact.capability_id,
        kind=artifact.kind,
        artifact_hash=artifact_hash,
        decision=decision,
        reasoning=clean_reasoning or None,
        signer_id=user.id,
        signed_at=signed_at,
    )
    session.add(signoff)
    await session.flush()

    await audit.log(
        session,
        SIGNOFF_ACTION_BY_DECISION[decision],
        actor_id=user.id,
        matter_id=matter.id,
        module=artifact.module_id,
        resource_type="matter_signoff",
        resource_id=str(signoff.id),
        payload={
            "signoff_id": str(signoff.id),
            "artifact_id": str(artifact.id),
            "invocation_id": str(artifact.invocation_id),
            "artifact_hash": artifact_hash,
            "kind": artifact.kind,
            "decision": decision,
            "reasoning": clean_reasoning or None,
            "signer_is_author": signer_is_author,
            "review_seconds": review_seconds,
            "implausible_speed": implausible_speed,
        },
    )
    return signoff


async def list_signoffs(
    session: AsyncSession, *, matter: Matter
) -> list[MatterSignoff]:
    """All sign-offs for a matter, newest first (append-only history)."""
    rows = await session.scalars(
        select(MatterSignoff)
        .where(MatterSignoff.matter_id == matter.id)
        .order_by(MatterSignoff.signed_at.desc(), MatterSignoff.id.desc())
    )
    return list(rows.all())


async def review_annotations(
    session: AsyncSession, signoffs: list[MatterSignoff]
) -> dict[uuid.UUID, tuple[int | None, bool]]:
    """Per-signoff ``(review_seconds, implausible_speed)`` for API reads.

    - ``review_seconds`` is derived at read time from the two audit rows
      (open → decision), per the spec — no stored latency column.
    - ``implausible_speed`` is read back from the decision's own audit
      payload, where it was recorded against the word count at sign
      time. Legacy rows without the key read as False (never accuse
      without evidence).
    """
    if not signoffs:
        return {}
    opened = await review_opened_at_map(
        session, pairs={(s.signer_id, s.artifact_id) for s in signoffs}
    )
    flag_rows = await session.execute(
        select(AuditEntry.resource_id, AuditEntry.payload)
        .where(
            AuditEntry.action.in_(SIGNOFF_ACTION_BY_DECISION.values()),
            AuditEntry.resource_type == "matter_signoff",
            AuditEntry.resource_id.in_({str(s.id) for s in signoffs}),
        )
    )
    flags = {
        resource_id: bool(payload.get("implausible_speed"))
        for resource_id, payload in flag_rows.all()
        if isinstance(payload, dict)
    }
    return {
        s.id: (
            review_latency_seconds(
                opened.get((s.signer_id, s.artifact_id)), s.signed_at
            ),
            flags.get(str(s.id), False),
        )
        for s in signoffs
    }


def current_signoff_ids(signoffs: list[MatterSignoff]) -> set[uuid.UUID]:
    """Ids of the *current* (latest-by-signed_at) sign-off per artifact.

    Input must be ordered newest-first (as ``list_signoffs`` returns), so
    the first sign-off seen for each artifact is its current one.
    """
    seen: set[uuid.UUID] = set()
    current: set[uuid.UUID] = set()
    for s in signoffs:
        if s.artifact_id not in seen:
            seen.add(s.artifact_id)
            current.add(s.id)
    return current
