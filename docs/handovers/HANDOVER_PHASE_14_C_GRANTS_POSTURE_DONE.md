# HANDOVER — Phase 14 C Grants + Posture DONE

**Date:** 2026-05-26
**Branch:** `runtime-rewrite`
**Plan ratified at:** `7258cf7` (v2). **A0:** `d98a6a2`. **A:** `fb80cb9`. **B:** `d534d59`.
**Reviewer brief:** "Phase 14 C: matter-scoped grants UI. Keep it narrow: show installable module capabilities for the matter, POST/DELETE `/api/matters/{slug}/grants`, reflect posture/permission state. No invoke UI, artifacts, reconstruction, admin, settings, or new backend substrate."

## What landed

Two new components inserted into the existing `MatterDetail` page, plus the API client to drive them. No new routes, no new substrate, no audit-row inventions.

### Posture banner (`src/matter/PostureBanner.tsx`)

Renders the (actor role × matter posture) cell from `POSTURE_GATE_UX.md`. Substrate truth (`app/core/posture_gate.py:POSTURE_POLICY`):

- `A_cleared` → any authenticated → **no banner**, full UI.
- `B_mixed` (default) → requires `qualified_solicitor`. Banner renders only when the actor's role doesn't satisfy. Superuser bypasses the role check (mirrors substrate behaviour for admin operations).
- `C_paused` → sentinel `matter_paused`; nobody satisfies. **Banner always renders**, even for admins. Admin viewers also see a hint about `PATCH /api/matters/{slug}/privilege` to unpause; non-admins don't.
- Unknown posture → fail-closed banner naming the unknown value. Mirrors substrate `POSTURE_POLICY.get(posture)` default-deny.

Banner shell uses two tones: amber for `B_mixed`, red-sealed for `C_paused`. The posture badge pill names the substrate posture string verbatim per ACCEPTANCE.md §14.

**Deliberately NOT in this banner:**

- No "View audit trail" deep-link. Per the brief, no reconstruction integration in C. The plan's deep-link target (`/matters/{slug}/audit?action=posture_gate.check.blocked`) lands when Phase 14 E ships and the matter reconstruction route resolves real content. Until then, surfacing a link that goes to a `PlaceholderPage` would be the same mistake we caught in Phase 14 B P1. Tracked alongside finding 14-B-#2.
- No "Change posture" admin shortcut. That belongs to Phase 14 G (settings polish) per the build plan.

### Grants panel (`src/matter/GrantsPanel.tsx`)

Embedded as a section at the bottom of the matter workspace `<main>`, visible across all tabs.

**List:** `GET /api/matters/{slug}/grants` rendered as a table — plugin / skill / capability / granted_at / Revoke. Empty state when no grants exist; row-level revoke spinner; structured error on fetch failure.

**Create:** Two-select form (module + capability) sourced from `GET /api/modules/v2` filtered to manifests with at least one declared capability. Submit hits `POST /api/matters/{slug}/grants {module_id, capability_id}`. Result states:

