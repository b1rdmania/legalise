"""OAuth accounts — social sign-in identities (Google, Microsoft, GitHub).

Revision ID: 0043
Revises: 0042
Create Date: 2026-07-10

Adds the fastapi-users OAuth account table (`SQLAlchemyBaseOAuthAccountTableUUID`
shape). One row per (user, provider) — a user who signs in with both Google
and GitHub against the same verified email gets two rows here, both pointing
at the same `users.id`. See ADR-012 for the account-linking decision.

DOWNGRADE
---------
Drops the table outright. Any user who exists ONLY via OAuth (no password
ever set) becomes unreachable after downgrade — acceptable for a reversible
dev/CI operation, not something to run against a populated production
database without a plan for those accounts first.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0043"
down_revision: str | None = "0042"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.create_table(
        "oauth_accounts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("oauth_name", sa.String(100), nullable=False),
        sa.Column("access_token", sa.String(1024), nullable=False),
        sa.Column("expires_at", sa.Integer(), nullable=True),
        sa.Column("refresh_token", sa.String(1024), nullable=True),
        sa.Column("account_id", sa.String(320), nullable=False),
        sa.Column("account_email", sa.String(320), nullable=False),
    )
    op.create_index("ix_oauth_accounts_user_id", "oauth_accounts", ["user_id"])
    op.create_index(
        "ix_oauth_accounts_oauth_name_account_id",
        "oauth_accounts",
        ["oauth_name", "account_id"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("ix_oauth_accounts_oauth_name_account_id", table_name="oauth_accounts")
    op.drop_index("ix_oauth_accounts_user_id", table_name="oauth_accounts")
    op.drop_table("oauth_accounts")
