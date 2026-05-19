# Backend TODOs

Surfaced during the v0.4 design pass. Frontend currently fakes these with static
data or `window.confirm`; the real fix is a backend endpoint.

## TODO(public-modules)

**Where:** `frontend/src/pages/ModulesPage.tsx` unauth catalogue (and the same
data feeds the in-matter Workflows catalogue).

**Current state:** Catalogue cards render from the frontend `WORKFLOW_TABS`
constant in `frontend/src/matter/tabs/types.ts`. Unauth visitors see the same
five hardcoded modules an authed user sees, regardless of what's actually
installed in `PLUGINS_ROOT`.

**Needed:** `GET /api/modules/public` returning the list of installed plugins
with `key`, `label`, `blurb`, declared `capabilities`, and `version`. Read-only,
no auth. Frontend swaps the constant for fetched data.

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
