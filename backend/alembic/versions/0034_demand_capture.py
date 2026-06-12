"""Gate 4 demand capture columns on users.

Revision ID: 0034
Revises: 0033
Create Date: 2026-06-12

Launch instrumentation: optional self-reported persona + signup channel
tag, and the server-derived email domain + class (firm-like vs generic
mail provider). All nullable — pre-instrumentation rows read as
"unknown" in the launch funnel. See app/core/demand_capture.py.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "0034"
down_revision = "0033"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("persona", sa.String(32), nullable=True))
    op.add_column("users", sa.Column("signup_channel", sa.String(16), nullable=True))
    op.add_column("users", sa.Column("email_domain", sa.String(255), nullable=True))
    op.add_column("users", sa.Column("domain_class", sa.String(16), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "domain_class")
    op.drop_column("users", "email_domain")
    op.drop_column("users", "signup_channel")
    op.drop_column("users", "persona")
