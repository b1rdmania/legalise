/**
 * Phase 15 B — first-run end-to-end.
 *
 * Walks Journey 00 verbatim against the FINAL post-14.5 contracts.
 * Every step asserts the substrate audit row that the audit-map
 * documents. No test-only substrate; no fake provider key; the
 * stub-echo keyless model is opted into via existing operator
 * surfaces (PATCH /auth/users/me default_model_id, POST /api/matters
 * with default_model_id).
 *
 * Wall-clock is NOT a contract here per the v3 plan; the test
 * reports its duration in the trace but doesn't hard-fail.
 */

import { test, expect } from "@playwright/test";
import { firstRunReset } from "./fixtures/db";
import {
  bootstrapAdminViaCli,
  registerUser,
  signIn,
  signInViaUi,
  whoami,
} from "./fixtures/auth";
import {
  createMatter,
  expectMatterAuditRow,
  expectWorkspaceAuditRow,
  getBootstrapState,
  readMatterReconstruction,
  setUserDefaultModel,
} from "./fixtures/api";

const BACKEND = process.env.E2E_BACKEND_URL ?? "http://localhost:8000";
const KEYLESS_MODEL = "stub-echo";

test.beforeEach(async () => {
  // The first-run scenario depends on a truly empty users table.
  await firstRunReset();
});

