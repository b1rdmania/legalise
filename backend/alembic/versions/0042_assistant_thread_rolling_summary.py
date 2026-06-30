"""Assistant thread rolling summary — conversation memory beyond the window.

Revision ID: 0042
Revises: 0041
Create Date: 2026-06-30

WHAT THIS MIGRATION DOES
------------------------
Adds rolling-summary conversation memory to ``assistant_threads``. Today a
thread keeps only its most recent ``_HISTORY_MESSAGE_LIMIT`` turns in context;
older turns are dropped silently. These columns let the pipeline fold the
turns that fall out of the window into a refreshable summary instead.

- ``rolling_summary``     TEXT NULL        — model-written précis of the
                                             turns that have aged out of the
                                             recent window. Null until the
                                             thread first overflows it.
- ``summary_updated_at``  TIMESTAMPTZ NULL — when the summary was last
                                             refreshed.

Both nullable — existing threads keep working unchanged (no summary, current
drop-oldest behaviour) until they next overflow the window.

DOWNGRADE
---------
Drops both columns.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "0042"
down_revision = "0041"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "assistant_threads",
        sa.Column("rolling_summary", sa.Text(), nullable=True),
    )
    op.add_column(
        "assistant_threads",
        sa.Column(
            "summary_updated_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("assistant_threads", "summary_updated_at")
    op.drop_column("assistant_threads", "rolling_summary")
