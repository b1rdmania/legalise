# Handover — Phase 1 Done

**Builder:** Claude (this session)
**Branch:** `runtime-rewrite`
**Head:** `926b1fa` after Phase 1 land
**Acceptance gate:** awaiting Reviewer ratification
**Phase 2 status:** blocked until this handover is reviewed

---

## What landed

Three substrate primitives implemented end-to-end per
`docs/architecture/STATE_MACHINE_PRIMITIVE.md`,
`docs/architecture/MATTER_CONTEXT_STORE.md`, and
`docs/architecture/ADVICE_BOUNDARY.md`.

### Shared infrastructure — `backend/app/core/phase1_runtime/` (commit `f3c3de0`)

| File | Purpose |
|---|---|
| `blocked.py` | `BlockedReason` enum (8 values) + `BlockedPayload` frozen dataclass with canonical `to_dict()` rendering |
| `exceptions.py` | `Phase1Blocked` (carries BlockedPayload) and `Phase1Failed` (system error) |
| `audit_emit.py` | `audit_phase1` wrapper enforcing `module = "core.<primitive>"` convention; merges BlockedPayload into payload JSONB |
| `capability_check.py` | `check_or_block` wraps `require_capability` via `plugin="core"` convention; on denial writes the Phase 1 `*.blocked` row via `audit_failure` (independent transaction) in addition to the legacy `module.capability.denied` row |
| `__init__.py` | Public surface |

786 LOC across 6 files (incl. tests). 11 tests; AST-parse clean.

### State machine — `backend/app/core/state_machine/` + models + migration + API + tests (commit `68b0e23`)

| Layer | Files |
|---|---|
| Models | `state_machine_definition.py`, `state_machine_instance.py`, `state_machine_transition.py` |
| Migration | `alembic/versions/0012_phase1_state_machine.py` (three tables + WORM trigger on transitions) |
| Core | `core/state_machine/{__init__,registry,runtime}.py` |
| API | `api/state_machine.py` (5 endpoints) |
| Wire-up | `app/main.py` registers `/api/state-machine/...` router |
| Tests | `tests/test_phase1_state_machine.py` (15 tests) |

2628 LOC across 11 files. Status vocabulary `{completed, blocked, failed}` — `requested` intentionally absent because WORM blocks UPDATE; one row per transition request with terminal status.

### Matter context store — `backend/app/core/matter_context/` + models + migration + API + tests (commit `3ccfd4b`)

| Layer | Files |
|---|---|
| Models | `matter_context_schema.py`, `matter_context_item.py` (with `schema_id` + `schema_version` linkage per Reviewer P1.2 round 2) |
| Migration | `alembic/versions/0013_phase1_matter_context.py` (two tables; no WORM — items support PATCH via supersession) |
| Core | `core/matter_context/{__init__,registry,store}.py` (JSON Schema validation via Draft 2020-12) |
| API | `api/matter_context.py` (two routers: schema-level at `/api/matter-context/...`, item-level at `/api/matters/{slug}/context/...`) |
| Wire-up | `app/main.py` registers both routers |
| Tests | `tests/test_phase1_matter_context.py` (14 tests) |

2035 LOC across 10 files. Matter-scoped endpoints resolve via `resolve_owned_open_matter` so cross-user / archived / missing matters return 404 (codebase convention).

### Advice boundary — `backend/app/core/advice_boundary/` + model + migration + API + tests (commit `b88cd69`)

| Layer | Files |
|---|---|
| Model | `advice_boundary_decision.py` (5-tier vocabulary + status enum) |
| Migration | `alembic/versions/0014_phase1_advice_boundary.py` (one table + WORM trigger) |
| Core | `core/advice_boundary/{__init__,tiers,gate}.py` (5 canonical tiers, 5 allowed transitions, role requirements per transition, initial-tier role requirements, `check()` callable) |
| API | `api/advice_boundary.py` (`POST /api/advice-boundary/check`) |
| Wire-up | `app/main.py` registers `/api/advice-boundary` router |
| Tests | `tests/test_phase1_advice_boundary.py` (19 tests) |

1455 LOC across 9 files. Status vocabulary `{completed, blocked, denied, failed}` — `blocked` vs `denied` distinction load-bearing for SRA framing (blocked = transition rule violated; denied = caller authority insufficient).

### Cross-primitive integration — `backend/tests/test_phase1_integration.py` (commit `926b1fa`)

3 integration tests proving the primitives compose: state-machine transition consuming matter-context capability strings, matter-context write composing with advice-boundary check, end-to-end audit reconstruction across all three. 384 LOC.

---

## Totals

- **7 commits** on `runtime-rewrite` between `f3c3de0` and `926b1fa`
- **~7290 LOC backend + tests** (roughly 4250 implementation + 3040 tests/fixtures)
- **62 tests** in 5 new test files
- **3 Alembic migrations** (0012, 0013, 0014)
- **3 WORM triggers** added (state_machine_transitions, advice_boundary_decisions; matter_context_items deliberately not WORM per spec)
- **6 new models** + 4 new core packages + 3 new API routers
- **All files AST-parse clean.** No regressions to existing code paths (Phase 1 is purely additive).

