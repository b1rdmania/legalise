"""Block TRUNCATE on the WORM audit tables.

Revision ID: 0044
Revises: 0043

Postgres row-level triggers do not fire on TRUNCATE, so the ``FOR EACH ROW``
WORM guards from 0011 (``audit_entries``) and 0030 (``audit_chain``) let a
single ``TRUNCATE audit_entries, audit_chain`` empty both tables — after which
the verifier reports a clean chain over zero rows. Reported by Luca Minotti,
who ported the audit substrate to an independent Postgres 16 and tested it.

Fix: one shared trigger function plus a ``BEFORE TRUNCATE ... FOR EACH
STATEMENT`` trigger on each table. Role separation (infra/postgres-roles.sql)
remains the second, independent layer for the split-role deployment.
"""

from __future__ import annotations

from alembic import op


revision = "0044"
down_revision = "0043"
branch_labels = None
depends_on = None


_CREATE_TRIGGER_FN = """\
CREATE OR REPLACE FUNCTION audit_worm_no_truncate()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION
        '% is append-only — TRUNCATE is forbidden.',
        TG_TABLE_NAME;
    RETURN NULL;
END;
$$;
"""

_CREATE_ENTRIES_TRIGGER = """\
CREATE TRIGGER enforce_audit_worm_no_truncate
BEFORE TRUNCATE ON audit_entries
FOR EACH STATEMENT
EXECUTE FUNCTION audit_worm_no_truncate();
"""

_CREATE_CHAIN_TRIGGER = """\
CREATE TRIGGER enforce_audit_chain_worm_no_truncate
BEFORE TRUNCATE ON audit_chain
FOR EACH STATEMENT
EXECUTE FUNCTION audit_worm_no_truncate();
"""

# Same pattern as 0011: role-level revoke is a no-op on single-role stacks.
# 0030 introduced audit_chain but infra/postgres-roles.sql only revoked on
# audit_entries — close that gap here for stacks where the role exists, and
# revoke TRUNCATE explicitly on both tables.
_REVOKE_APP_ROLE = """\
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'legalise_app') THEN
        REVOKE UPDATE, DELETE, TRUNCATE ON audit_entries FROM legalise_app;
        REVOKE UPDATE, DELETE, TRUNCATE ON audit_chain FROM legalise_app;
    END IF;
END;
$$;
"""

_RESTORE_APP_ROLE = """\
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'legalise_app') THEN
        GRANT UPDATE, DELETE ON audit_chain TO legalise_app;
    END IF;
END;
$$;
"""


def upgrade() -> None:
    op.execute(_CREATE_TRIGGER_FN)
    op.execute(_CREATE_ENTRIES_TRIGGER)
    op.execute(_CREATE_CHAIN_TRIGGER)
    op.execute(_REVOKE_APP_ROLE)


def downgrade() -> None:
    # audit_entries UPDATE/DELETE stays revoked (that predates this migration);
    # only the audit_chain grant added here is restored.
    op.execute(_RESTORE_APP_ROLE)
    op.execute(
        "DROP TRIGGER IF EXISTS enforce_audit_chain_worm_no_truncate ON audit_chain;"
    )
    op.execute(
        "DROP TRIGGER IF EXISTS enforce_audit_worm_no_truncate ON audit_entries;"
    )
    op.execute("DROP FUNCTION IF EXISTS audit_worm_no_truncate();")
