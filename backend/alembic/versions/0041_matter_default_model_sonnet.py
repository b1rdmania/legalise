"""Matter.default_model_id server-default → Sonnet.

Revision ID: 0041
Revises: 0040
Create Date: 2026-06-29

The column was created with a server-default of ``claude-opus-4-7`` (the
old default model). Sonnet is now the recommended default everywhere else
(settings, seed, ORM default, .env), so align the DB column default too —
otherwise any insert path that omits ``default_model_id`` would silently
fall back to Opus. This only changes the DEFAULT for future inserts that
don't specify a model; existing matter rows are left untouched (their
chosen model is theirs to keep).

DOWNGRADE restores the previous Opus default.
"""

from __future__ import annotations

from alembic import op


revision = "0041"
down_revision = "0040"
branch_labels = None
depends_on = None

_NEW_DEFAULT = "claude-sonnet-4-6"
_OLD_DEFAULT = "claude-opus-4-7"


def upgrade() -> None:
    op.alter_column(
        "matters",
        "default_model_id",
        server_default=_NEW_DEFAULT,
    )


def downgrade() -> None:
    op.alter_column(
        "matters",
        "default_model_id",
        server_default=_OLD_DEFAULT,
    )
