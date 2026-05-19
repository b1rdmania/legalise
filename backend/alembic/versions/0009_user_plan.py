"""User.plan field - v0.1 display-only plan tier.

No enforcement, no billing semantics. Surfaces on /auth/users/me so the
Settings page can render the user's tier honestly. Real subscription
state lands in v0.2 when billing wires.

Revision ID: 0009
Revises: 0008
Create Date: 2026-05-19
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "0009"
down_revision: str | None = "0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "plan",
            sa.String(32),
            nullable=False,
            server_default="free",
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "plan")
