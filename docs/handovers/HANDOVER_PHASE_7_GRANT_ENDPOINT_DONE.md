# Handover — Phase 7 Done (`/grant` endpoint + scope-as-columns)

**Builder:** Claude
**Branch:** `runtime-rewrite`
**Plan:** `docs/handovers/PHASE_7_GRANT_ENDPOINT_BUILD_PLAN.md` (v2)
**Sweep:** 610 passed, 8 skipped, 0 failed

---

## Demo sentence (now true through real HTTP only)

> Install a signed module, **grant scoped permissions**, run it on a matter, produce an output, reconstruct the trail.

Pre-Phase-7 the "grant scoped permissions" half was true via test fixtures only — the vertical-slice integration test inserted grant rows directly because no endpoint existed. Phase 7 closes that gap. The Phase 6 vertical-slice test now walks the public HTTP surface between install and invoke:

```
POST /auth/register
POST /auth/login
POST /api/modules/install + advance (×4)
POST /api/matters/{slug}/grants          ← Phase 7 endpoint
(direct review_contract call — Phase 8+ wraps in invoke endpoint)
GET  /api/matters/{slug}/audit/reconstruction
```

The grants are matter-scoped at the database level. A grant for Matter A does not authorise Matter B. The runtime denial happens before document resolution, before the provider call, with no artifact written.

---

## Deliverables ledger

| Step | Title | Status | Commit |
| --- | --- | --- | --- |
| 0 | Migration `0019` — `scope_type` + `scope_id` columns | done | `792fd25` |
| 1 | Column-backed `require_capability` + Phase 4 cascade | done | `792fd25` |
| 2 | `core/grants_lifecycle.py` — `create_grants_for_capability` + `revoke_grant` | done | (this commit) |
| 3 | `api/grants.py` — three endpoints | done | (this commit) |
| 4 | `main.py` router registration | done | (this commit) |
| 5 | Phase 6 vertical-slice walks real `POST /grants` | done | (this commit) |
| 6 | Tests — 4 migration + 14 API | done | (this commit) |
| 7 | Full sweep green — 610 / 8 / 0 | done | (this commit) |
| 8 | This handover | done | (this commit) |

---

## Architectural decisions requesting Reviewer ratification

### Decision #1a — Scope is first-class on the grant row

Migration `0019_phase7_grant_scope_columns.py` adds:

