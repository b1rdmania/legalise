# Phase 17A — Matter Record Summary Slice

**Branch:** `phase-17-crm-pass`
**Status:** first 17A slice complete; no substrate touched.

## What changed

- Converted the Phase 17 walkthrough gate to a virtual
  operator-proxy approximation in:
  - `PHASE_17_CRM_ERGONOMIC_PLAN.md`
  - `PHASE_17_COLD_WALKTHROUGH.md`
- Locked the initial virtual build order:
  1. Matter detail / action panel
  2. Modules / integrations manager
  3. Audit reconstruction / oversight timeline
- Added `MatterRecordSummary` at the top of the matter detail page.
  It makes the record-page frame explicit: title, slug, matter type,
  status, posture, document count, audit-window count, opened date,
  and direct actions to Documents, Workflows, Artifacts, and Audit.
- Reframed `GrantsPanel` copy from substrate-first "grants on this
  matter" to operator-first "Matter actions", with runnable modules
  first and permission records below.

## Findings addressed

- `MD-1` — matter page lacked a single record summary.
- `MD-2` — grants/invocation surface read like capability plumbing
  rather than an action panel.
- `MD-4` — action, artifact, and audit trail were not visually tied
  together from the matter page.

`MD-3` remains open: the tab set still mixes core workspace concepts
and module-specific workflows. That needs a larger IA pass after this
first slice.

## Verification

- `docker compose -f infra/docker-compose.yml up -d --build --force-recreate frontend`
- `docker compose -f infra/docker-compose.yml exec -T frontend npm run typecheck`
- `docker compose -f infra/docker-compose.yml exec -T frontend npx vitest run src/matter/MatterRecordSummary.test.tsx src/matter/GrantsPanel.test.tsx`
- `docker compose -f infra/docker-compose.yml exec -T frontend npm test`
- `docker compose -f infra/docker-compose.yml exec -T frontend npm run build`

Results:

- Typecheck clean.
- Focused tests: 16 passed.
- Full frontend tests: 129 passed.
- Build clean.

## Visual note

The running compose stack initially reused an old `infra` project
container that did not see newly added files. Recreating the frontend
service fixed the bind-mount view. Browser navigation verified the
local app is reachable; a protected matter-page visual check still
needs an authenticated session in the refreshed stack.

## Out of scope

- No backend files.
- No migrations.
- No schema or manifest changes.
- No module changes.
- No audit vocabulary changes.
