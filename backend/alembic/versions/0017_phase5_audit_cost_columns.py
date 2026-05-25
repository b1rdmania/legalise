"""Phase 5 — audit cost columns.

Revision ID: 0017
Revises: 0016
Create Date: 2026-05-25

WHAT THIS MIGRATION DOES
------------------------
Promotes model-invocation cost metadata from JSONB payload scan to
first-class columns on ``audit_entries``:

- ``tokens_in``       BIGINT NULL
- ``tokens_out``      BIGINT NULL
- ``cost_micros``     BIGINT NULL  (integer minor-unit micros)
- ``currency``        CHAR(3) NULL (ISO 4217)
- ``provider``        VARCHAR(32) NULL
- ``model_id``        VARCHAR(128) NULL

These columns are populated **only** for ``model.invoked`` rows. All
other audit rows leave them NULL. The WORM trigger from migration
0011 fires on row, not column — append-only semantics still apply.

Constraint: ``(cost_micros NULL) = (currency NULL)`` — cost and
currency move together. Either both are NULL (non-cost row) or both
are populated (cost row in a specified currency).

Index: ``ix_audit_entries_matter_action_timestamp`` partial index on
``(matter_id, action, timestamp DESC) WHERE matter_id IS NOT NULL``
to make ad-hoc rollup queries cheap when they're needed.

Reviewer redline (Phase 5 v2 R2 P1): cost stored in micros + currency,
NOT pence. Many provider calls fall in the sub-penny band; multi-
currency is real once you have providers in different regions.
Integer micros preserves precision without a float; currency is the
shape FX-conversion layers (Phase 7+) will need anyway.

No backfill — existing ``model.invoked`` rows keep their JSONB-only
payload. Phase 5 readers do column-first / JSONB fallback so old
rows still render in reconstruction.

DOWNGRADE
---------
Drops the index, drops the check constraint, drops the six columns.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "0017"
down_revision = "0016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("audit_entries") as batch:
        batch.add_column(sa.Column("tokens_in", sa.BigInteger(), nullable=True))
        batch.add_column(sa.Column("tokens_out", sa.BigInteger(), nullable=True))
        batch.add_column(sa.Column("cost_micros", sa.BigInteger(), nullable=True))
        batch.add_column(sa.Column("currency", sa.CHAR(length=3), nullable=True))
        batch.add_column(sa.Column("provider", sa.String(length=32), nullable=True))
        batch.add_column(sa.Column("model_id", sa.String(length=128), nullable=True))

    op.create_check_constraint(
        "ck_audit_entries_cost_currency_paired",
        "audit_entries",
        "(cost_micros IS NULL) = (currency IS NULL)",
    )

    op.execute(
        """
        CREATE INDEX ix_audit_entries_matter_action_timestamp
        ON audit_entries (matter_id, action, timestamp DESC)
        WHERE matter_id IS NOT NULL;
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_audit_entries_matter_action_timestamp;")
    op.drop_constraint(
        "ck_audit_entries_cost_currency_paired",
        "audit_entries",
        type_="check",
    )
    with op.batch_alter_table("audit_entries") as batch:
        batch.drop_column("model_id")
        batch.drop_column("provider")
        batch.drop_column("currency")
        batch.drop_column("cost_micros")
        batch.drop_column("tokens_out")
        batch.drop_column("tokens_in")
