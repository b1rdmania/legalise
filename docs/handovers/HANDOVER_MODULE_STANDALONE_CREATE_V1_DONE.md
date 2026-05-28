# Module Standalone + Create Module v1 — Handover (DONE)

**Status:** built on `phase-17-crm-pass`, green, awaiting review/merge.
**Date:** 2026-05-29
**Plan:** `MODULE_STANDALONE_CREATE_V1_PLAN.md` (5 locked decisions + the A choice on validation).

## Shipped

### Backend (the one small read-only touch — decision #5, choice A)
- **`POST /api/modules/validate`** (`backend/app/api/modules.py`) — body `{ manifest }`, response `{ valid, errors: [{path, message}] }`. **Read-only**: no DB write, no install ceremony, no trust/signing, no audit row. Wraps the existing `validate_manifest_v2`, so "valid here" == "installable". **Authed** (operator surface).

### Frontend
- **`/modules` redesigned** (`modules-v2/ModulesCatalog.tsx`) as the standalone integrations home:
  - **Primary — reference modules** from the v2 registry (`getModulesV2`), each card showing workspace state derived from `listInstalledModules`: `Available` / `Installed` / `Installed · disabled`. Click → existing ModuleDetail. A **Create module** action in the header.
  - Honest per-matter caveat in the header copy ("installing here does not make it ready everywhere — grant/run per matter").
  - **Secondary — UK legal skills** (`getPublicModules`) as a **collapsed-by-default** browse, explicitly *not* an install path.
  - `/modules` stays a **public** route: the authed registry/installed calls are gated on `useAuth` (anon sees a "sign in to manage reference modules" prompt + the browsable skill library).
- **`/modules/create`** (`modules-v2/CreateModule.tsx`, authed) — validate-and-explain (not a builder): what a module is, required manifest fields, capabilities/audit-events explainer, a paste-manifest → **Validate** step (calls the new endpoint, shows OK or path/message errors), and a "sign & install locally" section that points at the CLI (no in-browser signing — decision #4).
- `documentOriginalUrl`-style helper `validateManifest(manifest)` added to `lib/api.ts`.
- Routing: `lib/route.ts` (`createModule` name, parsed before the `$moduleId` catch-all), `router/index.tsx` (`createModuleRoute` under authed, before `/modules/$moduleId`), `Sidebar.tsx` (Modules stays active on `createModule`).

## Decisions honoured
1. Catalogue and v2 registry **kept separate** — registry primary, public skills secondary browse.
2. Enablement **per-matter** — workspace state shown as install/enabled/disabled; matter-readiness stays in GrantsPanel; never "ready everywhere".
3. Create = **scaffold + validate + explain**, not a visual builder.
4. Signing **deploy-time / CLI** — explained + linked, no in-app signing.
5. **No substrate** beyond the one read-only validate endpoint.

`/modules/submit` (the marketing form) is left as-is but is no longer the operator create entry — `/modules/create` is.

## Tests run
- **Backend (focused):** `test_module_validate_endpoint.py` — 3 green: valid manifest → `valid:true` + **no audit row written** (read-only proven); invalid → errors with path+message; **auth required (401 when anon)**. (Local against docker pg + MinIO via host IP.)
- **Frontend:** `ModulesCatalog.test.tsx` rewritten (reference-module state badge + Create action; public skills secondary/collapsed) — 2; `CreateModule.test.tsx` — 3 (validate OK, errors with path/message, non-JSON rejected before API). Full frontend vitest **162 passed / 23 files**; `tsc -b` clean; `npm run build` succeeds.
- **Not run during build:** full backend pytest (deferred to CI — runs in-container); e2e (new leaf route + a redesigned public page — low nav risk).

## Gaps / residual limitations
- Create-module is validate-and-explain only: it does not produce a signed, installed module in-app (signing is CLI/deploy-time by decision #4). The "sign & install locally" copy links to the repo docs rather than an in-app flow.
- `/modules` reference section is authed-gated; anon users get the skill-library browse + a sign-in prompt (intentional — registry/installed endpoints are authed).
- The catalogue/registry split is deliberately **not** unified (decision #1); a future phase could reconcile them if the two surfaces confuse users.

## Next recommended phase
With modules now standalone + a create on-ramp, the remaining v1 track is the **live-matter foundations** (object storage as source-of-truth / durable jobs / matter export+delete) — the production-hardening Andy deferred behind the product-story work. In-app module signing is a separate future module-DX phase.
