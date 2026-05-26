# Phase 7 Build Plan v2 — `/grant` Endpoint

**Builder:** Claude (this session)
**Branch:** `runtime-rewrite`
**Base:** `872e921` (Phase 6 R3 closed; sweep 592/8)
**Supersedes:** Phase 7 v1 (in this same file, pre-redline).
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

Three HTTP endpoints + one **schema migration that makes scope
first-class on grants** + the existing grant lifecycle helpers from
Phase 4. No new tables. No new substrate. No new permissions
vocabulary.

**Why a migration (v2 redline):** Reviewer P1 surfaced that the
current `WorkspaceSkillCapabilityGrant` UNIQUE on
`(user_id, plugin, skill, capability)` makes it physically
impossible for the same user to hold the same capability scoped to
both Matter A and Matter B. The vertical-slice story is currently
true for ONE matter; the plan as written can't make it true for
two. Phase 6 R3 patched `require_capability` to read
`granted_permissions_snapshot.matter_id`, but the uniqueness
primitive never moved. v2 fixes that. The plan grows by one
migration (0019).

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

**Decision #1a (v2) — Scope is a first-class column pair, not a JSONB lookup.**

Migration `0019_grant_scope_columns.py` adds two columns to
`workspace_skill_capability_grants`:

- `scope_type VARCHAR(16) NOT NULL` — `"workspace"` or `"matter"`
- `scope_id UUID NULL` — populated when `scope_type='matter'`

Plus:
- Check constraint `(scope_type = 'matter') = (scope_id IS NOT NULL)` — they move together.
- Drop the old UNIQUE on `(user_id, plugin, skill, capability)`.
- Add the new UNIQUE on `(user_id, plugin, skill, capability, scope_type, scope_id)`.
- Backfill existing rows as `scope_type='workspace', scope_id=NULL`.
- Index `(user_id, plugin, skill, scope_type, scope_id)` keeps `require_capability` a single point-lookup.

`granted_permissions_snapshot` stays as provenance (what the
trust ceremony showed at grant time). Scope reads from the columns,
not the JSONB.

Three callers update to use the columns:

1. `require_capability(..., matter_id=...)` — switches from
   `snapshot->>'matter_id'` to `scope_type/scope_id`.
2. Phase 4 matter-archive cascade — same switch.
3. Phase 6 vertical-slice + R2/R3 tests — fixture helpers now
   populate the columns directly. Snapshot still carries matter_id
   as provenance.

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

**Idempotent no-op does NOT emit duplicate audit rows.** Reviewer
v2 clarification: when the POST is an idempotent no-op (no new
rows written because all already exist), `module.grant.created`
is NOT emitted. The endpoint returns 200 with the existing rows
and writes no audit. A first-time POST that creates N rows writes
N `module.grant.created` rows. A subsequent identical POST writes
zero. This keeps the reconstruction view honest — "what
authority was created when" is unambiguous.

Revoke is by individual `WorkspaceSkillCapabilityGrant.id`. Bulk
revoke ("remove everything for this module on this matter") is
client-side — list, then DELETE each id. Phase 8+ may add a bulk
form once a real UI hits it.

**Decision #5 (v2) — Matter endpoint refuses workspace/global capabilities outright.**

Reviewer P1: a matter-scoped endpoint must not silently produce
workspace authority. If the requested capability's manifest
declaration is `scope: workspace` or `scope: global`, the POST
returns:

```
HTTP 422
{
  "error": "capability_scope_not_supported_here",
  "message": "POST /api/matters/{slug}/grants only accepts matter-scope capabilities.",
  "capability_scope": "<workspace|global>"
}
```

Workspace-scope grants get a future
`POST /api/workspace/grants` endpoint when a real caller needs
one. Today no module ships a workspace-scope capability in the
canonical set, so cutting this off is zero-loss and
semantically cleaner: the matter URL grants matter authority,
end of story.

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

## Critical path (v2)

```
Step 0: migration 0019_grant_scope_columns.py
        + model update + backfill + tests pinning the new constraint
   ↓
Step 1: switch require_capability + Phase 4 cascade from
        snapshot.matter_id to scope_type/scope_id
   ↓
Step 2: core/grants_lifecycle.py — create_grants_for_capability +
        revoke_grant helpers (column-driven; idempotent;
        emit-audit-only-on-actual-create)
   ↓
Step 3: api/grants.py — three endpoints with matter-scope-only
        gating + the strict matter-access predicate
   ↓
Step 4: Wire into main.py
   ↓
Step 5: Update Phase 6 vertical-slice test to use the endpoint
        instead of inserting grant rows directly
   ↓
Step 6: Tests for the migration + the three endpoints +
        cross-matter scenario
   ↓
Step 7: Full sweep green
   ↓
Step 8: HANDOVER_PHASE_7_GRANT_ENDPOINT_DONE.md
```

