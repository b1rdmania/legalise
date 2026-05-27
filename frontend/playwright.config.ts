/**
 * Phase 15 A — Playwright scaffolding.
 *
 * Chromium-only default. No retries: these flows are deterministic
 * against a reset DB, and retrying broken setup triples feedback time.
 * Trace + video on failure for fast bisection. e2e dir lives at
 * `frontend/e2e/`; vitest is unchanged and continues to own
 * `frontend/src/**\/*.test.{ts,tsx}`.
 *
 * Two server modes:
 *   - dev: `npm run dev` (Vite HMR on :3000). Used locally for
 *     fast iteration.
 *   - preview: `npm run preview` (built artefact, port :4173 by
 *     default). Used in CI for production-parity.
 *
 * The plan's discipline is "tests touch the same surfaces an
 * evaluator does." The frontend is just served — no test-only
 * routes, no test-only env flags. Backend runs from the existing
 * docker-compose stack with the test DB DSN; reset helpers in
 * `e2e/fixtures/db.ts` do the per-test cleanup.
 */

import { defineConfig, devices } from "@playwright/test";

const PORT = process.env.E2E_FRONTEND_PORT ?? "3000";
const FRONTEND_URL = process.env.E2E_FRONTEND_URL ?? `http://localhost:${PORT}`;
const CI = !!process.env.CI;

export default defineConfig({
  testDir: "./e2e",
  testMatch: /.*\.spec\.ts$/,
  fullyParallel: false, // tests share a DB; serial keeps reset semantics simple
  forbidOnly: CI,
  retries: 0,
  workers: 1, // single worker — shared backend + shared DB
  reporter: CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: FRONTEND_URL,
    trace: "on-first-retry",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // No webServer block — frontend + backend are expected to be
  // running before `npm run e2e` is invoked. CI wires this in
  // sub-step F. Local devs run docker-compose + `npm run dev` in
  // separate terminals.
});
