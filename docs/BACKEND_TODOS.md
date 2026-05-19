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

## ~~TODO(workflow-state)~~ SHIPPED 2026-05-19

`GET /api/matters/{slug}/workflows` returns five workflow states, each
derived live from declared capabilities, the union of the user's
granted capabilities, the matter posture, and the audit log.

- `grant`: `granted` / `partial` / `blocked` / `not-installed`
- `availability`: `ok` / `blocked-by-posture` / `blocked-by-grant` /
  `not-installed`
- `last_run_at`: most recent audit timestamp whose `module` matches the
  workflow's `audit_modules` set. No denorm table.
- `reason`: human string when blocked.

Workflow definitions (`WORKFLOW_DEFS`) live alongside the route in
`backend/app/api/matters.py` and are the canonical taxonomy. Frontend
`WorkflowsTab.tsx` fetches via `getMatterWorkflows()` and renders the
real `grant` / `last run` / `availability` instead of static placeholders.
Matter ownership scoped via the existing `created_by_id` check. Tests
in `backend/tests/test_matter_workflows_route.py` cover shape, default
blocked, grant derivation (partial vs granted), posture blocking,
last-run-at audit sourcing, and 404 for non-owner matters.

## TODO(plan)

**Where:** `frontend/src/pages/SettingsPage.tsx` plan section.

**Current state:** Renders a hardcoded "Free" badge. No source of truth.

**Needed:** Add a `plan` field to `CurrentUser` (string: `free` / `pro` /
`team`). Settable when billing wires up later; for now seed all users `free`.

## ~~TODO(delete-account)~~ SHIPPED 2026-05-19

`DELETE /api/users/me` (mounted from `backend/app/api/account.py`)
implements the locked v0.1 policy from the reviewer pass:

- **Matter count > 0**: 409 with
  `{error: "account_has_matters", message, matter_count}`. No deletion.
  v0.1 safety rail; v0.2 adds matter export / delete then a graceful
  account-deletion flow that walks through it.
- **Matter count == 0**: 204. `is_active=False`, profile fields scrubbed
  (`name`, `default_model_id`, `default_privilege_posture`), every
  `AccessToken` row for the user removed, session cookie cleared.
- **Audit entries never cascade.** `AuditEntry.actor_id` is nullable;
  hard purge with anonymisation is a v0.2 background job.

Tests in `backend/tests/test_account_delete.py` cover: no-matters
soft-delete + session revocation + cookie clear, matters-owned 409,
audit FK survival, auth-required, and per-user session isolation.

Frontend `Settings.tsx` danger-zone now wires to `deleteAccount()` in
`lib/api.ts`. Throws `AccountHasMattersError` with `matterCount` on 409;
copy bumps the user to "Export or delete matters first (matter-delete
lands in v0.2)."
