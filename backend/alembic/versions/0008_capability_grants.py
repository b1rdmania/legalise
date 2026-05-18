"""Capability grants — per-user (plugin, skill, capability) grants table.

Storage for the runtime capability-enforcement layer. The doctrine line:
manifests declare, the workspace grants, the runtime enforces. This is
the workspace-grants half.

Revision ID: 0008
Revises: 0007
Create Date: 2026-05-18
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0008"
down_revision: str | None = "0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "workspace_skill_capability_grants",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("plugin", sa.String(64), nullable=False),
        sa.Column("skill", sa.String(128), nullable=False),
        sa.Column("capability", sa.String(64), nullable=False),
        sa.Column(
            "granted_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "granted_by_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.UniqueConstraint(
            "user_id", "plugin", "skill", "capability",
            name="uq_capability_grants_user_plugin_skill_capability",
        ),
    )
    op.create_index(
        "ix_capability_grants_user_plugin_skill",
        "workspace_skill_capability_grants",
        ["user_id", "plugin", "skill"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_capability_grants_user_plugin_skill",
        table_name="workspace_skill_capability_grants",
    )
    op.drop_table("workspace_skill_capability_grants")
