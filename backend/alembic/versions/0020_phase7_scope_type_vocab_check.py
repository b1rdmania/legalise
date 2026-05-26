"""Phase 7 follow-up — scope_type vocabulary check.

Revision ID: 0020
Revises: 0019
Create Date: 2026-05-26

Adds ``CHECK (scope_type IN ('workspace', 'matter'))`` to
``workspace_skill_capability_grants``. Reviewer Phase 7
ratification surfaced that the existing
``ck_grant_scope_pairing`` check only enforces the (scope_type,
scope_id) pairing — an arbitrary ``scope_type`` string (e.g.
``"global"``, ``"banana"``) paired with NULL ``scope_id`` would
have passed the pairing check silently. The vocabulary is a
small constant set; the DB should enforce it directly.

DOWNGRADE
---------
Drops the constraint. No backfill needed — the SQLAlchemy default
``SCOPE_TYPE_WORKSPACE`` keeps any future row valid.
"""

from __future__ import annotations

from alembic import op


revision = "0020"
down_revision = "0019"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_check_constraint(
        "ck_grant_scope_type_vocab",
        "workspace_skill_capability_grants",
        "scope_type IN ('workspace', 'matter')",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_grant_scope_type_vocab",
        "workspace_skill_capability_grants",
        type_="check",
    )
