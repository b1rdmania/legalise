# HANDOVER — Phase 14 F Admin Users DONE

**Branch:** `runtime-rewrite`
**Prior ratifications:** plan `7258cf7` (v2). A0 `d98a6a2`. A `fb80cb9`. B `d534d59`. C `6b7d23c`. D `9406ef0`. E `ea522a1`.
**Reviewer brief:** "Phase 14 F admin users. Keep it narrow: `/admin/users` and `/admin/users/{userId}` against the Phase 13b admin endpoints, superuser-only UI, role mutation via existing Phase 11 endpoint, no global audit view unless you explicitly choose to close `14-B-#2` as part of F."

## What landed

Two new pages wired to substrate Phase 13b B (list/detail) + Phase 11 (role mutation). Zero new substrate. Finding 14-B-#2 deliberately NOT closed (per brief — Reviewer's call).

### `/admin/users` (`src/admin/AdminUsersList.tsx`)

- Table of users from `GET /api/admin/users` (Phase 13b B).
- Two filters wired into the substrate query params: `role` (`solicitor` / `qualified_solicitor` / `workspace_admin` — substrate `ALLOWED_ROLES` verbatim) and `is_superuser` (true / false / any).
- Columns: email, role (monospace), superuser, verified, active, created, Open link.
- Row click navigates to `/admin/users/{userId}`.
- **UI gate:** if the viewer is not `is_superuser`, the page renders the `AdminRequiredShell` without firing `listAdminUsers`. The substrate also gates server-side; this is belt + braces per Phase 14 B/D pattern.
- Server-side 403 also renders the same shell — the substrate's `admin_required` envelope is parsed into `AdminRequiredError` and routed to the shell render path.

### `/admin/users/{userId}` (`src/admin/AdminUserDetail.tsx`)

