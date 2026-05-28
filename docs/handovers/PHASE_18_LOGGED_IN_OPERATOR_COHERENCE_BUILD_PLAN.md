# Phase 18 — Logged-In Operator Coherence Build Plan

**Status:** RATIFIED + BUILT (Steps A–F) on `phase-17-crm-pass`, awaiting Reviewer review before merge to master.
**Branch:** `phase-17-crm-pass`
**Date:** 2026-05-28
**Base context:** Phase 17.5 is live; firm role gates are dormant by default in hosted/eval mode. Module DX (`PHASE_18_G_MODULE_DX_PLAN.md`) is parked behind this product pass unless Reviewer explicitly reorders it.

## Builder close-out (2026-05-28)

All six steps built frontend-first, no substrate touched. Order A→B→C→D→E→F as ratified. Commit-per-step on `phase-17-crm-pass`:

- **A — Route inventory** (`PHASE_18_ROUTE_INVENTORY.md`): 14 routes classified; findings F1–F4. Reviewer steers applied: keep browse/manage separate (F3), hide empty Preferences tab (F4).
- **B — Modules as integrations**: truthful installed/disabled/not-installed badge on ModuleDetail (derived from `listInstalledModules`, no backend); capabilities rendered as a "needs access to" permission summary, not a raw manifest table; InstallCeremony de-leaked + operator framing; GrantsPanel humanised headers/intro, softened the leaky "N row(s) created" (idempotent/no-audit copy kept verbatim — load-bearing).
- **C — Provider clarity**: honest run-mode status ("No key configured" / "Key configured, not tested"), "hosted has no shared key — bring your own", named audit rows, confirm-on-revoke. No fake validity. `POST /settings/keys/{provider}/test` stays a deferred backend gap. Empty Preferences tab hidden from nav (route still resolves).
- **D — Matter action/artifact loop**: matter sub-nav now persists across detail/audit/artifacts/artifact-detail (slug from route) and surfaces an **Artifacts** link (was URL-only); Audit active-state fixed on its own route. Artifact list/detail copy already read as matter outputs + labelled audit links.
- **E — Admin calm-down**: role controls reframed as dormant firm/deployment controls, substrate internals removed; honest self-promotion/no-op facts + `user.role.changed` kept. AdminUsersList already sparse — left as-is.
- **F — Shared primitives**: extracted the one proven duplication — a `DescItem` label/value pair (3 identical local copies) into `ui/primitives`. No speculative library.

**Verification:** focused tests + typecheck per step; close-out full frontend vitest **129 passed / 19 files**, `tsc -b` clean, `npm run build` succeeds. e2e not run locally (the docker stack binds the other checkout) — the `e2e.yml` workflow runs it on merge to master. Acceptance-bar items met in code; an unaided browser walk of the evaluator path is the recommended pre-merge check.

## Objective

Make the signed-in product feel like one coherent operator workspace:

> configure provider keys -> inspect modules -> install/trust -> grant on a matter -> run -> inspect artifact -> inspect audit.

This phase is frontend-first. It should not add substrate unless the UI proves a real missing endpoint.

## Design Diagnosis

The logged-in product now has the right major surfaces, but two design languages are still competing:

- **New IA / CRM-like shell:** `/app`, the matter shell, and the modules catalogue.
- **Older substrate-admin screens:** module detail, install ceremony, admin users, admin audit, and settings.

The problem is not visual taste. The problem is that each page solves layout independently. That makes the app feel assembled rather than systematised.

Phase 18 should make the existing surfaces feel like one calm operator product. Do not redesign the brand. Do not move substrate boundaries. Standardise how logged-in screens explain state, actions, and audit proof.

## Page Contract

Every logged-in page should answer the same four questions in the same rough order:

1. **Where am I?**
   - Page title, route context, matter/module/user identity.
2. **What is the current state?**
   - Installed/enabled/disabled, key configured/not configured, grants present/missing, matter posture, artifact status.
3. **What can I do next?**
   - Install, grant, run, add key, inspect artifact, view audit, change admin setting.
4. **Where is the proof?**
   - Audit row names, reconstruction links, metadata strips, raw IDs as secondary information.

This is the core design rule for Phase 18. If a screen cannot answer those four questions, fix the screen before extracting shared primitives.

