"""Audited retrieval (P3) — document_chunks table.

Revision ID: 0036
Revises: 0035
Create Date: 2026-06-29

WHAT THIS MIGRATION DOES
------------------------
Creates ``document_chunks`` — the retrieval substrate for P3
(see docs/RETRIEVAL_DESIGN.md). One row per chunk of a document's
extracted text, carrying both a pgvector embedding (vector similarity)
and a generated ``tsvector`` (full-text keyword search) so the assistant
can run hybrid retrieval scoped to a matter.

Shape:

- ``id``           UUID PK
- ``document_id``  UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE
                   — a hard document delete sweeps its chunks.
- ``matter_id``    UUID NOT NULL REFERENCES matters(id) — scope filter.
- ``chunk_index``  INT NOT NULL — order within the document.
- ``text``         TEXT NOT NULL — the chunk body.
- ``char_start`` / ``char_end``  INT NOT NULL — offsets into the extracted
                   text, for click-back to the source.
- ``embedding``    vector(384) NULL — filled by the async embed job; NULL
                   until the document is indexed.
- ``tsv``          tsvector GENERATED ALWAYS AS (to_tsvector('english', text))
                   STORED — DB-managed, never written by the ORM.
- ``created_at``   TIMESTAMPTZ NOT NULL DEFAULT now().

Indexes:
- GIN on ``tsv`` (full-text).
- HNSW on ``embedding`` with ``vector_cosine_ops`` (approx. nearest
  neighbour, cosine). HNSW ships with pgvector >= 0.5.0; if the deployed
  pgvector predates it, swap the index DDL for the ivfflat fallback noted
  inline below.
- btree on ``document_id`` and on ``matter_id``.

The ``vector`` type and the generated column are declared via raw SQL
(``op.execute``) — the same approach 0001 uses for ``CREATE EXTENSION
vector`` — so the migration carries no hard import dependency on the
pgvector SQLAlchemy bindings.

DOWNGRADE
---------
Drops the table; its indexes and the generated column go with it.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "0036"
down_revision = "0035"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "document_chunks",
        sa.Column(
            "id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            primary_key=True,
        ),
        sa.Column(
            "document_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("documents.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "matter_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("matters.id"),
            nullable=False,
        ),
        sa.Column("chunk_index", sa.Integer(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("char_start", sa.Integer(), nullable=False),
        sa.Column("char_end", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )

    # pgvector embedding column — nullable until the async embed job fills it.
    op.execute("ALTER TABLE document_chunks ADD COLUMN embedding vector(384)")

    # DB-managed generated full-text column. The ORM must never write this.
    op.execute(
        "ALTER TABLE document_chunks "
        "ADD COLUMN tsv tsvector "
        "GENERATED ALWAYS AS (to_tsvector('english', text)) STORED"
    )

    # Full-text index.
    op.execute(
        "CREATE INDEX ix_document_chunks_tsv "
        "ON document_chunks USING gin (tsv)"
    )

    # Approximate nearest-neighbour index over the embedding (cosine).
    # HNSW requires pgvector >= 0.5.0. Fallback for older pgvector:
    #   CREATE INDEX ix_document_chunks_embedding ON document_chunks
    #     USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
    op.execute(
        "CREATE INDEX ix_document_chunks_embedding "
        "ON document_chunks USING hnsw (embedding vector_cosine_ops)"
    )

    op.create_index(
        "ix_document_chunks_document_id",
        "document_chunks",
        ["document_id"],
    )
    op.create_index(
        "ix_document_chunks_matter_id",
        "document_chunks",
        ["matter_id"],
    )


def downgrade() -> None:
    # Dropping the table drops its indexes and the generated column with it.
    op.drop_table("document_chunks")
