/**
 * Golden-loop e2e — TEST_SLIM_ORDER_2026-06-12 Phase 0.
 *
 * The flow on the landing page, walked through the real UI:
 *
 *   signup → seeded Khan matter → chat is the default surface →
 *   deterministic summary prompt (keyless) → output row renders →
 *   Sources pane lists the cited document → skill run → sign-off →
 *   Activity shows `output.signed` with `signer_is_author: true`.
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
 * - Divergence from the order's single-matter narrative, on purpose:
 *   the deterministic chat summary (the keyless fallback in
 *   backend/app/modules/assistant/pipeline.py) persists an
 *   AssistantMessage, NOT a MatterArtifact — only prompt-runtime skill
 *   runs (backend/app/core/prompt_runtime.py `write_artifact`) produce
 *   signable outputs. And the seeded Khan matter pins
 *   `default_model_id="claude-opus-4-7"` (backend/app/core/seed.py),
 *   whose provider is always registered as keyed, so a keyless skill
 *   run on Khan raises provider_key_missing — that same key-missing is
 *   exactly what triggers Khan's deterministic chat summary. The
 *   sign-off leg therefore runs on a stub-echo matter created through
 *   the same real surfaces first-run.spec.ts uses (POST /api/matters
 *   with default_model_id, the Phase 7 grants endpoint, the real
 *   multipart document upload), with the skill run and the sign click
 *   both driven through the UI.
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

const KHAN_SLUG = "khan-v-acme-trading-2026";
const KEYLESS_MODEL = "stub-echo";
// Seeded workspace-wide by the Khan demo seed (backend/app/core/demo_loop.py).
const DEMO_MODULE_ID = "demo.guided-skill";
const DEMO_CAPABILITY_ID = "summarise";

test.beforeEach(async () => {
  await firstRunReset();
});

test("golden loop: signup → Khan chat → deterministic summary + sources → skill run → sign-off → output.signed", async ({
  page,
  request,
}) => {
  // ---------------------------------------------------------------
  // 1. Signup. Dev-autoverify seeds the Khan matter inline
  //    (auth.user.demo_seeded lands matter-scoped on Khan).
  // ---------------------------------------------------------------
  const user = await registerUser(request, "golden-loop");
  await signInViaUi(page, user);
  await signIn(request, user);
  await expectMatterAuditRow(request, KHAN_SLUG, "auth.user.demo_seeded");

  // ---------------------------------------------------------------
  // 2. Bare /matters/:slug now lands on Documents (the most important
  //    view). The golden loop runs in Chat, so navigate there.
  // ---------------------------------------------------------------
  await page.goto(`/matters/${KHAN_SLUG}/assistant`);
  await expect(page.getByTestId("chat-led-workspace")).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByTestId("chat-composer-input")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Khan v Acme Trading Ltd" }),
  ).toBeVisible();

  // ---------------------------------------------------------------
  // 3. Deterministic summary prompt. The user has no provider key and
  //    Khan's default model is keyed, so the assistant answers via the
  //    keyless deterministic document-summary fallback (honestly
  //    labelled "extract, no model") citing [doc:<witness statement>].
  // ---------------------------------------------------------------
  await page
    .getByTestId("chat-composer-input")
    .fill("Summarise the witness statement");
  await page.getByTestId("chat-composer-send").click();

  // The assistant reply renders the summary lead line…
  await expect(
    page.getByText("Summary of witness-statement-khan.docx").first(),
  ).toBeVisible({ timeout: 30_000 });
  // …honestly labelled as the no-model extract path…
  await expect(page.getByText(/extract, no model/i)).toBeVisible();
  // …and the output row renders beneath it.
  const outputRow = page.getByTestId("assistant-output-row");
  await expect(outputRow).toBeVisible();

  // ---------------------------------------------------------------
  // 4. Sources pane lists the cited document.
  // ---------------------------------------------------------------
  await outputRow.getByRole("button", { name: "Sources" }).click();
  const sourcesPane = page.getByTestId("assistant-work-pane-sources");
  await expect(sourcesPane).toBeVisible();
  await expect(sourcesPane.getByText("witness-statement-khan.docx")).toBeVisible();
  await sourcesPane.getByRole("button", { name: "Close" }).click();

  // The deterministic turn is audited on the matter timeline.
  await expectMatterAuditRow(request, KHAN_SLUG, "module.assistant.message");

  // ---------------------------------------------------------------
  // 5. Signable output. Only prompt-runtime skill runs write
  //    matter artifacts, and a keyless run needs a stub-echo matter
  //    (see header comment for why Khan can't host this leg).
  //    Prerequisites go through real substrate endpoints, as in
  //    first-run.spec.ts; the run + sign happen in the UI.
  // ---------------------------------------------------------------
  const signMatter = await createMatter(request, {
    title: "Golden loop sign-off target",
    default_model_id: KEYLESS_MODEL,
    privilege_posture: "A_cleared",
  });
  await grantCapability(request, signMatter.slug, {
    module_id: DEMO_MODULE_ID,
    capability_id: DEMO_CAPABILITY_ID,
  });
  await uploadTextDocument(request, signMatter.slug, {
    filename: "golden-loop-note.txt",
    body:
      "Golden loop fixture note. The employee was dismissed after raising " +
      "a grievance. No prior disciplinary record exists. The dismissal " +
      "letter cites the social-media policy.",
  });

  // Chat is the default surface here too; run the granted demo skill
  // from the chat Skills popover.
  await page.goto(`/matters/${signMatter.slug}`);
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

  // ---------------------------------------------------------------
  // 6. Sign-off through the UI. "Review & sign" routes to
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
  // 7. Activity shows output.signed with signer_is_author: true.
  //    Substrate first (reconstruction payload), then the UI Activity
  //    deep link renders the decision row.
  // ---------------------------------------------------------------
  const signedRow = await expectMatterAuditRow(
    request,
    signMatter.slug,
    "output.signed",
  );
  expect(signedRow.payload.signer_is_author).toBe(true);
  expect(signedRow.payload.decision).toBe("signed");
  expect(typeof signedRow.payload.artifact_hash).toBe("string");

  await page.goto(`/matters/${signMatter.slug}/audit?action=output.signed`);
  await expect(page.getByText("Output signed").first()).toBeVisible({
    timeout: 15_000,
  });
});
