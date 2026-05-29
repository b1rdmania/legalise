"""Professional Sign-Off v1 — matter_signoffs table.

Revision ID: 0022
Revises: 0021
Create Date: 2026-05-29

WHAT THIS MIGRATION DOES
------------------------
Creates ``matter_signoffs`` — one row per author sign-off over a matter
artifact (the solicitor takes professional ownership of an AI-prepared
output). Append-only at the row level: re-signing inserts a new row; the
*current* sign-off for an artifact is the latest by ``signed_at``. The
immutable trail lives in the ``output.*`` audit rows emitted alongside.

No ``state`` column — each row is itself a terminal decision
(signed / signed_with_observations / rejected). Distinct from
``matter_reviews`` (supervisor review): here the author may sign their
own output and there is no qualified-solicitor role wall.

Shape:
- id            UUID PK
- matter_id     UUID NOT NULL REFERENCES matters(id)
- artifact_id   UUID NOT NULL REFERENCES matter_artifacts(id)
- invocation_id UUID NOT NULL
- module_id     VARCHAR(128) NOT NULL
- capability_id VARCHAR(256) NOT NULL
- kind          VARCHAR(64) NOT NULL
- artifact_hash VARCHAR(64) NOT NULL  (sha256 of canonical
                                       {artifact_id, kind, payload})
- decision      VARCHAR(32) NOT NULL  (signed | signed_with_observations
                                       | rejected)
- reasoning     TEXT NULL  (required for observations / rejected)
- signer_id     UUID NOT NULL REFERENCES users(id)
- signed_at     TIMESTAMPTZ NOT NULL

Indexes:
- (matter_id, signed_at) — list sign-offs for a matter.
- (artifact_id) — find sign-off(s) for an artifact / current sign-off.

DOWNGRADE
---------
Drops the indexes then the table.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "0022"
down_revision = "0021"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "matter_signoffs",
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
        sa.Column("decision", sa.String(32), nullable=False),
        sa.Column("reasoning", sa.Text(), nullable=True),
        sa.Column(
            "signer_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column("signed_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(
        "ix_matter_signoffs_matter_signed",
        "matter_signoffs",
        ["matter_id", "signed_at"],
    )
    op.create_index(
        "ix_matter_signoffs_artifact",
        "matter_signoffs",
        ["artifact_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_matter_signoffs_artifact", table_name="matter_signoffs")
    op.drop_index("ix_matter_signoffs_matter_signed", table_name="matter_signoffs")
    op.drop_table("matter_signoffs")
