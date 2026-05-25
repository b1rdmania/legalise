"""Phase 1 matter context store — schemas + items.

Revision ID: 0013
Revises: 0012
Create Date: 2026-05-25

WHAT THIS MIGRATION DOES
------------------------
Creates two tables that hold the generic matter-context substrate:

1. ``matter_context_schemas`` — versioned typed-schema declarations
   under a namespace, unique on ``(namespace, version)``. Modules
   register schemas before writing items.

2. ``matter_context_items`` — actual matter-scoped data rows. Each
   item carries ``schema_id`` + ``schema_version`` so the schema it
   was validated against is permanently linked (Reviewer P1.2 round 2).
   The ``superseded_by_id`` self-reference supports soft supersession
   without losing history.

NO WORM ENFORCEMENT
-------------------
Unlike state_machine_transitions and audit_entries, matter_context_items
permits UPDATE. The MATTER_CONTEXT_STORE.md spec explicitly supports
PATCH for item revisions (e.g. superseding via supersede_item; updating
metadata via PATCH). True deletes are not supported — modules supersede
rather than delete. Phase 2 may revisit if a stricter immutability
guarantee is required for advice-tier-locked items.

DOWNGRADE
---------
Drops both tables in reverse FK order.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "0013"
down_revision: str | None = "0012"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. matter_context_schemas
    op.create_table(
        "matter_context_schemas",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            nullable=False,
        ),
        sa.Column("namespace", sa.String(128), nullable=False),
        sa.Column("module_id", sa.String(128), nullable=False),
        sa.Column("version", sa.String(32), nullable=False),
        sa.Column("json_schema", postgresql.JSONB, nullable=False),
        sa.Column(
            "registered_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "registered_by_module_id",
            sa.String(128),
            nullable=True,
        ),
        sa.UniqueConstraint(
            "namespace",
            "version",
            name="uq_matter_context_schemas_namespace_version",
        ),
    )
    op.create_index(
        "ix_matter_context_schemas_namespace",
        "matter_context_schemas",
        ["namespace"],
    )
    op.create_index(
        "ix_matter_context_schemas_module_id",
        "matter_context_schemas",
        ["module_id"],
    )

    # 2. matter_context_items
    op.create_table(
        "matter_context_items",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            nullable=False,
        ),
        sa.Column(
            "matter_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("matters.id"),
            nullable=False,
        ),
        sa.Column("namespace", sa.String(128), nullable=False),
        sa.Column(
            "schema_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("matter_context_schemas.id"),
            nullable=False,
        ),
        sa.Column("schema_version", sa.String(32), nullable=False),
        sa.Column("payload", postgresql.JSONB, nullable=False),
        sa.Column("source_type", sa.String(32), nullable=True),
        sa.Column("source_id", sa.String(64), nullable=True),
        sa.Column(
            "created_by_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=True,
        ),
        sa.Column(
            "created_by_module_id",
            sa.String(128),
            nullable=True,
        ),
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
        sa.Column(
            "superseded_by_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("matter_context_items.id"),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_matter_context_items_matter_namespace",
        "matter_context_items",
        ["matter_id", "namespace"],
    )
    op.create_index(
        "ix_matter_context_items_namespace",
        "matter_context_items",
        ["namespace"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_matter_context_items_namespace",
        table_name="matter_context_items",
    )
    op.drop_index(
        "ix_matter_context_items_matter_namespace",
        table_name="matter_context_items",
    )
    op.drop_table("matter_context_items")

    op.drop_index(
        "ix_matter_context_schemas_module_id",
        table_name="matter_context_schemas",
    )
    op.drop_index(
        "ix_matter_context_schemas_namespace",
        table_name="matter_context_schemas",
    )
    op.drop_table("matter_context_schemas")
