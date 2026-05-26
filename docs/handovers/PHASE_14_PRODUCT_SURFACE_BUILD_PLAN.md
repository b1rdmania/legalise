# Phase 14 — Product Surface Build Plan

**Phase entry conditions (all met):**
- Phase 13b ratified at `f318640` — substrate has zero open backend gaps for the documented surfaces.
- `docs/spec/AUDIT_EMISSION_MAP.md` v3 and `docs/spec/BACKEND_GAP_AUDIT.md` v3 are stable.
- Twelve journey docs at `docs/spec/journeys/00…12` are the canonical UX brief.
- `docs/spec/ACCEPTANCE.md` is the bar.

**Goal:** ship the **authenticated app surface** so a fresh evaluator can complete Andy's four acceptance criteria without leaving the UI:

1. Registered → run a module → view its reconstruction trail.
2. No direct DB manipulation.
3. No curl-only step except first-admin bootstrap CLI.
4. No unsupported marketing claim.

**Stack (locked):** Vite + React 19 + TanStack Router + TanStack Query + Tailwind. Already in `frontend/`. Phase 14 does NOT migrate routers or rebuild auth; it extends the existing surface and closes the missing pages.

## Architectural discipline

Lifted verbatim from `ACCEPTANCE.md` §11–§15:

- **No hidden failures.** Posture / grant / capability denials always render a structured banner. Never silently no-op.
- **No smuggled authority.** The substrate enforces; the UI MUST NOT pretend a capability is available.
- **No bypassed audit.** Every documented action lands the documented audit row.
- **No diverged vocabulary.** Roles, postures, audit action names, BlockedReason enum values — verbatim from substrate.
- **No claim-without-ship.** In-app copy reflects what's actually live.

**Out of scope for Phase 14:**
- Marketing landing site (`legalise.dev`) — already shipped; not touched.
- No new substrate concepts. No new audit actions. No new endpoints. If a surface needs something the substrate doesn't expose, the surface is deferred — not silently invented.
- No translation layers over substrate vocabulary.
- Playwright / equivalent end-to-end coverage — that's Phase 15+ per ACCEPTANCE.md §15-coverage. Phase 14 ships pixels + audit-emission integration tests per surface.

## What already exists in `frontend/`

Surveyed before drafting:

- Custom hash-based router at `src/lib/route.ts` (≈10 named routes). Phase 14 sub-step F migrates to TanStack Router with path-based routes per `PAGE_MAP.md` so deep-links work.
- Auth screens (`src/auth/`): SignIn, SignUp, ForgotPassword, ResetPassword, Verify, VerifyPending, Settings. Already wired against `/auth/*` endpoints.
- Matter surface (`src/matter/`): MatterList, MatterDetail, NewMatter, tabs, PrivilegeControl, CprGateBanner, breadcrumb. Substantial but pre-spec — needs alignment with journey docs.
- Modules catalog (`src/modules/`, `src/modules-page/`) — basic shell only; no detail page, no install ceremony flow.
- Landing / manifesto / waitlist pages — marketing surfaces, untouched by Phase 14.

**Reuse posture:** prefer extending existing components over rewrites. The rewrite bar is "does not match the spec AND a one-line edit cannot bring it in line." Each sub-step's acceptance lists which existing components it touches.

## Sub-phase ledger

Seven sub-steps. Sequential dependency: F lands the router migration, so anything that adds new routes lands after F. Each sub-step is self-contained, each ships green tests + a Reviewer ratification cycle.

### Phase 14 A — Bootstrap-state + first-run shell (~1 day)

**Surfaces:** `/app`, `/auth/register` (first-run mode), Journey 00.

**Builds:**
- `BootstrapStateProvider` (or query) hitting `GET /api/system/bootstrap-state`. No auth required.
- `/app` home: post-login lands here. Shows recent matters + "Open Khan v Acme" CTA.
- First-run branch on `/app`: if `user_count === 0`, render the Journey 00 §1 empty state ("No accounts yet. The first user becomes the workspace administrator.") with the "Register first account" CTA → `/auth/register`. Secondary anchor "Read the open-core README" → external (already-shipped marketing).
- Existing landing page (`legalise.dev`) is unaffected; this is the **in-app** first-run, hit when you log into a fresh fork.

