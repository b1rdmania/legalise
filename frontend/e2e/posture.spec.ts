/**
 * Phase 15 D — posture matrix.
 *
 * For each cell of (actor role × matter posture) per
 * docs/spec/POSTURE_GATE_UX.md: banner content + deep-link
 * behaviour. The matrix is the load-bearing UX contract.
 *
 * All role mutations go through the real Phase 11 admin endpoint
 * from a signed-in superuser. All posture mutations go through
 * the real PATCH /api/matters/{slug}/privilege.
 */

import { test, expect, Page, APIRequestContext } from "@playwright/test";
import { standardE2eReset } from "./fixtures/db";
import {
  bootstrapAdminViaCli,
  changeRoleAsAdmin,
  registerUser,
  signIn,
  signInViaUi,
  whoami,
} from "./fixtures/auth";
import {
  createMatter,
  setMatterPrivilege,
  type Matter,
} from "./fixtures/api";

const BACKEND = process.env.E2E_BACKEND_URL ?? "http://localhost:8000";

async function setupAdminPlusTargetUser(
  page: Page,
  request: APIRequestContext,
  targetRole: "solicitor" | "qualified_solicitor" | "workspace_admin",
): Promise<{ matter: Matter; targetUserId: string }> {
  // Admin = first registered user, promoted via real CLI.
  const admin = await registerUser(request, "p15d-admin");
  await bootstrapAdminViaCli(admin.email);
  await signIn(request, admin);

  // Target = second registered user; admin promotes via Phase 11
  // endpoint (real product surface; no DB UPDATE).
  const target = await registerUser(request, "p15d-target");
  // Need target's id: temporarily sign in as target to call /me.
  await signIn(request, target);
  const targetMe = await whoami(request);
  // Switch back to admin context for the role change.
  await signIn(request, admin);
  await changeRoleAsAdmin(request, targetMe.id, targetRole);

  // Sign back in as the target so the browser context observes
  // the new role.
  await signIn(request, target);
  await signInViaUi(page, target);

  // Each test creates its own matter so posture mutations don't
  // pollute the shared Khan seed.
  const matter = await createMatter(request, {
    title: `Phase 15 D posture target (${targetRole})`,
    default_model_id: "stub-echo",
    privilege_posture: "A_cleared",
  });

  return { matter, targetUserId: targetMe.id };
}

test.beforeEach(async () => {
  await standardE2eReset();
});

// ---------------------------------------------------------------------------
// A_cleared: silent for every role.
// ---------------------------------------------------------------------------

test("A_cleared: solicitor sees no posture banner", async ({ page, request }) => {
  const { matter } = await setupAdminPlusTargetUser(
    page,
    request,
    "solicitor",
  );
  await page.goto(`/matters/${matter.slug}`);
  await expect(page.getByTestId("posture-banner")).toHaveCount(0);
});

