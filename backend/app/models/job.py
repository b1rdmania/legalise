"""Job model — durable record of a long-running module pipeline run.

Every Pre-Motion and Contract Review run that the worker processes has a
row here. The row is the source of truth; Redis only carries the job id.

Status lifecycle: queued → running → succeeded | failed | cancelled
Stage / progress track sub-pipeline progress for the SSE status transport.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


# Status constants
JOB_STATUS_QUEUED = "queued"
JOB_STATUS_RUNNING = "running"
JOB_STATUS_SUCCEEDED = "succeeded"
JOB_STATUS_FAILED = "failed"
JOB_STATUS_CANCELLED = "cancelled"

JOB_STATUS_VALUES = {
    JOB_STATUS_QUEUED,
    JOB_STATUS_RUNNING,
    JOB_STATUS_SUCCEEDED,
    JOB_STATUS_FAILED,
    JOB_STATUS_CANCELLED,
}

JOB_ACTIVE_STATUSES = {JOB_STATUS_QUEUED, JOB_STATUS_RUNNING}

# Kind constants
JOB_KIND_PRE_MOTION = "pre_motion"
JOB_KIND_CONTRACT_REVIEW = "contract_review"
JOB_KIND_EXPORT = "export"

# Per-user active-job ceiling is canonical at `app.core.limits.get_limits().active_jobs`
# (env-overridable via `LEGALISE_LIMIT_ACTIVE_JOBS`). The hard-coded constant
# that used to live here was a second source of truth that diverged from the
# reporting endpoint when the env var was set — see
# HANDOVER_SUBSTRATE_R2_REVIEW.md §Issue 2.


class Job(Base):
    __tablename__ = "jobs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    matter_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("matters.id"), nullable=False, index=True
    )
    created_by_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True
    )

    kind: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(
        String(32), nullable=False, default=JOB_STATUS_QUEUED, index=True
    )
    stage: Mapped[str | None] = mapped_column(String(128), nullable=True)
    progress: Mapped[int | None] = mapped_column(Integer, nullable=True)

    input_payload: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    result_payload: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    error_code: Mapped[str | None] = mapped_column(String(128), nullable=True)
    error_message: Mapped[str | None] = mapped_column(String(2048), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.utcnow(),
    )
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    def __repr__(self) -> str:
        return f"<Job {self.id} kind={self.kind} status={self.status}>"
