# Matter Lifecycle + Export UX v1 — Handover (DONE)

**Status:** built on `phase-17-crm-pass`, awaiting review/merge. **Frontend-only** (no backend change in this project; the one backend touch on the branch is the separate LMF export-download audit-ordering fix — see below).
**Date:** 2026-05-29
**Plan:** `MATTER_LIFECYCLE_EXPORT_UX_V1_PLAN.md`.

## Routes / surface
- **New routed `/matters/{slug}/lifecycle`** → `frontend/src/matter/MatterLifecycle.tsx`. Reached via a new **"Lifecycle"** entry in the matter sub-nav (Sidebar), which persists on the route. Route shim (`lib/route.ts` `matterLifecycle`) + `router/index.tsx` (`matterLifecycleRoute`, authed).
- `PageHeader` + three stacked panels, order **Export → Close → Delete**, using existing primitives/tokens.

## Endpoints used (all pre-existing LMF; no new backend)
- `POST /api/matters/{slug}/export` (create export job) → poll `GET /api/matters/{slug}/jobs/{job_id}` → download `GET /api/matters/{slug}/export/{job_id}`.
- `POST /api/matters/{slug}/close` (non-destructive).
- `DELETE /api/matters/{slug}` (destructive tombstone).
- New `lib/api.ts` helpers: `createMatterExport`, `getJob`, `matterExportDownloadUrl`, `closeMatter`, `deleteMatter` (+ `JobRead` type).

## Panels
- **Export** — "Includes / Not included" explainer; **Start export** → stores the job id in state + `localStorage` (same-session reload resumes polling); polls every 3s while queued/running; on `succeeded` shows a **Download** link; on `failed` shows the error; "you can leave this page" copy; an audit-trail link filtered to `module.export.job.completed` (real action name).
- **Close** — neutral (non-red) confirm; copy says **retained + stays viewable**, reopening not in v1; **no "read-only"/immutability claim** (no server-side write-locks — per the reviewer redline); reflects `status=closed`; idempotent.
- **Delete (danger zone)** — red-bordered, separated; consequence checklist; **type-the-matter-slug-to-confirm** (button disabled until it matches); "export first" recommendation; surfaces failures (incl. the fail-closed 502) honestly; navigates to `/matters` on success.

## Audit linkage
Filters the existing reconstruction on the **real** action names (`module.export.job.*`, `matter.export.downloaded`, `matter.closed`, `matter.deleted`) — **no new audit source**. (Andy's scope listed `matter.export.requested/completed`; those don't exist, so the real names are used.)

## Reviewer redlines (both addressed)
1. **LMF export-download audit ordering** — fixed (separate commit `7578091`): `matter.export.downloaded` now emits only **after** a successful local `get_bytes` / presigned-URL generation; regression test added (a failed download writes no row).
2. **"Closed = read-only" wording** — Close copy says "retained / stays viewable", not "read-only"/"immutable"; no server-side write-lock added (consistent with the plan).

## Tests run
- Frontend: `MatterLifecycle.test.tsx` — 4 (export start→poll→download; close; delete type-to-confirm gating; danger-zone/irreversible copy). Full frontend vitest **166 passed / 24 files**; `tsc -b` clean; `npm run build` succeeds.
- Backend (the LMF fix): `test_lmf_close_and_export_audit.py` 6 passed (incl. the new failed-download-no-audit regression).
- Not run: full backend (no backend change in this project beyond the already-tested LMF fix); e2e (new leaf route, low main-path risk).

## Remaining gaps / out-of-scope
- **No list-export-jobs endpoint** (filed in the plan): v1 tracks the active export in-session (state + `localStorage`); durable export history is the audit trail. A "past exports" table needs a small `GET …/export` read endpoint — **not built** (would need approval).
- No reopen-after-close (one-way in v1). No server-side write-lock on closed matters. No crypto-purge.
- Owner-only throughout; no admin/superuser shortcut.

## Next recommended
If desired, the small `GET /api/matters/{slug}/export` list endpoint → a real "past exports" table; otherwise the matter lifecycle is now visible + safe end-to-end.
