"""External workspace packs — matter source marker + non-human artifact authors.

Revision ID: 0035
Revises: 0034
Create Date: 2026-06-12

Two small schema changes for the register sidecar (docs/REGISTER_SIDECAR.md):

- ``matters.external_source``: nullable adapter name (``"mike"``) marking a
  matter as an ingested external-workspace pack. NULL = native matter.
  External matters are created with ``privilege_posture='C_paused'`` so the
  posture gate keeps them read-only (no capability runs, no model calls).

- ``matter_artifacts.created_by_id`` becomes nullable. NULL means "no
  workspace user authored this artifact" — the case for documents ingested
  from an external workspace, where the author was the external assistant
  or an external human. ``signer_is_author`` is computed as
  ``created_by_id == signer.id``, so a NULL author always reads as
  ``signer_is_author=false`` — a sign-off over external material can never
  present as self-authorship. DDL only: the WORM trigger on
  ``matter_artifacts`` blocks row UPDATE/DELETE, not ALTER TABLE.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision = "0035"
down_revision = "0034"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "matters",
        sa.Column("external_source", sa.String(length=64), nullable=True),
    )
    op.alter_column(
        "matter_artifacts",
        "created_by_id",
        existing_type=postgresql.UUID(as_uuid=True),
        nullable=True,
    )


def downgrade() -> None:
    # Reinstating NOT NULL fails if NULL-author artifacts exist — that is
    # correct: those rows are WORM and cannot be backfilled to a fake author.
    op.alter_column(
        "matter_artifacts",
        "created_by_id",
        existing_type=postgresql.UUID(as_uuid=True),
        nullable=False,
    )
    op.drop_column("matters", "external_source")
