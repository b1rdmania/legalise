/**
 * Golden-loop e2e — TEST_SLIM_ORDER_2026-06-12 Phase 0.
 *
 * The flow on the landing page, walked through the real UI:
 *
 *   signup → create matter → upload document → grant a governed skill →
 *   run the skill from Chat → sign the output → Activity shows
 *   `output.signed` → export the working pack.
 *
 * Discovery notes (where the order asked for them):
 *
 * - `output.signed` is emitted by `create_signoff` in
 *   backend/app/core/signoff.py (SIGNOFF_ACTION_BY_DECISION). Its audit
 *   payload carries: signoff_id, artifact_id, invocation_id,
 *   artifact_hash, kind, decision, reasoning, and `signer_is_author`
 *   (computed against the artifact's created_by_id). The field the
 *   order names EXISTS — asserted hard below.
 *
 * - This is intentionally no longer stitched across Khan + a second
 *   sign-off matter. The acceptance contract is one evaluator matter
 *   carrying the document upload, skill invocation, output artifact,
 *   sign-off row, Activity row, and export job. CI uses the real
 *   keyless `stub-echo` provider because provider keys are not
 *   available in Actions; BYO-key frontier-provider runs remain a
 *   manual private-beta gate.
 *
 * Acceptance hook: the sign step is a HARD assertion — the UI walks
 * /matters/:slug/artifacts/:id/sign (SignOff.tsx → POST
 * /api/matters/:slug/signoffs) and the test then requires the
 * `output.signed` audit row. Killing the sign-off route fails this
 * spec.
 */

import { test, expect } from "@playwright/test";
import { firstRunReset } from "./fixtures/db";
import { registerUser, signIn, signInViaUi } from "./fixtures/auth";
import {
  createMatter,
  expectMatterAuditRow,
  grantCapability,
  uploadTextDocument,
} from "./fixtures/api";

const KEYLESS_MODEL = "stub-echo";
// Seeded workspace-wide by the Khan demo seed (backend/app/core/demo_loop.py).
const DEMO_MODULE_ID = "demo.guided-skill";
const DEMO_CAPABILITY_ID = "summarise";
const BACKEND = process.env.E2E_BACKEND_URL ?? "http://localhost:8000";

test.beforeEach(async () => {
  await firstRunReset();
});

