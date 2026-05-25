"""Phase 1 state machine primitive — definitions, instances, transitions.

Revision ID: 0012
Revises: 0011
Create Date: 2026-05-25

WHAT THIS MIGRATION DOES
------------------------
Creates three tables that hold the generic state-machine substrate:

1. ``state_machine_definitions`` — versioned shape declarations. One
   row per (module_id, definition_key, version) tuple. Mostly-immutable:
   modules ship new versions when the shape changes.

2. ``state_machine_instances`` — running state machines bound to an
   ``(owner_scope, owner_id)`` tuple. Carries denormalised
   ``definition_version`` so the runtime knows which transition set
   applies even after a module ships a newer definition.

3. ``state_machine_transitions`` — append-only log of every transition
   request. WORM-enforced via Postgres trigger (same pattern as
   ``audit_entries`` from migration 0011). The runtime appends a row
   per request regardless of outcome — completed, blocked, failed all
   leave provenance.

WORM ENFORCEMENT
----------------
The ``state_machine_transitions`` table receives the same WORM trigger
treatment as ``audit_entries``: a BEFORE UPDATE OR DELETE trigger that
raises an exception. Append-only is the Phase 1 doctrine
(STATE_MACHINE_PRIMITIVE.md §Failure Semantics: "Partial state
transitions are not allowed. Transition write and audit write should
commit together or the transition fails."). Re-running history requires
a new row, never a mutation of an existing one.

DOWNGRADE
---------
Drops the trigger, the function, and the three tables in reverse
dependency order.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "0012"
down_revision: str | None = "0011"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


_CREATE_TRIGGER_FN = """\
CREATE OR REPLACE FUNCTION state_machine_transitions_worm()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION
        'state_machine_transitions is append-only — UPDATE and DELETE are forbidden. '
        'Operation: %; table: state_machine_transitions.',
        TG_OP;
    RETURN NULL;
END;
$$;
"""

_CREATE_TRIGGER = """\
CREATE TRIGGER enforce_state_machine_transitions_worm
BEFORE UPDATE OR DELETE ON state_machine_transitions
FOR EACH ROW
EXECUTE FUNCTION state_machine_transitions_worm();
"""


def upgrade() -> None:
    # 1. state_machine_definitions
    op.create_table(
        "state_machine_definitions",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            nullable=False,
        ),
        sa.Column("module_id", sa.String(128), nullable=False),
        sa.Column("definition_key", sa.String(128), nullable=False),
        sa.Column("version", sa.String(32), nullable=False),
        sa.Column("states", postgresql.JSONB, nullable=False),
        sa.Column("initial_state", sa.String(64), nullable=False),
        sa.Column(
            "terminal_states",
            postgresql.JSONB,
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column(
            "transitions",
            postgresql.JSONB,
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.UniqueConstraint(
            "module_id",
            "definition_key",
            "version",
            name="uq_state_machine_definitions_module_key_version",
        ),
    )
    op.create_index(
        "ix_state_machine_definitions_module_id",
        "state_machine_definitions",
        ["module_id"],
    )

    # 2. state_machine_instances
    op.create_table(
        "state_machine_instances",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            nullable=False,
        ),
        sa.Column(
            "definition_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("state_machine_definitions.id"),
            nullable=False,
        ),
        sa.Column("definition_version", sa.String(32), nullable=False),
        sa.Column("owner_scope", sa.String(32), nullable=False),
        sa.Column("owner_id", sa.String(64), nullable=False),
        sa.Column("current_state", sa.String(64), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index(
        "ix_state_machine_instances_owner",
        "state_machine_instances",
        ["owner_scope", "owner_id"],
    )
    op.create_index(
        "ix_state_machine_instances_definition_id",
        "state_machine_instances",
        ["definition_id"],
    )

    # 3. state_machine_transitions (append-only via WORM trigger below)
    op.create_table(
        "state_machine_transitions",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            nullable=False,
        ),
        sa.Column(
            "instance_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("state_machine_instances.id"),
            nullable=False,
        ),
        sa.Column("from_state", sa.String(64), nullable=False),
        sa.Column("to_state", sa.String(64), nullable=False),
        sa.Column(
            "actor_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=True,
        ),
        sa.Column("module_id", sa.String(128), nullable=True),
        sa.Column("capability_id", sa.String(256), nullable=True),
        sa.Column("reason", sa.Text, nullable=True),
        sa.Column(
            "extra_metadata",
            postgresql.JSONB,
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "gate_state",
            postgresql.JSONB,
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column(
            "occurred_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index(
        "ix_state_machine_transitions_instance_occurred",
        "state_machine_transitions",
        ["instance_id", "occurred_at"],
    )
    op.create_index(
        "ix_state_machine_transitions_occurred_at",
        "state_machine_transitions",
        ["occurred_at"],
    )

    # WORM trigger on state_machine_transitions
    op.execute(_CREATE_TRIGGER_FN)
    op.execute(_CREATE_TRIGGER)


def downgrade() -> None:
    op.execute(
        "DROP TRIGGER IF EXISTS enforce_state_machine_transitions_worm "
        "ON state_machine_transitions;"
    )
    op.execute("DROP FUNCTION IF EXISTS state_machine_transitions_worm();")

    op.drop_index(
        "ix_state_machine_transitions_occurred_at",
        table_name="state_machine_transitions",
    )
    op.drop_index(
        "ix_state_machine_transitions_instance_occurred",
        table_name="state_machine_transitions",
    )
    op.drop_table("state_machine_transitions")

    op.drop_index(
        "ix_state_machine_instances_definition_id",
        table_name="state_machine_instances",
    )
    op.drop_index(
        "ix_state_machine_instances_owner",
        table_name="state_machine_instances",
    )
    op.drop_table("state_machine_instances")

    op.drop_index(
        "ix_state_machine_definitions_module_id",
        table_name="state_machine_definitions",
    )
    op.drop_table("state_machine_definitions")