test("first-run journey: register → bootstrap CLI → auth refresh → install → grant → run → reconstruction", async ({
  page,
  request,
}) => {
  // ---------------------------------------------------------------
  // 1. Fresh DB. /app empty-state renders.
  // ---------------------------------------------------------------
  const initial = await getBootstrapState(request);
  expect(initial.user_count).toBe(0);
  expect(initial.has_superuser).toBe(false);

  await page.goto("/app");
  // Phase 14 A P1 invariant — copy MUST NOT claim registration
  // grants admin. Assert the empty-state heading + absence of
  // admin-promotion language.
  await expect(page.getByText(/No accounts yet/i)).toBeVisible();
  const body = (await page.textContent("body")) ?? "";
  expect(body).not.toMatch(/becomes the workspace administrator/i);
  expect(body).not.toMatch(/first user becomes admin/i);
  expect(body).toMatch(/bootstrap CLI/i);

  // ---------------------------------------------------------------
  // 2. Register first account via the real form. Dev-autoverify is
  //    on, so the chain (registered → verified → demo_seeded →
  //    capabilities_auto_granted) lands inline.
  // ---------------------------------------------------------------
  const user = await registerUser(request, "p15-first-run");
  // Sign the page in via the real UI form so cookies land in the
  // browser context.
  await signInViaUi(page, user);
  // Sign the request context in too so subsequent API helpers
  // share auth.
  await signIn(request, user);

  // Substrate emits the four-row dev-autoverify chain on the
  // user's auto-seeded Khan matter.
  for (const action of [
    "auth.user.registered",
    "auth.user.verified",
    "auth.user.demo_seeded",
    "auth.user.capabilities_auto_granted",
  ]) {
    await expectMatterAuditRow(
      request,
      "khan-v-acme-trading-2026",
      action,
    );
  }

  // ---------------------------------------------------------------
  // 3. /app now shows "Bootstrap admin required" because
  //    user_count > 0 but has_superuser still false.
  // ---------------------------------------------------------------
  await page.goto("/app");
  await expect(
    page.getByText(/Administrator not yet bootstrapped/i),
  ).toBeVisible();
  await expect(
    page.getByText("python -m app.tools.bootstrap_admin <email>"),
  ).toBeVisible();
  await expect(
    page.getByText("backend/app/tools/bootstrap_admin.py"),
  ).toBeVisible();

  // ---------------------------------------------------------------
  // 4. Run the Phase 12 CLI via docker compose exec — real
  //    operator surface, not mocked.
  // ---------------------------------------------------------------
  await bootstrapAdminViaCli(user.email);

  // The CLI emits user.admin.bootstrapped at workspace scope.
  // Need a superuser session to read /admin/audit; the CLI's
  // promotion has already landed, but the browser + request
  // contexts still see the stale pre-promotion identity. Refresh
  // the request context's session by signing in again — this
  // exercises the auth bootstrap path the README documents for
  // post-CLI use.
  await signIn(request, user);
  await expectWorkspaceAuditRow(request, "user.admin.bootstrapped");

  // ---------------------------------------------------------------
  // 5. EXPLICIT AUTH REFRESH. AuthProvider caches the user object;
  //    after a CLI promotion we need a reload so /auth/users/me
  //    refetches and the React context flips is_superuser→true.
  //    Without this the test passes/fails on cache behaviour
  //    rather than product contract.
  // ---------------------------------------------------------------
  await page.reload();
  // After reload AuthProvider re-fetches; /app renders the authed
  // home for a superuser. Verify via whoami too.
  const me = await whoami(request);
  expect(me.is_superuser).toBe(true);
  await page.goto("/app");
  await expect(page.getByRole("heading", { name: /^Home$/ })).toBeVisible();

  // ---------------------------------------------------------------
  // 6. Keyless invocation path. PATCH the user default to
  //    stub-echo, then create a fresh matter that inherits it.
  //    No fake provider key required.
  // ---------------------------------------------------------------
  await setUserDefaultModel(request, KEYLESS_MODEL);
  const matter = await createMatter(request, {
    title: "Phase 15 first-run target",
    default_model_id: KEYLESS_MODEL,
    privilege_posture: "A_cleared",
  });
  expect(matter.default_model_id).toBe(KEYLESS_MODEL);

  // The PATCH emits auth.user.profile_updated; the matter create
  // emits matter.create. Both substrate-verified.
  await expectMatterAuditRow(
    request,
    "khan-v-acme-trading-2026",
    "auth.user.profile_updated",
  );
  await expectMatterAuditRow(request, matter.slug, "matter.create");

  // ---------------------------------------------------------------
  // 7. /modules → Contract Review → Install → drive the trust
  //    ceremony state machine to ENABLED.
  // ---------------------------------------------------------------
  // Find the Contract Review module in the v2 catalog. The
  // ratification fixtures may name it differently per the
  // examples/modules/contract_review/module.json id; query the
  // catalog to be flexible.
  const catalog = await request.get(`${BACKEND}/api/modules/v2`);
  expect(catalog.ok()).toBe(true);
  const catalogBody = (await catalog.json()) as {
    modules: Array<{ module_id: string; manifest: Record<string, unknown> }>;
  };
  const cr = catalogBody.modules.find(
    (m) => m.module_id.includes("contract") || m.module_id.includes("review"),
  );
  // Skip the rest of the journey if Contract Review isn't
  // present — the test environment may not have it installed on
  // disk. Filed as a Phase 15 finding if that's the case.
  test.skip(
    cr === undefined,
    "Contract Review module not discovered; e2e env needs the example modules on disk",
  );
  const moduleId = cr!.module_id;

  // Start the ceremony via the real endpoint, drive it to ENABLED
  // through the same advance calls the UI would issue.
  const ceremonyResp = await request.post(`${BACKEND}/api/modules/install`, {
    data: { source: "registry", module_id: moduleId },
  });
  expect(ceremonyResp.status()).toBe(201);
  let ceremony = await ceremonyResp.json();
  // Drive trust → trust → … → grant until ENABLED.
  let safety = 16;
  while (!ceremony.is_terminal && safety-- > 0) {
    const action = ceremony.state === "granted" ? "grant" : "trust";
    const advance = await request.post(
      `${BACKEND}/api/modules/install/${ceremony.ceremony_id}/advance`,
      { data: { action } },
    );
    if (!advance.ok()) {
      throw new Error(
        `advance ${action} failed at state=${ceremony.state}: ${advance.status()} ${await advance.text()}`,
      );
    }
    ceremony = await advance.json();
  }
  expect(ceremony.state).toBe("enabled");

  // Ceremony rows are workspace-scoped (matter_id IS NULL).
  await expectWorkspaceAuditRow(request, "module.enabled");

  // ---------------------------------------------------------------
  // 8. Grant the Contract Review review capability on the fresh
  //    matter. Substrate emits module.grant.created per required
  //    capability string.
  // ---------------------------------------------------------------
  // Find the review capability id in the manifest.
  const manifest = cr!.manifest as Record<string, unknown>;
  const caps = Array.isArray(manifest.capabilities) ? manifest.capabilities : [];
  const reviewCap = (caps as Array<Record<string, unknown>>).find(
    (c) => c.scope === "matter" && c.kind === "skill",
  );
  test.skip(
    reviewCap === undefined,
    "Contract Review has no matter-scope skill capability",
  );
  const capId = String(reviewCap!.id ?? reviewCap!.capability_id);

  const grantResp = await request.post(
    `${BACKEND}/api/matters/${matter.slug}/grants`,
    { data: { module_id: moduleId, capability_id: capId } },
  );
  expect(grantResp.ok()).toBe(true);
  await expectMatterAuditRow(request, matter.slug, "module.grant.created");

  // ---------------------------------------------------------------
  // 9. Click Run via the UI. Result panel renders deterministically
  //    via stub-echo. Substrate emits module.capability.invoked +
  //    model.call + module.capability.completed (+ advice_boundary
  //    if the capability is gated).
  // ---------------------------------------------------------------
  await page.goto(`/matters/${matter.slug}`);
  const runButton = page.getByTestId(`run-${moduleId}-${capId}`);
  await expect(runButton).toBeVisible({ timeout: 10_000 });
  await runButton.click();
  await expect(page.getByText(/Invocation complete/i)).toBeVisible({
    timeout: 30_000,
  });

  // Pluck the invocation_id from the result panel — exact format
  // varies but it's a UUID rendered in monospace under the header.
  const invocationIdMatch = (
    (await page.textContent("body")) ?? ""
  ).match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
  expect(invocationIdMatch).not.toBeNull();
  const invocationId = invocationIdMatch![0];

  // Substrate-verified rows on the matter timeline.
  await expectMatterAuditRow(request, matter.slug, "module.capability.invoked");
  await expectMatterAuditRow(request, matter.slug, "module.capability.completed");

  // ---------------------------------------------------------------
  // 10. Reconstruction renders the filtered timeline. Substrate
  //     emits audit.reconstruction.viewed with the unified payload
  //     shape (Phase 14.5 A).
  // ---------------------------------------------------------------
  await page.goto(`/matters/${matter.slug}/audit?invocation_id=${invocationId}`);
  await expect(page.getByText("invocation_id=")).toBeVisible();
  await expect(page.getByText(invocationId)).toBeVisible();
  // The viewed row lands on this fetch; reading the page after
  // surfaces it.
  const viewedPage = await readMatterReconstruction(request, matter.slug, {
    action: "audit.reconstruction.viewed",
  });
  const viewed = viewedPage.entries.find(
    (e) => e.action === "audit.reconstruction.viewed",
  );
  expect(viewed).toBeDefined();
  // Phase 14.5 A unified payload shape.
  expect(viewed!.payload.scope).toBe("matter");
  expect(viewed!.payload.matter_id).toBe(matter.id);
});
