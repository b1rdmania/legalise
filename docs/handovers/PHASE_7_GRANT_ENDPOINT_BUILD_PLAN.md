# Phase 7 Build Plan — `/grant` Endpoint

**Builder:** Claude (this session)
**Branch:** `runtime-rewrite`
**Base:** `872e921` (Phase 6 R3 closed; sweep 592/8)
**Goal:** Close the install-to-run gap so the Phase 6 vertical-slice
story doesn't depend on tests writing grant rows directly. After this
phase, a real HTTP client can: install module (admin) → grant
capabilities to itself for a matter (per-user) → invoke the capability.

KISS rule (Andy's): every change must make the Contract Review
slice more truthful, or enable the next brutal reference module.
Phase 7 is the first option — the slice is the only path that
exercises grants today, which is a real shape gap. This phase
removes it.

---

## Scope (deliberately small)

Three HTTP endpoints + one audit shape + the existing grant lifecycle
helpers from Phase 4. No new tables. No new substrate. No new
permissions vocabulary.

**In:**
- `POST /api/matters/{slug}/grants` — grant a capability on a matter
- `DELETE /api/matters/{slug}/grants/{grant_id}` — revoke
- `GET /api/matters/{slug}/grants` — list grants on this matter

**Out (parked, KISS):**
- Bulk grant
- Per-grant expiry
- Grant approval workflow (multi-party)
- Grant transfer between users
- Cross-matter view of "what do I have access to" — Phase 8+
- Frontend UI — Phase 12

---

## Pre-build findings

- The trust ceremony is the install-time admin gate. It writes
  `InstalledModule` + its `permissions_snapshot`. That's where the
  workspace as a whole says "this module is trusted to exist."
- Per-user grants live in `WorkspaceSkillCapabilityGrant`. Phase 2
  added `capability_version`, `granted_at_module_version`,
  `granted_permissions_snapshot` (JSONB). Phase 4 keyed matter
  scope through the snapshot.
- Phase 6 R3 wired `require_capability(..., matter_id=...)` to
  honour the snapshot. So once a grant row exists with the matter
  scope, the runtime governs it correctly.
- The Phase 6 vertical-slice test inserts these rows directly. The
  acceptance bar still holds, but the only thing standing between
  "install" and "invoke" today is a test fixture. That's the gap.

### Architectural decisions taken pre-code

**Decision #1 — One endpoint, one capability per call.**

Granting "the whole module on this matter" is not coherent: a
module's manifest can carry multiple capabilities with different
scopes and gates. The user must opt in per capability so what they
authorised is what the audit shows.

`POST /api/matters/{slug}/grants` body:
```
{
  "module_id": "examples.contract-review",
  "capability_id": "review"
}
```

The server looks up the `InstalledModule`, finds the matching
capability declaration in its `manifest_snapshot`, and writes one
`WorkspaceSkillCapabilityGrant` row per capability string declared
in `reads + writes`. Each row gets
`granted_permissions_snapshot = {matter_id, capability_id, capability_version, ...}`.

**Decision #2 — Strict matter-access predicate, identical to Phase 5 reconstruction.**

Same matter-access shape that gates reconstruction:
- Matter owner (`Matter.created_by_id == user.id`), OR
- `User.is_superuser`

A user grants capabilities to **themselves** on a matter they own.
Phase 8+ extends to "matter member" once that role table exists.

**Decision #3 — Grant requires the module to be installed AND enabled.**

`InstalledModule.enabled = True` is the precondition. Disabled
installs don't accept new grants. Existing grants for a disabled
module survive (they keep their audit linkage) but new ones can't
be written. Phase 4's matter-archive cascade already revokes grants
on a closed matter; the grant endpoint enforces the same direction
of dependency.

**Decision #4 — Idempotent grant; revoke is by row id.**

Re-granting the same `(user, module_id, capability_id, matter_id)`
returns 200 with the existing rows, not 409. Two reasons:
- Removes a footgun for UIs that retry on network blips.
- Matches the Phase 4 grant lifecycle convention (snapshot-keyed
  idempotence).

Revoke is by individual `WorkspaceSkillCapabilityGrant.id`. Bulk
revoke ("remove everything for this module on this matter") is
client-side — list, then DELETE each id. Phase 8+ may add a bulk
form once a real UI hits it.

**Decision #5 — Capability scope honoured (not just declared).**

When the manifest declares `scope: workspace` on a capability, the
grant goes through WITHOUT a matter id in the snapshot — workspace-
broad. When the manifest declares `scope: matter`, the snapshot
MUST carry the slug-resolved `matter_id`. This is enforced server-
side so a client can't smuggle a workspace-broad grant via the
matter-scoped endpoint.

**Decision #6 — All three endpoints emit audit rows.**

- Grant created → `module.grant.created` (one row per capability
  string written; payload references the parent capability_id).
- Grant revoked → `module.grant.revoked` (one row per row revoked).
- Grant list → no audit row (read-only).

`module.grant.created` and `module.grant.revoked` already exist as
action names (Phase 4 cascade emits the latter on matter close);
the endpoint shares the shape so reconstruction renders both code
paths identically.

---

## Critical path

```
Step 1: api/grants.py — three endpoints
   ↓
Step 2: GrantService helper in core/grants_lifecycle.py
        (write grant rows + emit audits + idempotence)
   ↓
Step 3: Wire into main.py
   ↓
Step 4: Update Phase 6 vertical-slice test to use the
        endpoint instead of inserting grant rows directly
   ↓
Step 5: Tests for the three endpoints (happy + negatives)
   ↓
Step 6: Full sweep green
   ↓
Step 7: HANDOVER_PHASE_7_GRANT_ENDPOINT_DONE.md
```

~6 days at recent cadence; ~25 new tests.

---

## Step 1 — `api/grants.py`

**File:** `backend/app/api/grants.py` (new)

Three endpoints, all under `/api/matters/{slug}/grants`:

- `POST` — body `{module_id, capability_id}` → 201 with the list of
  grant row ids written. Emits `module.grant.created` per row.
- `DELETE /{grant_id}` → 204. Emits `module.grant.revoked`.
- `GET` → list current grants on this matter, with the parent
  capability they belong to.

All three apply the strict matter-access predicate (Phase 5's
`_load_matter_or_403`-shape). Route registration order: AFTER the
broad matters router, same rule as Phase 5.

~180 LOC.

---

## Step 2 — `core/grants_lifecycle.py` extension

**File:** `backend/app/core/grants_lifecycle.py` (extend)

**Public surface:**
- `async def create_grants_for_capability(session, *, user, matter, installed_module, capability_id) -> list[WorkspaceSkillCapabilityGrant]`
- `async def revoke_grant(session, *, user, grant_id) -> WorkspaceSkillCapabilityGrant | None`

The grant-creation helper:
1. Loads the capability declaration from `installed_module.manifest_snapshot`.
2. Walks `capability.reads + capability.writes`.
3. Idempotent INSERT per capability string with snapshot containing
   `matter_id` (when scope is matter) or empty (when workspace).
4. Emits `module.grant.created` audit per row written.
5. Returns the rows.

The revoke helper:
1. Loads the grant row by id.
2. Confirms it belongs to the caller + the matter.
3. Deletes (WorkspaceSkillCapabilityGrant is NOT WORM — Phase 4
   cascade already DELETEs).
4. Emits `module.grant.revoked` audit.

~150 LOC delta.

---

## Step 3 — Wire into main.py

One line: `app.include_router(grants_router, prefix="/api/matters", tags=["grants"])` — registered AFTER the matters router so `/{slug}/grants` doesn't collide with the catch-all matter detail route.

~5 LOC.

---

## Step 4 — Update Phase 6 vertical-slice test

`tests/test_phase6_vertical_slice.py` currently inserts grant rows
directly between "install" and "invoke". Replace that block with a
real `POST /api/matters/{slug}/grants` call. The vertical-slice
test then walks **only HTTP endpoints** end-to-end:

- POST /auth/register
- POST /auth/login
- POST /api/modules/install + advance (×4)
- POST /api/matters/{slug}/grants
- (direct review_contract call still — Phase 8+ adds the invoke endpoint)
- GET /api/matters/{slug}/audit/reconstruction

This is the single test that proves the user-facing surface is the
real path. The acceptance bar gets tighter.

~30 LOC delta.

---

## Step 5 — Tests

**File:** `backend/tests/test_phase7_grants_api.py` (new)

~25 tests:

- POST happy path — admin installs, owner grants, rows land with
  matter-scoped snapshot, audit row per write
- POST idempotence — same body twice returns same row ids, no
  duplicates
- POST non-owner → 404 (uniform cross-user response, same as Phase 5)
- POST disabled module → 409
- POST archived matter → 404
- POST module not installed → 404
- POST capability_id not in module → 422 with structured error
- POST workspace-scope capability → snapshot has no matter_id
- DELETE happy path — row gone, audit row written, subsequent
  invoke denies via require_capability
- DELETE non-owner → 404
- DELETE foreign grant (different user's row) → 404
- DELETE archived matter → 404 (grants on archived matters can't be
  touched via this endpoint; Phase 4 cascade already handled the
  archive case)
- GET happy path — returns the rows owner created
- GET non-owner → 404
- GET archived matter → 404
- (+ negatives for malformed body, missing fields, etc.)

---

## Step 6 — Full sweep

- Phase 7 only: ~25 new tests
- Phases 1–7 combined: ~617 tests
- Entire backend stays green.

---

## Step 7 — Handover

`HANDOVER_PHASE_7_GRANT_ENDPOINT_DONE.md` covers:
- Six architectural decisions for Reviewer ratification
- Deliberate variance note: Phase 7 grants user → self only;
  cross-user grant (admin grants to another user) is Phase 8+
- Updated vertical-slice test as the canonical end-to-end proof
- Hand-off line for Reviewer

---

## Out of scope (intentional)

- Posture-aware gate (block `legally_privileged` matter + non-solicitor) → next phase
- Pre-Motion as second reference module → after the posture gate
- Async runtime → still parked
- Connector breadth → still parked
- Frontend → Phase 12
- Sigstore real verification → Phase 11
- Cross-user grants (admin → other user) — Phase 8+
- Bulk grant / bulk revoke — Phase 8+
- Per-grant expiry / TTL — Phase 9+ if a real use case appears

---

*End of `/grant` endpoint build plan. Builder commits this, then waits for Reviewer redline before Step 1.*
