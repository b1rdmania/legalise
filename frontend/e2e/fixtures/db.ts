/**
 * Phase 15 A — DB reset fixture.
 *
 * Two explicit modes per the v3 plan:
 *
 *   first_run_reset — truly empty app DB. Truncates users +
 *     access_token + every runtime table. No preserved test-runner
 *     user. Used only by the Phase 15 B first-run scenario, which
 *     depends on GET /api/system/bootstrap-state returning
 *     {user_count: 0, has_superuser: false}. No Khan reseed runs
 *     here — the first-run scenario creates its user and Khan
 *     emerges from the dev-autoverify path.
 *
 *   standard_e2e_reset — truncates runtime tables only. Leaves
 *     `users` intact; each test registers / promotes / signs in
 *     through real auth + Phase 11 operator endpoints to produce
 *     the user shape it needs. Module manifests on disk and their
 *     signatures are not touched in either mode.
 *
 * Mechanism: `docker compose exec -T db psql` against the
 * `legalise_test` DB. No new substrate; no new CLI; the psql
 * binary lives in the existing db container.
 */

import { spawn } from "node:child_process";

const COMPOSE_FILE =
  process.env.E2E_COMPOSE_FILE ?? "infra/docker-compose.yml";
const DB_SERVICE = process.env.E2E_DB_SERVICE ?? "db";
const DB_NAME = process.env.E2E_DB_NAME ?? "legalise_test";
const DB_USER = process.env.E2E_DB_USER ?? "legalise";
const COMPOSE_CWD = process.env.E2E_COMPOSE_CWD ?? "..";

// Runtime tables — truncated by both reset modes.
const RUNTIME_TABLES = [
  "matter_artifacts",
  "advice_boundary_decisions",
  "state_machine_transitions",
  "state_machine_instances",
  "workspace_skill_capability_grants",
  "workspace_disabled_skills",
  "installed_modules",
  "user_api_keys",
  "documents",
  "audit_entries",
  "matters",
  "access_token",
] as const;

// first_run_reset also truncates these; standard_e2e_reset leaves
// them alone.
const FIRST_RUN_ONLY_TABLES = ["users"] as const;

async function runPsql(sql: string): Promise<void> {
  // -T disables TTY; -v ON_ERROR_STOP halts on first error so a
  // bad table name produces a real failure instead of a partial
  // truncate.
  const args = [
    "compose",
    "-f",
    COMPOSE_FILE,
    "exec",
    "-T",
    DB_SERVICE,
    "psql",
    "-U",
    DB_USER,
    "-d",
    DB_NAME,
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    sql,
  ];
  await new Promise<void>((resolve, reject) => {
    const proc = spawn("docker", args, { cwd: COMPOSE_CWD });
    let stderr = "";
    proc.stderr.on("data", (b: Buffer) => {
      stderr += b.toString();
    });
    proc.on("error", reject);
    proc.on("exit", (code) => {
      if (code === 0) resolve();
      else
        reject(
          new Error(
            `psql exited ${code} for SQL "${sql.slice(0, 80)}"; stderr=${stderr}`,
          ),
        );
    });
  });
}

function truncateStatement(tables: readonly string[]): string {
  // RESTART IDENTITY resets serial sequences; CASCADE follows FK
  // dependencies so we don't have to topologically sort by hand.
  return `TRUNCATE ${tables.join(", ")} RESTART IDENTITY CASCADE;`;
}

/**
 * Truly empty app DB. Used only by the first-run scenario.
 * Truncates users + access_token + every runtime table; no
 * test-runner user survives.
 */
export async function firstRunReset(): Promise<void> {
  const all = [...RUNTIME_TABLES, ...FIRST_RUN_ONLY_TABLES];
  await runPsql(truncateStatement(all));
}

/**
 * Per-test runtime reset. Leaves `users` intact (and any persistent
 * runner user the test suite creates); each test then registers /
 * promotes through real auth + Phase 11 surfaces.
 */
export async function standardE2eReset(): Promise<void> {
  await runPsql(truncateStatement(RUNTIME_TABLES));
}
