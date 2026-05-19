# Backend TODOs

Surfaced during the v0.4 design pass. Frontend currently fakes these with static
data or `window.confirm`; the real fix is a backend endpoint.

## ~~TODO(public-modules)~~ SHIPPED 2026-05-19

`GET /api/modules/public` returns the catalogue from the same manifest
resolver as `GET /api/modules` (the `_discover_skills()` helper in
`backend/app/api/modules.py`). Response shape: `source`, `skills`,
`broken`. Per-skill fields: `plugin`, `skill`, `name`, `description`,
`declared_capabilities`, `trust_posture`, `source_url`. Workspace state
(`granted_capabilities`, `enabled`) is deliberately absent. Cached at
`Cache-Control: public, max-age=300`. Frontend `Modules.tsx` swapped the
static `WORKFLOW_TABS` preview for a live fetch via `getPublicModules()`.
Tests: `backend/tests/test_modules_public.py` covers shape, no-leak,
no-auth, cache header, and parity with the authed endpoint.

## TODO(workflow-state)

**Where:** `frontend/src/matter/tabs/WorkflowsTab.tsx`.

**Current state:** Each workflow card renders `Status: installed`,
`Last run: never`, `Availability: ok` as static strings.

**Needed:** `GET /api/matters/{slug}/workflows` returning per-workflow
`{ grant: "installed" | "blocked" | "not-installed", last_run_at: ISO | null,
availability: "ok" | "blocked-by-posture" | "blocked-by-grant" }`. Frontend
already has the colour-coded display ready; just wire the data.

## TODO(plan)

**Where:** `frontend/src/pages/SettingsPage.tsx` plan section.

**Current state:** Renders a hardcoded "Free" badge. No source of truth.

**Needed:** Add a `plan` field to `CurrentUser` (string: `free` / `pro` /
`team`). Settable when billing wires up later; for now seed all users `free`.

## TODO(delete-account)

**Where:** `frontend/src/pages/SettingsPage.tsx` danger zone.

**Current state:** Button calls `window.confirm` then logs to console.

**Needed:** `DELETE /api/users/me` that soft-deletes the user, invalidates the
session cookie, and returns 204. Matters owned by the user follow whatever
retention policy we land on (TBD — flag for a separate decision).