**Test bar:**
- Integration: with `user_count=0`, `/app` renders the empty state. After register completes, `/app` renders the authenticated home.
- Audit: no extra rows beyond the existing `auth.user.registered`.

**Acceptance vs ACCEPTANCE.md:** §9 (first-run experience matches Journey 00).

### Phase 14 B — Module catalog + detail + install ceremony (~2.5 days)

**Surfaces:** `/modules`, `/modules/{module_id}`, `/modules/install/{ceremony_id}`. Journeys 05 + 06.

**Builds:**
- `/modules`: extend existing catalog page. Call `GET /api/modules/v2` (per `PAGE_MAP.md`); render installed-vs-available state per module.
- `/modules/{module_id}`: new. Render manifest + capabilities table + permissions card + "Install" CTA. Call `GET /api/modules/v2/{module_id}`. If already installed, render version + "Update / Revoke" controls (those endpoints already verified at Phase 13b D).
- `/modules/install/{ceremony_id}`: new. The trust ceremony stepper.
  - State machine driven by `GET /api/modules/install/{ceremony_id}` response.
  - Step-per-state: discovered → manifest_inspected → signature_checked → publisher_checked → permissions_reviewed → grant → ENABLED (per Phase 6 / `trust_ceremony.py:451-462`).
  - Advance via `POST .../advance {action:"trust"|"grant"|"reject"}`.
  - Reject path → `module.denied` audit + return to `/modules`.
  - Invalid transition → 409 banner with `module.ceremony.rejected` deep-link to reconstruction (Phase 14 E lands the reconstruction view).
- Module update + revoke wired from `/modules/{module_id}` (admin-only buttons). `module.updated` + `module.disabled` rows verified.

**Test bar:**
- Integration: install flow walks the full state machine, no DB. Reject path produces `module.denied`. Invalid transition produces 409 + `module.ceremony.rejected`.
- Audit: every transition lands the documented row from `AUDIT_EMISSION_MAP.md` §Modules.

**Acceptance vs ACCEPTANCE.md:** §5 (Journey 05 + 06 achievable through UI).

### Phase 14 C — Grants on matter + posture banner (~1.5 days)

**Surfaces:** `/matters/{slug}` (grants panel + posture banner). Journeys 04 + 07. Cross-cutting posture work per `POSTURE_GATE_UX.md`.

**Builds:**
- Extend `MatterDetail`: add a Grants panel rendering `GET /api/matters/{slug}/grants`, with per-installed-module "Enable on this matter" / "Disable" controls hitting POST/DELETE `/api/matters/{slug}/grants`.
- Posture banner component, shared. Reads `matter.privilege_posture` (A_cleared / B_mixed / C_paused), renders per `POSTURE_GATE_UX.md` cell that matches `(role, posture)`. Banner has a "View in audit trail" link → reconstruction filtered to `posture_gate.check.blocked`.
- `CprGateBanner` already exists — audit it against `POSTURE_GATE_UX.md` and either align or replace.

**Test bar:**
- Integration: enable + disable produce `module.grant.created` + `module.grant.revoked` rows. Idempotent re-enable produces no row.
- Posture: a `solicitor` opening a `B_mixed` matter sees the structured banner; clicking deep-links to reconstruction.

**Acceptance vs ACCEPTANCE.md:** §7 (posture-gate visible + actionable).

### Phase 14 D — Invocation + artifacts (~2 days)

**Surfaces:** matter-workspace "Run" CTA, `/matters/{slug}/artifacts`, `/matters/{slug}/artifacts/{id}`. Journeys 08 + 09 + 10.

