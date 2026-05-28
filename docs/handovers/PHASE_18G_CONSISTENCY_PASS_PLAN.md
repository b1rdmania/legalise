# Phase 18-G — Logged-In Consistency Pass (mini-plan)

**Status:** v1 mini-plan for Reviewer redline. Do not build until ratified.
**Branch:** `phase-17-crm-pass`
**Date:** 2026-05-28
**Base context:** Phase 18 A–F is built and **merged to master / deployed** at `ad90e23`. Reviewer's design rules added in `ad90e23` (Design Diagnosis, Page Contract, Design Drift, Operator Language Rules) are the spec for this pass.

## Why this exists

B–F satisfied most of the **Operator Language Rules** already (`Provider keys`, "this module needs access to…", "audit trail/reconstruction", "firm/deployment controls", state badges, raw IDs in mono). What B–F did **not** address are the two *consistency* drift items — and those are exactly what makes the app "feel assembled rather than systematised":

- **Drift #1 — page headers drift.** modules-v2 detail / install ceremony / artifact pages use `font-serif` h1 + `max-w-3xl`; the new IA shell (`/app`, matters, sidebar) and admin use bold-sans `tracking-tight2`; Settings has its own heading+sidebar pattern. No single logged-in header pattern exists.
- **Drift #2 — panel/table/empty-state shapes drift.** Local `border` / `rounded-md` / padding / empty-state copy are close but not identical across ArtifactsList, AdminUsersList, GrantsPanel, ModuleDetail.

This pass standardises those two, plus two small copy tightenings the language rules call for. **No brand redesign, no new tokens, no substrate.**

## Scope (IN)

### 18-G-1 — One logged-in `PageHeader` primitive
Extract `PageHeader` into `ui/primitives.tsx`: eyebrow (uppercase tracking-widest muted), `h1`, optional explanatory paragraph, optional mono sub-id, optional right-aligned actions slot, optional metadata strip. Apply across the detail/list screens that currently hand-roll headers: ModuleDetail, ModulesCatalog, InstallCeremony, ArtifactsList, ArtifactDetail, AdminUsersList, AdminUserDetail, and reconcile Settings' heading into the same pattern. This is the single highest-leverage drift fix and answers Page-Contract Q1 ("where am I?") uniformly.

**Design call needed (see Open Questions #1):** standardise on the **new-IA bold-sans `tracking-tight2`** heading and retire the `font-serif` headings on the older modules-v2/admin screens, so the IA shell stays canonical.

### 18-G-2 — Reuse table / section / empty-state shapes
Where the same operator-table shape appears ≥2× (ArtifactsList, AdminUsersList, GrantsPanel grants table), align on one shared shape — either a thin `OperatorTable`/`SectionBlock` wrapper or, if a primitive would be thin, shared classes + the existing `EmptyState` primitive. Extract a primitive **only** where it directly removes duplication found in B–F screens (Reviewer's own Step-F rule, reaffirmed in `ad90e23`). No speculative components.

### 18-G-3 — Two copy tightenings
- GrantsPanel: frame the section as **"Permissions on this matter"** (currently "Matter actions" / "Grant a capability"). Keep the load-bearing idempotent/no-audit copy verbatim.
- InstallCeremony: lean the surrounding framing toward **"Review permissions"** (the substrate stepper state labels stay as metadata — tests pin them).

## Scope (OUT / non-negotiables)

- No brand or visual-system change — same colour tokens, same fonts, same density. This is *consistency*, not restyle.
- No substrate, no new endpoints (the `POST /settings/keys/{provider}/test` gap stays deferred).
- No new routes, no audit export/grouping, no Settings re-architecture beyond header alignment.
- No matter-workspace behaviour changes — D's nav already landed.
- Module DX still parked.
- Each substep leaves focused tests + `tsc -b` green; full vitest + build at close-out (shared primitives → full suite).

## Open questions for Reviewer

1. **Header typography.** Standardise on the new-IA bold-sans `tracking-tight2` h1 and retire `font-serif` headings on the older screens? *Rec: yes — the IA shell is the canonical language; serif on a few legacy pages is the drift.*
2. **Table extraction depth.** Extract a shared `OperatorTable` primitive, or just align inline classes + reuse `EmptyState`? *Rec: only extract if the shape is genuinely identical in ≥2 places; otherwise align classes — avoid a thin-wrapper component for its own sake.*
3. **Content max-width.** Standardise logged-in content width (modules use `max-w-3xl/4xl`, IA uses `max-w-page`)? *Rec: pick one for detail pages; flag if it visibly reflows the matter shell.*

## Verification

Per substep: focused tests for touched screens + `tsc -b --noEmit` (run locally from `frontend/`; `docker exec` binds the other checkout). Close-out: full frontend vitest + `npm run build`. e2e runs on merge to master via `e2e.yml`.

## Acceptance

- One header pattern across logged-in screens; consistent table + empty-state shapes where they repeat.
- The two copy tightenings landed without breaking the pinned substrate/audit assertions.
- Each touched screen answers the Page Contract's four questions in order.
- No visual-system change; typecheck / full vitest / build green.
