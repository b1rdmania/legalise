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

## ~~TODO(workflow-state)~~ SHIPPED 2026-05-19 (reviewer-tightened)

`GET /api/matters/{slug}/workflows` returns five workflow states, each
derived live from declared capabilities, the union of the user's
granted capabilities, the matter posture, and the audit log.

- `grant`: `granted` / `partial` / `blocked`. Workspace-level signal:
  does the workspace hold the runtime capability types this workflow
  needs? NOT per-skill enforcement.
- `availability`: `ok` / `blocked-by-posture` / `blocked-by-grant`.
- `last_run_at`: most recent audit timestamp whose `module` matches the
  workflow's `audit_modules` set. No denorm table.
- `reason`: human string when blocked.

`declared_capabilities` MUST be a subset of the runtime vocabulary in
`app.core.capabilities.CAPABILITY_VOCABULARY`. Audit emission is
mandatory provenance and is NOT a capability; descriptive metadata
("writes review table", "uses network") belongs in the human
`description`, not in `declared_capabilities`. Enforced by
`test_workflow_declared_capabilities_match_runtime_vocabulary`.

v0.1 admits the endpoint is a built-in catalogue (five workflows are
in-app pipelines, not installed plugins) - `not-installed` is
deliberately absent from the response enum. Guard:
`test_workflows_grant_values_never_include_not_installed`.

Workflow definitions (`WORKFLOW_DEFS`) live alongside the route in
`backend/app/api/matters.py`. Frontend `WorkflowsTab.tsx` fetches via
`getMatterWorkflows()` and renders the real `grant` / `last run` /
`availability`. Matter ownership scoped via the existing
`created_by_id` check. Tests in
`backend/tests/test_matter_workflows_route.py` (7) cover shape,
default blocked, grant derivation, posture blocking, last-run-at
audit sourcing, 404 for non-owner matters, runtime-vocabulary subset,
and no-`not-installed`-leak.

## ~~TODO(plan)~~ SHIPPED 2026-05-19

`User.plan` is a `String(32)` column on the users table, defaulted to
`"free"` at both ORM and SQL level (alembic `0009_user_plan`). Every
new user signs up `free`. Surfaced via the fastapi-users `UserRead`
schema, so `/auth/users/me` returns the field. `CurrentUser` on the
frontend carries it; `Settings.tsx` profile capitalises the value
("free" -> "Free") for the badge.

**No enforcement.** No Stripe wiring, no plan-based gating, no limits.
v0.1 keeps this honest: the field is signage, not a billing contract.
Tests in `backend/tests/test_user_plan.py` assert new users default to
`free` and the value flows through both `/auth/register` and
`/auth/users/me`.

## ~~TODO(delete-account)~~ SHIPPED 2026-05-19

`DELETE /auth/users/me` (mounted from `backend/app/api/account.py`)
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
