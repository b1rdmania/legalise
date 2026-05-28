# Phase 18 — Builder Response to the Operator Coherence Brief

**Status:** Builder reply to `PHASE_18_LOGGED_IN_OPERATOR_COHERENCE_BRIEF.md`. For Reviewer redline before any build.
**Branch:** `phase-17-crm-pass`
**Date:** 2026-05-28
**Method:** grounded in a full route + API inventory of the current tree (not speculation). Disagreements with the brief's recommendations are marked **[DIVERGE]**.

## Two facts that change the framing

1. **Module setup is already half-built.** `/modules` already routes to `modules-v2/ModulesCatalog` (the public catalog from Phase 17-IA-C), and `ModuleDetail` + `InstallCeremony` are real, routed components (`frontend/src/router/index.tsx`). The legacy `modules-page/Modules.tsx` is **not mounted on any route** (router comment confirms "retained for reference"). So Scope §1 is a *polish + state-legibility* pass, not a greenfield build.
2. **`/demo` already uses the real matter shell.** `demo/DemoMatter.tsx` imports the same `MatterNav` / `MatterBreadcrumb` / `RightRailAssistant` + the real tab system, fed by a static `DEMO_SNAPSHOT` with zero backend calls. There is **no divergent old shell** to reconcile (Q5's worry is already resolved). Only copy hygiene remains, and the open-eval CTA consolidation already landed.

## Open-question answers

**Q1 — Phase number/sequencing.** Agree: call this **Phase 18**, move "Module DX" behind it. This pass *is* the next product work and the module surfaces are central to it, so folding Module DX in (rather than running a parallel phase) avoids two agents touching `modules-v2/` at once.

**Q2 — Route priority.** Agree module setup is first, with one change. **[DIVERGE]**: pair the provider **"can I run real calls?" status** immediately after (18-B), not last. Rationale: the evaluator loop's *run* step is inert without a key, and an evaluator on the keyless/demo model today gets zero signal about which mode they're in. The status piece is tiny and frontend-only (see Q3), so it's cheap insurance for the headline loop. Admin calm-down genuinely is last.

**Q3 — Settings/provider gap.** Confirmed empirically: `backend/app/api/settings.py` exposes only `GET/POST/DELETE /settings/keys` (CRUD). `UserApiKeyRead` returns `provider / created_at / last_used_at` — **no `configured` / `valid` / `tested` field, and no test-call endpoint.** Recommendation, two layers:
  - **Now (frontend-only, no backend):** derive a *configured vs not-configured* state per provider from the existing `listApiKeys()` response (provider row present = key on file) and surface "You can run real model calls" vs "Running on the keyless demo model — add a key to use your own provider." This is honest: presence ≠ validity, so the copy says *configured*, never *valid*.
  - **Deferred (filed backend gap):** a real `POST /settings/keys/{provider}/test` that does a minimal provider round-trip to confirm the key works. **Do not fake this.** File it as a substrate gap (it touches provider clients + audit) and keep it out of this frontend-first pass per the Non-Goals.

**Q4 — Admin roles visibility.** Agree: keep visible to superusers, framed as deployment/firm controls. Note it's *already* non-prominent — role mutation lives only on `AdminUserDetail`, not in the list. So this is copy framing ("Firm role controls — for self-hosted deployments that enforce role gates; not required for evaluation") plus a pointer to Phase 17.5 dormancy, not new UI.

**Q5 — Demo route.** Agree keep static — and note (per fact #2 above) it already shares the real IA, so there is nothing to de-fork. Copy hygiene only; treat as part of 18-A's modules/landing copy sweep, not its own substep.

**Q6 — Shared primitives timing.** Agree: extract after the second duplicate, no component-library phase. Concretely, `ui/primitives.tsx` today has `Badge / StatusBadge / EmptyState / ErrorCallout / LoadingLine / Field` but **no `PageHeader`, `Card`, or `Table`**. The first two extraction candidates will almost certainly be a `PageHeader` (h1+p+actions, hand-rolled on every screen) and a dense table row — I expect both to surface during 18-C. I'll extract them then, not before.

**Q7 — Audit UX depth.** Agree: navigation/linking/readability only; defer export + grouped-decision views. Leverage what exists — `ArtifactDetail` already deep-links to `/matters/{slug}/audit?invocation_id=<id>`. The 18-C work is making that path *discoverable after a run*, not rebuilding the audit view.

**Q8 — Acceptance bar.** Agree with all five. Add one, from Q3: **an evaluator can tell whether they're running on the keyless demo model or their own provider key, without being told.**

## Route inventory marking

| Route | Component | Mark |
|---|---|---|
| `/app` | AppHome | keep (rebuilt 17-IA-D) — light copy only |
| `/matters` | MatterList | keep / copy-only |
| `/matters/$slug` | MatterDetail + MatterRecordSummary | layout-IA (action→artifact discoverability) |
| `/matters/$slug/artifacts` | ArtifactsList | layout-IA (post-run discoverability, empty state) |
| `/matters/$slug/artifacts/$id` | ArtifactDetail/Preview | keep / light |
| `/matters/$slug/audit` | ReconstructionView | copy + readability only |
| `/modules` | ModulesCatalog | layout-IA (install/disabled/broken/update states) |
| `/modules/$id` | ModuleDetail | layout-IA (does-what / capabilities / trust / install-revoke) |
| `/modules/install/$ceremonyId` | InstallCeremony | layout-IA + copy (permission review, not state-machine) |
| `/settings/keys` | Settings(keys) | layout-IA + derived can-I-run status (frontend) + **file backend test-call gap** |
| `/settings/profile` | Settings(profile) | keep |
| `/settings/preferences` | Settings(preferences) | defer (empty placeholder — hide tab until it has content) |
| `/admin/users` `/admin/users/$id` `/admin/audit` | Admin* | copy-only (frame roles as deployment controls) |
| `/demo`, `/demo/$tab` | DemoMatter | copy hygiene only (already shares real shell) |

## Proposed substep order

Each substep is independently reviewable, frontend-first, no substrate unless a gap is proven and Reviewer-approved.

- **18-A — Module setup as integrations.** Catalog state legibility (installed / disabled / available / broken / update-required); ModuleDetail as "what it does + capabilities needed + trust/signature + install/update/revoke"; InstallCeremony reads as a permission review; matter-level `GrantsPanel` reads as "permissions for this matter," not DB rows. (Thesis surface; directly drives the evaluator loop.)
- **18-B — Settings/provider clarity.** Derived configured/not-configured status + honest BYO copy ("keyless demo" vs "your provider"); group account/security calmly. File the `POST /settings/keys/{provider}/test` backend gap (deferred, not built here).
- **18-C — Matter workspace action→artifact→audit loop.** Make available actions clear after grants; make artifacts findable after a run; surface the existing artifact→audit deep-link. Extract `PageHeader` + table-row primitives here *if* the second duplicate appears.
- **18-D — Admin calm-down.** Copy framing for role controls as deployment controls; make workspace audit discoverable without a raw-log feel.

**Non-goals carried verbatim from the brief:** no new substrate unless a real missing endpoint is proven; no backend changes without a filed gap + Reviewer approval; no role-gate rethink (Phase 17.5 owns dormancy); no connector / async / streaming work; no marketing redesign beyond copy; no Base44/Pulse migration; no new visual identity or token system.

## One open question back to Reviewer

The only proposed substrate touch in this whole pass is the **deferred** `POST /settings/keys/{provider}/test` gap (Q3). Do you want it (a) filed-and-deferred as I propose, (b) pulled forward into 18-B as an explicit backend substep with its own redline, or (c) dropped entirely in favour of the frontend-only configured/not-configured signal? My recommendation is (a).
