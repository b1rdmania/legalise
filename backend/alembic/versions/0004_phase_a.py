"""Phase A — document bodies/versions/edits, tabular reviews, workspace
disabled skills, matter citations, audit module column.

Single migration adds 7 new tables, 1 column on `audit_entries`, and backfills
a `document_versions` row for every existing document so downstream FKs bind.

Revision ID: 0004
Revises: 0003
Create Date: 2026-05-15
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # document_bodies -------------------------------------------------------
    op.create_table(
        "document_bodies",
        sa.Column(
            "document_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("documents.id", ondelete="CASCADE"),
            primary_key=True,
            nullable=False,
        ),
        sa.Column("kind", sa.String(32), primary_key=True, nullable=False, server_default="extracted"),
        sa.Column("extracted_text", sa.Text, nullable=False, server_default=""),
        sa.Column("extraction_method", sa.String(32), nullable=False),
        sa.Column(
            "extracted_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("char_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("page_count", sa.Integer, nullable=True),
        sa.Column("error_reason", sa.String(255), nullable=True),
        sa.CheckConstraint(
            "kind IN ('extracted','redacted','summary')",
            name="ck_document_bodies_kind",
        ),
        sa.CheckConstraint(
            "extraction_method IN ('pypdf','pdfplumber','python-docx','passthrough','failed')",
            name="ck_document_bodies_method",
        ),
    )
    op.create_index("ix_document_bodies_document_id", "document_bodies", ["document_id"])

    # document_versions -----------------------------------------------------
    op.create_table(
        "document_versions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "document_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("documents.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("version_number", sa.Integer, nullable=False),
        sa.Column("kind", sa.String(32), nullable=False),
        sa.Column(
            "created_by_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("storage_uri", sa.String(1024), nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.UniqueConstraint("document_id", "version_number", name="uq_document_versions_doc_num"),
        sa.CheckConstraint(
            "kind IN ('upload','assistant_edit','user_accept','user_reject','generated','replicated')",
            name="ck_document_versions_kind",
        ),
    )
    op.create_index("ix_document_versions_document_id", "document_versions", ["document_id"])

    # document_edits --------------------------------------------------------
    op.create_table(
        "document_edits",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "document_version_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("document_versions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("change_id", sa.String(64), nullable=False),
        sa.Column("correlation_id", sa.String(32), nullable=True),
        sa.Column("deleted_text", sa.Text, nullable=False, server_default=""),
        sa.Column("inserted_text", sa.Text, nullable=False, server_default=""),
        sa.Column("context_before", sa.Text, nullable=False, server_default=""),
        sa.Column("context_after", sa.Text, nullable=False, server_default=""),
        sa.Column("status", sa.String(16), nullable=False, server_default="pending"),
        sa.Column("rationale", sa.Text, nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "resolved_by_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=True,
        ),
        sa.UniqueConstraint(
            "document_version_id", "change_id", name="uq_document_edits_version_change"
        ),
        sa.CheckConstraint(
            "status IN ('pending','accepted','rejected')",
            name="ck_document_edits_status",
        ),
    )
    op.create_index("ix_document_edits_document_version_id", "document_edits", ["document_version_id"])
    op.create_index("ix_document_edits_status", "document_edits", ["status"])

    # tabular_reviews -------------------------------------------------------
    op.create_table(
        "tabular_reviews",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "matter_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("matters.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column(
            "created_by_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column(
            "columns_config",
            postgresql.JSONB,
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index("ix_tabular_reviews_matter_id", "tabular_reviews", ["matter_id"])

    # tabular_review_rows (composite PK, no `id`) ---------------------------
    op.create_table(
        "tabular_review_rows",
        sa.Column(
            "review_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tabular_reviews.id", ondelete="CASCADE"),
            primary_key=True,
            nullable=False,
        ),
        sa.Column(
            "document_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("documents.id", ondelete="CASCADE"),
            primary_key=True,
            nullable=False,
        ),
        sa.Column(
            "extracted_values",
            postgresql.JSONB,
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("last_run_at", sa.DateTime(timezone=True), nullable=True),
    )

    # workspace_disabled_skills --------------------------------------------
    # Semantics: absence = enabled (default), presence = disabled.
    op.create_table(
        "workspace_disabled_skills",
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            primary_key=True,
            nullable=False,
        ),
        sa.Column("plugin", sa.String(64), primary_key=True, nullable=False),
        sa.Column("skill", sa.String(128), primary_key=True, nullable=False),
        sa.Column(
            "disabled_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )

    # matter_citations ------------------------------------------------------
    op.create_table(
        "matter_citations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "matter_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("matters.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("citation_text", sa.Text, nullable=False),
        sa.Column("case_name", sa.String(512), nullable=True),
        sa.Column("citation_ref", sa.String(255), nullable=True),
        sa.Column(
            "added_by_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column(
            "added_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index("ix_matter_citations_matter_id", "matter_citations", ["matter_id"])

    # audit_entries — add `module` column ---------------------------------
    op.add_column("audit_entries", sa.Column("module", sa.String(64), nullable=True))
    op.create_index("ix_audit_entries_module", "audit_entries", ["module"])

    # Data backfill — seed a v1 'upload' DocumentVersion for every existing
    # document so future FKs from edits bind. `created_by_id` comes from the
    # parent matter's creator (documents.uploaded_by_id would also work but
    # matters.created_by_id is the canonical owner per the data model).
    op.execute(
        """
        INSERT INTO document_versions (
            id, document_id, version_number, kind, created_by_id, created_at, storage_uri, notes
        )
        SELECT
            gen_random_uuid(),
            d.id,
            1,
            'upload',
            m.created_by_id,
            now(),
            NULL,
            NULL
        FROM documents d
        JOIN matters m ON m.id = d.matter_id
        """
    )


def downgrade() -> None:
    # NOTE: dropping the `module` column on audit_entries will destroy data
    # if rows have been written with non-NULL module values. The safer path
    # in production is to leave the column and ship a separate cleanup
    # migration. Tests / fresh dev DBs are unaffected.
    op.drop_index("ix_audit_entries_module", table_name="audit_entries")
    op.drop_column("audit_entries", "module")

    op.drop_index("ix_matter_citations_matter_id", table_name="matter_citations")
    op.drop_table("matter_citations")

    op.drop_table("workspace_disabled_skills")

    op.drop_table("tabular_review_rows")

    op.drop_index("ix_tabular_reviews_matter_id", table_name="tabular_reviews")
    op.drop_table("tabular_reviews")

    op.drop_index("ix_document_edits_status", table_name="document_edits")
    op.drop_index("ix_document_edits_document_version_id", table_name="document_edits")
    op.drop_table("document_edits")

    op.drop_index("ix_document_versions_document_id", table_name="document_versions")
    op.drop_table("document_versions")

    op.drop_index("ix_document_bodies_document_id", table_name="document_bodies")
    op.drop_table("document_bodies")
