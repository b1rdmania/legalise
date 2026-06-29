"""Audited retrieval (P3) — document index status columns.

Revision ID: 0037
Revises: 0036
Create Date: 2026-06-29

WHAT THIS MIGRATION DOES
------------------------
Adds per-document indexing status to ``documents`` so the UI and the
assistant can be honest about what is searchable yet (see
docs/RETRIEVAL_DESIGN.md — "Indexing: async on upload").

- ``index_status``  VARCHAR(16) NOT NULL DEFAULT 'pending'
                    — one of pending|indexed|failed|empty.
- ``indexed_at``    TIMESTAMPTZ NULL — when the document was last indexed.

DOWNGRADE
---------
Drops both columns.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "0037"
down_revision = "0036"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "documents",
        sa.Column(
            "index_status",
            sa.String(length=16),
            nullable=False,
            server_default="pending",
        ),
    )
    op.add_column(
        "documents",
        sa.Column(
            "indexed_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("documents", "indexed_at")
    op.drop_column("documents", "index_status")
