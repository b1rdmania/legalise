"""Auth tables — fastapi-users user fields, access_token, user_api_keys.

Also tightens matter slug tenancy from global to per-owner (composite
unique on `(created_by_id, slug)`) per HANDOVER_AUTH.md §3e option A.

Revision ID: 0003
Revises: 0002
Create Date: 2026-05-14
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # users — extend with fastapi-users columns ------------------------------
    op.add_column("users", sa.Column("hashed_password", sa.String(1024), nullable=True))
    op.add_column(
        "users",
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.true()),
    )
    op.add_column(
        "users",
        sa.Column("is_superuser", sa.Boolean, nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "users",
        sa.Column("is_verified", sa.Boolean, nullable=False, server_default=sa.false()),
    )
    op.add_column("users", sa.Column("default_model_id", sa.String(64), nullable=True))
    op.add_column(
        "users",
        sa.Column(
            "default_privilege_posture",
            sa.String(16),
            nullable=True,
            server_default="B_mixed",
        ),
    )

    # Backfill hashed_password for any existing user rows with an unusable
    # placeholder so the column can be tightened to NOT NULL. Anyone who
    # existed before auth landed needs to go through password reset.
    op.execute("UPDATE users SET hashed_password = '!disabled' WHERE hashed_password IS NULL")
    op.alter_column("users", "hashed_password", nullable=False)

    # access_token (fastapi-users DatabaseStrategy shape) --------------------
    op.create_table(
        "access_token",
        sa.Column("token", sa.String(43), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index("ix_access_token_user_id", "access_token", ["user_id"])
    op.create_index("ix_access_token_created_at", "access_token", ["created_at"])

    # user_api_keys ----------------------------------------------------------
    op.create_table(
        "user_api_keys",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("provider", sa.String(32), nullable=False),
        sa.Column("ciphertext", sa.LargeBinary, nullable=False),
        sa.Column("nonce", sa.LargeBinary, nullable=False),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.UniqueConstraint("user_id", "provider", name="uq_user_api_keys_user_provider"),
    )
    op.create_index("ix_user_api_keys_user_id", "user_api_keys", ["user_id"])

    # matters — per-owner slug uniqueness (Option A) ------------------------
    # Drop the global unique-on-slug index and replace with a composite
    # unique on (created_by_id, slug). A non-unique index on slug stays so
    # lookups by slug alone (e.g. resolver helpers) keep their plan.
    op.drop_index("ix_matters_slug", table_name="matters")
    op.create_index("ix_matters_slug", "matters", ["slug"], unique=False)
    op.create_unique_constraint("uq_matters_owner_slug", "matters", ["created_by_id", "slug"])


def downgrade() -> None:
    op.drop_constraint("uq_matters_owner_slug", "matters", type_="unique")
    op.drop_index("ix_matters_slug", table_name="matters")
    op.create_index("ix_matters_slug", "matters", ["slug"], unique=True)

    op.drop_index("ix_user_api_keys_user_id", table_name="user_api_keys")
    op.drop_table("user_api_keys")

    op.drop_index("ix_access_token_created_at", table_name="access_token")
    op.drop_index("ix_access_token_user_id", table_name="access_token")
    op.drop_table("access_token")

    op.drop_column("users", "default_privilege_posture")
    op.drop_column("users", "default_model_id")
    op.drop_column("users", "is_verified")
    op.drop_column("users", "is_superuser")
    op.drop_column("users", "is_active")
    op.drop_column("users", "hashed_password")
