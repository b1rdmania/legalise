# Module Standalone + Create Module v1 — Build Plan

**Status:** decisions LOCKED (below) by Andy; plan for Reviewer redline before build. Mostly IA/frontend.
**Branch:** `phase-17-crm-pass`
**Date:** 2026-05-28
**Why now:** documents + supervised review made the product *loop* real; modules is where the product must explain its *thesis* standalone — install existing modules, see enabled/disabled state, and understand how to make your own. This is the marketplace hook (vs Claude-for-Legal / LawV positioning), and it's more core to the story than live-matter hardening.

## Locked decisions (do not reopen)

1. **Do NOT unify the public skill catalogue and the v2 registry.** Keep the distinction, make it legible. `/modules` becomes the standalone "Modules / Integrations" surface; **available reference modules come from the v2 registry** (primary install path); the public skill catalogue may appear as a secondary "UK legal skills / capabilities" section, **not** the primary install path. Enabled/disabled state comes from installed modules.
2. **Enablement stays per-matter for v1.** No workspace-global enablement invented. Runtime grants are matter-scoped; the UI says "enabled for this matter" where there's matter context. Workspace install state, if shown, reads "installed in workspace" — **not** "ready everywhere".
3. **Create Module v1 = scaffold + validate + explain** (not a visual builder). Helps a developer/operator understand: what a module is; required manifest fields; capabilities requested; audit events declared; whether the manifest validates; how to install/sign it locally.
4. **Signing stays deploy-time / CLI.** No in-browser signing. The create flow explains a module must be signed before install and links to the signing CLI/docs. In-app signing is a future module-DX phase.
5. **No substrate unless inventory proves a small missing read endpoint.** Mostly IA/product/frontend. File any backend gap; never bridge with fake state.

## Inventory (verified, file/route refs)

- **Routes:** `/modules` → `modules-v2/ModulesCatalog` (today: public *skills* via `getPublicModules`, grouped by suite); `/modules/$moduleId` → `ModuleDetail` (v2 registry via `getModuleV2`, install/update/revoke); `/modules/install/$ceremonyId` → `InstallCeremony`; `/modules/submit` → `landing/SubmitModule` (a **marketing** form, not an operator authoring tool).
- **Backend (`app/api/modules.py`):** `GET /v2` (V2 registry — reference modules), `GET /v2/{id}`, `GET /v2/capabilities`, `GET /installed` (InstalledModuleOut: module_id, version, publisher, visibility, signature_status, **enabled**, installed_at), `GET /public` (public skills), install/update/revoke (POST). `validate_manifest_v2` exists but is **internal-only** (used inside install/update/register) — there is **no standalone "validate this manifest" endpoint**.
- **Frontend API:** `getModulesV2()` → `{ modules: V2ManifestEntry[], ui_slots }`; `getPublicModules()` → public skills; `listInstalledModules()` → installed/enabled state; `startInstall` / `getModuleV2` / install ceremony helpers.
- **Per-matter grant/run:** `matter/GrantsPanel.tsx` (matter-scoped grants + runnable derivation) — the matter-scoped install→grant→run flow. Unchanged by this phase.
- **No frontend JSON-schema validator dependency.**

## The catalogue/registry split (documented honestly)

Three distinct concepts, kept separate (decision #1):
- **v2 registry** (`/v2`) — the governed reference modules you install/trust/run. **Primary.**
- **Installed modules** (`/installed`) — workspace install + `enabled` flag. Drives "installed in workspace / enabled / disabled".
- **Public skill catalogue** (`/public`) — the open UK-legal skill library (browse). **Secondary, not an install path.**
Per-matter "granted / runnable here" lives in the matter's GrantsPanel — workspace install ≠ matter-ready (decision #2).

## Proposed work

### MS-1 — `/modules` redesigned as the standalone Integrations home
- Primary section: **reference modules from the v2 registry** (`getModulesV2`), each card showing name / publisher / capabilities-count and its **workspace state** derived from `listInstalledModules`: `Available` / `Installed` / `Installed · disabled`. Click → existing `ModuleDetail`.
- State legend + one honest line: modules are installed at the workspace; **running them is granted per-matter** ("enable for a matter from its workspace"). Never imply "ready everywhere".
- Secondary, collapsible section: **UK legal skills** (`getPublicModules`, the current grouped browse) — clearly labelled "browse the open skill library", not an install path.
- Reuse `PageHeader` + tokens; no new visual system.

### MS-2 — Create Module on-ramp (`/modules/create`)
- New routed page: validate-and-explain (NOT a builder). Sections: what a module is; the required manifest fields (schema_version, id, version, publisher, visibility, runtime, entrypoint, capabilities); capabilities + reads/writes + advice tier; declared audit events; a **paste-or-scaffch manifest → Validate** step; and "how to sign + install locally" (links the CLI/docs — decision #4).
- Replaces the marketing `SubmitModule` as the operator-facing create entry (keep `/modules/submit` or fold it; decide in build).

### MS-3 — Manifest validation (the one possible small backend touch)
There's no standalone validate endpoint and no frontend validator. Two honest options (decision #5 permits a small **read-only** endpoint if proven):
- **(A, recommended)** add `POST /api/modules/validate { manifest }` → `{ valid, errors }`, a **read-only** wrapper over the existing `validate_manifest_v2` (no persistence, no state). Gives real validation identical to the install path, so "valid here" == "installable".
- **(B, zero-backend fallback)** create-module stays explain-only and links to a local `validate` CLI; no in-app validation.
**Open question for Reviewer:** A or B? Rec A — it's the single small read endpoint decision #5 sanctions, and validation is explicitly a create-module function (decision #3).

## Non-goals
No catalogue/registry unification; no workspace-global enablement; no visual manifest builder; no in-browser signing; no marketplace economy/ratings/payments; no role-hierarchy / posture work; no changes to the matter-scoped grant/run flow.

## Testing plan
- Focused frontend: `/modules` home (available/installed/disabled states render; public skills secondary; honest per-matter copy), create-module page (renders fields/explainer; validate calls the endpoint and shows valid/errors).
- If MS-3 (A): one focused backend test for `POST /modules/validate` (valid manifest → ok; bad manifest → errors; read-only, no row written).
- Typecheck + full frontend vitest + build at the gate. Full backend pytest at CI only if MS-3 (A) is built. e2e only if navigation risk warrants (new leaf route — low).

## Stop conditions
- If MS-3 reveals validation needs more than wrapping `validate_manifest_v2` (e.g. signing/registry mutation) — stop and file, don't build it into v1.
- If "standalone /modules state" turns out to require workspace-global enablement to be honest — stop; decision #2 forbids inventing it.

## Acceptance
- `/modules` reads as a standalone integrations home: available reference modules, install/enabled/disabled state legible, public skills clearly secondary, per-matter caveat honest.
- A developer/operator can reach a create-module page that explains the manifest, validates it (A) or points at the local validate/sign path (B), without reverse-engineering the repo.
- No catalogue/registry unification, no workspace-global enablement, no in-app signing, no fake state.
- Handover names routes/endpoints touched, the A/B validation choice, tests run, gaps, out-of-scope.
