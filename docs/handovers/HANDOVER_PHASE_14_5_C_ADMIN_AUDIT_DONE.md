# HANDOVER — Phase 14.5 C Workspace Audit Reconstruction DONE

**Branch:** `runtime-rewrite`
**Plan ratified at:** `b98f0ab`. **14.5 A:** `26cdd05`. **14.5 B:** `24ebe2c`.
**Closes:** BACKEND_GAP_AUDIT finding **14-B-#2**.
**Reviewer brief:** "Proceed to Phase 14.5 C: `/api/admin/audit/reconstruction`, workspace-only audit rows, superuser-only, action-filter deep-link restored."

## What landed

### Substrate (`backend/app/api/audit.py`)

New endpoint `GET /api/admin/audit/reconstruction`:

- Separate `admin_router` mounted at `/api/admin/audit` (the existing `router` is on `/api/matters`).
- Superuser-only via `_require_superuser` helper. Non-superuser returns 403 with `{detail: {error: "admin_required", message}}`.
- Reuses `reconstruct()` from Phase 14.5 A with `matter_id=None`.
- Same query params as the matter endpoint: `since`, `until`, `include`, `cursor`, `limit`, `invocation_id`, `action`.
- Returns `ReconstructionResponse` (same shape; one row schema across both surfaces).
- `invocation_id` validated as a UUID before substrate call.
- Audit emission: same `audit.reconstruction.viewed` action, `payload.scope="workspace"` + `payload.matter_id=None` + `filters` block. Unified payload contract from Phase 14.5 A holds across both surfaces.

### Source semantics (locked per the plan + tests)

- `source="audit"` returns rows where `matter_id IS NULL`.
- `source="state_machine"` returns `[]`. `StateMachineInstance` always carries a matter owner.
- `source="advice_boundary"` returns `[]`. `AdviceBoundaryDecision.gate_state` always carries `matter_id`.
- `include` accepts all three values (no 422 churn). The empties surface honestly.

### Frontend (`frontend/src/admin/AdminAuditView.tsx`)

- Mirrors `ReconstructionView` structurally: header / filter chips / source chips / timeline / pagination.
- **Auth-gate first.** `useEffect` returns early if `auth.loading` or `!auth.user?.is_superuser` — `getAdminReconstruction` is never called for a non-admin viewer (same belt-and-braces pattern as `AdminUsersList` after the Phase 14 F P1 redline).
- **Source chips for state_machine + advice_boundary render disabled** with a tooltip naming the substrate constraint (`"matter-bound by substrate design"`), `cursor-not-allowed` cursor, line-through styling.
- Filter chips for `?invocation_id=` and `?action=` mirror the matter view's contract; same clear-link UX.
- Timeline row data-testid namespaced as `admin-timeline-row-{source_row_id}` so future tests can disambiguate.

### Router (`frontend/src/router/index.tsx`)

- New `adminAuditRoute` with `validateSearch` for `{ invocation_id?, action? }`. Identical contract to `matterAuditRoute`.
- Added to the `authedRoute` children list alongside `adminUsersRoute` + `adminUserDetailRoute`.
- Exported so `AdminAuditView` can use the typed `useSearch` hook.

### InstallCeremony deep-link restored

- Banner now reads "View workspace audit trail" linking to `/admin/audit?action=module.ceremony.rejected`.
- **Action-only per the plan's P1 redline.** No `?ceremony=` query param; the backend filters only on `invocation_id` + `action` and inventing `ceremony_id` would be false-contract territory.
- Test asserts the exact href + asserts the link does NOT match `/ceremony=/` (regression guard).

### API client (`frontend/src/lib/api.ts`)

- `getAdminReconstruction(opts)` — same options as `getReconstruction` but with no `slug`. Forwards filters as query params.

## P3 from B ratification folded in

