"""Assistant threads — multiple named conversations per matter.

Revision ID: 0040
Revises: 0039
Create Date: 2026-06-29

WHAT THIS MIGRATION DOES
------------------------
Today a matter has exactly one flat assistant conversation: every
``assistant_messages`` row is scoped only by ``matter_id``. This migration
introduces named threads so a matter can hold several separate
conversations, each with its own history.

- Creates ``assistant_threads``:
    id          UUID PK
    matter_id   UUID NOT NULL FK matters.id ON DELETE CASCADE (indexed)
    title       TEXT NULL   — derived from the first user message; null
                              until the first turn names it
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    created_by_id UUID NULL FK users.id

- Adds ``assistant_messages.thread_id``:
    UUID NULL FK assistant_threads.id ON DELETE CASCADE (indexed). Nullable
    so back-compat holds and the backfill below can populate it in place.

BACKFILL
--------
For every matter that already has assistant messages, one
``assistant_threads`` row is created ("Main thread", created_at = the
matter's earliest message time, created_by_id null) and that matter's
existing messages are pointed at it. Existing single-thread conversations
keep working unchanged.

DOWNGRADE
---------
Drops ``assistant_messages.thread_id`` then drops ``assistant_threads``.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision = "0040"
down_revision = "0039"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "assistant_threads",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column(
            "matter_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("matters.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("title", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "created_by_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_assistant_threads_matter_id",
        "assistant_threads",
        ["matter_id"],
    )

    op.add_column(
        "assistant_messages",
        sa.Column(
            "thread_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("assistant_threads.id", ondelete="CASCADE"),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_assistant_messages_thread_id",
        "assistant_messages",
        ["thread_id"],
    )

    # Backfill: one "Main thread" per matter that already has messages,
    # created at that matter's earliest message time, then point those
    # messages at it. Done in a single SQL pass so existing data keeps
    # working without any application code change.
    op.execute(
        sa.text(
            """
            WITH new_threads AS (
                INSERT INTO assistant_threads
                    (id, matter_id, title, created_at, created_by_id)
                SELECT
                    gen_random_uuid(),
                    m.matter_id,
                    'Main thread',
                    m.first_created_at,
                    NULL
                FROM (
                    SELECT matter_id, MIN(created_at) AS first_created_at
                    FROM assistant_messages
                    GROUP BY matter_id
                ) AS m
                RETURNING id, matter_id
            )
            UPDATE assistant_messages AS am
            SET thread_id = nt.id
            FROM new_threads AS nt
            WHERE am.matter_id = nt.matter_id
              AND am.thread_id IS NULL
            """
        )
    )


def downgrade() -> None:
    op.drop_index(
        "ix_assistant_messages_thread_id", table_name="assistant_messages"
    )
    op.drop_column("assistant_messages", "thread_id")
    op.drop_index(
        "ix_assistant_threads_matter_id", table_name="assistant_threads"
    )
    op.drop_table("assistant_threads")
