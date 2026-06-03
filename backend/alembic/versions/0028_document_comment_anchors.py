"""Add source anchors to document comments.

Revision ID: 0028
Revises: 0027
Create Date: 2026-06-03
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0028"
down_revision = "0027"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("document_comments", sa.Column("body_sha256", sa.String(length=64), nullable=True))
    op.add_column("document_comments", sa.Column("anchor_start", sa.Integer(), nullable=True))
    op.add_column("document_comments", sa.Column("anchor_end", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("document_comments", "anchor_end")
    op.drop_column("document_comments", "anchor_start")
    op.drop_column("document_comments", "body_sha256")