~7 days at recent cadence; ~32 new tests (up from ~25 to cover
the migration + the column-driven require_capability path).

---

## Step 0 — Migration `0019_grant_scope_columns.py`

**File:** `backend/alembic/versions/0019_grant_scope_columns.py` (new)

Per Decision #1a:

```sql
ALTER TABLE workspace_skill_capability_grants
  ADD COLUMN scope_type VARCHAR(16) NOT NULL DEFAULT 'workspace',
  ADD COLUMN scope_id   UUID NULL;

ALTER TABLE workspace_skill_capability_grants
  ALTER COLUMN scope_type DROP DEFAULT;

ALTER TABLE workspace_skill_capability_grants
  ADD CONSTRAINT ck_grant_scope_pairing
  CHECK ((scope_type = 'matter') = (scope_id IS NOT NULL));

-- Backfill any pre-existing snapshot.matter_id rows into the new
-- columns so Phase 6 R3 tests + Phase 4 cascade keep working.
UPDATE workspace_skill_capability_grants
   SET scope_type = 'matter',
       scope_id   = (granted_permissions_snapshot ->> 'matter_id')::uuid
 WHERE granted_permissions_snapshot ->> 'matter_id' IS NOT NULL;

-- Re-key uniqueness.
ALTER TABLE workspace_skill_capability_grants
  DROP CONSTRAINT uq_workspace_skill_capability_grants_user_plugin_skill_capability;
ALTER TABLE workspace_skill_capability_grants
  ADD CONSTRAINT uq_grant_user_plugin_skill_cap_scope
  UNIQUE (user_id, plugin, skill, capability, scope_type, scope_id);

CREATE INDEX ix_grant_user_plugin_skill_scope
  ON workspace_skill_capability_grants
     (user_id, plugin, skill, scope_type, scope_id);
```

`WorkspaceSkillCapabilityGrant` model gains the two columns.
`granted_permissions_snapshot` stays — it's provenance now, not the
uniqueness primitive.

~80 LOC + 4 unit tests pinning: new constraint accepts two grants
for the same (user, plugin, skill, capability) when scopes differ;
rejects two with identical scope; check constraint catches
`scope_type='matter' AND scope_id IS NULL`; backfill produces
correct columns from snapshot.

---

## Step 1 — Column-driven `require_capability` + Phase 4 cascade

**Files:**
- `backend/app/core/capabilities.py` (extend `require_capability`)
- `backend/app/api/matters.py` (extend the matter-archive cascade)

`require_capability(..., matter_id=...)` switches the SQL filter
from `granted_permissions_snapshot->>'matter_id' = :matter_id` to
`scope_type = 'matter' AND scope_id = :matter_id`. When
`matter_id` is None, filter `scope_type = 'workspace' AND
scope_id IS NULL`. The denial audit row's `scope` field reads
from the new columns.

Phase 4 matter-archive cascade switches the same way:
`DELETE FROM workspace_skill_capability_grants WHERE
scope_type = 'matter' AND scope_id = :matter_id`. The cascade test
(`test_grant_with_matter_id_in_snapshot_revoked_on_archive`) still
passes because the migration backfilled the columns from the
snapshot.

~50 LOC delta + 3 tests confirming: workspace-broad check still
matches legacy grants; matter-scoped check rejects mismatched
scope; cascade DELETEs by scope_id, not by snapshot.

---

## Step 2 — `core/grants_lifecycle.py` extension

**File:** `backend/app/core/grants_lifecycle.py` (extend)

**Public surface:**
- `async def create_grants_for_capability(session, *, user, matter, installed_module, capability_id) -> list[WorkspaceSkillCapabilityGrant]`
- `async def revoke_grant(session, *, user, grant_id) -> WorkspaceSkillCapabilityGrant | None`

The grant-creation helper:
1. Loads the capability declaration from `installed_module.manifest_snapshot`.
2. If `capability.scope != "matter"` → raise `CapabilityScopeUnsupported` (Step 3 catches and returns 422).
3. Walks `capability.reads + capability.writes`.
4. For each capability string: SELECT for existing row with same
   `(user, plugin, skill, capability, scope_type='matter', scope_id=matter.id)`.
