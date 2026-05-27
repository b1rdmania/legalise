# Phase 17 Walkthrough Unblockers

**Branch:** `codex/fix-signup-ci`
**Purpose:** close the two pre-walkthrough blockers surfaced before
Phase 17A/B/C starts. This is not the CRM redesign pass.

## What Changed

1. Local Vite dev now proxies `/auth` to the backend, matching `/api`
   and `/health`. This closes the signup 404 caused by the browser
   posting to the frontend dev server instead of FastAPI.
2. Self-host/dev frontend access now defaults to `open`. Waitlist mode
   is also gated to the hosted domain, so localhost / CI preview cannot
   accidentally hide the auth forms if an env layer drifts.
3. Landing page now exposes explicit unauthenticated actions:
   `Sign in` and `Create account`. This closes L-1 from the
   walkthrough attempt.
4. Phase 15 e2e preview now uses a tiny explicit static SPA server
   instead of `vite preview`. CI showed `vite preview` returning
   `500` plus empty HTML for `/auth/signin`; the e2e server serves
   `dist` assets and falls back to `index.html` for deep links.
5. The e2e workflow now smokes `/auth/signin`, not just `/`, before
   Playwright starts. A broken auth deep link fails at setup instead
   of wasting the full suite.

## Why It Is Safe

- No backend files touched.
- No substrate files touched.
- No Phase 17 target-screen redesign started.
- The changes only make existing auth surfaces reachable from a fresh
  local fork.

## Verification

- `docker compose -f infra/docker-compose.yml exec -T frontend npm run typecheck`
- `docker compose -f infra/docker-compose.yml exec -T frontend npm test`
- `docker compose -f infra/docker-compose.yml exec -T frontend npm run build`
- `docker compose -f infra/docker-compose.yml exec -T frontend npm run preview:e2e -- --host 0.0.0.0 --port 4173`
- `docker compose -f infra/docker-compose.yml exec -T backend python -m pytest tests/test_phase10_invocations_api.py -q`
- Manual: POST `/auth/register` through the frontend dev server reached
  FastAPI and returned `201`.

## Next

Resume the Phase 17 operator-proxy walkthrough from `/`. Do not begin
Matter / Modules / Audit redesign until the walkthrough artifact is
filled and reviewed.
