"""Hosted evaluation limits for legalise.dev.

Copy doctrine:
    Legalise is open source. The hosted site is a limited evaluation environment.

Limits are generous enough that a normal demo user (1 matter, 5 docs, a few
workflow runs per day) never hits them. They exist to prevent viral-signup
abuse of the hosted instance, not to gate functionality behind a paid plan.

Daily windows use calendar-day UTC boundaries. Rolling-24h would be more
accurate but calendar-day is simpler to reason about, matches user
expectations ("I have 100 messages today"), and avoids the edge case where a
burst at 23:59 rolls into the next window 1 minute later. All counts are
recomputed from Postgres on each call — no Redis counter, no cache.

``active_jobs`` is defined here as the canonical constant but enforced inside
``backend/app/core/jobs.py`` (Unit 2). This module does not double-enforce it.
Import it from here if you need the value elsewhere.
"""

from __future__ import annotations

import os
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import TYPE_CHECKING

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

if TYPE_CHECKING:
    pass


# ---------------------------------------------------------------------------
# Canonical limit values
# ---------------------------------------------------------------------------

# Active jobs: owned by Unit 2 (jobs.py). Defined here so it is a single
# source of truth. jobs.py imports and enforces this constant directly.
ACTIVE_JOBS_LIMIT: int = int(os.environ.get("LEGALISE_LIMIT_ACTIVE_JOBS", "3"))


@dataclass
class Limits:
    """Evaluation limits for the hosted legalise.dev instance.

    All values can be overridden via environment variables of the form
    ``LEGALISE_LIMIT_<FIELD_UPPER>``.  The dataclass carries the resolved
    values; call ``get_limits()`` to obtain the singleton.
    """

    matters_per_user: int = field(
        default_factory=lambda: int(os.environ.get("LEGALISE_LIMIT_MATTERS_PER_USER", "5"))
    )
    documents_per_matter: int = field(
        default_factory=lambda: int(os.environ.get("LEGALISE_LIMIT_DOCUMENTS_PER_MATTER", "50"))
    )
    # max_file_bytes re-uses the canonical upload helper via env-override.
    # Do not duplicate the 25 MB literal here — import MAX_UPLOAD_BYTES from
    # app.core.document_uploads at call sites that need the raw value.
    total_storage_bytes_per_user: int = field(
        default_factory=lambda: int(
            os.environ.get("LEGALISE_LIMIT_TOTAL_STORAGE_BYTES_PER_USER", str(500 * 1024 * 1024))
        )
    )
    assistant_messages_per_day: int = field(
        default_factory=lambda: int(
            os.environ.get("LEGALISE_LIMIT_ASSISTANT_MESSAGES_PER_DAY", "100")
        )
    )
    workflow_runs_per_day: int = field(
        default_factory=lambda: int(
            os.environ.get("LEGALISE_LIMIT_WORKFLOW_RUNS_PER_DAY", "50")
        )
    )
    # active_jobs — canonical value is ACTIVE_JOBS_LIMIT above. Unit 2
    # enforces this; we store it here for reference only.
    active_jobs: int = field(
        default_factory=lambda: ACTIVE_JOBS_LIMIT
    )
    generated_artefacts_per_day: int = field(
        default_factory=lambda: int(
            os.environ.get("LEGALISE_LIMIT_GENERATED_ARTEFACTS_PER_DAY", "50")
        )
    )
    # Set to 0 to disable module submissions at launch (the intended default).
    # Set to 1 (or higher) to allow submissions per day per user.
    module_submissions_per_day: int = field(
        default_factory=lambda: int(
            os.environ.get("LEGALISE_LIMIT_MODULE_SUBMISSIONS_PER_DAY", "0")
        )
    )


_limits: Limits | None = None


def get_limits() -> Limits:
    """Return the process-lifetime Limits singleton."""
    global _limits
    if _limits is None:
        _limits = Limits()
    return _limits


# ---------------------------------------------------------------------------
# 429 helper
# ---------------------------------------------------------------------------

def _limit_exceeded(limit_name: str, current: int, maximum: int) -> HTTPException:
    """Build the canonical evaluation_limit_reached 429."""
    return HTTPException(
        status_code=429,
        detail={
            "error": "evaluation_limit_reached",
            "limit": limit_name,
            "current": current,
            "max": maximum,
            "message": (
                "Hosted evaluation limit reached. "
                "Legalise is open source; self-hosting removes hosted limits."
            ),
        },
    )


# ---------------------------------------------------------------------------
# UTC calendar-day window helpers
# ---------------------------------------------------------------------------

def _today_utc_start() -> datetime:
    """Return the start of today (UTC) as a timezone-aware datetime."""
    now = datetime.now(timezone.utc)
    return now.replace(hour=0, minute=0, second=0, microsecond=0)


# ---------------------------------------------------------------------------
# Check helpers
# ---------------------------------------------------------------------------

async def check_matter_create(user_id: uuid.UUID, session: AsyncSession) -> None:
    """Raise 429 if the user has reached the matters-per-user limit.

    Called before the matter row is inserted — the count reflects the
    current committed state, so the imminent insert is not yet counted.
    """
    from app.models.matter import Matter

    lim = get_limits()
    count = await session.scalar(
        select(func.count(Matter.id)).where(Matter.created_by_id == user_id)
    )
    current = count or 0
    if current >= lim.matters_per_user:
        raise _limit_exceeded("matters_per_user", current, lim.matters_per_user)


