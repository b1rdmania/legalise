# HANDOVER — Phase 14 B Module Catalog + Detail + Trust Ceremony DONE

**Date:** 2026-05-26
**Branch:** `runtime-rewrite`
**Plan ratified at:** `7258cf7` (v2). **A0 ratified at:** `d98a6a2`. **A ratified at:** `fb80cb9`.
**Reviewer brief:** "Phase 14 B, module catalog + detail + trust ceremony. Keep it similarly narrow."

## What landed

Three surfaces, all driven against the substrate v2 module API:

- **`/modules`** — v2 catalog
- **`/modules/{module_id}`** — detail + lifecycle controls
- **`/modules/install/{ceremony_id}`** — trust-ceremony stepper

Plus one substrate finding filed, and the A0 stale code comment tidied per the A ratification note.

### `/modules` catalog (`src/modules-v2/ModulesCatalog.tsx`)

- Fetches `GET /api/modules/v2`, renders one card per `V2ManifestEntry`.
- Per card: name, id, version, publisher, visibility tag, description, capability count, "manifest invalid" flag.
- Card is a single `<Link to="/modules/$moduleId">` — clicking opens detail.
- Empty state when registry is empty; error state when the fetch fails.
- Replaces the legacy v1 `Modules` component as the `/modules` route target. The v1 file at `src/modules-page/Modules.tsx` stays in the repo (other surfaces may still import sub-fragments) but is no longer routed.

### `/modules/{module_id}` detail (`src/modules-v2/ModuleDetail.tsx`)

- Fetches `GET /api/modules/v2/{module_id}`.
- Header: name + id + version + publisher + visibility + source link.
- Manifest-invalid banner with structured validation errors when `is_valid=false`.
- Capabilities table: id, kind, scope, advice_tier_max, internal/external network. Substrate vocabulary verbatim per ACCEPTANCE.md §14.
- Lifecycle controls:
  - **Install** (always visible) → `POST /api/modules/install` with `{source: "registry", module_id}` → navigates to `/modules/install/{ceremony_id}`.
  - **Update** (admin only) → discloses a JSON textarea for the new manifest; submit → `POST /api/modules/{id}/update`. If the response carries `expansion_detected=true` + `ceremony_id`, the page navigates to the new ceremony. Otherwise the in-place update message renders.
  - **Revoke** (admin only) → `POST /api/modules/{id}/revoke`. 404 from "not installed" is surfaced as a friendly inline message rather than an error banner.
- Non-admins see only Install + an explainer "Update / Revoke are admin-only" — no smuggled authority.

### `/modules/install/{ceremony_id}` trust-ceremony stepper (`src/modules-v2/InstallCeremony.tsx`)

- Fetches `GET /api/modules/install/{ceremony_id}`.
- Stepper with **substrate state names verbatim** (`discovered`, `inspected`, `signature_checked`, `publisher_checked`, `permissions_reviewed`, `gates_reviewed`, `granted`, `enabled`) — ACCEPTANCE.md §14.
- Permission card rendered from the substrate's `permission_card` shape (module, version, publisher + verified flag, signature status, visibility, advice tier max, capability count, audit event count).
- Three actions:
  - **Trust + continue** → `POST .../advance {action: "trust"}` → advances one substrate step.
  - **Grant + enable** → `POST .../advance {action: "grant"}` → final commit; substrate persists `InstalledModule` and emits `module.enabled`.
  - **Reject** → `POST .../advance {action: "reject"}` → terminal `rejected_by_user`; substrate emits `module.denied`; UI bounces to `/modules` after 700 ms (long enough to see the terminal state, short enough to feel like a confirmation).
- **409 invalid-transition handling** (the load-bearing failure path):
  - Substrate emits `module.ceremony.rejected` via `audit_failure` (independent committed session) and returns HTTP 409.
  - Frontend recognises a `InvalidCeremonyTransitionError` and renders a structured banner naming the audit row plus a deep-link with the stable query-param shape Phase 14 E will honour: `?action=module.ceremony.rejected&module={moduleId}&ceremony={ceremonyId}`.
  - Banner says "lands in Phase 14 E" so the user understands the link isn't broken — it's a forward dependency.
- Terminal-failure states (`signature_failed`, `publisher_blocked`, `permission_denied`, `sandbox_profile_missing`, `rejected_by_user`) hide the advance buttons and show a "Ceremony terminated: {state}" banner.

