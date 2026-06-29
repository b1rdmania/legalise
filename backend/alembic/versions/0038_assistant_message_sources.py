"""Source provenance (P4) — assistant message sources column.

Revision ID: 0038
Revises: 0037
Create Date: 2026-06-29

WHAT THIS MIGRATION DOES
------------------------
Adds ``sources`` to ``assistant_messages`` so each assistant turn can carry
the retrieved passages the answer rests on, letting the workspace render a
"Sources" affordance and deep-link to the exact char range.

- ``sources``  JSONB NOT NULL DEFAULT '[]'
               — list of {document_id, title, snippet, char_start,
               char_end, score}. Empty on user rows and on turns with no
               retrieval (selected-docs / deterministic-summary paths).

DOWNGRADE
---------
Drops the column.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision = "0038"
down_revision = "0037"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "assistant_messages",
        sa.Column(
            "sources",
            postgresql.JSONB,
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )


def downgrade() -> None:
    op.drop_column("assistant_messages", "sources")
