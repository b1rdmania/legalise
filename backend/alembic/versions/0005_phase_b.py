"""Phase B — resolved_text column on document_versions for W2 accept/reject.

Adds a single nullable TEXT column to `document_versions` so user_accept /
user_reject closing versions can persist the materialised post-resolution
text alongside the existing audit trail. No other schema changes.

Revision ID: 0005
Revises: 0004
Create Date: 2026-05-15
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "document_versions",
        sa.Column("resolved_text", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("document_versions", "resolved_text")
