"""Chronology auto-build (P4) — event review status column.

Revision ID: 0039
Revises: 0038
Create Date: 2026-06-29

WHAT THIS MIGRATION DOES
------------------------
Adds a review-lifecycle status to ``events`` so the chronology can be
auto-built as *proposed* rows the solicitor then accepts or rejects,
without changing the meaning of events created before this migration.

- ``status``  VARCHAR(16) NOT NULL DEFAULT 'accepted'
              — one of proposed|accepted|rejected. Existing rows (seeded /
              manually-created) become 'accepted' so the current read
              surface is unchanged; the auto-build path writes 'proposed'.

The source-document reference and CPR 31.22 taint reuse the existing
``events.source_doc_ids`` array (a document with ``from_disclosure=True``
in that array makes the row disclosure-tainted) — no new column is needed.

DOWNGRADE
---------
Drops the column.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "0039"
down_revision = "0038"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "events",
        sa.Column(
            "status",
            sa.String(length=16),
            nullable=False,
            server_default="accepted",
        ),
    )


def downgrade() -> None:
    op.drop_column("events", "status")
