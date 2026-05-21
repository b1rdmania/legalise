"""Add jobs table for durable pipeline runs.

Revision ID: 0010
Revises: 0009
Create Date: 2026-05-21

Every Pre-Motion and Contract Review pipeline run is stored here.
Redis carries only the job id; Postgres is the source of truth.

Downgrade: drop the jobs table. Any queued/running jobs at the time of
downgrade will lose their state — operators should drain the queue before
downgrading.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID


revision: str = "0010"
down_revision: str | None = "0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "jobs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "matter_id",
            UUID(as_uuid=True),
            sa.ForeignKey("matters.id"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "created_by_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=False,
            index=True,
        ),
        sa.Column("kind", sa.String(64), nullable=False),
        sa.Column("status", sa.String(32), nullable=False, server_default="queued"),
        sa.Column("stage", sa.String(128), nullable=True),
        sa.Column("progress", sa.Integer, nullable=True),
        sa.Column("input_payload", JSONB, nullable=False, server_default="{}"),
        sa.Column("result_payload", JSONB, nullable=True),
        sa.Column("error_code", sa.String(128), nullable=True),
        sa.Column("error_message", sa.String(2048), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_jobs_status", "jobs", ["status"])
    op.create_index("ix_jobs_created_by_id_status", "jobs", ["created_by_id", "status"])


def downgrade() -> None:
    # Drain queue before downgrading — any running jobs will lose state.
    op.drop_index("ix_jobs_created_by_id_status", table_name="jobs")
    op.drop_index("ix_jobs_status", table_name="jobs")
    op.drop_table("jobs")
