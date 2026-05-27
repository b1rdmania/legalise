/**
 * Phase 15 E — failure paths via real surfaces.
 *
 * Covers the InvocationRunner / InstallCeremony / GrantsPanel
 * banner taxonomies that can be produced through documented
 * product + operator endpoints. Each test drives the UI to
 * surface the banner where practical; pure-substrate envelope
 * checks (which the v1 plan slipped into) are explicitly NOT in
 * Phase 15 E — pytest already pins the substrate envelopes for
 * every error code the API exposes.
 *
 * Phase1Blocked + ProviderUpstreamError are not-coverable-yet
 * (matrix 15-#2 / 15-#3); the matter `model.call.error` row and
 * the advice-boundary blocked/denied/failed rows are pytest-
 * covered.
 */

import { test, expect } from "@playwright/test";
import { resetDb } from "./fixtures/db";
import {
  bootstrapAdminViaCli,
  registerUser,
  signIn,
  signInViaUi,
} from "./fixtures/auth";
import {
  createMatter,
  expectWorkspaceAuditRow,
} from "./fixtures/api";

const BACKEND = process.env.E2E_BACKEND_URL ?? "http://localhost:8000";

test.beforeEach(async () => {
  await resetDb();
});

// ---------------------------------------------------------------------------
// GrantsPanel — 404 module_not_installed banner via the UI form
// ---------------------------------------------------------------------------

test("GrantsPanel: clicking Grant for a not-installed module surfaces the 404 banner in the UI", async ({
  page,
  request,
}) => {
  const user = await registerUser(request, "p15e-notinst");
  await signIn(request, user);
  await signInViaUi(page, user);
  const matter = await createMatter(request, {
    title: "p15e not-installed",
    default_model_id: "stub-echo",
  });

  // Find a discovered module that is NOT yet installed. The v2
  // catalog lists discovered manifests regardless of install state.
  const catalog = await request.get(`${BACKEND}/api/modules/v2`);
  const body = (await catalog.json()) as {
    modules: Array<{
      module_id: string;
      is_valid: boolean;
      manifest: Record<string, unknown>;
    }>;
  };
  const candidate = body.modules.find(
    (m) =>
      m.is_valid &&
      Array.isArray((m.manifest as Record<string, unknown>).capabilities) &&
      ((m.manifest as Record<string, unknown>).capabilities as Array<{
        scope?: string;
      }>).some((c) => c.scope === "matter"),
  );
  test.skip(candidate === undefined, "no candidate module discovered in e2e env");

  // Drive the GrantsPanel form on the matter page.
  await page.goto(`/matters/${matter.slug}`);
  await expect(page.getByText(/Grant a capability/i)).toBeVisible();
  await page
    .getByTestId("posture-banner")
    .first()
    .isVisible()
    .catch(() => {
      // posture A_cleared → no banner; fine
    });
  await page.getByLabel(/Module/i).selectOption(candidate!.module_id);
  // Pick the first matter-scope capability.
  const caps = (candidate!.manifest as Record<string, unknown>)
    .capabilities as Array<{ id?: string; capability_id?: string; scope?: string }>;
  const matterCap = caps.find((c) => c.scope === "matter");
  const capId = (matterCap?.id ?? matterCap?.capability_id) as string;
  await page.getByLabel(/Capability/i).selectOption(capId);
  await page.getByRole("button", { name: /^Grant$/ }).click();

  // The Phase 14 C banner names the module and points at /modules.
  await expect(page.getByText(/not installed on this workspace/i)).toBeVisible();
  await expect(page.getByText(candidate!.module_id)).toBeVisible();
});

// ---------------------------------------------------------------------------
// GrantsPanel — 409 module_disabled banner via the UI (after admin revoke)
// ---------------------------------------------------------------------------