async def check_document_upload(
    user_id: uuid.UUID,
    matter_id: uuid.UUID,
    content_length: int,
    session: AsyncSession,
) -> None:
    """Raise 429 if uploading this document would breach any document or
    storage limit.

    This is called *after* the 413 size-cap check in the upload route so
    that oversized bodies still produce 413 (not 429).  Two checks run:
    1. documents_per_matter for this matter.
    2. total_storage_bytes_per_user across all matters.
    """
    from app.models.document import Document
    from app.models.matter import Matter

    lim = get_limits()

    # Per-matter document count.
    doc_count = await session.scalar(
        select(func.count(Document.id)).where(Document.matter_id == matter_id)
    )
    current_docs = doc_count or 0
    if current_docs >= lim.documents_per_matter:
        raise _limit_exceeded("documents_per_matter", current_docs, lim.documents_per_matter)

    # Total storage across all user matters.
    storage_used = await session.scalar(
        select(func.coalesce(func.sum(Document.size_bytes), 0)).join(
            Matter, Document.matter_id == Matter.id
        ).where(Matter.created_by_id == user_id)
    )
    used = int(storage_used or 0)
    if used + content_length > lim.total_storage_bytes_per_user:
        raise _limit_exceeded(
            "total_storage_bytes_per_user",
            used,
            lim.total_storage_bytes_per_user,
        )


async def check_assistant_message(user_id: uuid.UUID, session: AsyncSession) -> None:
    """Raise 429 if the user has sent ≥ assistant_messages_per_day today (UTC).

    Counts user-role assistant_messages rows with created_at on today's
    calendar day (UTC).  The user row is written inside run_assistant_turn
    before the model call; this check runs before that write, so the count
    reflects the number of completed turns rather than the one in flight.
    """
    from app.models.assistant import AssistantMessage, ROLE_USER

    lim = get_limits()
    today_start = _today_utc_start()

    count = await session.scalar(
        select(func.count(AssistantMessage.id)).where(
            AssistantMessage.actor_id == user_id,
            AssistantMessage.role == ROLE_USER,
            AssistantMessage.created_at >= today_start,
        )
    )
    current = count or 0
    if current >= lim.assistant_messages_per_day:
        raise _limit_exceeded(
            "assistant_messages_per_day", current, lim.assistant_messages_per_day
        )


async def check_workflow_run(user_id: uuid.UUID, session: AsyncSession) -> None:
    """Raise 429 if the user has queued or completed ≥ workflow_runs_per_day
    workflow jobs today (UTC).

    Counts Pre-Motion and Contract Review jobs created today by this user.
    Export jobs are NOT workflow runs — they're data-portability operations
    that should not consume the user's run budget (reviewer call per
    HANDOVER_SUBSTRATE_REVIEW_FIXES.md §2 P2).

    Active-job cap (ACTIVE_JOB_LIMIT) and the daily workflow-run cap are
    layered: the active cap prevents fan-out within a moment; this cap
    prevents fan-out across the day.
    """
    from app.models.job import (
        JOB_KIND_CONTRACT_REVIEW,
        JOB_KIND_PRE_MOTION,
        Job,
    )

    lim = get_limits()
    today_start = _today_utc_start()

    count = await session.scalar(
        select(func.count(Job.id)).where(
            Job.created_by_id == user_id,
            Job.kind.in_({JOB_KIND_PRE_MOTION, JOB_KIND_CONTRACT_REVIEW}),
            Job.created_at >= today_start,
        )
    )
    current = count or 0
    if current >= lim.workflow_runs_per_day:
        raise _limit_exceeded(
            "workflow_runs_per_day", current, lim.workflow_runs_per_day
        )


async def check_generated_artefact(user_id: uuid.UUID, session: AsyncSession) -> None:
    """Raise 429 if the user has generated ≥ generated_artefacts_per_day today (UTC).

    Counts ``module.*.docx.exported`` and ``module.*.pdf.exported`` audit rows
    for the user today.  AuditEntry.action is the discriminator:
    ``module.pre_motion.pdf.exported``, ``module.pre_motion.docx.exported``,
    ``module.contract_review.docx.exported``, ``module.letters.docx.exported``.

    Using the audit log avoids introducing a separate artefacts table before
    Unit 1 storage is fully wired.
    """
    from app.models.audit import AuditEntry

    lim = get_limits()
    today_start = _today_utc_start()

    count = await session.scalar(
        select(func.count(AuditEntry.id)).where(
            AuditEntry.actor_id == user_id,
            AuditEntry.action.like("module.%.exported"),
            AuditEntry.timestamp >= today_start,
        )
    )
    current = count or 0
    if current >= lim.generated_artefacts_per_day:
        raise _limit_exceeded(
            "generated_artefacts_per_day", current, lim.generated_artefacts_per_day
        )


async def check_module_submission(user_id: uuid.UUID | None, session: AsyncSession) -> None:
    """Raise 429 if the limit is 0 (disabled) or if the user has hit the
    per-day submission cap.

    Module submissions are unauthenticated — user_id may be None.  When
    user_id is None and the limit is > 0, this check is skipped (the IP
    rate-limit in submissions.py still applies).  When the limit is 0, all
    submissions are blocked regardless of auth state.
    """
    from app.models.audit import AuditEntry

    lim = get_limits()
    if lim.module_submissions_per_day == 0:
        raise _limit_exceeded("module_submissions_per_day", 0, 0)

    if user_id is None:
        # Unauthenticated — IP rate-limit in submissions.py is the guard.
        return

    today_start = _today_utc_start()
    count = await session.scalar(
        select(func.count(AuditEntry.id)).where(
            AuditEntry.actor_id == user_id,
            AuditEntry.action == "module.module.submission.opened",
            AuditEntry.timestamp >= today_start,
        )
    )
    current = count or 0
    if current >= lim.module_submissions_per_day:
        raise _limit_exceeded(
            "module_submissions_per_day", current, lim.module_submissions_per_day
        )
