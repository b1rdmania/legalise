# Phase 18 — Logged-In Operator Coherence Brief

**Status:** planning brief for Builder + Reviewer discussion.  
**Branch:** `phase-17-crm-pass`  
**Date:** 2026-05-28  
**Purpose:** turn the post-Phase-17 KISS backlog into a coherent implementation plan before UI work starts.

## Problem

The governed runtime is now real enough to evaluate:

> create account -> open Khan -> install module -> grant permissions -> run capability -> inspect artifact -> reconstruct audit.

The logged-in product still feels uneven. Admin, settings, modules, grants, artifacts, and matter actions exist, but several screens still read like substrate panels surfaced directly into the UI. The next pass should make the logged-in experience feel like a calm operator workspace rather than a set of backend primitives with buttons.

This is not a request for a new visual system. It is a product-IA and ergonomics pass over the surfaces that matter to a signed-in evaluator or operator.

## Goal

Make the logged-in product coherent enough that a new evaluator can understand the system without handholding:

1. where they are;
2. what is installed;
3. what a module can do;
4. what permissions it has;
5. how to run it;
6. where the output went;
7. how to inspect the audit trail;
8. where to configure account/provider/admin settings.

The target feel is familiar CRM/admin SaaS:

- persistent left navigation;
- dense but legible tables;
- detail pages with tabs;
- integration-style module setup;
- settings/admin as boring operator surfaces;
- audit as an activity timeline with regulator-grade detail.

## Scope

### 1. Module Setup / Module Manager

Current risk: modules expose the thesis, but the workflow can still feel like catalogue rows, manifest details, ceremony states, and grants bolted together.

Desired product shape:

- `/modules` feels like an integrations marketplace/admin page.
- Installed, disabled, available, broken, and update-required states are obvious.
- Module detail explains:
  - what this module does;
  - what capabilities it needs;
  - whether it is installed;
  - trust/signature status;
  - how to install/update/revoke.
- Trust ceremony reads like a permission review, not a state-machine debugger.
- Matter-level grant/revoke reads like permissions for a matter, not database rows.

Potential implementation surfaces:

- `frontend/src/modules-v2/ModulesCatalog.tsx`
- `frontend/src/modules-v2/ModuleDetail.tsx`
- `frontend/src/modules-v2/InstallCeremony.tsx`
- `frontend/src/matter/GrantsPanel.tsx`
- `frontend/src/modules-page/Modules.tsx` if the legacy/public module surface remains in use

### 2. Settings / Provider Keys

Current risk: BYO keys are launch-critical but easy to miss or misunderstand.

Desired product shape:

- Settings makes BYO provider setup obvious.
- Users can understand whether they can run real model calls or only keyless/stub/demo flows.
- Provider key add/revoke has clear audit language.
- Account/security basics are grouped calmly.
- If provider test-call/status exists, expose it. If it does not exist, log a substrate/product gap rather than fake it.

Potential implementation surfaces:

- `frontend/src/auth/Settings.tsx`
- `frontend/src/lib/api.ts` settings-key calls
- docs around provider setup if the UI cannot yet cover everything

### 3. User / Admin Section

Current risk: admin primitives exist, but firm roles are intentionally dormant for the evaluator path. The admin UI must not make role hierarchy feel like a launch prerequisite.

Desired product shape:

- Admin feels sparse and safe.
- User list/detail is useful for an operator, not an invitation to fiddle with substrate.
- Role controls are framed as firm/deployment controls, not required demo setup.
- First-admin/bootstrap story is clear for self-hosters.
- Workspace audit is discoverable from admin without becoming a raw log dump.

Potential implementation surfaces:

- `frontend/src/admin/AdminUsersList.tsx`
- `frontend/src/admin/AdminUserDetail.tsx`
- `frontend/src/admin/AdminAuditView.tsx`
- `frontend/src/app/AppHome.tsx`
- `docs/DEMO.md`, `docs/TROUBLESHOOTING.md`, `docs/LAUNCH_TRUTH.md`

### 4. Matter Workspace Sections

Current risk: the matter page is the core product, but actions, grants, artifacts, audit, documents, assistant, and posture can feel like independent widgets.

Desired product shape:

- Matter detail reads like a record page.
- Documents are the lead context, not buried behind chat.
- Available actions are clear after grants are configured.
- Artifacts/results are easy to find after a run.
- Audit links are present but not noisy.
- Posture is visible but, in evaluator mode, does not become role-hierarchy onboarding.

Potential implementation surfaces:

- `frontend/src/matter/MatterDetail.tsx`
- `frontend/src/matter/MatterRecordSummary.tsx`
- `frontend/src/matter/ArtifactsList.tsx`
- `frontend/src/matter/ArtifactDetail.tsx`
- `frontend/src/matter/ArtifactPreview.tsx`
- `frontend/src/matter/ReconstructionView.tsx`
- `frontend/src/matter/tabs/*`