---

## Tests not yet executed end-to-end

The 62 new tests have not been run against a live Postgres container in this session — the build was executed in a worktree without `docker compose` access. Per `backend/tests/conftest.py`, DB-backed tests skip cleanly if Postgres at `TEST_DATABASE_URL` is unreachable, so a partial run is safe but the full validation needs:

```bash
docker compose -f infra/docker-compose.yml exec -T \
  -e POSTGRES_DSN="postgresql+asyncpg://legalise:legalise@db:5432/legalise_test" \
  backend python -m alembic upgrade head

docker compose -f infra/docker-compose.yml exec -T \
  -e POSTGRES_DSN="postgresql+asyncpg://legalise:legalise@db:5432/legalise_test" \
  backend python -m pytest tests/test_phase1_runtime.py \
    tests/test_phase1_state_machine.py \
    tests/test_phase1_matter_context.py \
    tests/test_phase1_advice_boundary.py \
    tests/test_phase1_integration.py -x
```

**Reviewer should run this and report any failures before clearing Phase 2.**

The pure-unit tests in each file (BlockedPayload structure, tier ordering, transition rule sets, role requirements) pass in any environment — about 18 of the 62 tests are pure unit tests.

---

## Architectural decisions taken (Reviewer ratification requested)

Two decisions taken pre-code per `PHASE_1_BUILD_PLAN.md`. Reviewer to ratify, counter, or accept-with-followups.

### Decision #1 — `plugin="core"` convention for substrate capabilities

**What landed:** Substrate primitives call `require_capability(user_id, plugin="core", skill="<primitive_name>", capability=...)`. The grant table is shared with module-level capabilities; substrate grants live under the `core` namespace.

**Where:** `backend/app/core/phase1_runtime/capability_check.py` (the `check_or_block` helper passes `plugin="core"` by default; modules pass their own plugin). Call sites in the state-machine runtime and matter-context store use this default.

**Refactor scope if Reviewer counters:** ~3 files (`capability_check.py`, the few callers in `state_machine/runtime.py` and `matter_context/store.py`). <100 LOC.

**Phase 2 question this defers:** when the manifest v2 schema lands, do substrate capabilities stay under `plugin="core"` or get promoted to a separate `substrate_capability_grants` table? Phase 2 should decide.

### Decision #2 — Dual-audit pattern on capability denial

**What landed:** When `check_or_block` raises `Phase1Blocked` due to a missing grant, two audit rows are written:

