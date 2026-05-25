"""Phase 2 — extend workspace_skill_capability_grants for v2 manifests.

Revision ID: 0015
Revises: 0014
Create Date: 2026-05-25

WHAT THIS MIGRATION DOES
------------------------
Three additive changes to ``workspace_skill_capability_grants``:

1. Widens ``capability`` from ``VARCHAR(64)`` to ``VARCHAR(256)``.
   v2 capability strings exceed 64 chars in practice (e.g.
   ``matter.context.legalise_memory.accepted_facts.write`` = 50 chars,
   with longer module namespaces possible). Matches the
   ``capability_id`` column shape on ``state_machine_transitions`` /
   ``advice_boundary_decisions``.

2. Widens ``plugin`` from ``VARCHAR(64)`` to ``VARCHAR(128)``. v2
   module ids can be longer than the legacy plugin names.

3. Adds three nullable columns:
   - ``capability_version VARCHAR(32) NULL``
   - ``granted_at_module_version VARCHAR(32) NULL``
   - ``granted_permissions_snapshot JSONB NULL``

   All nullable so existing v1 grants continue to resolve via
   ``require_capability`` unchanged. v2 grants populate these for
   Phase 4 grant-lifecycle / permission-expansion detection.

The composite UNIQUE constraint
``uq_capability_grants_user_plugin_skill_capability`` is dropped
and recreated to pick up the widened column types.

DOWNGRADE
---------
Drops the three new columns. Restores the column widths (best
effort — actual data may exceed the narrower widths after the
upgrade, so the downgrade will fail if any v2 grants have been
written).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "0015"
down_revision: str | None = "0014"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. Widen capability column.
    op.alter_column(
        "workspace_skill_capability_grants",
        "capability",
        existing_type=sa.String(64),
        type_=sa.String(256),
        existing_nullable=False,
    )

    # 2. Widen plugin column.
    op.alter_column(
        "workspace_skill_capability_grants",
        "plugin",
        existing_type=sa.String(64),
        type_=sa.String(128),
        existing_nullable=False,
    )

    # 3. Add Phase 2 columns.
    op.add_column(
        "workspace_skill_capability_grants",
        sa.Column("capability_version", sa.String(32), nullable=True),
    )
    op.add_column(
        "workspace_skill_capability_grants",
        sa.Column(
            "granted_at_module_version", sa.String(32), nullable=True
        ),
    )
    op.add_column(
        "workspace_skill_capability_grants",
        sa.Column(
            "granted_permissions_snapshot",
            postgresql.JSONB,
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column(
        "workspace_skill_capability_grants",
        "granted_permissions_snapshot",
    )
    op.drop_column(
        "workspace_skill_capability_grants",
        "granted_at_module_version",
    )
    op.drop_column(
        "workspace_skill_capability_grants",
        "capability_version",
    )

    # Best-effort restore of column widths. If any rows exceed the
    # narrower widths the downgrade will fail; operators must
    # truncate or drop those rows first.
    op.alter_column(
        "workspace_skill_capability_grants",
        "plugin",
        existing_type=sa.String(128),
        type_=sa.String(64),
        existing_nullable=False,
    )
    op.alter_column(
        "workspace_skill_capability_grants",
        "capability",
        existing_type=sa.String(256),
        type_=sa.String(64),
        existing_nullable=False,
    )
