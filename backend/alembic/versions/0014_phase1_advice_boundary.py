"""Phase 1 advice boundary primitive — decisions table.

Revision ID: 0014
Revises: 0013
Create Date: 2026-05-25

WHAT THIS MIGRATION DOES
------------------------
Creates ``advice_boundary_decisions`` — one row per call to
``core.advice_boundary.check``. Append-only via WORM trigger (same
pattern as ``audit_entries`` from 0011 and ``state_machine_transitions``
from 0012).

DOWNGRADE
---------
Drops the trigger, the function, and the table.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "0014"
down_revision: str | None = "0013"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


_CREATE_TRIGGER_FN = """\
CREATE OR REPLACE FUNCTION advice_boundary_decisions_worm()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION
        'advice_boundary_decisions is append-only — UPDATE and DELETE are forbidden. '
        'Operation: %; table: advice_boundary_decisions.',
        TG_OP;
    RETURN NULL;
END;
$$;
"""

_CREATE_TRIGGER = """\
CREATE TRIGGER enforce_advice_boundary_decisions_worm
BEFORE UPDATE OR DELETE ON advice_boundary_decisions
FOR EACH ROW
EXECUTE FUNCTION advice_boundary_decisions_worm();
"""


def upgrade() -> None:
    op.create_table(
        "advice_boundary_decisions",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            nullable=False,
        ),
        sa.Column("output_id", sa.String(128), nullable=False),
        sa.Column("from_tier", sa.String(64), nullable=True),
        sa.Column("to_tier", sa.String(64), nullable=False),
        sa.Column(
            "actor_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=True,
        ),
        sa.Column("actor_role", sa.String(64), nullable=True),
        sa.Column("module_id", sa.String(128), nullable=True),
        sa.Column("capability_id", sa.String(256), nullable=True),
        sa.Column("declared_tier_max", sa.String(64), nullable=True),
        sa.Column(
            "gate_state",
            postgresql.JSONB,
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column(
            "decided_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index(
        "ix_advice_boundary_decisions_output",
        "advice_boundary_decisions",
        ["output_id", "decided_at"],
    )
    op.create_index(
        "ix_advice_boundary_decisions_decided_at",
        "advice_boundary_decisions",
        ["decided_at"],
    )

    op.execute(_CREATE_TRIGGER_FN)
    op.execute(_CREATE_TRIGGER)


def downgrade() -> None:
    op.execute(
        "DROP TRIGGER IF EXISTS enforce_advice_boundary_decisions_worm "
        "ON advice_boundary_decisions;"
    )
    op.execute("DROP FUNCTION IF EXISTS advice_boundary_decisions_worm();")

    op.drop_index(
        "ix_advice_boundary_decisions_decided_at",
        table_name="advice_boundary_decisions",
    )
    op.drop_index(
        "ix_advice_boundary_decisions_output",
        table_name="advice_boundary_decisions",
    )
    op.drop_table("advice_boundary_decisions")
