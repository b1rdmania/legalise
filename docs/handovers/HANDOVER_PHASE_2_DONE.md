# Handover — Phase 2 Done

**Builder:** Claude (this session)
**Branch:** `runtime-rewrite`
**Head:** current branch head (latest Phase 2 commit; see git log)
**Acceptance gate:** awaiting Reviewer ratification (CI validation in flight)
**Phase 3 status:** blocked until this handover is reviewed

---

## What landed

Phase 2 delivers the **manifest v2 + capability registry** layer per
`docs/handovers/PHASE_2_BUILD_PLAN.md` and the architecture doc
`docs/architecture/MANIFEST_V2_SCHEMA.md`. v1 modules continue to
function unchanged through the auto-derivation shim.

### Commits (in order)

| Commit | What |
|---|---|
| `5f011fd` | Phase 2 build plan written before code |
| `5e624f6` | `schemas/module.v2.json` — JSON Schema |
| `2edf5ea` | Capability vocabulary grammar extension |
| `4321958` | `core/registry/` — discovery + validator + v1→v2 shim |
| `eeac38e` | Migration 0015 + grant model extension |
| `4e4bab0` | API endpoints (v2 manifest + capability catalogue) |
| `21efe01` | Tests (45 new) + route-ordering fix |

### File-by-file delta

**New files:**

- `schemas/module.v2.json` — Draft 2020-12 JSON Schema for the v2 manifest.
- `backend/app/core/registry/__init__.py` — public surface for the registry.
- `backend/app/core/registry/discovery.py` — module discovery across `backend/app/modules/`, `examples/modules/`, and `settings.plugins_root`.
- `backend/app/core/registry/validator.py` — JSON Schema + code-level validation; emits structured error list.
- `backend/app/core/registry/shim.py` — v1 → v2 auto-derivation for both SKILL.md and `module.json` sources.
- `backend/app/core/registry/slots.py` — `UISlotRegistry` with canonical 9-slot vocabulary.
- `backend/app/core/registry/capability_catalogue.py` — flat catalogue of declared capabilities across all modules.
- `backend/alembic/versions/0015_phase2_grants_v2.py` — migration: widens `plugin` → `VARCHAR(128)`, `capability` → `VARCHAR(256)`, adds 3 nullable columns to `workspace_skill_capability_grants`.
- `backend/tests/test_phase2_schema.py` (16 tests)
- `backend/tests/test_phase2_capability_grammar.py` (8 tests)
- `backend/tests/test_phase2_registry.py` (11 tests)
- `backend/tests/test_phase2_grants_v2.py` (4 tests)
- `backend/tests/test_phase2_api.py` (5 tests)

**Extended files:**

- `backend/app/core/capabilities.py` — adds `is_valid_capability_string`, `assert_capability_string`, `capability_scope`. Legacy v1 vocabulary intact.
- `backend/app/api/modules.py` — three new endpoints (`/v2`, `/v2/capabilities`, `/v2/{module_id}`) registered BEFORE the legacy catch-all `/{plugin}/{skill}`.
- `backend/app/models/workspace_skill_capability_grant.py` — three new nullable columns; widened `plugin` and `capability` column types.

---

## Architectural decisions taken (Reviewer ratification requested)

Three decisions taken pre-code per the build plan §Architectural decisions taken pre-code.

### Decision #1 — v1 manifest stays valid; v2 is additive via auto-derivation shim

v1 SKILL.md and v1 `module.json` modules continue to work. The shim derives an in-memory v2 manifest for them so they surface in the v2 catalogue. Phase 7-9 reference module ports replace these shims with hand-authored v2 manifests where the developer chooses exact capability declarations.

**Trade-off:** preserves all existing first-party modules without forcing migration before Phase 7-9. The shim makes conservative inferences (`scope: matter`, `model_access: optional`, `advice_tier_max: draft_advice`, local-only `data_movement`); hand-authored v2 manifests in Phase 7+ can override.

**Refactor scope if Reviewer counters:** ~150 LOC in `core/registry/shim.py` + 1 path in `discovery.py`.

### Decision #2 — Capability vocabulary extension is purely additive

The 7-string legacy `CAPABILITY_VOCABULARY` stays valid. A regex grammar `^(matter|workspace|global)\.[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$` accepts v2 grammar strings. `require_capability` is unchanged — the grant table is still a free-form string column and the runtime still does exact lookups. What changes is what's *considered* a valid capability string at manifest validation time.

**Trade-off:** zero risk of breaking existing grants; new modules can use richer namespaces.

**Refactor scope:** ~30 LOC if Reviewer wants stricter vocabulary policing.

### Decision #3 — Grant table extension is purely additive

Three nullable columns added; existing v1 grants continue to resolve. v2 grants populate the new fields for Phase 4 grant-lifecycle.

