"""Add append-only audit hash chain.

Revision ID: 0030
Revises: 0029
Create Date: 2026-06-05

Phase 1 hardening: keep ``audit_entries`` untouched and append one chain row
per audit row in a separate WORM table. The chain row is inserted by an
``AFTER INSERT`` trigger on ``audit_entries`` so every write path is covered:
middleware, request-session semantic rows, and independent ``audit_failure``
transactions.

This is not external anchoring. It detects edit/delete/reorder of DB history
when the chain table is present, but a privileged operator who disables
triggers can still rewrite unanchored history. Rekor/external anchoring is the
Phase 3 control that changes that trust model.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision = "0030"
down_revision = "0029"
branch_labels = None
depends_on = None


_CREATE_FIELD_FN = """\
CREATE OR REPLACE FUNCTION audit_chain_field(value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT CASE
        WHEN value IS NULL THEN '-1:'
        ELSE char_length(value)::text || ':' || value
    END;
$$;
"""


_CREATE_ENTRY_CANONICAL_FN = """\
CREATE OR REPLACE FUNCTION audit_chain_entry_canonical(entry audit_entries)
RETURNS text
LANGUAGE sql
STABLE
AS $$
    SELECT concat_ws(E'\\n',
        'audit-chain-entry-v1',
        audit_chain_field(entry.id::text),
        audit_chain_field(to_char(entry.timestamp AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')),
        audit_chain_field(entry.actor_id::text),
        audit_chain_field(entry.matter_id::text),
        audit_chain_field(entry.action),
        audit_chain_field(entry.module),
        audit_chain_field(entry.resource_type),
        audit_chain_field(entry.resource_id),
        audit_chain_field(entry.model_used),
        audit_chain_field(entry.prompt_hash),
        audit_chain_field(entry.response_hash),
        audit_chain_field(entry.token_count::text),
        audit_chain_field(entry.latency_ms::text),
        audit_chain_field(entry.tokens_in::text),
        audit_chain_field(entry.tokens_out::text),
        audit_chain_field(entry.cost_micros::text),
        audit_chain_field(entry.currency),
        audit_chain_field(entry.provider),
        audit_chain_field(entry.model_id),
        audit_chain_field(entry.payload::text)
    );
$$;
"""


_CREATE_ENTRY_HASH_FN = """\
CREATE OR REPLACE FUNCTION audit_chain_entry_hash(entry audit_entries)
RETURNS char(64)
LANGUAGE sql
STABLE
AS $$
    SELECT encode(digest(audit_chain_entry_canonical(entry), 'sha256'), 'hex')::char(64);
$$;
"""


_CREATE_LINK_CANONICAL_FN = """\
CREATE OR REPLACE FUNCTION audit_chain_link_canonical(
    chain_version integer,
    scope_type text,
    matter_id uuid,
    scope_sequence bigint,
    audit_entry_id uuid,
    previous_chain_hash text,
    entry_hash text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT concat_ws(E'\\n',
        'audit-chain-link-v1',
        audit_chain_field(chain_version::text),
        audit_chain_field(scope_type),
        audit_chain_field(matter_id::text),
        audit_chain_field(scope_sequence::text),
        audit_chain_field(audit_entry_id::text),
        audit_chain_field(previous_chain_hash),
        audit_chain_field(entry_hash)
    );
$$;
"""


_CREATE_LINK_HASH_FN = """\
CREATE OR REPLACE FUNCTION audit_chain_link_hash(
    chain_version integer,
    scope_type text,
    matter_id uuid,
    scope_sequence bigint,
    audit_entry_id uuid,
    previous_chain_hash text,
    entry_hash text
)
RETURNS char(64)
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT encode(
        digest(
            audit_chain_link_canonical(
                chain_version,
                scope_type,
                matter_id,
                scope_sequence,
                audit_entry_id,
                previous_chain_hash,
                entry_hash
            ),
            'sha256'
        ),
        'hex'
    )::char(64);
$$;
"""


_CREATE_APPEND_FN = """\
CREATE OR REPLACE FUNCTION audit_chain_append_for_entry()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_scope_type text;
    v_matter_id uuid;
    v_previous_hash char(64);
    v_sequence bigint;
    v_entry_hash char(64);
    v_chain_hash char(64);
BEGIN
    IF NEW.matter_id IS NULL THEN
        v_scope_type := 'system';
        v_matter_id := NULL;
    ELSE
        v_scope_type := 'matter';
        v_matter_id := NEW.matter_id;
    END IF;

    -- Serialize appends per scope. Row locks are insufficient for the first
    -- row in a new scope, where no previous row exists yet.
    PERFORM pg_advisory_xact_lock(
        hashtext(v_scope_type),
        hashtext(COALESCE(v_matter_id::text, 'system'))
    );

    SELECT chain_hash, scope_sequence
      INTO v_previous_hash, v_sequence
      FROM audit_chain
     WHERE scope_type = v_scope_type
       AND (
            (v_matter_id IS NULL AND matter_id IS NULL)
            OR matter_id = v_matter_id
       )
     ORDER BY scope_sequence DESC
     LIMIT 1;

    v_sequence := COALESCE(v_sequence, 0) + 1;
    v_entry_hash := audit_chain_entry_hash(NEW);
    v_chain_hash := audit_chain_link_hash(
        1,
        v_scope_type,
        v_matter_id,
        v_sequence,
        NEW.id,
        v_previous_hash::text,
        v_entry_hash::text
    );

    INSERT INTO audit_chain (
        audit_entry_id,
        scope_type,
        matter_id,
        scope_sequence,
        previous_chain_hash,
        entry_hash,
        chain_hash,
        chain_version
    )
    VALUES (
        NEW.id,
        v_scope_type,
        v_matter_id,
        v_sequence,
        v_previous_hash,
        v_entry_hash,
        v_chain_hash,
        1
    );

    RETURN NEW;
END;
$$;
"""


_CREATE_CHAIN_WORM_FN = """\
CREATE OR REPLACE FUNCTION audit_chain_worm()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION
        'audit_chain is append-only — UPDATE and DELETE are forbidden. '
        'Operation: %; table: audit_chain.',
        TG_OP;
    RETURN NULL;
END;
$$;
"""


_CREATE_BACKFILL = """\
DO $$
DECLARE
    r audit_entries%ROWTYPE;
BEGIN
    FOR r IN
        SELECT *
          FROM audit_entries
         WHERE id NOT IN (SELECT audit_entry_id FROM audit_chain)
         ORDER BY timestamp, id
    LOOP
        -- Reuse the trigger body by inserting through a temp audit row shape:
        -- call the same append logic with a local NEW-equivalent via INSERT
        -- into audit_chain using the helper functions. Advisory lock keeps
        -- backfill semantics identical to live appends.
        PERFORM pg_advisory_xact_lock(
            hashtext(CASE WHEN r.matter_id IS NULL THEN 'system' ELSE 'matter' END),
            hashtext(COALESCE(r.matter_id::text, 'system'))
        );

        WITH previous AS (
            SELECT chain_hash, scope_sequence
              FROM audit_chain
             WHERE scope_type = CASE WHEN r.matter_id IS NULL THEN 'system' ELSE 'matter' END
               AND (
                    (r.matter_id IS NULL AND matter_id IS NULL)
                    OR matter_id = r.matter_id
               )
             ORDER BY scope_sequence DESC
             LIMIT 1
        ),
        values_to_insert AS (
            SELECT
                CASE WHEN r.matter_id IS NULL THEN 'system' ELSE 'matter' END AS scope_type,
                r.matter_id AS matter_id,
                COALESCE((SELECT scope_sequence FROM previous), 0) + 1 AS scope_sequence,
                (SELECT chain_hash FROM previous) AS previous_chain_hash,
                audit_chain_entry_hash(r) AS entry_hash
        )
        INSERT INTO audit_chain (
            audit_entry_id,
            scope_type,
            matter_id,
            scope_sequence,
            previous_chain_hash,
            entry_hash,
            chain_hash,
            chain_version
        )
        SELECT
            r.id,
            v.scope_type,
            v.matter_id,
            v.scope_sequence,
            v.previous_chain_hash,
            v.entry_hash,
            audit_chain_link_hash(
                1,
                v.scope_type,
                v.matter_id,
                v.scope_sequence,
                r.id,
                v.previous_chain_hash::text,
                v.entry_hash::text
            ),
            1
        FROM values_to_insert v;
    END LOOP;
END;
$$;
"""


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")
    op.execute(_CREATE_FIELD_FN)
    op.execute(_CREATE_ENTRY_CANONICAL_FN)
    op.execute(_CREATE_ENTRY_HASH_FN)
    op.execute(_CREATE_LINK_CANONICAL_FN)
    op.execute(_CREATE_LINK_HASH_FN)

    op.create_table(
        "audit_chain",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=False), nullable=False),
        sa.Column("audit_entry_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("scope_type", sa.String(length=16), nullable=False),
        sa.Column("matter_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("scope_sequence", sa.BigInteger(), nullable=False),
        sa.Column("previous_chain_hash", sa.CHAR(length=64), nullable=True),
        sa.Column("entry_hash", sa.CHAR(length=64), nullable=False),
        sa.Column("chain_hash", sa.CHAR(length=64), nullable=False),
        sa.Column("chain_version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint("scope_type IN ('matter', 'system')", name="ck_audit_chain_scope_type"),
        sa.CheckConstraint(
            "(scope_type = 'matter' AND matter_id IS NOT NULL) "
            "OR (scope_type = 'system' AND matter_id IS NULL)",
            name="ck_audit_chain_scope_matter_consistency",
        ),
        sa.CheckConstraint(
            "previous_chain_hash IS NULL OR previous_chain_hash ~ '^[0-9a-f]{64}$'",
            name="ck_audit_chain_previous_hash_hex",
        ),
        sa.CheckConstraint("entry_hash ~ '^[0-9a-f]{64}$'", name="ck_audit_chain_entry_hash_hex"),
        sa.CheckConstraint("chain_hash ~ '^[0-9a-f]{64}$'", name="ck_audit_chain_hash_hex"),
        sa.ForeignKeyConstraint(["audit_entry_id"], ["audit_entries.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("audit_entry_id", name="uq_audit_chain_audit_entry_id"),
    )
    op.create_index("ix_audit_chain_matter_id", "audit_chain", ["matter_id"])
    op.create_index("ix_audit_chain_scope", "audit_chain", ["scope_type", "matter_id", "scope_sequence"])
    op.create_index(
        "uq_audit_chain_matter_scope_sequence",
        "audit_chain",
        ["matter_id", "scope_sequence"],
        unique=True,
        postgresql_where=sa.text("scope_type = 'matter'"),
    )
    op.create_index(
        "uq_audit_chain_system_scope_sequence",
        "audit_chain",
        ["scope_sequence"],
        unique=True,
        postgresql_where=sa.text("scope_type = 'system'"),
    )

    op.execute(_CREATE_CHAIN_WORM_FN)
    op.execute(
        """
        CREATE TRIGGER enforce_audit_chain_worm
        BEFORE UPDATE OR DELETE ON audit_chain
        FOR EACH ROW
        EXECUTE FUNCTION audit_chain_worm();
        """
    )

    op.execute(_CREATE_APPEND_FN)
    op.execute(
        """
        CREATE TRIGGER audit_entries_hash_chain_after_insert
        AFTER INSERT ON audit_entries
        FOR EACH ROW
        EXECUTE FUNCTION audit_chain_append_for_entry();
        """
    )
    op.execute(_CREATE_BACKFILL)


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS audit_entries_hash_chain_after_insert ON audit_entries;")
    op.execute("DROP FUNCTION IF EXISTS audit_chain_append_for_entry();")
    op.execute("DROP TRIGGER IF EXISTS enforce_audit_chain_worm ON audit_chain;")
    op.execute("DROP FUNCTION IF EXISTS audit_chain_worm();")
    op.drop_index("uq_audit_chain_system_scope_sequence", table_name="audit_chain")
    op.drop_index("uq_audit_chain_matter_scope_sequence", table_name="audit_chain")
    op.drop_index("ix_audit_chain_scope", table_name="audit_chain")
    op.drop_index("ix_audit_chain_matter_id", table_name="audit_chain")
    op.drop_table("audit_chain")
    op.execute("DROP FUNCTION IF EXISTS audit_chain_link_hash(integer, text, uuid, bigint, uuid, text, text);")
    op.execute("DROP FUNCTION IF EXISTS audit_chain_link_canonical(integer, text, uuid, bigint, uuid, text, text);")
    op.execute("DROP FUNCTION IF EXISTS audit_chain_entry_hash(audit_entries);")
    op.execute("DROP FUNCTION IF EXISTS audit_chain_entry_canonical(audit_entries);")
    op.execute("DROP FUNCTION IF EXISTS audit_chain_field(text);")
