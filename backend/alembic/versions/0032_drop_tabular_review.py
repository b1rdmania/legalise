"""Drop tabular review tables.

Revision ID: 0032
Revises: 0031
Create Date: 2026-06-10

The native tabular_review module was removed from the app (skills-as-
plugins cut: the platform ships chat + governance + editor; heavyweight
review pipelines live as installable skills). The tables held only
evaluation data; nothing else references them.
"""

from __future__ import annotations

from alembic import op


revision = "0032"
down_revision = "0031"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("DROP TABLE IF EXISTS tabular_review_rows")
    op.execute("DROP TABLE IF EXISTS tabular_reviews")


def downgrade() -> None:
    raise NotImplementedError(
        "tabular review tables are not recreated; restore from the "
        "pre-0032 schema if needed"
    )
