/**
 * Phase 15 A — auth fixtures.
 *
 * All auth flows go through real product / operator surfaces:
 *   - Register: POST /auth/register (fastapi-users).
 *   - Login: POST /auth/login (fastapi-users cookie transport).
 *   - First-admin bootstrap: `python -m app.tools.bootstrap_admin
 *     <email>` via `docker compose exec backend …`. The real Phase
 *     12 CLI; not mocked.
 *   - Later role mutations: POST /api/admin/users/{id}/role from a
 *     real superuser session.
 *
 * No test-only helpers. No direct DB UPDATE for role changes. The
 * plan's "no new substrate or private bypasses" bar applies here.
 */

import { spawn } from "node:child_process";
import type { APIRequestContext, Page } from "@playwright/test";

const COMPOSE_FILE =
  process.env.E2E_COMPOSE_FILE ?? "infra/docker-compose.yml";
const COMPOSE_CWD = process.env.E2E_COMPOSE_CWD ?? "..";
const BACKEND_SERVICE = process.env.E2E_BACKEND_SERVICE ?? "backend";
const BACKEND_BASE =
  process.env.E2E_BACKEND_URL ?? "http://localhost:8000";

export interface RegisteredUser {
  email: string;
  password: string;
}

/**
 * Run the Phase 12 bootstrap-admin CLI inside the backend
 * container. This is the documented operator surface; the e2e
 * suite invokes it the same way an operator would.
 *
 * Returns the CLI's stdout for assertion purposes. Throws if the
 * CLI exits non-zero.
 */
export async function bootstrapAdminViaCli(email: string): Promise<string> {
  const args = [
    "compose",
    "-f",
    COMPOSE_FILE,
    "exec",
    "-T",
    BACKEND_SERVICE,
    "python",
    "-m",
    "app.tools.bootstrap_admin",
    // Phase 12 CLI signature: --email is keyword, not positional.
    // Positional form exits 2 with "usage" — caught by CI run
    // 26507523312.
    "--email",
    email,
  ];
  return new Promise<string>((resolve, reject) => {
    const proc = spawn("docker", args, { cwd: COMPOSE_CWD });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (b: Buffer) => {
      stdout += b.toString();
    });
    proc.stderr.on("data", (b: Buffer) => {
      stderr += b.toString();
    });
    proc.on("error", reject);
    proc.on("exit", (code) => {
      if (code === 0) resolve(stdout);
      else
        reject(
          new Error(
            `bootstrap_admin exited ${code}; stderr=${stderr}; stdout=${stdout}`,
          ),
        );
    });
  });
}

/**
 * Register a fresh user via the real POST /auth/register endpoint.
 * Dev-autoverify is on, so register is sufficient — no email loop
 * required. Returns the (email, password) tuple so subsequent
 * sign-in/operator calls can use it.
 */
export async function registerUser(
  request: APIRequestContext,
  emailPrefix = "p15",
): Promise<RegisteredUser> {
  const email = `${emailPrefix}-${crypto.randomUUID().slice(0, 8)}@example.com`;
  const password = "p15-pwd-2026";
  const resp = await request.post(`${BACKEND_BASE}/auth/register`, {
    data: { email, password },
  });
  if (!resp.ok()) {
    throw new Error(
      `register failed: ${resp.status()} ${await resp.text()}`,
    );
  }
  return { email, password };
}

/**
 * Sign in via the real fastapi-users cookie-transport endpoint.
 * Sets the session cookie on the request context; subsequent
 * requests from the same context are authenticated.
 */
export async function signIn(
  request: APIRequestContext,
  user: RegisteredUser,
): Promise<void> {
  const resp = await request.post(`${BACKEND_BASE}/auth/login`, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    form: { username: user.email, password: user.password },
  });
  if (resp.status() !== 204 && !resp.ok()) {
    throw new Error(
      `signin failed: ${resp.status()} ${await resp.text()}`,
    );
  }
}

/**
 * Browser equivalent — drive the SignIn form via the page so
 * the test exercises the real auth UI and the cookie lands in the
 * browser context (not the API context).
 */
export async function signInViaUi(page: Page, user: RegisteredUser): Promise<void> {
  await page.goto("/auth/signin");
  const email = page.locator('input[name="email"]');
  try {
    await email.waitFor({ state: "visible", timeout: 5_000 });
  } catch (err) {
    const bodyText = ((await page.locator("body").innerText().catch(() => "")) || "")
      .replace(/\s+/g, " ")
      .slice(0, 1000);
    throw new Error(
      `Sign-in form did not render at ${page.url()}; body="${bodyText}"`,
      { cause: err },
    );
  }
  await email.fill(user.email);
  await page.locator('input[name="password"]').fill(user.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  // SignIn navigates to /app on success. The chain is 3 async hops:
  //   1. POST /auth/login (cookie set)
  //   2. AuthProvider.refresh() re-fetches /auth/users/me
  //   3. useEffect on auth.user fires navigate("/app")
  // CI machines run slower than local; 5s was too tight (first
  // real e2e run at 8d704b7 timed out here on every signInViaUi
  // caller). 15s gives the chain comfortable headroom without
  // inflating happy-path runtime.
  await page.waitForURL(/\/app(\b|$)/, { timeout: 15_000 });
}

/**
 * Promote a target user to a non-default role via the real Phase 11
 * admin endpoint. Caller is the (already-signed-in) superuser
 * request context. Substrate emits `user.role.changed`.
 */
export async function changeRoleAsAdmin(
  adminRequest: APIRequestContext,
  targetUserId: string,
  role: "solicitor" | "qualified_solicitor" | "workspace_admin",
): Promise<void> {
  const resp = await adminRequest.post(
    `${BACKEND_BASE}/api/admin/users/${encodeURIComponent(targetUserId)}/role`,
    { data: { role } },
  );
  if (!resp.ok()) {
    throw new Error(
      `role change failed: ${resp.status()} ${await resp.text()}`,
    );
  }
}

/**
 * Helper for fetching `/auth/users/me` on a logged-in request
 * context. Mostly used for getting the current user's id so admin
 * calls can target it.
 */
export async function whoami(
  request: APIRequestContext,
): Promise<{ id: string; email: string; is_superuser: boolean; role: string }> {
  const resp = await request.get(`${BACKEND_BASE}/auth/users/me`);
  if (!resp.ok()) {
    throw new Error(`whoami failed: ${resp.status()} ${await resp.text()}`);
  }
  return resp.json();
}