test("golden loop: create matter → upload doc → run skill → sign-off → Activity → export", async ({
  page,
  request,
}) => {
  // ---------------------------------------------------------------
  // 1. Signup. Dev-autoverify still seeds Khan, but this acceptance
  //    gate creates its own matter so the proof is not stitched across
  //    demo fixtures.
  // ---------------------------------------------------------------
  const user = await registerUser(request, "golden-loop");
  await signInViaUi(page, user);
  await signIn(request, user);

  // ---------------------------------------------------------------
  // 2. Create one evaluator matter, upload one document through the
  //    real multipart endpoint, and grant one governed skill on that
  //    same matter.
  // ---------------------------------------------------------------
  const matter = await createMatter(request, {
    title: "Golden loop evaluator matter",
    default_model_id: KEYLESS_MODEL,
    privilege_posture: "A_cleared",
  });
  await expectMatterAuditRow(request, matter.slug, "matter.create");
  await grantCapability(request, matter.slug, {
    module_id: DEMO_MODULE_ID,
    capability_id: DEMO_CAPABILITY_ID,
  });
  await uploadTextDocument(request, matter.slug, {
    filename: "golden-loop-note.txt",
    body:
      "Golden loop fixture note. The employee was dismissed after raising " +
      "a grievance. No prior disciplinary record exists. The dismissal " +
      "letter cites the social-media policy.",
  });
  await expectMatterAuditRow(request, matter.slug, "document.upload");
  await expectMatterAuditRow(request, matter.slug, "document.text_extracted");

  // ---------------------------------------------------------------
  // 3. Run the granted demo skill from the real chat Skills popover.
  // ---------------------------------------------------------------
  await page.goto(`/matters/${matter.slug}/assistant`);
  await expect(page.getByTestId("chat-led-workspace")).toBeVisible({
    timeout: 15_000,
  });
  await page.getByTestId("chat-skills-toggle").click();
  await page
    .getByTestId(`chat-runner-skill-${DEMO_MODULE_ID}-${DEMO_CAPABILITY_ID}`)
    .click();
  const runner = page.getByTestId(
    `generic-runner-${DEMO_MODULE_ID}-${DEMO_CAPABILITY_ID}`,
  );
  await expect(runner).toBeVisible();
  await page
    .getByTestId(`generic-run-${DEMO_MODULE_ID}-${DEMO_CAPABILITY_ID}`)
    .click();

  // stub-echo answers deterministically; the run writes one artifact.
  const result = page.getByTestId("generic-runner-result");
  await expect(result).toBeVisible({ timeout: 30_000 });
  await expect(result.getByText(/Output written/i)).toBeVisible();
  await expectMatterAuditRow(request, matter.slug, "module.capability.invoked");
  await expectMatterAuditRow(request, matter.slug, "module.capability.completed");

  // ---------------------------------------------------------------
  // 4. Sign-off through the UI. "Review & sign" routes to
  //    /matters/:slug/artifacts/:id/sign (SignOff.tsx). Affirm review,
  //    sign, land on the confirmation record.
  // ---------------------------------------------------------------
  await result.getByRole("link", { name: "Review & sign" }).click();
  await page.waitForURL(/\/artifacts\/[0-9a-f-]+\/sign(\b|$)/, {
    timeout: 15_000,
  });
  await expect(page.getByTestId("signoff-artifact")).toBeVisible();
  await page.getByTestId("signoff-affirm").check();
  await page.getByTestId("signoff-submit").click();
  await page.waitForURL(/\/signoffs\/[0-9a-f-]+(\b|$)/, { timeout: 15_000 });
  const record = page.getByTestId("signoff-record");
  await expect(record).toBeVisible();
  await expect(record.getByText("Signed in Legalise")).toBeVisible();
  // Author self-signed is labelled, never hidden.
  await expect(record.getByText(/Author — self-signed/)).toBeVisible();

  // ---------------------------------------------------------------
  // 5. Activity shows output.signed with signer_is_author: true.
  //    Substrate first (reconstruction payload), then the UI Activity
  //    deep link renders the decision row.
  // ---------------------------------------------------------------
  const signedRow = await expectMatterAuditRow(
    request,
    matter.slug,
    "output.signed",
  );
  expect(signedRow.payload.signer_is_author).toBe(true);
  expect(signedRow.payload.decision).toBe("signed");
  expect(typeof signedRow.payload.artifact_hash).toBe("string");

  await page.goto(`/matters/${matter.slug}/audit?action=output.signed`);
  await expect(page.getByText("Output signed").first()).toBeVisible({
    timeout: 15_000,
  });

  // ---------------------------------------------------------------
  // 6. Working-pack export starts and records the expected governance
  //    rows on the same matter. The worker owns completion; this test
  //    polls the real job endpoint and then confirms Activity.
  // ---------------------------------------------------------------
  await page.goto(`/matters/${matter.slug}/lifecycle`);
  await expect(page.getByTestId("start-export")).toBeVisible({ timeout: 15_000 });
  const [exportResp] = await Promise.all([
    page.waitForResponse(
      (resp) =>
        resp.url().includes(`/api/matters/${matter.slug}/export`) &&
        resp.request().method() === "POST",
    ),
    page.getByTestId("start-export").click(),
  ]);
  expect(exportResp.ok()).toBe(true);
  const exportJob = await exportResp.json();
  const jobId = String(exportJob.id);
  expect(jobId).toMatch(/[0-9a-f-]{36}/);
  await expect(page.getByTestId("export-status")).toBeVisible();

  let status = "queued";
  for (let i = 0; i < 40; i += 1) {
    const resp = await request.get(
      `${BACKEND}/api/matters/${encodeURIComponent(matter.slug)}/jobs/${jobId}`,
    );
    expect(resp.ok()).toBe(true);
    const body = await resp.json();
    status = body.status;
    if (status === "succeeded") break;
    if (status === "failed" || status === "cancelled") {
      throw new Error(`export job ${jobId} ended ${status}: ${body.error_message ?? ""}`);
    }
    await page.waitForTimeout(1000);
  }
  expect(status).toBe("succeeded");

  await expectMatterAuditRow(request, matter.slug, "module.export.job.completed");
  await page.goto(`/matters/${matter.slug}/audit?action=module.export.job.completed`);
  await expect(page.getByText("Working pack ready").first()).toBeVisible({
    timeout: 15_000,
  });
});
