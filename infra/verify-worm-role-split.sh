#!/usr/bin/env bash
# Verify the WORM audit role-split property (R2 hardening #7) end to end.
#
# Proves two independent guarantees on a production-shaped two-role Postgres:
#   1. legalise_app may INSERT and SELECT audit rows but is REFUSED
#      UPDATE/DELETE at the privilege layer (SQLSTATE 42501) — before the
#      trigger runs.
#   2. A privileged role that bypasses the REVOKE still hits the 0011 trigger
#      ("append-only").
#
# Two modes:
#
#   disposable (default) — self-contained harness. Creates a throwaway DB
#     named legalise_worm_verify with the exact 0011 trigger + role split,
#     runs the checks, drops everything on exit. No app schema or running
#     stack needed. Usage:
#       infra/verify-worm-role-split.sh        # native, local superuser
#       ADMIN_USER=postgres infra/verify-worm-role-split.sh
#
#   existing — verify an ALREADY-PROVISIONED role-split database (the real
#     migrated schema: alembic 0011 trigger + infra/postgres-roles.sql
#     grants). This is what CI runs against its service Postgres. Nothing is
#     created or dropped; one probe audit row is appended (audit_entries is
#     append-only by design, so the probe row stays). Usage:
#       VERIFY_MODE=existing \
#         APP_DSN='postgres://legalise_app:pw@localhost:5432/legalise_test' \
#         ADMIN_DSN='postgres://legalise:pw@localhost:5432/legalise_test' \
#         infra/verify-worm-role-split.sh
#
# Exit code is non-zero if ANY layer fails — in particular, if the app role
# CAN update or delete audit_entries, this script fails.
#
# Requires: psql on PATH.
set -euo pipefail

VERIFY_MODE="${VERIFY_MODE:-disposable}"

fail() { echo "FAIL: $1" >&2; exit 1; }

# ---------------------------------------------------------------------------
# The four checks. Callers must set:
#   PSQL_APP      — psql invocation array connected as legalise_app
#   PSQL_ADMIN_DB — psql invocation array connected as a privileged role,
#                   to the SAME database (ON_ERROR_STOP=1)
# ---------------------------------------------------------------------------
run_checks() {
    echo "==> [1/5] app role INSERT must succeed"
    "${PSQL_APP[@]}" -v ON_ERROR_STOP=1 \
      -c "INSERT INTO audit_entries (id, action, module, payload) VALUES (gen_random_uuid(), 'worm.rolesplit.probe', 'verify', '{}'::jsonb);" \
      >/dev/null 2>&1 || fail "app role could not INSERT (append broken)"
    echo "    ok — append works"

    echo "==> [2/5] app role SELECT must succeed"
    "${PSQL_APP[@]}" -v ON_ERROR_STOP=1 \
      -c "SELECT count(*) FROM audit_entries;" \
      >/dev/null 2>&1 || fail "app role could not SELECT (read broken)"
    echo "    ok — read works"

    echo "==> [3/5] app role UPDATE must be denied with SQLSTATE 42501"
    out=$("${PSQL_APP[@]}" -v ON_ERROR_STOP=0 -c "\set VERBOSITY verbose" -c "UPDATE audit_entries SET action='x';" 2>&1 || true)
    echo "$out" | grep -q "42501" || fail "app UPDATE not blocked by privilege (got: $out)"
    echo "    ok — permission denied (REVOKE layer)"

    echo "==> [4/5] app role DELETE must be denied with SQLSTATE 42501"
    out=$("${PSQL_APP[@]}" -v ON_ERROR_STOP=0 -c "\set VERBOSITY verbose" -c "DELETE FROM audit_entries;" 2>&1 || true)
    echo "$out" | grep -q "42501" || fail "app DELETE not blocked by privilege (got: $out)"
    echo "    ok — permission denied (REVOKE layer)"

    echo "==> [5/5] privileged role (bypasses REVOKE) must still hit the trigger"
    out=$("${PSQL_ADMIN_DB[@]}" -c "UPDATE audit_entries SET action='x';" 2>&1 || true)
    echo "$out" | grep -q "append-only" || fail "trigger did not fire for privileged UPDATE (got: $out)"
    echo "    ok — append-only trigger (belt-and-braces layer)"
}