## Design Drift To Correct

1. **Page headers drift**
   - Some pages use `Workspace` eyebrow + bold sans heading.
   - Some use serif headings and different max widths.
   - Settings has a separate heading/sidebar pattern.
   - Target: one logged-in page header pattern with eyebrow, h1, explanatory paragraph, optional actions, and metadata strip.

2. **Panel/table/card language drifts**
   - Local `border`, `rounded-md`, padding, and empty-state patterns are close but not identical.
   - Target: repeat the same operator table, section block, action panel, and empty state shapes where they appear twice.

3. **Module setup still exposes substrate first**
   - Module detail leads with manifest fields and capability rows.
   - Install ceremony exposes state-machine language.
   - Grants panel reads partly like database rows.
   - Target: translate to operator language first, keep raw IDs/substrate names as metadata.

4. **Settings undersells BYO-key readiness**
   - The launch-critical question is “can I run real model calls?”
   - Target: provider setup/status is obvious without handholding.

5. **Admin can reintroduce role-gate confusion**
   - Firm roles are dormant for evaluator mode.
   - Target: admin role controls are framed as firm/deployment controls, not launch setup.

6. **Matter actions need a visible spine**
   - The matter page has documents, permissions, actions, artifacts, and audit.
   - Target: evaluator can see the loop: Documents -> Permissions -> Run module -> Artifact -> Audit trail.

7. **Audit is strong but still raw**
   - Keep regulator-grade detail.
   - Target: improve labels and scanability before adding export/grouping.

## Operator Language Rules

Prefer:

- “Model providers” or “Provider keys” over generic “API keys”.
- “This module needs access to…” over raw capability table as the first read.
- “Permissions on this matter” over “grants”.
- “Review permissions” over “ceremony state”.
- “Audit trail” or “reconstruction” over raw source rows.
- “Firm/deployment controls” over role hierarchy language in evaluator paths.

Keep raw substrate terms available in mono metadata where they matter:

- module IDs;
- capability IDs;
- audit action names;
- ceremony state;
- grant IDs only if needed for debugging.

Do not hide truth. Reorder it so operators understand the product before they inspect the substrate.

## Non-Negotiables

- No backend changes without a filed gap and Reviewer approval.
- No role-gate rethink. Firm role gates stay dormant by default; firm-mode remains behind `LEGALISE_FIRM_ROLE_GATES_ENABLED=true`.
- No new visual system.
- No Base44/Pulse Talent migration. Borrow CRM/admin layout grammar only.
- No connector work.
- No async/runtime work.
- No marketing/landing redesign except tiny consistency fixes found during the pass.
- Each substep must leave `npm run typecheck`, `npm test -- --run`, and `npm run build` green in the frontend container.

## Build Order

### Step A — Route Inventory + UI Contract

Create a short inventory doc before changing screens.

Deliverable:

- `docs/handovers/PHASE_18_ROUTE_INVENTORY.md`

For each route, record:

- current purpose;
- user goal;
- API calls;
- rough UI problem;
- classification: keep / copy-only / layout fix / missing endpoint / defer;
- whether route is public, authed, admin, or matter-scoped.

Routes to cover:

- `/app`
- `/matters`
- `/matters/{slug}`
- `/matters/{slug}/artifacts`
- `/matters/{slug}/audit`
- `/modules`
- `/modules/{module_id}`
- `/modules/install/{ceremony_id}`
- `/settings/profile`
- `/settings/keys`
- `/settings/preferences`
- `/admin/users`
- `/admin/users/{id}`
- `/admin/audit`

Acceptance:

- Inventory exists.
- Any backend gap is logged as a finding, not implemented.
- Reviewer can alter Step B/C/D order from the inventory.

### Step B — Module Setup As Integrations

Problem: module setup is the thesis surface, but today it can feel like catalogue rows plus manifest tables plus ceremony states.

Target:

- `/modules` reads like an integrations catalogue.
- `/modules/{module_id}` reads like an integration detail page.
- `/modules/install/{ceremony_id}` reads like a permission review.
- Matter grants read like permissions for this matter.

Likely files:

- `frontend/src/modules-v2/ModulesCatalog.tsx`
- `frontend/src/modules-v2/ModuleDetail.tsx`
- `frontend/src/modules-v2/InstallCeremony.tsx`
- `frontend/src/matter/GrantsPanel.tsx`
- `frontend/src/lib/api.ts` only if existing types need tightening

