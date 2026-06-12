-- WORM audit role split — canonical bootstrap (R2 hardening item #7).
--
-- The deployed stack runs a single Postgres role today; the trigger in
-- migration 0011 (`enforce_audit_worm`) is the live guarantee. This file is
-- the *second* belt-and-braces layer: a database-role split so the
-- application role physically lacks UPDATE/DELETE on audit_entries, and a
-- separate migration role does the schema work.
--
-- Two layers, independently sufficient:
--   1. Trigger  → raises "append-only ..." on UPDATE/DELETE (any role).
--   2. REVOKE   → the app role gets "permission denied" *before* the trigger
--                 even runs. Holds even if a future migration drops the trigger.
--
-- Idempotent: safe to re-run. Roles are created only if absent; grants are
-- declarative. Run as a Postgres superuser (Neon: the project owner role).
--
-- Passwords: this script does NOT set them. Create the roles with LOGIN +
-- password out of band (psql \password, or Neon console), or pass them in:
--   psql -v app_pw="'...'" -v migrate_pw="'...'" -f infra/postgres-roles.sql
-- The DO blocks below only ALTER passwords when the :app_pw / :migrate_pw
-- vars are supplied, so the file stays secret-free for source control.

\set ON_ERROR_STOP on

-- Target database name. Defaults to the production name (`legalise`); CI
-- points it at its own service DB:
--   psql -v dbname=legalise_test -f infra/postgres-roles.sql
\if :{?dbname}
\else
    \set dbname legalise
\endif

-- ---------------------------------------------------------------------------
-- 1. Roles (created LOGIN-less if they don't exist; password set separately).
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'legalise_app') THEN
        CREATE ROLE legalise_app WITH LOGIN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'legalise_migrate') THEN
        CREATE ROLE legalise_migrate WITH LOGIN;
    END IF;
END;
$$;

-- Optional password assignment (only when invoked with -v app_pw / migrate_pw).
\if :{?app_pw}
    ALTER ROLE legalise_app WITH PASSWORD :app_pw;
\endif
\if :{?migrate_pw}
    ALTER ROLE legalise_migrate WITH PASSWORD :migrate_pw;
\endif

-- ---------------------------------------------------------------------------
-- 2. Migration role — full DDL/DML authority (used only by `alembic upgrade`).
-- ---------------------------------------------------------------------------
GRANT CONNECT ON DATABASE :"dbname" TO legalise_migrate;
GRANT ALL ON SCHEMA public TO legalise_migrate;
GRANT ALL ON ALL TABLES IN SCHEMA public TO legalise_migrate;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO legalise_migrate;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT ALL ON TABLES TO legalise_migrate;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT ALL ON SEQUENCES TO legalise_migrate;

-- ---------------------------------------------------------------------------
-- 3. App role — read/write everywhere EXCEPT mutation of audit_entries.
-- ---------------------------------------------------------------------------
GRANT CONNECT ON DATABASE :"dbname" TO legalise_app;
GRANT USAGE ON SCHEMA public TO legalise_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO legalise_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO legalise_app;
-- Future tables created by legalise_migrate must auto-grant to the app role,
-- otherwise the app loses access the next time a migration adds a table.
ALTER DEFAULT PRIVILEGES FOR ROLE legalise_migrate IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO legalise_app;
ALTER DEFAULT PRIVILEGES FOR ROLE legalise_migrate IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO legalise_app;

-- The whole point: the app role may APPEND audit rows but never mutate them.
-- This REVOKE targets the existing audit_entries table specifically. If a
-- future migration ever drops and recreates audit_entries, that migration is
-- responsible for re-applying this REVOKE (the trigger in 0011 is recreated
-- the same way) — default privileges deliberately are NOT used here, because
-- a blanket future-table revoke would also strip mutation from every new
-- non-audit table.
REVOKE UPDATE, DELETE ON audit_entries FROM legalise_app;