# ---------------------------------------------------------------------------
# existing mode — verify a provisioned DB (CI path), then exit.
# ---------------------------------------------------------------------------
if [[ "$VERIFY_MODE" == "existing" ]]; then
    : "${APP_DSN:?existing mode needs APP_DSN (legalise_app connection string)}"
    : "${ADMIN_DSN:?existing mode needs ADMIN_DSN (privileged connection string, same DB)}"
    PSQL_APP=(psql "$APP_DSN" -X -q -t -A)
    PSQL_ADMIN_DB=(psql "$ADMIN_DSN" -v ON_ERROR_STOP=1 -X -q)
    echo "==> [setup] existing mode — verifying provisioned role split (no DDL)"
    run_checks
    echo
    echo "PASS: WORM role split verified — both layers independently enforced."
    exit 0
fi

# ---------------------------------------------------------------------------
# disposable mode — self-contained throwaway harness.
# ---------------------------------------------------------------------------
ADMIN_USER="${ADMIN_USER:-$(whoami)}"
ADMIN_HOST="${ADMIN_HOST:-localhost}"
ADMIN_PORT="${ADMIN_PORT:-5432}"
VERIFY_DB="legalise_worm_verify"
PSQL_ADMIN=(psql -h "$ADMIN_HOST" -p "$ADMIN_PORT" -U "$ADMIN_USER" -v ON_ERROR_STOP=1 -X -q)

cleanup() {
    "${PSQL_ADMIN[@]}" -d postgres >/dev/null 2>&1 <<SQL || true
DROP DATABASE IF EXISTS ${VERIFY_DB} WITH (FORCE);
DROP ROLE IF EXISTS legalise_app;
DROP ROLE IF EXISTS legalise_migrate;
SQL
}
trap cleanup EXIT

echo "==> [setup] creating disposable database ${VERIFY_DB} + roles"
cleanup
"${PSQL_ADMIN[@]}" -d postgres <<SQL
CREATE DATABASE ${VERIFY_DB};
SQL

# Build the audit_entries table + the EXACT trigger from migration 0011, then
# apply the role split. We construct the table directly (rather than running
# full alembic) so the harness has no app-schema/asyncpg dependency — the
# property under test is purely the trigger + REVOKE on audit_entries.
"${PSQL_ADMIN[@]}" -d "${VERIFY_DB}" <<SQL
CREATE TABLE audit_entries (
    id uuid PRIMARY KEY,
    timestamp timestamptz NOT NULL DEFAULT now(),
    actor_id uuid, matter_id uuid,
    action text NOT NULL, module text NOT NULL,
    payload jsonb
);
CREATE OR REPLACE FUNCTION audit_entries_worm() RETURNS trigger LANGUAGE plpgsql AS \$\$
BEGIN
    RAISE EXCEPTION 'audit_entries is append-only — UPDATE and DELETE are forbidden. Operation: %; table: audit_entries.', TG_OP;
    RETURN NULL;
END; \$\$;
CREATE TRIGGER enforce_audit_worm BEFORE UPDATE OR DELETE ON audit_entries
    FOR EACH ROW EXECUTE FUNCTION audit_entries_worm();
CREATE ROLE legalise_app WITH LOGIN;
CREATE ROLE legalise_migrate WITH LOGIN;
GRANT CONNECT ON DATABASE ${VERIFY_DB} TO legalise_app;
GRANT USAGE ON SCHEMA public TO legalise_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO legalise_app;
REVOKE UPDATE, DELETE ON audit_entries FROM legalise_app;
SQL

PSQL_APP=(psql -h "$ADMIN_HOST" -p "$ADMIN_PORT" -U legalise_app -d "${VERIFY_DB}" -X -q -t -A)
PSQL_ADMIN_DB=("${PSQL_ADMIN[@]}" -d "${VERIFY_DB}")

run_checks

echo
echo "PASS: WORM role split verified — both layers independently enforced."