test("GrantsPanel: clicking Grant for a revoked module surfaces the 409 banner in the UI", async ({
  page,
  request,
}) => {
  const admin = await registerUser(request, "p15e-disab-admin");
  await bootstrapAdminViaCli(admin.email);
  await signIn(request, admin);
  await signInViaUi(page, admin);

  const catalog = await request.get(`${BACKEND}/api/modules/v2`);
  const body = (await catalog.json()) as {
    modules: Array<{ module_id: string; manifest: Record<string, unknown> }>;
  };
  const candidate = body.modules.find(
    (m) =>
      Array.isArray((m.manifest as Record<string, unknown>).capabilities) &&
      ((m.manifest as Record<string, unknown>).capabilities as Array<{
        scope?: string;
      }>).some((c) => c.scope === "matter"),
  );
  test.skip(candidate === undefined, "no candidate module in e2e env");

  // Drive the trust ceremony to ENABLED through real endpoints.
  const start = await request.post(`${BACKEND}/api/modules/install`, {
    data: { source: "registry", module_id: candidate!.module_id },
  });
  let ceremony = await start.json();
  for (let i = 0; i < 16 && !ceremony.is_terminal; i++) {
    const action = ceremony.state === "granted" ? "grant" : "trust";
    const advance = await request.post(
      `${BACKEND}/api/modules/install/${ceremony.ceremony_id}/advance`,
      { data: { action } },
    );
    ceremony = await advance.json();
  }
  expect(ceremony.state).toBe("enabled");

  // Revoke via the real admin endpoint. Substrate emits module.disabled.
  const revoke = await request.post(
    `${BACKEND}/api/modules/${candidate!.module_id}/revoke`,
  );
  expect(revoke.ok()).toBe(true);
  await expectWorkspaceAuditRow(request, "module.disabled");

  // Now drive the GrantsPanel form on a fresh matter.
  const matter = await createMatter(request, {
    title: "p15e disabled-grant",
    default_model_id: "stub-echo",
  });
  await page.goto(`/matters/${matter.slug}`);
  await expect(page.getByText(/Grant a capability/i)).toBeVisible();
  await page.getByLabel(/Module/i).selectOption(candidate!.module_id);
  const caps = (candidate!.manifest as Record<string, unknown>)
    .capabilities as Array<{ id?: string; capability_id?: string; scope?: string }>;
  const matterCap = caps.find((c) => c.scope === "matter");
  const capId = (matterCap?.id ?? matterCap?.capability_id) as string;
  await page.getByLabel(/Capability/i).selectOption(capId);
  await page.getByRole("button", { name: /^Grant$/ }).click();

  // The Phase 14 C 409 banner names the module + the substrate's
  // "installed but currently disabled" copy.
  await expect(page.getByText(/installed but currently disabled/i)).toBeVisible();
});

// ---------------------------------------------------------------------------
// InstallCeremony — 409 invalid-transition banner via the UI
// ---------------------------------------------------------------------------

test("InstallCeremony: clicking Grant+enable on a fresh ceremony surfaces the 409 banner in the UI", async ({
  page,
  request,
}) => {
  const admin = await registerUser(request, "p15e-409-admin");
  await bootstrapAdminViaCli(admin.email);
  await signIn(request, admin);
  await signInViaUi(page, admin);

  const catalog = await request.get(`${BACKEND}/api/modules/v2`);
  const body = (await catalog.json()) as {
    modules: Array<{ module_id: string }>;
  };
  test.skip(body.modules.length === 0, "no modules discovered in e2e env");
  const moduleId = body.modules[0].module_id;

  // Start the ceremony via the real endpoint; navigate the
  // browser to the stepper.
  const start = await request.post(`${BACKEND}/api/modules/install`, {
    data: { source: "registry", module_id: moduleId },
  });
  expect(start.status()).toBe(201);
  const ceremony = await start.json();
  await page.goto(`/modules/install/${ceremony.ceremony_id}`);

  // Click Grant+enable on a freshly-discovered ceremony — the
  // substrate's R2 P1 fix rejects with 409 and emits
  // module.ceremony.rejected.
  await expect(page.getByText("Grant + enable")).toBeVisible();
  await page.getByText("Grant + enable").click();

  // The Phase 14 B banner names the substrate audit row + carries
  // the action-only deep-link Phase 14.5 C restored.
  await expect(page.getByText(/invalid ceremony transition/i)).toBeVisible();
  await expect(page.getByText(/module\.ceremony\.rejected/)).toBeVisible();
  const auditLink = page.getByRole("link", { name: /workspace audit/i });
  await expect(auditLink).toBeVisible();
  const href = await auditLink.getAttribute("href");
  expect(href).toBe("/admin/audit?action=module.ceremony.rejected");

  // Substrate row landed too.
  await expectWorkspaceAuditRow(request, "module.ceremony.rejected");

  // Following the deep-link reaches the workspace-audit page with
  // the filter active.
  await auditLink.click();
  await expect(page).toHaveURL(/\/admin\/audit\?action=module\.ceremony\.rejected/);
  await expect(page.getByText("action=")).toBeVisible();
});
