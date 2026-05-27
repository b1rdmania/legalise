/**
 * Phase 15 A — DB reset fixture.
 *
 * Single reset path that truncates everything app-side (users +
 * access_token + every runtime table). Module manifests on disk
 * and their signatures are not touched.
 *
 * Why one path and not the two-mode split the v3 plan proposed:
 * the split was supposed to make standard tests fast by leaving
 * `users` intact. But several specs need to re-run the Phase 12
 * bootstrap CLI between tests. The substrate's "superuser already
 * exists" guard turns those into order-dependent failures if
 * `users` survives. Truncating users everywhere is substrate-
 * truthful; e2e performance impact is negligible.
 *
 * Backward-compatible aliases (`firstRunReset`, `standardE2eReset`)
 * are kept so the spec files don't need touching; both point at
 * the same underlying truncation.
 *
 * Mechanism: `docker compose exec -T db psql` against the
 * `legalise_test` DB. The CI workflow creates that DB explicitly
 * and overrides the backend service's POSTGRES_DSN to match, so
 * the running app + alembic + reset all hit the same target. No
 * new substrate; no new CLI.
 */

import { spawn } from "node:child_process";

const COMPOSE_FILE =
  process.env.E2E_COMPOSE_FILE ?? "infra/docker-compose.yml";
const DB_SERVICE = process.env.E2E_DB_SERVICE ?? "db";
const DB_NAME = process.env.E2E_DB_NAME ?? "legalise_test";
const DB_USER = process.env.E2E_DB_USER ?? "legalise";
const COMPOSE_CWD = process.env.E2E_COMPOSE_CWD ?? "..";

// App-side tables truncated by every reset. Order doesn't matter
// because CASCADE follows FK dependencies; RESTART IDENTITY resets
// serial sequences.
const APP_TABLES = [
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
  "users",
] as const;

async function runPsql(sql: string): Promise<void> {
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

/**
 * Truncate every app-side table including users + access_token.
 * Module manifests on disk and their signatures are not touched.
 */
export async function resetDb(): Promise<void> {
  await runPsql(`TRUNCATE ${APP_TABLES.join(", ")} RESTART IDENTITY CASCADE;`);
}

// Back-compat aliases for the v1 plan's reset-mode names. Both
// resolve to the same underlying truncation; the two-mode split
// retired with the P1 #2 redline.
export const firstRunReset = resetDb;
export const standardE2eReset = resetDb;