Widened `plugin` to `VARCHAR(128)` and `capability` to `VARCHAR(256)` to accommodate v2 module ids and longer capability strings respectively.

**Trade-off:** schema change is reversible (downgrade in 0015 restores narrower widths) but data in widened columns may exceed the narrower bounds.

---

## Tests + sweep result

**Local Postgres sweep (commit `21efe01`):**

| Sweep | Result |
|---|---|
| Phase 2 only (45 tests) | 45 passed |
| Phase 1 + Phase 2 combined (133 tests) | 133 passed |
| Entire backend suite | **441 passed, 7 skipped, 1 xfailed, 0 failed** |

The entire backend test suite is green. Phase 2 has not regressed any existing test.

**Pre-handover discipline:** ran sweep locally before pushing handover (per the Phase 1 process discussion). No `-x` round-trips this phase.

---

## What is NOT in Phase 2 (deferred)

Per the build plan's out-of-scope section:

- **MCP host implementation** — Phase 3. The registry validates `runtime: mcp` manifests structurally but the actual MCP host integration lands in Phase 3.
- **Signing + sandbox + trust ceremony** — Phase 3.
- **Grant lifecycle** (revocation, re-prompt on permission expansion) — Phase 4.
- **Dependency graph resolution** at install time — Phase 4. The `requires` field is validated structurally; runtime dependency resolution lands in Phase 4.
- **Audit reconstruction view** — Phase 5.
- **Streaming/async runtime** — Phase 6.
- **Porting existing first-party modules** to v2 — Phases 7-10. Currently all first-party modules surface in the v2 catalogue via the shim.
- **Connector proof set** — Phase 11.
- **Frontend module catalogue UI rewrite** — Phase 12.

Phase 2 is a foundation layer. It gives Phase 3+ a manifest spec, a registry, and a vocabulary to build against. It does NOT yet enforce anything new at runtime; v1 modules keep working unchanged.

---

## Phase 2 surfaces a few small architecture-doc gaps

Reviewer to confirm or amend:

1. **`MANIFEST_V2_SCHEMA.md` doesn't lock the UI slot vocabulary.** Phase 2 chose 9 slots in `core/registry/slots.py`. If Reviewer wants this in the architecture doc, the slot list should be added there.

2. **Conservative shim defaults** (`scope: matter`, `model_access: optional`, `advice_tier_max: draft_advice`, local-only `data_movement`) — these are documented in code comments but not in the architecture doc. Reviewer may want a brief paragraph in `MANIFEST_V2_SCHEMA.md` §v1 Backwards Compat.

3. **`audit_events` enumeration** — the v2 capability declares which audit events it will emit. Phase 2 accepts the declaration as-is; Phase 3+ enforces it at MCP invocation time per the build plan.

4. **Capability id regex `^[a-z0-9][a-z0-9_-]+$`** requires 2+ characters. A v1 SKILL.md with a single-char skill_id would fail to shim. Real claude-for-uk-legal SKILL.md files all have multi-char ids, but the shim could prepend a constant if Reviewer prefers belt-and-braces.

---

## Verification commands

To re-run the sweep locally:

```bash
# 1. Ensure compose stack is up.
docker compose -f infra/docker-compose.yml up -d db backend

# 2. Install dev deps if not already done.
docker compose -f infra/docker-compose.yml exec -T backend pip install -e '.[dev]'

# 3. Migrate test DB to head.
docker compose -f infra/docker-compose.yml exec -T \
  -e POSTGRES_DSN="postgresql+psycopg://legalise:legalise@db:5432/legalise_test" \
  backend python -m alembic upgrade head

# 4. Run Phase 2 sweep.
docker compose -f infra/docker-compose.yml exec -T \
  -e POSTGRES_DSN="postgresql+asyncpg://legalise:legalise@db:5432/legalise_test" \
  -e TEST_DATABASE_URL="postgresql+asyncpg://legalise:legalise@db:5432/legalise_test" \
  backend python -m pytest tests/test_phase2_schema.py tests/test_phase2_capability_grammar.py tests/test_phase2_registry.py tests/test_phase2_grants_v2.py tests/test_phase2_api.py
```

CI will run the full suite automatically on every push to `runtime-rewrite` per the workflow we enabled in `ci.yml` at the end of Phase 1.

---

## Hand-off line for Reviewer

> *Phase 2 implemented end-to-end on `runtime-rewrite` (manifest v2 + capability registry + shim + grants v2 + API). Local sweep green: 133/133 Phase 1+2 tests, 441/441 across the whole backend. CI workflow will validate on next push. Read `docs/handovers/HANDOVER_PHASE_2_DONE.md`. Three architectural decisions request ratification (purely additive in all three cases). Phase 3 starts when this handover is reviewed.*

---

*End of Phase 2 handover. Builder hands off to Reviewer.*
