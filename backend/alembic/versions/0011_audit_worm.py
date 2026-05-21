"""Audit WORM groundwork: trigger guard + role-split documentation.

Revision ID: 0011
Revises: 0010
Create Date: 2026-05-21

WHAT THIS MIGRATION DOES
------------------------
1.  Installs a Postgres trigger on ``audit_entries`` that raises an
    exception on any UPDATE or DELETE attempt. This is the belt-and-braces
    guard — even if a future code bug issues an UPDATE, Postgres will reject
    it at the DB layer.

2.  (v0.6 follow-up, documented here) Revokes UPDATE/DELETE on
    ``audit_entries`` from the app role *if* a separate ``legalise_app``
    role exists. On the current Fly + Neon single-role stack this block is
    a no-op, but the SQL is present so operators can enable it once the
    role split is done.

OPERATOR DECISION: trigger-only v0.5
--------------------------------------
The deployed stack (Fly + Neon London) uses a single Postgres role for
everything today. Splitting into separate migration and app roles is a
non-trivial ops change (new role, two connection strings, alembic config
update). The trigger guard alone gives a strong "code cannot mutate audit
rows" property immediately. The role-split SQL is documented below as a
v0.6 follow-up.

v0.6 ROLE-SPLIT RUNBOOK (operator must complete manually)
----------------------------------------------------------
Step 1: Create the app role in your Postgres cluster:
    CREATE ROLE legalise_app WITH LOGIN PASSWORD '…';
    GRANT CONNECT ON DATABASE legalise TO legalise_app;
    GRANT USAGE ON SCHEMA public TO legalise_app;
    GRANT SELECT, INSERT ON ALL TABLES IN SCHEMA public TO legalise_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO legalise_app;
    -- Explicitly remove audit mutation privileges:
    REVOKE UPDATE, DELETE ON audit_entries FROM legalise_app;

Step 2: Create a separate migration role (used only by alembic / deploy):
    CREATE ROLE legalise_migrate WITH LOGIN PASSWORD '…';
    GRANT ALL PRIVILEGES ON DATABASE legalise TO legalise_migrate;
    GRANT ALL ON ALL TABLES IN SCHEMA public TO legalise_migrate;
    GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO legalise_migrate;

Step 3: Update connection strings:
    - POSTGRES_DSN (Fly secret, used by FastAPI / worker): legalise_app DSN
    - ALEMBIC_URL (deploy step env var, used by `alembic upgrade head`):
      legalise_migrate DSN

Step 4: Re-run this migration so the GRANT/REVOKE block below fires:
    alembic upgrade 0011 (will be a no-op on schema, but runs the grant step)

Step 5: Validate with test_audit_worm.py connect-as-app-role path:
    TEST_DATABASE_URL=<legalise_app DSN> pytest backend/tests/test_audit_worm.py -x

DOWNGRADE
---------
downgrade() drops the trigger function and trigger, restoring UPDATE/DELETE
behaviour to whatever the DB role permits. The v0.6 role grants are not
automatically reversed here (they are done outside alembic); operators must
manually GRANT UPDATE, DELETE ON audit_entries TO legalise_app if needed.
"""

from collections.abc import Sequence

from alembic import op


revision: str = "0011"
down_revision: str | None = "0010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


_CREATE_TRIGGER_FN = """\
CREATE OR REPLACE FUNCTION audit_entries_worm()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION
        'audit_entries is append-only — UPDATE and DELETE are forbidden. '
        'Operation: %; table: audit_entries.',
        TG_OP;
    RETURN NULL;
END;
$$;
"""

_CREATE_TRIGGER = """\
CREATE TRIGGER enforce_audit_worm
BEFORE UPDATE OR DELETE ON audit_entries
FOR EACH ROW
EXECUTE FUNCTION audit_entries_worm();
"""

# v0.6 placeholder — runs as no-op when legalise_app role does not exist.
# Wrapped in a DO block so it does not error on single-role stacks.
_GRANT_APP_ROLE = """\
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'legalise_app') THEN
        REVOKE UPDATE, DELETE ON audit_entries FROM legalise_app;
    END IF;
END;
$$;
"""

_RESTORE_APP_ROLE = """\
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'legalise_app') THEN
        GRANT UPDATE, DELETE ON audit_entries TO legalise_app;
    END IF;
END;
$$;
"""


def upgrade() -> None:
    # 1. Trigger function
    op.execute(_CREATE_TRIGGER_FN)

    # 2. Trigger on table
    op.execute(_CREATE_TRIGGER)

    # 3. Role-level revoke (no-op on single-role stacks; active after v0.6 ops work)
    op.execute(_GRANT_APP_ROLE)


def downgrade() -> None:
    # Restore UPDATE/DELETE grant if legalise_app role exists
    op.execute(_RESTORE_APP_ROLE)

    # Drop trigger first, then function
    op.execute("DROP TRIGGER IF EXISTS enforce_audit_worm ON audit_entries;")
    op.execute("DROP FUNCTION IF EXISTS audit_entries_worm();")