Concrete changes:

1. **Catalog grouping**
   - Keep suite grouping.
   - Add simple state labels: available / installed / disabled / invalid where current API allows.
   - Do not fake states if data is missing; log a gap.

2. **Module detail**
   - Lead with what the module does.
   - Show capabilities as “needs access to…” rather than raw manifest rows where possible.
   - Keep raw identifiers available in small mono metadata.
   - Admin lifecycle controls should be obvious but not dominate the page.

3. **Trust ceremony**
   - Rename visual sections around operator language:
     - verify publisher;
     - review permissions;
     - enable module.
   - Keep substrate state names visible as metadata, not the page headline.

4. **Matter grants**
   - Explain current grants as permissions on this matter.
   - Group rows by module/capability if possible.
   - Keep idempotent/no-audit copy accurate.
   - Keep Run affordances next to the permission context, but avoid making the panel feel like a row editor.

Acceptance:

- Evaluator can identify whether Contract Review / Pre-Motion is installed and runnable.
- Evaluator can explain what granting does without reading manifest docs.
- No workspace/global capability is offered from the matter grant UI.
- Existing Phase 14 D strict grant/runnable-pair invariant remains.
- Tests cover at least one installed, disabled, not-installed, and grant-success state.

### Step C — Settings / Provider Key Clarity

Problem: BYO provider keys are launch-critical. Settings currently has the mechanics, but the product story is not prominent enough.

Target:

- `/settings/keys` is the obvious place to make real model calls work.
- Users understand keyless/stub/demo versus BYO provider behavior.
- Add/revoke key actions are tied to audit language.

Likely files:

- `frontend/src/auth/Settings.tsx`
- `frontend/src/lib/api.ts`
- maybe `docs/DEMO.md` or `docs/TROUBLESHOOTING.md` if the UI needs a supporting line

Concrete changes:

1. **Settings IA**
   - Make `API keys` read as `Provider keys` or `Model providers` if the route can keep the same path.
   - Add a short top explainer: Legalise does not provide production model access; bring your own provider key.

2. **Provider key list**
   - Make provider rows dense and clear:
     - provider;
     - created;
     - last used if available;
     - revoke action.
   - Do not display secrets after save.

3. **Provider add form**
   - Explain what saving a key enables.
   - Name audit rows if already emitted (`user.key.configured`, `user.key.revoked`).

4. **Provider status/test-call**
   - If an endpoint exists, expose status/test.
   - If no endpoint exists, file a backend gap and do not fake it.

Acceptance:

- Evaluator can find where to add an OpenAI/Anthropic key without being told.
- Settings copy makes clear the hosted site has no production shared key.
- Revoke is clearly destructive and audited.
- No fake provider-health status is rendered.

### Step D — Matter Workspace Action/Artifact Loop

Problem: the matter page is the core product, but actions, grants, artifacts, audit links, and documents can feel like independent widgets.

Target:

- Matter detail feels like a record page.
- Documents remain the lead context.
- Available module actions are clear after permissions are granted.
- New artifacts are easy to find after a run.
- Audit deep-links are present but not noisy.

Likely files:

- `frontend/src/matter/MatterDetail.tsx`
- `frontend/src/matter/MatterRecordSummary.tsx`
- `frontend/src/matter/ArtifactsList.tsx`
- `frontend/src/matter/ArtifactDetail.tsx`
- `frontend/src/matter/InvocationRunner.tsx`
- `frontend/src/matter/ReconstructionView.tsx`
- `frontend/src/matter/tabs/*`

Concrete changes:

1. **Matter summary**
   - Keep the slim record summary, but make next actions clearer:
     - review documents;
     - configure permissions;
     - run module;
     - inspect audit.

2. **Actions and artifacts**
   - After a successful run, link clearly to artifact and audit.
   - Artifact list should read as outputs for this matter, not object storage records.

3. **Audit links**
   - Keep exact deep-links.
   - Label them as audit trail / reconstruction, not raw source rows.

4. **Posture**
   - In dormant role-gate mode, posture should not become role-hierarchy onboarding.
   - C_paused hard stop should remain clear.

Acceptance:

