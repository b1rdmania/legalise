"""Usage endpoint — GET /api/me/usage.

Returns current usage counts vs evaluation limits for the authenticated user.
All counts are queried from Postgres in the same session.  Daily counts use
UTC calendar-day windows (see limits.py docstring for the rationale).

The response shape is designed to be safe to display in the UI: no raw query
plans, no internal user IDs, no matter slugs.
"""

from __future__ import annotations


from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import current_user
from app.core.db import get_session
from app.core.limits import _today_utc_start, get_limits
from app.models import User

router = APIRouter()


class LimitEntry(BaseModel):
    current: int
    max: int
    period: str  # "total" | "day"


class UsageResponse(BaseModel):
    matters: LimitEntry
    documents_per_matter: LimitEntry  # across all matters — max per matter
    total_storage_bytes: LimitEntry
    assistant_messages_today: LimitEntry
    generated_artefacts_today: LimitEntry
    module_submissions_today: LimitEntry
    workflow_runs_today: LimitEntry  # Pre-Motion + Contract Review jobs
    active_jobs: LimitEntry  # queued + running, point-in-time


async def _get_usage(user: User, session: AsyncSession) -> UsageResponse:
    from app.models.assistant import AssistantMessage, ROLE_USER
    from app.models.audit import AuditEntry
    from app.models.document import Document
    from app.models.matter import Matter

    lim = get_limits()
    today_start = _today_utc_start()

    # --- matter count ---
    matter_count = await session.scalar(
        select(func.count(Matter.id)).where(Matter.created_by_id == user.id)
    )

    # --- documents per matter (max across all matters) ---
    # Returns None when the user has no documents; default to 0.
    doc_max_subq = (
        select(func.count(Document.id).label("doc_count"))
        .join(Matter, Document.matter_id == Matter.id)
        .where(Matter.created_by_id == user.id)
        .group_by(Document.matter_id)
        .subquery()
    )
    doc_max = await session.scalar(select(func.coalesce(func.max(doc_max_subq.c.doc_count), 0)))

    # --- total storage ---
    storage_used = await session.scalar(
        select(func.coalesce(func.sum(Document.size_bytes), 0))
        .join(Matter, Document.matter_id == Matter.id)
        .where(Matter.created_by_id == user.id)
    )

    # --- assistant messages today ---
    assistant_today = await session.scalar(
        select(func.count(AssistantMessage.id)).where(
            AssistantMessage.actor_id == user.id,
            AssistantMessage.role == ROLE_USER,
            AssistantMessage.created_at >= today_start,
        )
    )

    # --- generated artefacts today ---
    artefacts_today = await session.scalar(
        select(func.count(AuditEntry.id)).where(
            AuditEntry.actor_id == user.id,
            AuditEntry.action.like("module.%.exported"),
            AuditEntry.timestamp >= today_start,
        )
    )

    # --- module submissions today ---
    submissions_today = await session.scalar(
        select(func.count(AuditEntry.id)).where(
            AuditEntry.actor_id == user.id,
            AuditEntry.action == "module.module.submission.opened",
            AuditEntry.timestamp >= today_start,
        )
    )

    # --- workflow runs today (job kinds other than export) ---
    from app.models.job import (
        JOB_ACTIVE_STATUSES,
        JOB_KIND_EXPORT,
        Job,
    )

    workflow_runs_today = await session.scalar(
        select(func.count(Job.id)).where(
            Job.created_by_id == user.id,
            Job.kind != JOB_KIND_EXPORT,
            Job.created_at >= today_start,
        )
    )

    # --- active jobs (point-in-time queued + running) ---
    active_jobs = await session.scalar(
        select(func.count(Job.id)).where(
            Job.created_by_id == user.id,
            Job.status.in_(JOB_ACTIVE_STATUSES),
        )
    )

    return UsageResponse(
        matters=LimitEntry(
            current=int(matter_count or 0),
            max=lim.matters_per_user,
            period="total",
        ),
        documents_per_matter=LimitEntry(
            current=int(doc_max or 0),
            max=lim.documents_per_matter,
            period="total",
        ),
        total_storage_bytes=LimitEntry(
            current=int(storage_used or 0),
            max=lim.total_storage_bytes_per_user,
            period="total",
        ),
        assistant_messages_today=LimitEntry(
            current=int(assistant_today or 0),
            max=lim.assistant_messages_per_day,
            period="day",
        ),
        generated_artefacts_today=LimitEntry(
            current=int(artefacts_today or 0),
            max=lim.generated_artefacts_per_day,
            period="day",
        ),
        module_submissions_today=LimitEntry(
            current=int(submissions_today or 0),
            max=lim.module_submissions_per_day,
            period="day",
        ),
        workflow_runs_today=LimitEntry(
            current=int(workflow_runs_today or 0),
            max=lim.workflow_runs_per_day,
            period="day",
        ),
        active_jobs=LimitEntry(
            current=int(active_jobs or 0),
            max=lim.active_jobs,
            period="total",
        ),
    )


@router.get("/me/usage", response_model=UsageResponse)
async def get_usage(
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> UsageResponse:
    """Return current usage counts vs evaluation limits.

    All counts are computed from Postgres in the request session.  Auth
    required — unauthenticated callers get 401 from the ``current_user``
    dependency before this handler is reached.
    """
    return await _get_usage(user, session)
