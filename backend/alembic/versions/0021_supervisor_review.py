"""Supervisor Review v1 — matter_reviews table.

Revision ID: 0021
Revises: 0020
Create Date: 2026-05-28

WHAT THIS MIGRATION DOES
------------------------
Creates ``matter_reviews`` — one row per human review over a matter
artifact. Unlike ``matter_artifacts`` / ``audit_entries`` /
``advice_boundary_decisions``, this table is **mutable**: a row starts
``pending`` and transitions once to a terminal decision (approved /
rejected / changes_requested / overridden). It therefore carries **no
WORM trigger** — the immutable history lives in the ``review.*`` audit
rows emitted on each transition. A re-review is a new row.

Shape:
- id              UUID PK
- matter_id       UUID NOT NULL REFERENCES matters(id)
- artifact_id     UUID NOT NULL REFERENCES matter_artifacts(id)
- invocation_id   UUID NOT NULL
- module_id       VARCHAR(128) NOT NULL
- capability_id   VARCHAR(256) NOT NULL
- kind            VARCHAR(64) NOT NULL
- artifact_hash   VARCHAR(64) NOT NULL  (sha256 at request time)
- state           VARCHAR(32) NOT NULL  (pending | approved | rejected |
                                         changes_requested | overridden)
- requested_by_id UUID NOT NULL REFERENCES users(id)
- requested_at    TIMESTAMPTZ NOT NULL
- decided_by_id   UUID NULL REFERENCES users(id)
- decided_at      TIMESTAMPTZ NULL
- note            TEXT NULL

Indexes:
- (matter_id, requested_at) — list reviews for a matter.
- (artifact_id) — find the review(s) for an artifact.

DOWNGRADE
---------
Drops the indexes then the table.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "0021"
down_revision = "0020"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "matter_reviews",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "matter_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("matters.id"),
            nullable=False,
        ),
        sa.Column(
            "artifact_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("matter_artifacts.id"),
            nullable=False,
        ),
        sa.Column(
            "invocation_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            nullable=False,
        ),
        sa.Column("module_id", sa.String(128), nullable=False),
        sa.Column("capability_id", sa.String(256), nullable=False),
        sa.Column("kind", sa.String(64), nullable=False),
        sa.Column("artifact_hash", sa.String(64), nullable=False),
        sa.Column("state", sa.String(32), nullable=False),
        sa.Column(
            "requested_by_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column("requested_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "decided_by_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=True,
        ),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
    )
    op.create_index(
        "ix_matter_reviews_matter_requested",
        "matter_reviews",
        ["matter_id", "requested_at"],
    )
    op.create_index(
        "ix_matter_reviews_artifact",
        "matter_reviews",
        ["artifact_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_matter_reviews_artifact", table_name="matter_reviews")
    op.drop_index("ix_matter_reviews_matter_requested", table_name="matter_reviews")
    op.drop_table("matter_reviews")