- From a matter page, evaluator can find documents, runnable actions, latest artifacts, and audit without side explanation.
- B_mixed default eval mode does not present a solicitor-hierarchy blocker.
- C_paused remains visible and blocks.
- Existing artifact preview tests still pass; add coverage where UI labels change behavior.

### Step E — Admin/User Calm-Down

Problem: admin pages exist, but they should feel like sparse operator controls, not a place to discover internal role ontology.

Target:

- `/admin/users` and `/admin/users/{id}` are simple, safe, and admin-only.
- Role controls are framed as firm/deployment controls.
- Workspace audit remains reachable.

Likely files:

- `frontend/src/admin/AdminUsersList.tsx`
- `frontend/src/admin/AdminUserDetail.tsx`
- `frontend/src/admin/AdminAuditView.tsx`
- `frontend/src/ui/Sidebar.tsx`
- `frontend/src/app/AppHome.tsx`

Concrete changes:

1. **User list**
   - Keep dense table.
   - Improve empty/filter states if weak.
   - Keep non-admin no-fetch invariant.

2. **User detail**
   - Role form copy should say firm controls / deployment controls.
   - Do not imply role promotion is required for the evaluator path.
   - Same-role/no-op copy must remain honest per prior redline.

3. **Admin audit**
   - Keep workspace audit.
   - Improve labels/tooltips only; no export/grouping in this phase.

Acceptance:

- Non-admins do not call admin endpoints.
- Superuser sees clear, sparse user/admin controls.
- Role controls are visible but not launch-onboarding language.

### Step F — Shared Operator Primitives

Do this last and only extract what Steps B-E prove is duplicated.

Likely files:

- `frontend/src/ui/primitives.tsx`
- selected route components

Candidate primitives:

- `PageHeader`
- `SectionHeader`
- `OperatorTable`
- `MetadataStrip`
- `EmptyState`
- `ActionPanel`

Acceptance:

- At least two screens use any newly extracted primitive.
- No component-library sprawl.
- No visual-system change.
- Do not extract a primitive unless it directly removes duplicated patterns found in Steps B-E.

## Open Questions For Reviewer

1. **Phase sequencing**
   - Is this Phase 18, with Module DX parked behind it?
   - Recommended: yes.

2. **Step order**
   - Approve A -> B -> C -> D -> E -> F?
   - Recommended: yes. Module setup and provider settings are closest to launch comprehension.

3. **Legacy modules surface**
   - Should `frontend/src/modules-page/Modules.tsx` remain, or should all visible module work consolidate on `modules-v2` routes?
   - Recommended: keep public browse if still routed, but avoid two competing module-management surfaces.

4. **Provider test-call**
   - Is there an existing endpoint for provider status/test-call?
   - Recommended: inspect during Step C; if absent, file gap and skip.

5. **Admin role prominence**
   - Should dormant firm roles be shown in admin by default?
   - Recommended: yes, but framed as firm controls, not evaluator setup.

6. **Demo route**
   - Should `/demo` be included in this phase?
   - Recommended: no, except if it contradicts the real signed-in UI. Keep demo coherence as a small copy/layout fix, not a full rebuild.

7. **Audit export/grouping**
   - Include export or grouped decision views now?
   - Recommended: no. This phase improves navigation/readability only.

## Verification

Per substep:

```bash
docker compose -f infra/docker-compose.yml exec -T frontend npm run typecheck
docker compose -f infra/docker-compose.yml exec -T frontend npm test -- --run
docker compose -f infra/docker-compose.yml exec -T frontend npm run build
```

Before close-out:

- Run the evaluator path manually or with Playwright:
  - create/sign in;
  - open Khan;
  - inspect modules;
  - confirm provider-key setup path is obvious;
  - grant/run a module;
  - open artifact;
  - open audit.
- Check no public/logged-in evaluator surface says:
  - join waitlist;
  - qualified solicitor required for default B_mixed evaluator flow;
  - live client matters are supported.

## Handover Line

> Phase 18 should make the logged-in product feel like a coherent operator workspace. Build frontend-first in substeps: route inventory, module setup, settings/provider keys, matter action/artifact loop, admin calm-down, then shared primitives only where duplication proves it. No substrate unless a missing endpoint is filed and approved. Module DX stays parked behind this pass unless Reviewer reorders.