- `scope_type VARCHAR(16) NOT NULL` — `"workspace"` or `"matter"`
- `scope_id UUID NULL` — matter UUID when scope is matter, NULL otherwise
- Check constraint `ck_grant_scope_pairing`: `(scope_type = 'matter') = (scope_id IS NOT NULL)` — they move together
- Drop old UNIQUE `uq_capability_grants_user_plugin_skill_capability` (Andy's note #1 catch: the real existing name, not the longer name in the plan draft)
- New UNIQUE `uq_grant_user_plugin_skill_cap_scope` on `(user_id, plugin, skill, capability, scope_type, scope_id)` with `NULLS NOT DISTINCT` (Postgres 15+; we're on 16)
- Index `ix_grant_user_plugin_skill_scope` for the point-lookup
- Backfill SQL: any pre-existing `snapshot.matter_id` becomes the row's `scope_id`; NULL snapshots remain `scope_type='workspace'`

**Why a migration in Phase 7:** Reviewer v1 surfaced that the original Phase 4/6 design held scope inside `granted_permissions_snapshot.matter_id` JSONB. The UNIQUE on `(user, plugin, skill, capability)` made it impossible for the same user to hold the same capability scoped to two matters. The vertical-slice claim "grant scoped permissions" was true for one matter only. The column promotion is the minimum DB correction that makes the sentence true at scale.

`granted_permissions_snapshot` survives as **provenance** — what the trust ceremony showed at grant time. It is no longer the uniqueness primitive.

### Decision #1b — Strict mutually-exclusive scope check

`require_capability(matter_id=None)` accepts ONLY `scope_type='workspace'` grants. `require_capability(matter_id=X)` accepts ONLY `scope_type='matter' AND scope_id=X`. The two are strict; no grant satisfies both.

Andy's note #3 on the plan made this explicit. Pre-redline, "workspace-broad check accepts both scoped and legacy grants" was the loose default. Strict semantics close the path where a user holding a matter grant on Matter A could pass a workspace-broad check on a non-matter resource.

The pre-existing `test_workspace_broad_check_unaffected_by_matter_scope` was rewritten as `test_workspace_broad_and_matter_scoped_checks_are_strict` to express the new contract.

### Decision #2 — Strict matter-access predicate, identical to Phase 5

`POST/DELETE/GET /api/matters/{slug}/grants` gate on:
- `Matter.created_by_id == user.id`, OR
- `User.is_superuser`

Same shape as Phase 5 reconstruction. Capability grants on the matter do NOT, on their own, satisfy access. A user granting their own authority is a privileged surface; only the matter owner uses it. 404 (not 403) for unauthorised access — uniform cross-user response that doesn't leak which matters exist.

### Decision #3 — Module must be installed AND enabled

Two separate failure modes:
- Module not installed → HTTP 404 `module_not_installed`
- Module installed but disabled → HTTP 409 `module_disabled`

Client knows whether to retry or chase an admin.

### Decision #4 — Idempotent POST; no-op emits zero audit rows

Re-posting the same `(module_id, capability_id)` for the same matter returns 200 with the existing row ids and **writes zero `module.grant.created` audit rows**.

Per Andy's note #4: an idempotent no-op must not produce duplicate audit rows. The reconstruction view shows "what authority was created when" — re-posts don't pollute that history. The endpoint signals which path it took via the `was_idempotent_noop` field in the response body, so callers can render correct UI without re-reading the rows.

First POST: HTTP 201 + one `module.grant.created` audit per new row.

### Decision #5 — Matter endpoint refuses workspace/global capabilities

If the requested capability's manifest declares `scope: workspace` or `scope: global`, the POST returns HTTP 422 `capability_scope_not_supported_here` with the offending capability's id + scope. **No grant row is written** — even partial grants would be confusing.

Reviewer v2: a matter URL must not be a path to global authority. Future `POST /api/workspace/grants` reserved for when a real caller needs workspace-broad grant management.

### Decision #6 — All three endpoints emit canonical audit shapes

- Grant created → one `module.grant.created` per newly-written row
- Grant revoked → `module.grant.revoked`
- List → no audit (read-only)

Both emission shapes are the same actions Phase 4 matter-archive cascade uses, so the reconstruction view renders explicit revoke and cascade revoke identically.

### Decision #7 — User to self only

`POST` grants the calling user's own capabilities on a matter they own. There is no path for "admin grants to another user". That's a Phase 8+ concern when a multi-user matter team becomes real.

---

## New / modified files

```
NEW
  backend/alembic/versions/0019_phase7_grant_scope_columns.py
  backend/app/api/grants.py
  backend/tests/test_phase7_grant_scope_migration.py
  backend/tests/test_phase7_grants_api.py
  docs/handovers/HANDOVER_PHASE_7_GRANT_ENDPOINT_DONE.md (this doc)

MODIFIED
  backend/app/main.py                              — register grants_router
  backend/app/models/workspace_skill_capability_grant.py  — scope_type/scope_id + constants + new constraints
  backend/app/models/__init__.py                   — export SCOPE_TYPE_*
  backend/app/core/capabilities.py                 — column-backed require_capability + grant() helper accepts scope kwargs
  backend/app/core/grants_lifecycle.py             — create_grants_for_capability + revoke_grant + GrantCreationResult + CapabilityScopeUnsupported
  backend/app/api/matters.py                       — Phase 4 cascade switches from JSONB to column reads
  backend/tests/test_phase4_matter_close_cascade.py — fixtures set scope columns alongside snapshot
  backend/tests/test_phase6_r2_fixes.py            — same; one R3 test rewritten for strict semantics
  backend/tests/test_phase6_vertical_slice.py      — walks real POST /grants endpoint between install and invoke
```

---

## Tests added (18 total)

| File | Tests | What it pins |
| --- | --- | --- |
| `test_phase7_grant_scope_migration.py` | 4 | Same tuple different scope coexists; identical scope rejects (incl. NULLS NOT DISTINCT for workspace); check constraint catches both invalid pairings |
| `test_phase7_grants_api.py` | 14 | POST happy path (cost columns + audit per row); idempotent no-op emits zero audit; **cross-matter independence** (A and B coexist; require_capability passes for both; third unknown matter denies); workspace-scope refused (422); unknown capability id (422); module not installed (404); module disabled (409); archived matter (404); non-owner (404). DELETE: revokes + audit + subsequent require_capability denies; non-existent id (404); archived matter (404). GET: lists only this matter; non-owner (404) |

---

## Subtleties surfaced during the build

Two corners that needed careful handling and would be easy to miss on a redo:

**1. Constraint name drift (Andy's note #1).**

The plan v2 sample SQL named the old unique constraint `uq_workspace_skill_capability_grants_user_plugin_skill_capability` (long form). The actual name from migration 0008 is `uq_capability_grants_user_plugin_skill_capability` (shorter). Dropping by the wrong name would have erroneously left the constraint in place silently. The model file's `__table_args__` was the source of truth and got verified before writing the DROP.

**2. Postgres NULLS NOT DISTINCT.**

Default Postgres UNIQUE treats NULL as never-equal-to-NULL — so two `(user, plugin, skill, capability, 'workspace', NULL)` rows would NOT conflict under a standard UNIQUE. That defeats the uniqueness for workspace-scope grants. The `NULLS NOT DISTINCT` modifier (Postgres 15+; we're on 16) makes them collide cleanly. The first `test_grant_is_idempotent` failure during build caught this and led to the fix.

---

## How to run

```bash
docker compose -f infra/docker-compose.yml up -d db backend

# Migrate to head (includes 0019).
docker compose -f infra/docker-compose.yml exec -T \
  -e POSTGRES_DSN="postgresql+psycopg://legalise:legalise@db:5432/legalise_test" \
  backend python -m alembic upgrade head

# Phase 7 only — 18 new tests.
docker compose -f infra/docker-compose.yml exec -T \
  -e POSTGRES_DSN="postgresql+asyncpg://legalise:legalise@db:5432/legalise_test" \
  -e TEST_DATABASE_URL="postgresql+asyncpg://legalise:legalise@db:5432/legalise_test" \
  backend python -m pytest \
    tests/test_phase7_grant_scope_migration.py \
    tests/test_phase7_grants_api.py \
    tests/test_phase6_vertical_slice.py

# Full sweep.
docker compose -f infra/docker-compose.yml exec -T \
  -e POSTGRES_DSN="postgresql+asyncpg://legalise:legalise@db:5432/legalise_test" \
  -e TEST_DATABASE_URL="postgresql+asyncpg://legalise:legalise@db:5432/legalise_test" \
  backend python -m pytest
```

---

## Out of scope at end of Phase 7

Still parked, intentionally:

- Posture-aware gate (block `legally_privileged` matter + non-solicitor) → **next phase** per Andy's roadmap
- Pre-Motion as second reference module → after the posture gate
- Async runtime → still parked at `PHASE_7_ASYNC_RUNTIME_PLAN_PARKED.md`
- Connector breadth → parked
- Frontend → Phase 12
- Sigstore real verification → Phase 11
- Cross-user grants (admin grants to another user) → Phase 8+
- Bulk grant / bulk revoke → Phase 8+ if a real UI hits it
- Workspace-scope grant endpoint (`POST /api/workspace/grants`) → reopens when a workspace-scope capability ships

---

## Hand-off line for Reviewer

> *Phase 7 (`/grant` endpoint + scope-as-columns) implemented end-to-end on `runtime-rewrite`. Full sweep green: 610 passed, 8 skipped. Seven architectural decisions request ratification. The vertical-slice integration test now walks real HTTP between install and invoke — no fixture writes grant rows. Cross-matter independence + idempotent no-op no-audit + workspace-scope refusal all proven by dedicated tests. Andy's three plan-redline notes (constraint name, scope constants, strict workspace-only check) all honoured. Ready for ratification.*

---

*End of Phase 7 handover.*