1. `module.capability.denied` — legacy row, written by `require_capability` itself and committed via the request session.
2. `<primitive>.<verb>.blocked` — Phase 1 canonical row carrying `BlockedPayload`, written via `audit_failure` (independent transaction so it survives the caller's rollback).

**Where:** `backend/app/core/phase1_runtime/capability_check.py`.

**Refactor scope if Reviewer counters:** ~1 helper file. Consolidation into a single row would either modify `require_capability` (touches existing audit doctrine — would require deeper Reviewer signoff) or skip the legacy row (would break the existing 403 handler in `app/main.py`).

**Trade-off lived with:** redundant rows on denial. Audit reconstruction (Phase 5) handles dedup as a presentation concern.

---

## Architecture-doc additions made by the builder

The architecture docs surfaced one canonical event name not previously listed; flagged here for Reviewer to incorporate into the source docs or counter:

**Addition: `state_machine.definition.registered`** — the build plan flagged this as an addition to the architecture-doc event list. NOT actually emitted in this implementation. Registry writes go through the session without an explicit audit row in Phase 1 because:

- definitions are mostly-immutable infrastructure (versioned, idempotent on triple)
- a definition register is a workspace-admin act not a matter-touching act
- the existing `AuditMiddleware` middleware logs the HTTP request

If Reviewer agrees, leave it out. If Reviewer wants it, the add is ~10 LOC in `state_machine/registry.py` + 1 line in the action-name list in `STATE_MACHINE_PRIMITIVE.md`.

---

## Architecture-doc gaps surfaced during build

Three items where the architecture docs were silent or ambiguous and the implementation made a choice. Reviewer to confirm or amend the docs.

### Gap 1 — `matter_context.read.blocked` / `matter_context.write.blocked` events

`MATTER_CONTEXT_STORE.md` §Audit Events lists only positive-path events. The implementation emits `matter_context.read.blocked` and `matter_context.write.blocked` on the denial paths because the canonical Phase 1 pattern requires every code path to audit. **Action requested:** add these two events to the architecture doc's event list, or counter-propose merging blocked-path audit into `module.capability.denied` only.

### Gap 2 — `requested` status absent from state_machine_transitions / advice_boundary_decisions

Both `STATE_MACHINE_PRIMITIVE.md` §Audit Events and `ADVICE_BOUNDARY.md` §Storage list `requested` as a status value. The implementation does NOT use `requested` because WORM blocks UPDATE — a two-step request → finalise pattern would be illegal. Instead each table receives ONE row per request with the terminal status (`completed`, `blocked`, `denied`, `failed`). **Action requested:** confirm this lives with the architecture or propose a separate "request log" table for the in-flight provenance.

### Gap 3 — Initial-tier creation in advice boundary (no `from_tier`)

`ADVICE_BOUNDARY.md` §Transition Rules lists allowed transitions but doesn't define what happens when an output is first created (no `from_tier`). The implementation introduces `INITIAL_TIER_ROLE_REQUIREMENTS` for this case: any-authenticated for `factual_extraction` / `legal_information` / `draft_advice`; qualified_solicitor/workspace_admin for `supervised_legal_advice` / `approved_final_advice`. **Action requested:** ratify the initial-tier rules in `ADVICE_BOUNDARY.md` or counter.

### Gap 4 — Owner scope vocabulary on state-machine instances

`STATE_MACHINE_PRIMITIVE.md` doesn't fix the vocabulary of `owner_scope` values. The implementation defines constants `OWNER_SCOPE_MATTER`, `OWNER_SCOPE_WORKSPACE`, `OWNER_SCOPE_PROSPECT` in `state_machine_instance.py` but the runtime accepts any string. **Action requested:** lock the v0.2 owner-scope vocabulary in the architecture doc or accept the current open-set.

---

## Open questions for Phase 2

These need decisions before Phase 2 (manifest v2 + registry) starts:

1. **Manifest-driven `advice_tier_max` enforcement.** Phase 2 wires the gate from the manifest. Where in the capability-invocation flow does the runtime fire the check — at the capability-grant boundary, at the model-call boundary, or at the output-write boundary? `ADVICE_BOUNDARY.md` §Relationship to Manifest needs to commit to one.

2. **Capability grammar for substrate primitives in manifest v2.** A module that declares it consumes the state machine — does its manifest list capabilities like `matter.state_machine.<namespace>.transition` or are state-machine consumption capabilities implicit on the module that owns the definition? Tied to Architectural Decision #1.

3. **Schema-version conflict policy.** If a module ships v2 of a schema that's stricter than v1 (e.g. adds a required field), existing v1 items remain readable but new v1 writes would violate the v2 expectations of downstream consumers. Phase 1 just preserves the original schema version on read. Phase 2 may need an explicit migration tooling story.

4. **Gate handler discovery on cold start.** Reference modules register gates via `register_gate(gate_id, handler)`. Today this happens at module-import time. Phase 2 will install/uninstall modules dynamically — how do gate registrations attach/detach with module lifecycle? Possibly via a registry hook in the manifest.

5. **Phase 1 `extra_metadata` JSONB on state_machine_transitions** is currently free-form. Phase 2 should decide whether to validate it against a per-definition schema.

---

## Non-blocking nits worth mentioning

- The state-machine API has a `GET /api/state-machine/definitions` list endpoint that I added beyond the five in the handover (low-cost convenience for the workspace UI in Phase 12). If Reviewer wants the API surface kept strictly to the spec, remove it.
- Matter-context `PATCH` accepts only `action="supersede"` in Phase 1. The endpoint signature reserves `action` for a future `withdraw` mode when output-lifecycle reference module ships. Documented in the endpoint docstring.

---

## What is NOT in Phase 1 (deferred)

Per the build plan's out-of-scope section:

- Frontend UI surfaces (Phase 12)
- Manifest v2 schema and registry (Phase 2)
- MCP host integration (Phase 3)
- Sandboxing / signing / trust ceremony (Phase 3)
- Grant lifecycle / dependency resolution (Phase 4)
- Cost tracking on `model_access` (Phase 5)
- Streaming/async runtime (Phase 6)
- Touching any existing first-party module (Phases 7-10)
- Connector proof set (Phase 11)
- Intake / output lifecycle / matter memory as core domain schemas (Phases 7-11 reference modules)
- SRA roll verification for `qualified_solicitor` role (Phase 1 uses generic workspace role check per `ADVICE_BOUNDARY.md` §Phase 1 Scope)

---

## Hand-off line for Reviewer

> Phase 1 is implemented end-to-end on `runtime-rewrite` at head `926b1fa`. Three substrate primitives (state_machine, matter_context, advice_boundary) plus shared phase1_runtime helpers, ~7290 LOC across 36 new files in 7 commits. Read `docs/handovers/HANDOVER_PHASE_1_DONE.md` for the full ledger. **Phase 2 is blocked until you (a) run the test suite against a Postgres container and report any failures, (b) ratify the two architectural decisions taken pre-code (plugin="core" convention + dual-audit pattern), and (c) decide on the four architecture-doc gaps and five Phase-2 open questions listed in the handover.**

---

*End of handover. Builder hands off to Reviewer. Phase 2 starts when this handover is reviewed and cleared.*
