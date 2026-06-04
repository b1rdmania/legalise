"""Add document working drafts.

Revision ID: 0029
Revises: 0028
Create Date: 2026-06-04
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision = "0029"
down_revision = "0028"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "document_working_drafts",
        sa.Column("document_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("updated_by_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("plain_text", sa.Text(), nullable=False),
        sa.Column("editor_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("base_version_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("version_counter", sa.Integer(), nullable=False),
        sa.Column("client_id", sa.String(length=96), nullable=True),
        sa.ForeignKeyConstraint(["base_version_id"], ["document_versions.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["document_id"], ["documents.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["updated_by_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("document_id"),
    )
    op.create_index(
        "ix_document_working_drafts_base_version_id",
        "document_working_drafts",
        ["base_version_id"],
    )
    op.create_index(
        "ix_document_working_drafts_updated_by_id",
        "document_working_drafts",
        ["updated_by_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_document_working_drafts_updated_by_id", table_name="document_working_drafts")
    op.drop_index("ix_document_working_drafts_base_version_id", table_name="document_working_drafts")
    op.drop_table("document_working_drafts")
