"""Phase 6 — matter_artifacts table.

Revision ID: 0018
Revises: 0017
Create Date: 2026-05-26

WHAT THIS MIGRATION DOES
------------------------
Creates ``matter_artifacts`` — one row per artifact produced by a
matter-scoped capability invocation. Artifacts are append-only;
new versions of the "same" output land as new rows with a new
``invocation_id``.

Shape (per Phase 6 build plan Decision #4):

- ``id``               UUID PK
- ``matter_id``        UUID NOT NULL REFERENCES matters(id)
- ``module_id``        VARCHAR(128) NOT NULL
- ``capability_id``    VARCHAR(256) NOT NULL
- ``invocation_id``    UUID NOT NULL
- ``kind``             VARCHAR(64) NOT NULL (e.g. ``findings_pack``)
- ``storage_path``     TEXT NOT NULL
- ``created_by_id``    UUID NOT NULL REFERENCES users(id)
- ``created_at``       TIMESTAMPTZ NOT NULL
- ``size_bytes``       BIGINT NOT NULL

Constraints + indexes:
- UNIQUE (invocation_id, kind) — one artifact per (invocation, kind).
  Multiple kinds per invocation are allowed (a future capability
  could produce both a findings_pack and a citation_pack); same
  (invocation, kind) cannot duplicate.
- INDEX (matter_id, created_at DESC) — recent artifacts per matter.
- INDEX (invocation_id) — for joining with the reconstruction view.

WORM trigger ``enforce_matter_artifacts_worm`` blocks UPDATE and
DELETE. Artifacts share the same append-only contract as audit rows;
the row points to a file on the matter filesystem that is itself
write-once-per-invocation.

DOWNGRADE
---------
Drops the trigger function, the trigger, then the table.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "0018"
down_revision = "0017"
branch_labels = None
depends_on = None


_CREATE_TRIGGER_FN = """\
CREATE OR REPLACE FUNCTION matter_artifacts_worm()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION
        'matter_artifacts is append-only — UPDATE and DELETE are forbidden. '
        'Operation: %; table: matter_artifacts.',
        TG_OP;
    RETURN NULL;
END;
$$;
"""

_CREATE_TRIGGER = """\
CREATE TRIGGER enforce_matter_artifacts_worm
BEFORE UPDATE OR DELETE ON matter_artifacts
FOR EACH ROW
EXECUTE FUNCTION matter_artifacts_worm();
"""


def upgrade() -> None:
    op.create_table(
        "matter_artifacts",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "matter_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("matters.id"),
            nullable=False,
        ),
        sa.Column("module_id", sa.String(128), nullable=False),
        sa.Column("capability_id", sa.String(256), nullable=False),
        sa.Column(
            "invocation_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            nullable=False,
        ),
        sa.Column("kind", sa.String(64), nullable=False),
        sa.Column("storage_path", sa.Text(), nullable=False),
        sa.Column(
            "created_by_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("size_bytes", sa.BigInteger(), nullable=False),
        sa.UniqueConstraint(
            "invocation_id", "kind", name="uq_matter_artifacts_invocation_kind"
        ),
    )
    op.create_index(
        "ix_matter_artifacts_matter_created",
        "matter_artifacts",
        ["matter_id", sa.text("created_at DESC")],
    )
    op.create_index(
        "ix_matter_artifacts_invocation_id",
        "matter_artifacts",
        ["invocation_id"],
    )
    op.execute(_CREATE_TRIGGER_FN)
    op.execute(_CREATE_TRIGGER)


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS enforce_matter_artifacts_worm ON matter_artifacts;")
    op.execute("DROP FUNCTION IF EXISTS matter_artifacts_worm();")
    op.drop_index("ix_matter_artifacts_invocation_id", table_name="matter_artifacts")
    op.drop_index("ix_matter_artifacts_matter_created", table_name="matter_artifacts")
    op.drop_table("matter_artifacts")
