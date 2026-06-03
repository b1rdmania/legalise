"""Add file metadata to document versions.

Revision ID: 0027
Revises: 0026
Create Date: 2026-06-03
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "0027"
down_revision = "0026"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint(
        "ck_document_versions_kind",
        "document_versions",
        type_="check",
    )
    op.create_check_constraint(
        "ck_document_versions_kind",
        "document_versions",
        sa.text(
            "kind IN ('upload','assistant_edit','user_accept','user_reject','user_edit',"
            "'generated','replicated','restored')"
        ),
    )

    op.add_column("document_versions", sa.Column("filename", sa.String(length=512), nullable=True))
    op.add_column("document_versions", sa.Column("mime_type", sa.String(length=128), nullable=True))
    op.add_column("document_versions", sa.Column("size_bytes", sa.Integer(), nullable=True))
    op.add_column("document_versions", sa.Column("sha256", sa.String(length=64), nullable=True))

    op.execute(
        """
        UPDATE document_versions AS dv
        SET
          filename = d.filename,
          mime_type = d.mime_type,
          size_bytes = d.size_bytes,
          sha256 = d.sha256,
          storage_uri = COALESCE(dv.storage_uri, d.storage_uri)
        FROM documents AS d
        WHERE dv.document_id = d.id
          AND dv.kind = 'upload'
          AND dv.version_number = 1
        """
    )

    op.execute(
        """
        UPDATE document_versions AS dv
        SET
          filename = COALESCE(dv.filename, d.filename),
          mime_type = COALESCE(dv.mime_type, d.mime_type),
          size_bytes = COALESCE(dv.size_bytes, d.size_bytes),
          sha256 = COALESCE(dv.sha256, d.sha256)
        FROM documents AS d
        WHERE dv.document_id = d.id
          AND dv.storage_uri = d.storage_uri
          AND dv.sha256 IS NULL
        """
    )


def downgrade() -> None:
    op.drop_column("document_versions", "sha256")
    op.drop_column("document_versions", "size_bytes")
    op.drop_column("document_versions", "mime_type")
    op.drop_column("document_versions", "filename")
    op.drop_constraint(
        "ck_document_versions_kind",
        "document_versions",
        type_="check",
    )
    op.create_check_constraint(
        "ck_document_versions_kind",
        "document_versions",
        sa.text(
            "kind IN ('upload','assistant_edit','user_accept','user_reject','user_edit',"
            "'generated','replicated')"
        ),
    )
