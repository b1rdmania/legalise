"""Phase C — case-law citation source_url + document-body anonymisation columns.

Three columns on `document_bodies` carry the W2 anonymisation result onto
the existing `kind="redacted"` body slot (no new table). One column on
`matter_citations` lets W1 persist the source URL surfaced by the
case-law lookup skill.

W3 (contract review) needs no schema changes — runs live entirely in
memory and audit rows.

Revision ID: 0006
Revises: 0005
Create Date: 2026-05-15
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # W1 — case-law lookup: capture the source URL alongside the citation
    # text so the Research tab can deep-link out to caselaw.nationalarchives.
    op.add_column(
        "matter_citations",
        sa.Column("source_url", sa.String(2048), nullable=True),
    )

    # W2 — anonymisation: extend the redacted body slot with the
    # token-to-original mapping, the engine that produced it, and the
    # timestamp of the run. UPSERTs onto the same (document_id, kind=
    # "redacted") row so re-runs are idempotent.
    op.add_column(
        "document_bodies",
        sa.Column("mapping", postgresql.JSONB, nullable=True),
    )
    op.add_column(
        "document_bodies",
        sa.Column("engine", sa.String(32), nullable=True),
    )
    op.add_column(
        "document_bodies",
        sa.Column("anonymised_at", sa.DateTime(timezone=True), nullable=True),
    )

    # W2 — extend the Phase A `extraction_method` CHECK constraint so the
    # anonymisation pipeline can persist `presidio` / `claude` / `hybrid`
    # alongside the original extractor enum. Without this drop+recreate,
    # the first successful anonymisation save violates the constraint.
    op.drop_constraint("ck_document_bodies_method", "document_bodies", type_="check")
    op.create_check_constraint(
        "ck_document_bodies_method",
        "document_bodies",
        "extraction_method IN ('pypdf','pdfplumber','python-docx','passthrough','failed','presidio','claude','hybrid')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_document_bodies_method", "document_bodies", type_="check")
    op.create_check_constraint(
        "ck_document_bodies_method",
        "document_bodies",
        "extraction_method IN ('pypdf','pdfplumber','python-docx','passthrough','failed')",
    )
    op.drop_column("document_bodies", "anonymised_at")
    op.drop_column("document_bodies", "engine")
    op.drop_column("document_bodies", "mapping")
    op.drop_column("matter_citations", "source_url")