### API client (`src/lib/api.ts`)

Eight new exports, no changes to existing ones:

- `V2ManifestEntry`, `V2RegistryResponse`, `CeremonyResponse`, `CeremonyAction`, `StartInstallRequest`, `UpdateModuleRequest`, `UpdateModuleResponse`, `InvalidCeremonyTransitionError`
- `getModulesV2`, `getModuleV2`, `startInstall`, `getCeremony`, `advanceCeremony`, `updateModuleV2`, `revokeModuleV2`

`advanceCeremony` parses the 409 detail body and throws `InvalidCeremonyTransitionError` so the caller can branch on it without string-matching.

### Substrate finding filed

`BACKEND_GAP_AUDIT.md` now carries finding **14-B-#1**:

- The substrate has no "list installed modules" endpoint. Catalog cannot render an at-a-glance "Installed vX" badge per module without N+1 requests.
- Two proposed shapes for Reviewer (new endpoint vs augment V2ManifestEntry).
- **Status:** filed; Phase 14 B ships catalog without the badge (graceful degradation — "Open" is the affordance on every card). Phase 14 D may force the issue.

### A0 nit tidied

The stale `VITE_FEATURE_FLAGS` comment in `src/router/index.tsx` is replaced with the corrected wording. Per the A ratification note: "tidy it in the next frontend touch."

## Test coverage

13 new tests across three files. Total frontend test count: **47 passing** (up from 34).

- `src/modules-v2/ModulesCatalog.test.tsx` — 4 tests (renders modules, empty state, invalid-manifest flag, fetch error).
- `src/modules-v2/ModuleDetail.test.tsx` — 4 tests (manifest + capabilities table, install CTA navigates, admin gating hides Update/Revoke for non-admins, shows for superusers).
- `src/modules-v2/InstallCeremony.test.tsx` — 5 tests (stepper highlights current substrate state, trust + grant call substrate with right action, reject bounces to /modules, 409 invalid-transition banner + deep-link, terminal-failure hides advance buttons).

The 409 banner test asserts the **stable query-param shape** Phase 14 E will honour:

```
href="/admin/audit?action=module.ceremony.rejected&module={moduleId}&ceremony={ceremonyId}"
```

When E lands, the route + handler resolve this URL without further frontend changes — the link contract is set here.

## Verification

- `npm run typecheck` — clean.
- `npm test` — **47/47**.
- `npm run build` — clean.
- Backend untouched.

## Reviewer-narrow discipline — what this DOES NOT do

- **No grants UI.** Phase 14 C. Catalog does NOT list grants per module.
- **No invocation surface.** Phase 14 D. Detail page does NOT have a "Run" button.
- **No reconstruction view.** Phase 14 E. The 409 banner deep-links to it but doesn't try to render it.
- **No admin pages.** Phase 14 F. Admin gating in detail is local (`auth.user.is_superuser`); no `/admin/users` linkage.
- **No new audit emissions.** Every audit row this surface produces is already substrate-verified (`module.discovered`, `module.manifest.inspected`, …, `module.enabled`, `module.denied`, `module.ceremony.rejected`, `module.updated`, `module.disabled`, `module.grant.revoked` cascade). UI does NOT emit anything itself.
- **No backend changes.** Finding 14-B-#1 is filed for Reviewer; substrate file count diff is zero.

## Acceptance vs ACCEPTANCE.md

- **§5 (every journey achievable through UI).** Journey 05 (install) + Journey 06 (trust ceremony) are reachable end-to-end via these three surfaces.
- **§11 (no hidden failures).** 409 path is the structured banner with deep-link, not a generic error. Terminal failures get their own banner. Fetch errors surface inline with the substrate message.
- **§12 (no smuggled authority).** Update + Revoke admin gating is enforced UI-side (button hidden) AND substrate-side (403 from `require_admin`). Non-admins never see the buttons.
- **§14 (no diverged vocabulary).** Substrate state names + action names appear verbatim in the stepper + banners.

## Next sub-step

**Phase 14 C — grants on matter + posture banner.** The matter-workspace gets a per-installed-module grants panel (`POST/DELETE/GET /api/matters/{slug}/grants`) and the cross-cutting posture banner per `POSTURE_GATE_UX.md`. Phase 14 B is the dependency Phase 14 C builds on — installed modules are what get granted onto matters.