**Builds:**
- "Run" control on matter workspace: for each installed-and-granted capability, a primary CTA. Posts to `POST /api/matters/{slug}/invocations` with the capability id + inputs.
- Invocation result panel: while pending, show spinner + capability + invocation id. On success, render structured output (motion_draft markdown, evidence_list table, claim_summary card per Journey 09).
- Failure surfaces: posture block → banner per Phase 14 C; capability denied → structured banner + reconstruction deep-link; provider-key-missing → banner → `/settings/keys` deep-link.
- `/matters/{slug}/artifacts`: list page hitting `GET /api/matters/{slug}/artifacts`. Sortable by created_at desc (default).
- `/matters/{slug}/artifacts/{id}`: detail page hitting `GET /api/matters/{slug}/artifacts/{id}`. Renders parsed payload by `kind`: `motion_draft` → markdown + claim_summary card; `evidence_list` → table with document deep-links. Phase 13b Decision #1 honoured — no audit row on read.
- "See audit trail for this invocation" link from artifact detail → `/matters/{slug}/audit?invocation_id=…`.

**Test bar:**
- Integration: full Contract Review run; `module.capability.invoked` + `model.call` + `module.capability.completed` rows land. Artifact list shows the run; detail shows parsed payload.
- Failure-path integration: posture block → banner + correct deep-link.

**Acceptance vs ACCEPTANCE.md:** §1 (registered → run → reconstruction), §11 (no hidden failures).

### Phase 14 E — Reconstruction view (~2 days)

**Surfaces:** `/matters/{slug}/audit`. Journey 11. The deep-link target for every banner across the app.

**Builds:**
- Reconstruction page hitting `GET /api/matters/{slug}/audit/reconstruction`.
- Filter chips: action (substrate strings verbatim — `module.capability.invoked`, `posture_gate.check.blocked`, etc.), source (`audit` / `state_machine` / `advice_boundary`), actor.
- Query-param plumbing for deep-link entry: `?invocation_id=`, `?action=`, `?from=`. Each banner across the app emits one of these.
- Row expansion: payload JSON pretty-printed; advice_boundary dual-name handled per `AUDIT_EMISSION_MAP.md` §dual-name (rows from both `source` values appear; UI labels them clearly).
- Pagination via cursor.
- "Audit the auditor" — viewing this page emits `audit.reconstruction.viewed` (already substrate-verified).

**Test bar:**
- Integration: every deep-link from earlier sub-steps lands the reconstruction page filtered correctly. `audit.reconstruction.viewed` lands once per page view.
- Vocabulary: filter values + action strings are verbatim substrate strings, no translation.

**Acceptance vs ACCEPTANCE.md:** §8 (reconstruction deep-linkable from every relevant page), §14 (no diverged vocabulary).

### Phase 14 F — Router migration + admin lifecycle (~1.5 days)

**Surfaces:** `/admin/users`, `/admin/users/{id}`. Journey 12. Plus router migration as a precondition.

**Sub-step F.1 — TanStack Router migration:**
- Replace `src/lib/route.ts` hash-based switch with TanStack Router file-based routes.
- Mount all routes from `PAGE_MAP.md` (path-based, not hash-based) — required for the deep-link query params in sub-step E to round-trip cleanly.
- Existing route names map 1:1; `case`/`switch` patterns inside `App.tsx` become route loaders.
- Auth gate: a single `__authed.tsx` layout protects everything except `/auth/*` and the marketing pages.

**Sub-step F.2 — Admin pages:**
- `/admin/users`: list page hitting `GET /api/admin/users` (superuser-only). Filters: role, is_superuser. Rendered as a table; row click → detail.
- `/admin/users/{id}`: detail page hitting `GET /api/admin/users/{id}`. Role-mutation form posting `POST /api/admin/users/{id}/role` with a `reason` field (required by substrate). Self-promote attempt produces the 403 banner.
- Top-nav: "Admin" anchor appears only if `user.is_superuser`.

**Test bar:**
- Integration: every existing surface still works after migration. New admin pages call documented endpoints; `user.role.changed` row lands.
- Idempotent same-role POST produces no row (substrate-verified).

**Acceptance vs ACCEPTANCE.md:** §10 (admin lifecycle coherent through UI).

### Phase 14 G — Settings polish + cross-cutting (~1 day)

**Surfaces:** `/settings`, `/settings/keys`. Journey 03 + cross-cutting top-nav.

**Builds:**
- Settings overview page extends existing; emits no new audit beyond what `app/core/auth.py:on_after_update` covers.
- BYO key page audit: `user.key.configured` (added/rotated) + `user.key.revoked` already substrate-verified; UI just renders the masked-tail + "rotate" / "revoke" controls.
- Top-nav: matters / modules / settings / admin (conditional). Recent-matters list (max 3 per `PAGE_MAP.md` §global state).
- Profile update form: `PATCH /auth/users/me`, `auth.user.profile_updated` row lands; password fields explicitly excluded from `payload.fields_changed`.

