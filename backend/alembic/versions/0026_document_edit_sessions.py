"""Add document edit sessions.

Revision ID: 0026
Revises: 0025
Create Date: 2026-06-03
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision = "0026"
down_revision = "0025"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "document_edit_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("document_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("client_id", sa.String(length=96), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["document_id"], ["documents.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_document_edit_sessions_document_id",
        "document_edit_sessions",
        ["document_id"],
    )
    op.create_index(
        "ix_document_edit_sessions_user_id",
        "document_edit_sessions",
        ["user_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_document_edit_sessions_user_id", table_name="document_edit_sessions")
    op.drop_index("ix_document_edit_sessions_document_id", table_name="document_edit_sessions")
    op.drop_table("document_edit_sessions")