5. INSERT only for those that don't yet exist.
6. Emit `module.grant.created` audit ONLY for newly-written rows (Decision #4 v2 clarification).
7. Returns the full list (existing + new).

The revoke helper:
1. Loads the grant row by id.
2. Confirms it belongs to the caller + the matter (`scope_id == matter.id`).
3. Deletes (the table is NOT WORM — Phase 4 cascade also DELETEs).
4. Emits `module.grant.revoked` audit.

~180 LOC delta.

---

## Step 3 — `api/grants.py`

**File:** `backend/app/api/grants.py` (new)

Three endpoints, all under `/api/matters/{slug}/grants`:

- `POST` — body `{module_id, capability_id}`. Looks up the
  `InstalledModule` + the capability declaration. If `capability.scope`
  is not `"matter"` → 422 `capability_scope_not_supported_here`
  (Decision #5 v2). If module not installed/enabled → 404 / 409.
  Otherwise delegates to `create_grants_for_capability`.
  Idempotent: returns 201 with row ids if anything was newly
  written, 200 with row ids on a pure no-op.
- `DELETE /{grant_id}` → 204. Delegates to `revoke_grant`.
- `GET` → list current grants on this matter, grouped by their
  parent capability_id.

All three apply the strict matter-access predicate (Phase 5's
`_load_matter_or_403` shape). Route registration order: AFTER the
broad matters router, same rule as Phase 5 audit.

~200 LOC.

---

## Step 4 — Wire into main.py

One line: `app.include_router(grants_router, prefix="/api/matters", tags=["grants"])` — registered AFTER the matters router so `/{slug}/grants` doesn't collide with the catch-all matter detail route.

~5 LOC.

---

## Step 5 — Update Phase 6 vertical-slice test

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

## Step 6 — Tests

**Two files:**
- `backend/tests/test_phase7_grant_scope_migration.py` — 4 tests pinning the migration shape (see Step 0).
- `backend/tests/test_phase7_grants_api.py` — ~28 tests.

### Migration tests (4)

- Two grants for the same `(user, plugin, skill, capability)` with
  different `scope_id` both insert OK.
- Two grants with identical scope reject on the new unique.
- `scope_type='matter' AND scope_id IS NULL` rejected by check.
- Backfill correctness: old row with `snapshot.matter_id` ends up
  with `scope_type='matter'` and the matching `scope_id`.

### API tests (~28)

POST:
- happy path — admin installs, owner grants, rows land with
  `scope_type='matter', scope_id=matter.id`; `module.grant.created`
  audit emitted per newly-written row
- idempotent no-op — same body twice; second call returns 200
  with the same row ids and **emits zero new audit rows**
  (Decision #4 v2)
- **cross-matter independence** — same user grants Contract Review
  on Matter A then on Matter B; both grant sets coexist; subsequent
  `require_capability(matter_id=A)` and `require_capability(matter_id=B)`
  both pass; `require_capability(matter_id=C)` for an ungranted
  matter denies
- non-owner → 404
- disabled module → 409
- archived matter → 404
- module not installed → 404
- `capability_id` not in module → 422 with structured error
- **workspace-scope capability → 422 `capability_scope_not_supported_here`**
  (Decision #5 v2 — NO grant row is written)

DELETE:
- happy path — row gone, audit row written, subsequent invoke denies
  via `require_capability`
- non-owner → 404
- foreign grant (different user's row) → 404
- archived matter → 404 (grants on archived matters can't be touched
  via this endpoint; Phase 4 cascade already handled the archive case)

GET:
- happy path — returns the rows the owner created, grouped by
  parent capability_id
- non-owner → 404
- archived matter → 404
- (+ negatives for malformed body, missing fields, etc.)

---

## Step 7 — Full sweep

- Phase 7 only: ~32 new tests (4 migration + ~28 API)
- Phases 1–7 combined: ~624 tests
- Entire backend stays green.

---

## Step 8 — Handover

`HANDOVER_PHASE_7_GRANT_ENDPOINT_DONE.md` covers:
- Six architectural decisions + Decision #1a (scope columns) for
  Reviewer ratification
- Migration `0019` notes
- Deliberate variance note: Phase 7 grants user → self only;
  cross-user grant (admin → another user) is Phase 8+
- Note: workspace/global-scope grants get a future
  `POST /api/workspace/grants` endpoint when needed; no current
  module ships a workspace-scope capability
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

## Reviewer redlines applied (v2)

1. **P1 — Scope is now a first-class column pair.** Decision #1a + Step 0 migration `0019_grant_scope_columns.py` adds `scope_type` + `scope_id` with the right uniqueness. Step 1 switches `require_capability` and the Phase 4 cascade to read the columns. The vertical-slice story is now general across multiple matters, not just one.
2. **P1 — Matter endpoint refuses workspace/global capabilities.** Decision #5 v2: POST returns `422 capability_scope_not_supported_here` for any non-matter-scope capability. No workspace authority gets created from a matter URL. Future workspace-grant endpoint reserved for when a real caller needs it.
3. **Clarification — Idempotent POST emits no audit on no-op.** Decision #4 v2 + Step 2 + Step 6 test. A second identical POST writes zero `module.grant.created` rows so reconstruction shows what was created when, not what was re-posted.

---

*End of `/grant` endpoint build plan v2. Builder commits this, then waits for Reviewer ratification before Step 0.*
