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

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.api import audit
from app.core.config import settings
from app.core.matter_artifacts import load_artifact_bytes
from app.models import (
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

    artifact_hash = compute_signoff_hash(artifact)
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
        signed_at=datetime.now(UTC),
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
