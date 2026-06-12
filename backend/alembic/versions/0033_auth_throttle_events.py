"""Add auth_throttle_events for per-IP auth rate limiting.

Revision ID: 0033
Revises: 0032
Create Date: 2026-06-12

Postgres-backed sliding window for the unauthenticated auth surface
(register / request-verify-token / forgot-password). Counts are recomputed
from this table on each call — no Redis counter — so the limit holds across
multiple backend instances. See app/core/rate_limit.py.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision = "0033"
down_revision = "0032"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "auth_throttle_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("ip", sa.String(length=64), nullable=False),
        sa.Column("route", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_auth_throttle_events_route_ip_created",
        "auth_throttle_events",
        ["route", "ip", "created_at"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_auth_throttle_events_route_ip_created",
        table_name="auth_throttle_events",
    )
    op.drop_table("auth_throttle_events")