test("A_cleared: qualified_solicitor sees no posture banner", async ({
  page,
  request,
}) => {
  const { matter } = await setupAdminPlusTargetUser(
    page,
    request,
    "qualified_solicitor",
  );
  await page.goto(`/matters/${matter.slug}`);
  await expect(page.getByTestId("posture-banner")).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// B_mixed: banner unless role === qualified_solicitor. Substrate truth:
// is_superuser does NOT bypass posture. Phase 14 C P1 invariant.
// ---------------------------------------------------------------------------

test("B_mixed: solicitor sees the banner with required role + actor role", async ({
  page,
  request,
}) => {
  const { matter } = await setupAdminPlusTargetUser(page, request, "solicitor");
  await setMatterPrivilege(request, matter.slug, "B_mixed");
  await page.goto(`/matters/${matter.slug}`);

  await expect(page.getByTestId("posture-banner")).toBeVisible();
  await expect(
    page.getByText(/only qualified solicitors can run skills/i),
  ).toBeVisible();
  // Role tokens render as display words in banner copy (WI-5.1):
  // "qualified solicitor", never the raw substrate enum.
  await expect(
    page.getByText(/requires the qualified solicitor role/i),
  ).toBeVisible();
  const bodyText = (await page.textContent("body")) ?? "";
  expect(bodyText).toMatch(/Your role: solicitor\./);
  expect(bodyText).not.toContain("qualified_solicitor");
});

test("B_mixed: qualified_solicitor sees no banner", async ({
  page,
  request,
}) => {
  const { matter } = await setupAdminPlusTargetUser(
    page,
    request,
    "qualified_solicitor",
  );
  await setMatterPrivilege(request, matter.slug, "B_mixed");
  await page.goto(`/matters/${matter.slug}`);
  await expect(page.getByTestId("posture-banner")).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// C_paused: always renders, even for admins.
// ---------------------------------------------------------------------------

test("C_paused: solicitor sees the paused banner", async ({ page, request }) => {
  const { matter } = await setupAdminPlusTargetUser(page, request, "solicitor");
  await setMatterPrivilege(request, matter.slug, "C_paused");
  await page.goto(`/matters/${matter.slug}`);

  await expect(page.getByTestId("posture-banner")).toBeVisible();
  await expect(page.getByText(/paused on this matter/i)).toBeVisible();
});

test("C_paused: qualified_solicitor sees the same paused banner", async ({
  page,
  request,
}) => {
  const { matter } = await setupAdminPlusTargetUser(
    page,
    request,
    "qualified_solicitor",
  );
  await setMatterPrivilege(request, matter.slug, "C_paused");
  await page.goto(`/matters/${matter.slug}`);
  await expect(page.getByTestId("posture-banner")).toBeVisible();
  await expect(page.getByText(/paused on this matter/i)).toBeVisible();
});

// ---------------------------------------------------------------------------
// Admin pause/resume toggle — superuser pauses an active matter, then
// resumes it (C_paused → B_mixed) via the inline toggle.
// ---------------------------------------------------------------------------

test("admin pause/resume toggle: pause from the B_mixed banner, resume from the paused banner", async ({
  page,
  request,
}) => {
  // Admin registers + promotes self via CLI.
  const admin = await registerUser(request, "p15d-admin-flip");
  await bootstrapAdminViaCli(admin.email);
  await signIn(request, admin);
  await signInViaUi(page, admin);

  const matter = await createMatter(request, {
    title: "Phase 15 D admin posture flip",
    default_model_id: "stub-echo",
    privilege_posture: "B_mixed",
  });

  await page.goto(`/matters/${matter.slug}`);
  // Admin's role is "solicitor" by default (substrate doesn't auto-
  // promote role on bootstrap; is_superuser is the only flip). So
  // the B_mixed banner DOES render — per the Phase 14 C P1
  // invariant, is_superuser doesn't satisfy posture. The toggle IS
  // visible because the viewer is a superuser.
  await expect(page.getByTestId("posture-banner")).toBeVisible();
  await expect(page.getByTestId("change-posture-control")).toBeVisible();

  // Pause AI on this matter → C_paused banner.
  await expect(page.getByTestId("change-posture-submit")).toHaveText(
    /pause ai on this matter/i,
  );
  await page.getByTestId("change-posture-submit").click();
  await expect(page.getByText(/paused on this matter/i)).toBeVisible();

  // Resume AI → back to B_mixed; paused copy gone, role banner back.
  await expect(page.getByTestId("change-posture-submit")).toHaveText(
    /resume ai/i,
  );
  await page.getByTestId("change-posture-submit").click();
  await expect(page.getByText(/paused on this matter/i)).toHaveCount(0);
  await expect(
    page.getByText(/only qualified solicitors can run skills/i),
  ).toBeVisible();
});

// posture_gate.check.blocked end-to-end is filed in the matrix as
// pytest-covered. The previous draft of this spec used a
// nonexistent module/capability for the invoke attempt, which
// caused the substrate to reject at capability-not-declared
// BEFORE the posture gate — so no posture_gate.check.blocked
// row ever landed and the test was lying. Producing the row
// from an end-to-end UI flow requires installing a module +
// granting a capability + posture mismatch on the same matter;
// that scenario is not staged in the e2e env yet. Substrate-
// side the row is pinned by backend/tests/test_phase8_posture_gate*.py.