`list_installed_modules` window function now uses `(installed_at DESC, id DESC)` as the partition ordering — adds a deterministic tie-breaker so two rows sharing the same `installed_at` instant still produce a stable "most recent" choice. Reviewer P3 hygiene note from `24ebe2c` ratification.

## Test coverage

### Substrate

11 new tests in `backend/tests/test_phase14_5_c_admin_reconstruction.py`:

1. Anon → 401.
2. Non-superuser → 403 `admin_required`.
3. Superuser sees workspace-scoped rows.
4. Matter-scoped rows are NOT surfaced (workspace endpoint excludes them).
5. `include=state_machine` alone → 200 with empty entries.
6. `include=advice_boundary` alone → 200 with empty entries.
7. `include=audit,state_machine,advice_boundary` → only audit rows surface; all returned entries have `source="audit"`.
8. **`?action=module.ceremony.rejected`** — the original UX motivation — surfaces the row; every returned row matches the filter (no `auth.user.registered` leak).
9. `?invocation_id=not-a-uuid` → 422 structured envelope.
10. Emits unified payload shape: `scope: "workspace"` + `matter_id: null` + `filters` block.
11. Audit-the-auditor across calls — first visit emits a viewed row; second visit can see it via `?action=audit.reconstruction.viewed`.

Backend full sweep: **735 passed, 8 skipped** (was 724; +11 new).

### Frontend

4 new tests in `frontend/src/admin/AdminAuditView.test.tsx`:

- Non-superuser → `Admin required` shell; `getAdminReconstruction` spy NEVER called.
- Superuser → renders timeline rows; URL filter forwarded to the API call.
- Source chips for `state_machine` + `advice_boundary` are disabled with the substrate-constraint tooltip.
- Substrate 403 → `Admin required` shell via typed `AdminRequiredError`.

InstallCeremony 409 test (`InstallCeremony.test.tsx`) updated:

- Was: asserted the banner had NO deep-link.
- Now: asserts the banner has `href="/admin/audit?action=module.ceremony.rejected"` AND **explicitly asserts the href does NOT match `/ceremony=/`** (pins the P1 redline against future drift).

Frontend total: **123 passing** (was 119; +4 new).

## Verification

- `docker compose exec backend pytest tests/test_phase14_5_c_admin_reconstruction.py` — **11/11**.
- `docker compose exec backend pytest` — **735 passed, 8 skipped**, no regressions.
- `npm test` — **123/123**.
- `npm run typecheck` — clean. `npm run build` — clean.

## Spec updates

- `BACKEND_GAP_AUDIT.md` — finding **14-B-#2** marked CLOSED with the closure description; original problem statement preserved below.

## What this DOES NOT do

- **No matter-row elevation.** A superuser visiting the admin endpoint does NOT see matter rows. Matter rows are reachable via the per-matter endpoint, which already has a superuser fallback for cross-matter access (Phase 5's `_load_matter_or_403`). Two endpoints, two scopes, no overlap.
- **No new audit action.** Same `audit.reconstruction.viewed` action; payload variant only. The action remains a single row in `AUDIT_EMISSION_MAP.md`.
- **No pagination changes.** Cursor encoding shared with the matter endpoint; same `next_cursor` / `total_in_window_estimate` fields.
- **No `?ceremony=` query param.** Action filter is sufficient for the original UX motivation; per-ceremony filtering is a future finding if it ever proves load-bearing.

## Phase 14.5 status

All three sub-steps shipped:

- **A** — ratified at `26cdd05`. Closes 14-E-#1.
- **B** — ratified at `24ebe2c`. Closes 14-B-#1.
- **C** — this commit (pending Reviewer). Closes 14-B-#2.

Phase 14.5 closes when C ratifies. After that:
- All three open Phase 14 findings closed.
- Frontend Phase 14 graceful-degradation fallbacks all upgraded to final-contract behaviour.
- Phase 15 (Playwright) tests will run against the intended substrate surface from the first run.

Hand to Reviewer.