### 5. Shared Operator Primitives

Current risk: density and tone can drift because each surface solves layout locally.

Desired product shape:

- consistent page header pattern;
- consistent section/card/table rows;
- consistent empty/error/loading states;
- consistent action panels;
- consistent metadata strips;
- no decorative redesign.

Potential implementation surfaces:

- `frontend/src/ui/primitives.tsx`
- `frontend/src/ui/Sidebar.tsx`
- `frontend/src/app/AppShell.tsx`
- selected page components using local duplicated patterns

## Non-Goals

- No new substrate unless the UI exposes a real missing endpoint.
- No backend changes without a filed gap and Reviewer approval.
- No role-gate rethink. Phase 17.5 owns dormant firm role gates.
- No connector work.
- No async/streaming work.
- No marketing/landing redesign beyond copy consistency.
- No Base44/Pulse Talent migration.
- No new visual identity or design-token system.

## Design Principle

> Familiar CRM ergonomics over bespoke UI, without compromising Legalise’s bespoke governance substrate.

Use CRM/admin patterns as interaction grammar:

- left nav;
- record pages;
- integrations pages;
- permissions panels;
- activity timelines;
- settings sections;
- dense tables;
- clear empty states.

Do not copy another repo’s components wholesale. Layout grammar yes; migration no.

## Suggested Planning Process

1. **Inventory current logged-in routes**
   - `/app`
   - `/matters`
   - `/matters/{slug}`
   - `/matters/{slug}/artifacts`
   - `/matters/{slug}/audit`
   - `/modules`
   - `/modules/{module_id}`
   - `/modules/install/{ceremony_id}`
   - `/settings/*`
   - `/admin/users`
   - `/admin/audit`

2. **Mark each route**
   - keep as-is;
   - copy-only fix;
   - layout/IA fix;
   - missing data/API gap;
   - defer.

3. **Choose a narrow implementation order**
   - recommended first: module setup + settings/provider clarity;
   - second: matter workspace action/artifact coherence;
   - third: admin/user calm-down;
   - shared primitives extracted only when the second duplicate pattern appears.

4. **Write one build plan**
   - small substeps;
   - each substep independently reviewable;
   - frontend-first unless a gap is proven.

## Open Questions For Reviewer / Other Agent

1. **Phase number and sequencing**
   - Should this be Phase 18, or should Phase 18 remain Module DX and this become Phase 17.6?
   - Recommendation: if this is the next product work, call it Phase 18 and move Module DX behind it.

2. **Route priority**
   - Which route should be the first build target: module setup, matter workspace, settings, or admin?
   - Recommendation: module setup first, because it is the thesis surface and directly affects the evaluator loop.

3. **Settings/provider gap**
   - Do we already have enough API surface for provider status/test-call, or should the UI only show add/revoke keys for now?
   - Recommendation: do not fake status. If no endpoint exists, record a small backend gap.

4. **Admin roles visibility**
   - With firm role gates dormant, should role controls stay prominent in admin, or be visually framed as advanced firm controls?
   - Recommendation: keep visible to superusers, but frame as deployment controls and avoid suggesting they are needed for the evaluator path.

5. **Demo route**
   - Should `/demo` remain a static unauthenticated marketing demo, or should it be brought closer to the real logged-in IA?
   - Recommendation: keep it static for now, but remove stale copy and avoid a separate old shell that contradicts the real app.

6. **Shared primitives timing**
   - Should shared operator primitives be extracted before screen work, or only after two screens duplicate the same pattern?
   - Recommendation: extract after duplication appears. Do not start with a component-library phase.

7. **Audit UX depth**
   - Should audit polish happen inside this pass, or remain separate?
   - Recommendation: include only navigation/linking/readability improvements needed by module/matter flows. Defer export/grouped-decision views.

8. **Acceptance bar**
   - What proves this pass worked?
   - Recommendation:
     - unaided evaluator can install/grant/run a module from the logged-in UI;
     - evaluator can find provider-key setup without being told;
     - evaluator can find artifacts and audit trail after a run;
     - no route says waitlist or qualified-solicitor hierarchy is required for the default evaluation path;
     - frontend typecheck/test/build green.

## Proposed Handover Line

> Read `docs/handovers/PHASE_18_LOGGED_IN_OPERATOR_COHERENCE_BRIEF.md`. We need a build plan for making the logged-in product feel like a coherent operator workspace: module setup as integrations, settings as BYO provider/account setup, admin as sparse firm controls, and matter pages as record/action/artifact/audit loops. Frontend-first. No substrate unless a missing endpoint is proven. Return with route priority, open-question answers, and a substep implementation plan.