- `was_idempotent_noop=true` → "Already granted — no change. Idempotent grants do not emit audit rows." This explicitly names the Phase 7 Decision #4 contract.
- `was_idempotent_noop=false` → "Granted. N row(s) created."
- `404 module_not_installed` → "Module X is not installed on this workspace. Ask an administrator to install it from /modules first." (Names the catalog path; substrate truth.)
- `409 module_disabled` → "Module X is installed but currently disabled." (Substrate's structured message.)
- Other errors → inline seal-coloured callout with the substrate message.

**Revoke:** `DELETE /api/matters/{slug}/grants/{grant_id}` per row. 204 → list refresh.

### Typed errors

Two new error classes in `lib/api.ts`:

- `ModuleNotInstalledError` (404)
- `ModuleDisabledError` (409)

Both parse the substrate's structured `detail` body in `createGrant` so callers branch on the error type, not string-match.

### Wired into MatterDetail

Two edits to `src/matter/MatterDetail.tsx`:

1. `useAuth()` added; `PostureBanner` rendered above the tab content in `<main>` (visible across every tab — posture affects everything).
2. `GrantsPanel` rendered at the bottom of `<main>` (visible across every tab; not tied to a specific workflow).

No tab plumbing changed. No new prop on `MatterDetail`. The signature stays `{ slug }`.

### CprGateBanner audit (per build plan)

Read the existing `src/matter/CprGateBanner.tsx`. It's for CPR 31.22 (disclosure undertaking), a chronology gate — orthogonal to the posture gate. Leaving it alone is the right call; building a separate `PostureBanner` does not duplicate it.

## Test coverage

17 new tests across two files. Total frontend test count: **64 passing** (up from 47).

`PostureBanner.test.tsx` — 9 tests:

- A_cleared: silent for solicitor + qualified_solicitor
- B_mixed: renders for solicitor with required-role + actor-role labels; silent for qualified_solicitor; silent for superuser; renders for unauth visitor
- C_paused: renders for admin with unpause hint; renders for solicitor WITHOUT admin hint
- Unknown posture: fail-closed banner naming the posture string
- **Regression guard:** no `View audit trail` link rendered (would catch a future stale deep-link reintroduction, mirroring the B 14-B-#2 lesson)

`GrantsPanel.test.tsx` — 8 tests:

- List renders grant table; empty-state when no grants
- Create: happy path submits the right payload, refreshes the list, surfaces success copy
- Create: 404 module_not_installed → inline message + reference to `/modules`
- Create: 409 module_disabled → inline message with substrate's body
- Create: idempotent no-op → "Already granted" copy AND explicit mention of "do not emit audit rows" (pins Phase 7 Decision #4)
- Revoke: DELETE call + list refresh

## Verification

- `npm run typecheck` — clean.
- `npm test` — **64/64**.
- `npm run build` — clean.
- Backend untouched (zero substrate file changes).

## Reviewer-narrow discipline — what this DOES NOT do

Lifted from the brief, named so the next sub-step builder doesn't blur scope:

- **No invoke UI.** Phase 14 D. There's no "Run" button next to grants.
- **No artifacts surface.** Phase 14 D.
- **No reconstruction view.** Phase 14 E. PostureBanner deliberately omits the audit deep-link the plan describes; banner names the audit row context but doesn't pretend to link out.
- **No admin pages.** Phase 14 F.
- **No settings polish.** Phase 14 G — including the workspace_admin "Change posture" shortcut from POSTURE_GATE_UX.md.
- **No new substrate.** Zero backend file changes. The substrate gap for a workspace-scoped reconstruction view (14-B-#2) stays open; Phase 14 D may force it.
- **No new audit emissions.** Every audit row this surface produces is already substrate-verified (`module.grant.created`, `module.grant.revoked`, no row on idempotent no-op).

## Acceptance vs ACCEPTANCE.md

- **§5 (every journey achievable through UI).** Journeys 04 + 07 reachable via the in-matter grants panel + posture banner.
- **§7 (posture-gate denial visible + actionable).** Banner renders the required role + actor role + (admin-only) unpause hint. The "actionable" part is partial — the deep-link to the audit row that the plan calls for is deferred to Phase 14 E.
- **§11 (no hidden failures).** Both 404 and 409 paths render structured banners citing the substrate error code; no generic toasts.
- **§12 (no smuggled authority).** Phase 14 C did not add new authority paths. The grants endpoint is per-user and substrate-enforced; the admin-only `PATCH /privilege` hint shows only when the viewer is superuser.
- **§14 (no diverged vocabulary).** Posture strings (`A_cleared`, `B_mixed`, `C_paused`, `matter_paused`), error codes (`module_not_installed`, `module_disabled`), audit action names (`module.grant.created`, `module.grant.revoked`) all appear verbatim from the substrate.

## Next sub-step

**Phase 14 D — invocation + artifacts.** Adds the load-bearing "Run" affordance per capability + the `/matters/{slug}/artifacts` + `/{id}` surfaces. Phase 14 D may force closure of finding 14-B-#1 (no list-installed-modules endpoint) if the catalog can't surface invocation-ready state otherwise.