**Test bar:**
- Integration: key add/rotate/revoke land their documented rows; key bytes never appear in any audit payload. Profile update lands `auth.user.profile_updated` with passwords elided.

**Acceptance vs ACCEPTANCE.md:** §11 (no hidden failures), §15 (no claim-without-ship — settings copy reflects what's wired).

## Phase 14 cross-cutting requirements

These are NOT sub-step-scoped — every sub-step honours them:

1. **Vocabulary discipline.** Every action string, role string, posture string, BlockedReason value appearing in the UI must be the substrate string. No translation maps. Lint rule (sub-step F lands the linter config): forbid string literals that look like action names outside an enum module that imports from a single substrate-vocabulary file.

2. **Error shape.** Every 4xx/5xx with a structured body renders the body, not a generic message. Banners carry: error code, human message, optional deep-link.

3. **Loading states.** Every fetch has skeleton + error + empty state. No `null →` blank screen.

4. **Audit-emission test per surface.** Every sub-step's integration test verifies the documented row from `AUDIT_EMISSION_MAP.md` lands when the action runs. Mirrors substrate's gap-fill test pattern.

5. **No new endpoints.** If a surface seems to need one, surface the gap as a Phase 14 finding (file in `BACKEND_GAP_AUDIT.md`); do not invent.

6. **Lifecycle: feature-flag escape hatch.** A `VITE_FEATURE_FLAGS` env can short-circuit any one sub-step's new surface to a 404. Lets us ship sub-steps independently to hosted-eval without blocking each other.

## Decisions to lock before build starts

These come back from Reviewer before the first line of code:

| # | Decision | Default | Reviewer call |
| --- | --- | --- | --- |
| 1 | Router: TanStack Router (file-based) vs React Router 6 | TanStack Router — already in `package.json` | confirm |
| 2 | Component primitive: shadcn/ui vs Radix Primitives + hand-built | shadcn/ui — fastest path; Tailwind already in stack | confirm |
| 3 | Reconstruction table virtualisation library | TanStack Table + TanStack Virtual | confirm |
| 4 | Deep-link query params: `?invocation_id=` vs path-segment | query param — preserves `PAGE_MAP.md` route shapes | confirm |
| 5 | Per-sub-step ratification vs single phase-end ratification | per-sub-step (matches Phase 13b cadence) | confirm |
| 6 | New audit rows from the UI side? | none — Phase 13b D is final | confirm |
| 7 | Server-paid model keys ever from the UI side? | never — UI never sees server-paid keys (non-negotiable per memory) | confirm |

## Total estimate

≈ 11.5 days of focused frontend work across seven sub-steps. Each sub-step lands its own Reviewer cycle if decision #5 holds. Phase 14 closes when:

- All seven sub-steps have ratified handovers.
- The cross-cutting acceptance from ACCEPTANCE.md (Andy's four + §5–§10 + §11–§15) holds end-to-end on a fresh fork.
- A walkthrough video (or written transcript) demonstrates the first-run journey wall-clock under 10 minutes.

## What Phase 14 is NOT

- Not Phase 15 — Playwright suites land in Phase 15.
- Not a hosted-eval revamp — `legalise.dev` and `api.legalise.dev` are already live; Phase 14 ships the in-app surface that those hosts serve.
- Not a substrate phase — if a sub-step uncovers a missing endpoint or audit row, that's a finding for `BACKEND_GAP_AUDIT.md`, NOT a unilateral substrate edit.

## Handover convention

Each sub-step lands:
- `docs/handovers/HANDOVER_PHASE_14_<letter>_<name>_DONE.md`
- Updated `BACKEND_GAP_AUDIT.md` if findings surfaced
- Reviewer ratification commit hash recorded

Phase 14 closes with `docs/handovers/HANDOVER_PHASE_14_PRODUCT_SURFACE_DONE.md` summarising all seven and listing any findings that became Phase 14b candidates.
