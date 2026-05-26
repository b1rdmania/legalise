"""Phase 7 — grant scope first-class columns.

Revision ID: 0019
Revises: 0018
Create Date: 2026-05-26

WHAT THIS MIGRATION DOES
------------------------
Promotes per-grant scope from a JSONB side effect of
``granted_permissions_snapshot.matter_id`` (Phase 4) to first-class
columns on ``workspace_skill_capability_grants``:

- ``scope_type VARCHAR(16) NOT NULL``  -- "workspace" or "matter"
- ``scope_id   UUID NULL``             -- non-NULL iff scope_type='matter'

Plus:

1. Check constraint enforcing ``(scope_type='matter') = (scope_id IS NOT NULL)``.
2. Drop the old uniqueness ``uq_capability_grants_user_plugin_skill_capability``
   on ``(user_id, plugin, skill, capability)``.
3. Add the new uniqueness on
   ``(user_id, plugin, skill, capability, scope_type, scope_id)``.
4. Backfill any existing row whose
   ``granted_permissions_snapshot ->> 'matter_id'`` is set into the
   new columns as ``scope_type='matter'`` with the matching uuid.
   Rows with NULL snapshot or no matter_id remain ``scope_type='workspace'``.
5. Index ``(user_id, plugin, skill, scope_type, scope_id)`` so
   ``require_capability`` stays a single point-lookup.

WHY THIS IS LOAD-BEARING
------------------------
The old uniqueness made it physically impossible for the same user
to hold the same capability scoped to both Matter A and Matter B —
the vertical-slice claim "grant scoped permissions" was true for one
matter only. Phase 6 R3 patched ``require_capability`` to honour
``snapshot.matter_id`` but the uniqueness primitive never moved;
Reviewer Phase 7 v1 surfaced the gap. This migration closes it.

``granted_permissions_snapshot`` stays — it is now provenance (what
the trust ceremony showed at grant time), not the uniqueness
primitive.

DOWNGRADE
---------
Restores the old uniqueness, drops the check + index + columns.
Information loss is one-way: workspace vs matter scope on legacy
rows comes from the original snapshot, but rows added in v2 that
carry no snapshot would lose their scope on rollback. Acceptable
because the only callers expected to add such rows post-migration
are the Phase 7 endpoints themselves (which write snapshot too).
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "0019"
down_revision = "0018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Add columns nullable with a default so existing rows fill in.
    op.add_column(
        "workspace_skill_capability_grants",
        sa.Column(
            "scope_type",
            sa.String(length=16),
            nullable=False,
            server_default=sa.text("'workspace'"),
        ),
    )
    op.add_column(
        "workspace_skill_capability_grants",
        sa.Column(
            "scope_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            nullable=True,
        ),
    )

    # 2. Backfill: any pre-existing snapshot.matter_id becomes the row's
    #    scope. NULL snapshots stay as scope_type='workspace', scope_id=NULL.
    op.execute(
        """
        UPDATE workspace_skill_capability_grants
           SET scope_type = 'matter',
               scope_id   = (granted_permissions_snapshot ->> 'matter_id')::uuid
         WHERE granted_permissions_snapshot IS NOT NULL
           AND granted_permissions_snapshot ? 'matter_id'
           AND (granted_permissions_snapshot ->> 'matter_id') IS NOT NULL;
        """
    )

    # 3. Drop the server_default — the column is intentionally
    #    explicit-only from this point.
    op.alter_column(
        "workspace_skill_capability_grants",
        "scope_type",
        server_default=None,
    )

    # 4. Check constraint — scope columns move together.
    op.create_check_constraint(
        "ck_grant_scope_pairing",
        "workspace_skill_capability_grants",
        "(scope_type = 'matter') = (scope_id IS NOT NULL)",
    )

    # 5. Re-key uniqueness. NULLS NOT DISTINCT (Postgres 15+) makes
    #    two ('workspace', NULL) tuples conflict — without it, Postgres
    #    treats NULL as never-equal-to-anything and a user could end up
    #    with multiple identical workspace-scope grants. The old name
    #    was set in migration 0008
    #    (uq_capability_grants_user_plugin_skill_capability), not the
    #    longer "uq_workspace_skill_..." name the v1 plan draft used.
    op.drop_constraint(
        "uq_capability_grants_user_plugin_skill_capability",
        "workspace_skill_capability_grants",
        type_="unique",
    )
    op.execute(
        """
        ALTER TABLE workspace_skill_capability_grants
          ADD CONSTRAINT uq_grant_user_plugin_skill_cap_scope
          UNIQUE NULLS NOT DISTINCT
          (user_id, plugin, skill, capability, scope_type, scope_id);
        """
    )

    # 6. Point-lookup index keeps require_capability cheap.
    op.create_index(
        "ix_grant_user_plugin_skill_scope",
        "workspace_skill_capability_grants",
        ["user_id", "plugin", "skill", "scope_type", "scope_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_grant_user_plugin_skill_scope",
        table_name="workspace_skill_capability_grants",
    )
    op.drop_constraint(
        "uq_grant_user_plugin_skill_cap_scope",
        "workspace_skill_capability_grants",
        type_="unique",
    )
    op.create_unique_constraint(
        "uq_capability_grants_user_plugin_skill_capability",
        "workspace_skill_capability_grants",
        ["user_id", "plugin", "skill", "capability"],
    )
    op.drop_constraint(
        "ck_grant_scope_pairing",
        "workspace_skill_capability_grants",
        type_="check",
    )
    op.drop_column("workspace_skill_capability_grants", "scope_id")
    op.drop_column("workspace_skill_capability_grants", "scope_type")
