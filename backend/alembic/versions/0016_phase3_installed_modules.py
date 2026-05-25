"""Phase 3 — installed_modules table.

Revision ID: 0016
Revises: 0015
Create Date: 2026-05-25

WHAT THIS MIGRATION DOES
------------------------
Creates ``installed_modules`` — one row per (module_id, version)
the workspace has installed via the trust ceremony.

Each row carries:
- the signature verification outcome at install time
- the full manifest snapshot (JSONB)
- an aggregated permissions snapshot (JSONB) for Phase 4 diff/expand
- the install path for re-discovery on boot
- the user who installed
- whether currently enabled

UNIQUE on (module_id, version) so the same exact version cannot
install twice. Different versions of the same module ARE allowed
(side-by-side coexistence; Phase 4 grant lifecycle handles
version-bump permission expansion).

DOWNGRADE
---------
Drops the table. The trust ceremony state machine is in-memory in
Phase 3 so there's no ceremonies table to drop.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "0016"
down_revision: str | None = "0015"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "installed_modules",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            nullable=False,
        ),
        sa.Column("module_id", sa.String(128), nullable=False),
        sa.Column("version", sa.String(32), nullable=False),
        sa.Column("publisher", sa.String(128), nullable=False),
        sa.Column("visibility", sa.String(32), nullable=False),
        sa.Column("signature_status", sa.String(32), nullable=False),
        sa.Column("signed_by", sa.String(128), nullable=True),
        sa.Column(
            "verified_at", sa.DateTime(timezone=True), nullable=True
        ),
        sa.Column("install_path", sa.String(512), nullable=False),
        sa.Column("manifest_snapshot", postgresql.JSONB, nullable=False),
        sa.Column(
            "permissions_snapshot", postgresql.JSONB, nullable=False
        ),
        sa.Column(
            "installed_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "installed_by_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "enabled",
            sa.Boolean,
            nullable=False,
            server_default=sa.text("true"),
        ),
        sa.UniqueConstraint(
            "module_id",
            "version",
            name="uq_installed_modules_module_id_version",
        ),
    )
    op.create_index(
        "ix_installed_modules_module_id",
        "installed_modules",
        ["module_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_installed_modules_module_id",
        table_name="installed_modules",
    )
    op.drop_table("installed_modules")
