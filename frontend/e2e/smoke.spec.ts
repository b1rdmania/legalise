/**
 * Phase 15 A — fixture smoke.
 *
 * One end-to-end exercise that proves the harness works before the
 * real scenarios land in B/C/D/E. Hits every fixture surface:
 *
 *   - standard_e2e_reset truncates cleanly
 *   - registerUser via real /auth/register
 *   - signInViaUi via the real SignIn form
 *   - whoami via real /auth/users/me
 *   - getBootstrapState via /api/system/bootstrap-state
 *   - expectMatterAuditRow reads matter reconstruction
 *
 * If this spec passes, the scaffolding is wired. Real coverage
 * comes in B/C/D/E.
 */

import { test, expect } from "@playwright/test";
import { standardE2eReset } from "./fixtures/db";
import {
  registerUser,
  signInViaUi,
  whoami,
} from "./fixtures/auth";
import {
  expectMatterAuditRow,
  getBootstrapState,
} from "./fixtures/api";

test.beforeEach(async () => {
  await standardE2eReset();
});

test("scaffolding smoke: register → signin → bootstrap-state visible → first matter audited", async ({
  page,
  request,
}) => {
  // Register a user via the real /auth/register endpoint. Dev-
  // autoverify is on; the user is immediately usable.
  const user = await registerUser(request, "p15-smoke");

  // Sign in through the real SignIn form. The cookie lands in the
  // browser context; subsequent page.goto navigations are authed.
  await signInViaUi(page, user);

  // /auth/users/me responds with the registered identity.
  // Note: request context cookies are separate from page cookies;
  // sign in via the request context too so the helper works.
  const req2 = await request.post("http://localhost:8000/auth/login", {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    form: { username: user.email, password: user.password },
  });
  expect(req2.status() === 204 || req2.ok()).toBe(true);
  const me = await whoami(request);
  expect(me.email).toBe(user.email);
  expect(me.is_superuser).toBe(false);

  // bootstrap-state has at least one user now.
  const boot = await getBootstrapState(request);
  expect(boot.user_count).toBeGreaterThanOrEqual(1);

  // Dev-autoverify seeded Khan for this user. Reconstruction over
  // the matter should surface the demo-seeded audit row.
  const row = await expectMatterAuditRow(
    request,
    "khan-v-acme-trading-2026",
    "auth.user.demo_seeded",
  );
  expect(row.action).toBe("auth.user.demo_seeded");
});