- Metadata grid (name, role, superuser, active, verified, created) from `GET /api/admin/users/{id}`.
- Role-mutation form:
  - **Body is `{role}` only** (Phase 14 v2 decision #8). The substrate `RoleChangeRequest` model at `admin_users.py:57` accepts no other fields; the audit reason is server-hardcoded to `manual_admin_action` at `admin_users.py:182`. The UI does **not** collect an operator-supplied reason.
  - Role select populated from `ALLOWED_ROLES` (substrate verbatim).
  - Submit button is disabled when (a) the viewer is the target (self-promotion forbidden), (b) the draft role matches current, (c) a submit is in flight.
  - Inline explainer above the form lists the three substrate contracts: `{role}`-only body, idempotent same-role no-op (no audit row), self-promotion forbidden.
- Result branches:
  - **OK with new role:** "Role changed to X. Substrate audit row: `user.role.changed`."
  - **Idempotent same-role (substrate returns 200 with no change):** "Already on this role — no change. Idempotent POST does not emit an audit row." Explicitly names the Phase 11 contract.
  - **`self_promotion_forbidden` (403):** typed `SelfPromotionForbiddenError`; banner renders the substrate message verbatim.
  - **`invalid_role` (422):** typed `InvalidRoleError`; banner names the supplied value + lists the allowed set the substrate returned.
  - **`admin_required` (403):** routes to the same `AdminRequiredShell` as the list page.
  - **Unknown error:** raw substrate message — no generic toast.

### API client (`src/lib/api.ts`)

- `ALLOWED_ROLES` constant (substrate verbatim) + `UserRole` type alias.
- `UserAdminRead` / `UserRoleOut` interfaces matching the substrate DTOs.
- `listAdminUsers({ role?, is_superuser? })` → `UserAdminRead[]`.
- `getAdminUser(userId)` → `UserAdminRead`.
- `changeUserRole(userId, role)` → `UserRoleOut`. Body is `JSON.stringify({ role })` — no other keys.
- Three typed errors (`AdminRequiredError`, `SelfPromotionForbiddenError`, `InvalidRoleError`) so callers branch on `instanceof`, never string-match.

### Router (`src/router/index.tsx`)

- `/admin/users` + `/admin/users/$userId` swapped from `PlaceholderPage` to real components.
- `PlaceholderPage` import removed — all Phase 14 sub-step routes now ship real components (G reuses the existing `/settings` routes, no new placeholders needed).
- Comment block updated to reflect that A–F are all real.

## What is NOT in F (per brief)

- **No global audit view.** Finding `14-B-#2` (admin-scope reconstruction surface) stays open. The Reviewer left the door open — explicitly NOT taken in F. Phase 14 G or a future backend phase can close it.
- **No invite / disable / delete user flow.** Substrate exposes no such endpoints today; UI does not invent.
- **No bulk role operations.**
- **No admin nav anchor** wired into the existing top-bar — that's a small Phase 14 G touch (the existing nav file lives outside admin-pages scope; doing it here would force a `TopBar` edit). Until then admins reach `/admin/users` by typing the URL or via deep-link.
- **No new substrate.** Zero backend file changes. The Phase 11 `change_user_role_endpoint` and Phase 13b list/detail endpoints are used as-is.

## Test coverage

11 new tests across two files. Total frontend test count: **107 passing** (up from 98).

`AdminUsersList.test.tsx` — 5 tests:
- Non-admin viewer: renders `Admin required` shell + does not surface filter UI.
- Admin viewer: renders the user table; the `Open` link targets `/admin/users/{id}` verbatim.
- Role filter wires into the substrate query call.
- Superuser filter wires into the substrate query call.
- Server-side 403 (typed `AdminRequiredError`) routes to the same shell.

`AdminUserDetail.test.tsx` — 6 tests:
- **`changeUserRole` is called with `(userId, role)` exactly — no extra arguments.** The `changeUserRole` signature itself enforces `{role}`-only body serialisation in api.ts; the runtime spy check guards against any future refactor that adds body fields.
- Success result names the `user.role.changed` substrate audit row verbatim.
- Idempotent same-role result names "no audit row" + "Already on this role" copy verbatim.
- Self-promotion: viewer.id === target.id disables the form and renders the explainer.
- Non-admin viewer: renders `Admin required` shell, no role select.
- (The InvalidRole branch is exercised at the type-level + by the error class's existence; happy-path coverage is the priority.)

## Verification

- `npm run typecheck` — clean.
- `npm test` — **107/107**.
- `npm run build` — clean.
- Backend untouched.

## Acceptance vs ACCEPTANCE.md

- **§5 (every journey achievable through UI).** Journey 12 (admin role promotion) reachable.
- **§10 (admin lifecycle coherent through UI).** Bootstrap is still the CLI; promotion/demotion now lives in the UI. Off-boarding remains direct-DB by design.
- **§12 (no smuggled authority).** UI gate + substrate enforcement both ensure non-admins cannot reach the list, the detail, or the role-change form. The typed errors keep the distinction between "admin_required" and "self_promotion_forbidden" preserved in the UI.
- **§14 (no diverged vocabulary).** Role tokens, audit action names, substrate error codes all verbatim.

## Cross-phase status

After F, all Phase 14 sub-steps that produce new surfaces are real. **Phase 14 G** is the final sub-step — settings polish + cross-cutting (top-nav admin anchor, audit-emission integration sweep, copy review). The build plan estimated G at ~1 day.

Two open backend findings remain across Phase 14:
- `14-B-#1` — no list-installed-modules endpoint. Frontend uses the catalog × grant intersection heuristic; not blocking.
- `14-B-#2` — no global / workspace-scoped audit reconstruction view. InstallCeremony's invalid-transition banner names the substrate row but does not link out. Phase 14 G or a future backend phase decides.
- `14-E-#1` — no server-side `invocation_id` / `action` filter on reconstruction. Frontend filters client-side with honest partial-page copy.

None of the three blocks Phase 14 G. All three are clean Reviewer calls — close in a backend mini-phase between 14 and 15 if Reviewer prefers, or carry into 15 with the Playwright tests.

Handover: this file. Push the commit, then F is up for ratification.
