# Phase 1 Build Plan

**Builder:** Claude (this session)
**Branch:** `runtime-rewrite`
**Base:** `186005a` (cleared head; `HANDOVER_PHASE_1_START.md` ratified by Reviewer)
**Goal:** Implement the three Phase 1 substrate primitives — generic state machine, matter-context store, advice-boundary gate — per the cleared handover and the architecture docs in `docs/architecture/`.

This document is the implementation contract. If anything changes during build (new pattern discovered, architecture doc proves incomplete, model shape needs adjustment), this plan gets patched first, then code follows.

---

## Pre-build findings (read pass completed 2026-05-25)

Eight adjustments to the implementation approach surfaced during the read pass. **Two are architectural decisions taken by the builder pre-code (#2 and #3); six are tactical.** All captured here and will be re-surfaced in `HANDOVER_PHASE_1_DONE.md` for Reviewer ratification at end of Phase 1. If Reviewer counters either architectural decision, the relevant primitive(s) get refactored.

### Architectural decisions taken (Reviewer ratification deferred to end of Phase 1)

**Architectural decision #1 — `plugin="core"` convention for substrate capabilities.**

The existing `require_capability(user_id, plugin, skill, capability)` infrastructure is plugin/skill-coupled. Substrate primitives reuse this by passing `plugin="core"`, `skill="<primitive_name>"` (e.g. `"state_machine"`, `"matter_context"`, `"advice_boundary"`). When modules later use the primitives, they pass their own `(plugin, skill)` identity.

Alternative considered: build a separate `substrate_capability_grants` table. Rejected for Phase 1 because it would (a) double the capability infrastructure, (b) require Phase 1 to touch core capability code paths I committed not to modify, (c) defer a clean decision to Phase 2 anyway when manifest v2 lands.

Risk: permanently couples substrate capabilities to the plugin/skill grant model. Phase 2 manifest v2 must decide whether substrate-level capability grants are conceptually a `plugin="core"` namespace or get promoted to a separate substrate table at that point. If Reviewer counters this decision at end of Phase 1, the substrate's capability check call sites are localised to ~3 files and refactorable in <100 LOC of changes.

**Architectural decision #2 — Dual-audit pattern on capability denial.**

The existing `require_capability` writes a `module.capability.denied` audit row when a grant is missing and commits it. Phase 1 primitives additionally write `<primitive>.<verb>.blocked` (e.g. `state_machine.transition.blocked`) carrying the canonical `BlockedPayload` shape. Two audit rows per denial.

Alternative considered: modify `require_capability` itself to optionally emit `BlockedPayload`. Rejected because it would modify existing code paths and the doctrine in `core/capabilities.py` docstring says "audit emission is not a capability. Audit is mandatory provenance" — adding a second emission shape there would muddy that.

Trade-off: clean separation between legacy and Phase 1 audit shapes; redundant rows on denial. The dual rows are not deduplicated; both carry the same denied_capability and actor_id. Audit reconstruction (Phase 5) handles the dedup as a presentation concern, not a write-time concern. If Reviewer counters at end of Phase 1, consolidation is a small change in `check_or_block` helper.

### Tactical findings (no Reviewer signoff needed)

1. **No `TimestampMixin`** — `models/base.py` is just `Base(DeclarativeBase)`. Models inline timestamps:
   ```python
   created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.utcnow(), nullable=False)
   ```
   All Phase 1 models follow this pattern.

2. **`require_capability` is plugin/skill-coupled.** Existing signature: `(session, *, user_id, plugin, skill, capability)`. The substrate primitives use a convention to fit cleanly: `plugin="core"`, `skill="<primitive_name>"` (e.g. `"state_machine"`, `"matter_context"`, `"advice_boundary"`). When modules later use state machines, they pass their own `(plugin, skill)` identity. Substrate-level checks use `plugin="core"` so the existing capability grant table works without schema changes.

3. **`CapabilityDenied` already writes its own audit row** (`module.capability.denied`) and is handled globally in `main.py` with a structured 403. The `check_or_block` helper in shared infrastructure just calls `require_capability` and lets `CapabilityDenied` propagate; my primitives' canonical `*.blocked` audit row is emitted *in addition* to the existing `module.capability.denied` row, carrying the `BlockedPayload` shape for Phase 1 reconstruction. Both rows are needed: one is the standard capability denial record (existing), one is the Phase 1 primitive's structured blocked event.

4. **Audit table** (`audit_entries`) has fixed columns: `action`, `module` (String 64), `resource_type`, `resource_id`, `payload` JSONB, plus model-call provenance fields (`model_used`, `prompt_hash`, `response_hash`, `token_count`, `latency_ms`). Phase 1 audit emissions pack `module_id`, `capability_id`, `BlockedPayload` into the `payload` JSONB. `action` uses canonical event names from the architecture docs (`state_machine.transition.completed`, etc.). `module` field is set to e.g. `"core.state_machine"`.

5. **Migration numbering** — next migration is `0012_phase1_state_machine.py`, then `0013_phase1_matter_context.py`, then `0014_phase1_advice_boundary.py`. Each migration includes WORM trigger for its append-only table (state_machine_transitions, advice_boundary_decisions) matching the existing pattern from `0011_audit_worm.py`.

6. **Tests directory is `backend/tests/`** (flat), not `tests/core/...`. Test files follow `test_<thing>.py` naming. Phase 1 test files: `test_phase1_state_machine.py`, `test_phase1_matter_context.py`, `test_phase1_advice_boundary.py`, `test_phase1_integration.py`, plus `test_phase1_runtime.py` for shared infrastructure.

7. **`jsonschema>=4.21`** already in `backend/pyproject.toml`. No new dependency for matter-context schema validation.

8. **Router paths** — `/api/state-machine/...`, `/api/matter-context/schemas/...` for workspace-scoped surfaces; `/api/matters/{matter_id}/context/...` for matter-scoped surfaces. Routers register in `app/main.py`. The audit middleware auto-logs mutations on `/api/matters/*` so matter-scoped writes get an `http.*` row in addition to the semantic event.

---

## Pre-build: codebase ground-in

Single read pass before any new code. Files to confirm shape and conventions:

- `backend/app/core/capabilities.py` — `require_capability()` signature, `CapabilityDenied` exception, grant table shape
- `backend/app/core/audit.py` — middleware audit emission patterns
- `backend/app/core/api.py` — `audit_failure` helper, public module surface
- `backend/app/models/base.py` — `TimestampMixin`, Base class, naming conventions
- `backend/app/models/matter.py` — canonical model pattern (FKs, types, indexes)
- `backend/app/models/audit.py` — audit entry table shape
- `backend/app/api/matters.py` — canonical FastAPI router pattern
- `backend/app/main.py` — router registration pattern
- `backend/alembic/versions/` — most recent two migrations for pattern reference
- `backend/app/core/db.py` — AsyncSession factory
- `tests/` directory shape — pytest fixtures, async test conventions
- `backend/pyproject.toml` — dependencies (confirm JSON Schema validation library available; if not, add `jsonschema` for matter-context Phase 1)

If any of these surface patterns I don't expect, **I stop and amend this plan before coding**.

---

## Shared Phase 1 infrastructure

**Module path:** `backend/app/core/phase1_runtime/`

**Files:**

- `__init__.py` — exports public surface
- `blocked.py` — `BlockedPayload` dataclass + `BlockedReason` enum:
  - `BlockedReason ∈ {capability_denied, gate_blocked, invalid_transition, schema_violation, role_denied, missing_input, tier_exceeded, tier_disallowed}`
  - `BlockedPayload.to_dict() -> dict` with canonical shape `{status: "blocked", blocked_reason, denied_capability?, gate_state?}`
- `audit_emit.py` — `audit_phase1(session, action, payload, **scope_fields)` async helper. Wraps existing audit insertion. Enforces that every Phase 1 audit row carries `module_id`, `capability_id`, `actor_id` where applicable.
- `capability_check.py` — `check_or_block(session, user_id, capability_string, ...) -> None`. Runs existing `require_capability()`; on `CapabilityDenied`, emits the canonical `*.blocked` audit row and re-raises.
- `exceptions.py` — `Phase1Blocked` (carries `BlockedPayload`), `Phase1Failed` (system error).

**Total estimated LOC:** ~150 across 5 files.

**Tests:** `tests/core/phase1_runtime/test_blocked.py`, `test_audit_emit.py`, `test_capability_check.py` — proving canonical payload shape, audit row emission, capability denial re-raise.

---

## Step 1: State machine primitive

**Module path:** `backend/app/core/state_machine/`

**Architecture reference:** `docs/architecture/STATE_MACHINE_PRIMITIVE.md`

### Models

`backend/app/models/state_machine_definition.py`:

```text
state_machine_definitions
├── id (UUID, PK)
├── module_id (String 128, indexed)
├── definition_key (String 128) — module-scoped key, e.g. "default"
├── version (String 32, semver)
├── states (JSONB) — array of state strings
├── initial_state (String 64)
├── terminal_states (JSONB) — array
├── transitions (JSONB) — array of {from, to, gates, required_capabilities}
├── created_at (TimestampMixin)
└── UNIQUE (module_id, definition_key, version)
```

`backend/app/models/state_machine_instance.py`:

```text
state_machine_instances
├── id (UUID, PK)
├── definition_id (FK → state_machine_definitions.id)
├── definition_version (String 32) — denormalised for history
├── owner_scope (String 32) — "matter" | "workspace" | "prospect" | etc.
├── owner_id (String 64) — caller's owner ref
├── current_state (String 64)
├── created_at, updated_at (TimestampMixin)
└── INDEX (owner_scope, owner_id), INDEX (definition_id)
```

`backend/app/models/state_machine_transition.py`:

```text
state_machine_transitions
├── id (UUID, PK)
├── instance_id (FK → state_machine_instances.id, indexed)
├── from_state (String 64)
├── to_state (String 64)
├── actor_id (FK → users.id, nullable)
├── module_id (String 128, nullable)
├── capability_id (String 256, nullable)
├── reason (Text, nullable)
├── metadata (JSONB)
├── gate_state (JSONB) — gate execution result if applicable
├── status (String 16) — requested | completed | blocked | failed
├── occurred_at (DateTime)
└── append-only (no UPDATE/DELETE in app code; WORM trigger if matching existing pattern)
```

### Migration

`backend/alembic/versions/<next_rev>_state_machine_primitive.py` — creates three tables + indexes + WORM trigger on `state_machine_transitions` if existing audit table uses one (match pattern).

### Core implementation

`backend/app/core/state_machine/__init__.py` — exports public surface
`backend/app/core/state_machine/registry.py` — `register_definition()`, `load_definition()`, `list_definitions()`. Idempotent on `(module_id, definition_key, version)`.
`backend/app/core/state_machine/runtime.py` — `create_instance()`, `request_transition()`, `read_instance()`, `read_history()`. `request_transition()`:

1. Load instance + definition
2. Verify `(from_state → to_state)` is in definition's transition set
3. For each `required_capability` on the transition, call `check_or_block(...)` → may raise `Phase1Blocked`
4. For each `gate` on the transition, execute (Phase 1 ships a `noop_gate` registry; specific gates land with the modules that need them)
5. Append a transition row with status `completed`, update instance's `current_state`, emit `state_machine.transition.completed` audit
6. On any block/failure, append a transition row with the appropriate status, emit the matching audit event, do NOT update instance state

### API router

`backend/app/api/state_machine.py` — five endpoints:

- `POST /api/state-machine/definitions` → register a definition. Body: definition JSON. Returns: `{id, module_id, definition_key, version}`.
- `GET /api/state-machine/definitions/{module_id}/{definition_key}/versions/{version}` → read definition.
- `POST /api/state-machine/instances` → create instance. Body: `{definition_id, owner_scope, owner_id}`. Returns: instance JSON.
- `GET /api/state-machine/instances/{instance_id}` → read current state + available transitions + history (capability-checked if instance is matter-scoped).
- `POST /api/state-machine/instances/{instance_id}/transitions` → request transition. Body: `{to_state, reason?, metadata?}`. Returns: `{status, current_state, transition_id, gate_state?}`.

### Wire-up

Register router in `backend/app/main.py`. Add to OpenAPI tag set.

### Tests

`tests/core/state_machine/test_models.py` — model constraint tests (uniqueness, FK).
`tests/core/state_machine/test_registry.py` — definition register/load, idempotency on version, rejection of unknown states / unknown transitions.
`tests/core/state_machine/test_runtime.py` — the five canonical scenarios from the handover acceptance bar:

1. **Valid path** — register definition, create instance, transition through all states to terminal. Assert: instance state updates, transitions appended, audit rows emitted with status `completed`.
2. **Denied capability** — request a transition without holding the `required_capability`. Assert: instance state unchanged, transition row appended with status `blocked` + `blocked_reason: capability_denied`, audit row `state_machine.transition.blocked` emitted with canonical payload.
3. **Invalid transition** — request a transition not in the definition's transition set. Assert: instance state unchanged, transition row appended with status `blocked` + `blocked_reason: invalid_transition`, audit emitted.
4. **Gate-blocked transition** — register a definition with a gate that returns blocked; request the transition. Assert: instance state unchanged, transition row with status `blocked` + `blocked_reason: gate_blocked`, audit emitted with `gate_state` payload.
5. **Audit emission on every path** — explicit check that every code path that writes a transition also emits a corresponding audit row, even on `failed`.

`tests/api/test_state_machine_routes.py` — HTTP-level tests for each endpoint.

### Audit events emitted

- `state_machine.definition.registered`
- `state_machine.instance.created`
- `state_machine.transition.requested`
- `state_machine.transition.completed`
- `state_machine.transition.blocked` (carries canonical `BlockedPayload`)
- `state_machine.transition.failed`

(Architecture doc lists 5; I'm adding `definition.registered` because registry writes need provenance per the canonical "every code path that mutates state audits" rule. Will flag this in HANDOVER_PHASE_1_DONE.md as an architecture-doc patch if Reviewer agrees.)

### Estimated LOC

~900 lines: models (200) + migration (80) + registry+runtime (350) + router (150) + tests (700+).

---

## Step 2: Matter context store

**Module path:** `backend/app/core/matter_context/`

**Architecture reference:** `docs/architecture/MATTER_CONTEXT_STORE.md`

### Models

`backend/app/models/matter_context_schema.py`:

```text
matter_context_schemas
├── id (UUID, PK)
├── namespace (String 128)
├── module_id (String 128)
├── version (String 32, semver)
├── json_schema (JSONB)
├── registered_at (DateTime)
├── registered_by_module_id (String 128)
└── UNIQUE (namespace, version)
```

`backend/app/models/matter_context_item.py`:

```text
matter_context_items
├── id (UUID, PK)
├── matter_id (FK → matters.id, indexed)
├── namespace (String 128, indexed)
├── schema_id (FK → matter_context_schemas.id)
├── schema_version (String 32) — denormalised
├── payload (JSONB)
├── source_type (String 32, nullable) — "document" | "event" | "audit_entry" | "user_assertion" | "connector_result" | "generated_output"
├── source_id (String 64, nullable)
├── created_by_user_id (FK → users.id, nullable)
├── created_by_module_id (String 128, nullable)
├── created_at, updated_at (TimestampMixin)
└── superseded_by_id (FK → matter_context_items.id, nullable)
```

### Migration

`backend/alembic/versions/<next_rev>_matter_context_store.py` — creates two tables + indexes (composite on `(matter_id, namespace)` for read filters).

### Core implementation

`backend/app/core/matter_context/__init__.py` — exports
`backend/app/core/matter_context/registry.py` — `register_schema()`, `load_schema()`, `latest_version_for_namespace()`. Validates JSON Schema syntax on register.
`backend/app/core/matter_context/store.py` — `write_item()`, `read_items()`, `supersede_item()`, `withdraw_item()`:

- `write_item()` accepts optional `schema_version`. If omitted, resolves to latest. Validates payload against the resolved schema. Capability check: `matter.context.<namespace>.write`. Audits.
- `read_items()` filters by `(matter_id, namespace)`, optional `schema_version`, optional `source_type`. Capability check: `matter.context.<namespace>.read`. Audits per-call (handles aggregation in Phase 5 audit reconstruction).
- `supersede_item()` writes new item + sets `superseded_by_id` on old item. Original payload remains queryable for reconstruction.
- `withdraw_item()` marks item via status (no hard delete).

### API router

`backend/app/api/matter_context.py` — five endpoints per handover:

- `POST /api/matter-context/schemas` → register schema. Body: schema declaration JSON. Idempotent on `(namespace, version)`.
- `GET /api/matter-context/schemas/{namespace}` → list versions for namespace. Optional `?version=` for specific version.
- `POST /api/matters/{matter_id}/context/{namespace}` → write item. Body: `{payload, source_type?, source_id?, schema_version?}`. Capability-checked.
- `GET /api/matters/{matter_id}/context/{namespace}` → read items. Filters via query string.
- `PATCH /api/matters/{matter_id}/context/items/{item_id}` → supersede / withdraw. Body: `{action: "supersede" | "withdraw", new_payload?, reason?}`.

### Wire-up

Register router in `backend/app/main.py`.

### Tests

`tests/core/matter_context/test_models.py` — constraint tests.
`tests/core/matter_context/test_registry.py` — schema register/load, JSON Schema syntax rejection, version uniqueness.
`tests/core/matter_context/test_store.py`:

1. **Valid path** — register schema, write item, read it back, schema-version preserved.
2. **Denied capability** — write item without `matter.context.<namespace>.write` grant. Item not written, audit `matter_context.write.blocked` with `blocked_reason: capability_denied`.
3. **Schema violation** — write item whose payload doesn't match schema. Item not written, audit `matter_context.write.blocked` with `blocked_reason: schema_violation`.
4. **Schema version write policy** — write without `schema_version` → uses latest. Write with explicit older version → uses that version. New schema version registered → existing items still readable at original version. Cross-version reads return items with their bound `schema_version`.
5. **Read denied capability** — read without grant. No items returned, audit `matter_context.read.blocked` emitted.
6. **Supersede chain** — supersede an item; reads return new item by default; reads with `?include_superseded=true` show both.
7. **Audit emission** — every write/read path emits a row.

`tests/api/test_matter_context_routes.py` — HTTP-level tests.

### Audit events emitted

- `matter_context.schema.registered`
- `matter_context.item.created`
- `matter_context.item.updated`
- `matter_context.item.superseded`
- `matter_context.item.withdrawn`
- `matter_context.item.read`
- `matter_context.write.blocked`
- `matter_context.read.blocked`

### Estimated LOC

~700 lines: models (180) + migration (70) + registry+store (300) + router (140) + tests (600+).

---

## Step 3: Advice boundary primitive

**Module path:** `backend/app/core/advice_boundary/`

**Architecture reference:** `docs/architecture/ADVICE_BOUNDARY.md`

### Models

`backend/app/models/advice_boundary_decision.py`:

```text
advice_boundary_decisions
├── id (UUID, PK)
├── output_id (String 64, indexed) — reference to a document or generated output; foreign key constraint deferred to Phase 7 when output lifecycle reference module lands
├── from_tier (String 32)
├── to_tier (String 32)
├── actor_user_id (FK → users.id, nullable)
├── actor_role (String 32) — denormalised at decision time
├── module_id (String 128, nullable)
├── capability_id (String 256, nullable)
├── declared_tier_max (String 32, nullable) — Phase 1 accepts null; Phase 2 requires
├── gate_state (JSONB)
├── status (String 16) — requested | completed | blocked | denied | failed
├── decided_at (DateTime)
└── append-only
```

### Migration

`backend/alembic/versions/<next_rev>_advice_boundary.py` — single table.

### Core implementation

`backend/app/core/advice_boundary/__init__.py` — exports
`backend/app/core/advice_boundary/tiers.py` — `AdviceTier` enum (five tiers), `ALLOWED_TRANSITIONS` set, `ROLE_REQUIREMENTS` mapping per transition.
`backend/app/core/advice_boundary/gate.py` — `check(output_id, requested_tier, declared_tier_max, actor_user_id, actor_role, module_id, capability_id) → AdviceBoundaryDecision`. Implements the 6-step validation from `ADVICE_BOUNDARY.md` §Gate API Surface.

### API router

`backend/app/api/advice_boundary.py` — one endpoint:

- `POST /api/advice-boundary/check` → invoke gate. Body matches the `check()` signature. Returns `{allowed, decision_id, gate_state}`.

### Wire-up

Register router in `backend/app/main.py`.

### Tests

`tests/core/advice_boundary/test_tiers.py` — enum integrity, ALLOWED_TRANSITIONS coverage.
`tests/core/advice_boundary/test_gate.py`:

1. **Valid transition** — `draft_advice → supervised_legal_advice` with `qualified_solicitor` role. Decision `completed`, audit `advice_boundary.check.completed` emitted.
2. **Invalid transition** — `draft_advice → approved_final_advice` (skipping supervised). Decision `blocked`, `blocked_reason: invalid_transition`, audit `advice_boundary.check.blocked`.
3. **Downward transition** — `supervised_legal_advice → draft_advice`. Decision `blocked`, audit emitted.
4. **Role denial** — `draft_advice → supervised_legal_advice` with non-solicitor actor. Decision `denied`, audit `advice_boundary.check.denied`.
5. **Tier exceeds declared max** — request `supervised_legal_advice` when `declared_tier_max = draft_advice`. Decision `denied`, `blocked_reason: tier_exceeded`.
6. **Null declared_tier_max (Phase 1 mode)** — request any tier with `declared_tier_max=None`. Decision accepted (Phase 2 will block), audit row notes the null-max condition.
7. **Immutability of approved_final_advice** — attempt any transition out of `approved_final_advice`. Decision `blocked`, audit emitted.
8. **Audit emission on every path**.

`tests/api/test_advice_boundary_routes.py` — HTTP-level test.

### Audit events emitted

- `advice_boundary.check.requested`
- `advice_boundary.check.completed`
- `advice_boundary.check.blocked`
- `advice_boundary.check.denied`
- `advice_boundary.check.failed`

### Estimated LOC

~500 lines: model (80) + migration (40) + tiers+gate (180) + router (80) + tests (450).

---

## Step 4: Cross-primitive integration tests

`tests/integration/test_phase1_composition.py`:

1. **State machine consuming matter-context capability check** — register a state-machine definition whose `required_capabilities` reference `matter.context.<namespace>.write`. Verify transition is blocked when the caller lacks the capability.
2. **Matter-context write triggering advice-boundary check** — write a matter-context item with `payload.advice_tier = "draft_advice"`. Verify the advice-boundary check API can be invoked against it.
3. **Audit reconstruction across all three** — perform a sequence (transition → context write → advice tier check) and verify all audit rows are emitted in order, all carry the correct `module_id` / `capability_id` / `actor_id` fields, and the canonical `BlockedPayload` shape is consistent across all three primitives.

These prove the shared infrastructure does its job.

---

## Step 5: Handover doc

`docs/handovers/HANDOVER_PHASE_1_DONE.md`:

- What landed (file list, LOC, test counts)
- Test results (`pytest` summary)
- Architecture-doc patches made during build (if any) with diff references
- Open questions for Phase 2 (e.g. how does manifest v2 wire `advice_tier_max` into capability boundaries?)
- Phase 2 readiness check

---

## Commit cadence

Per-primitive commits, plus shared-infrastructure as its own commit. Order:

1. `phase1: shared runtime infrastructure (BlockedPayload, audit_emit, capability_check)`
2. `phase1: state machine primitive (models + registry + runtime + API + tests)`
3. `phase1: matter context store (models + registry + store + API + tests)`
4. `phase1: advice boundary gate (model + tiers + gate + API + tests)`
5. `phase1: cross-primitive integration tests`
6. `phase1: handover doc`

Each commit must pass:

- All new tests in that commit
- The existing test suite (no regression)
- `pytest` runs clean for that primitive's directory

Push to `runtime-rewrite` after each commit so Reviewer can watch incrementally.

---

## Branch hygiene

- All work on `runtime-rewrite`
- Hosted-eval on master untouched
- No merge to master during Phase 1

---

## Out of scope (deliberate)

- Frontend UI surfaces (Phase 12)
- Manifest v2 schema and registry (Phase 2)
- MCP host integration (Phase 3)
- Sandboxing / signing / trust ceremony (Phase 3)
- Grant lifecycle / dependency resolution (Phase 4)
- Cost tracking on `model_access` (Phase 5)
- Streaming/async runtime (Phase 6)
- Touching any existing first-party module (Pre-Motion, Contract Review, Letters, Tabular Review, Case Law, Anonymisation, Chronology, Document Edit) — Phase 7-10
- Connector proof set (Phase 11)
- Implementing intake / output lifecycle / matter memory as core domain schemas (those are reference modules in Phase 7-11)
- SRA roll verification for `qualified_solicitor` role (Phase 1 uses generic workspace role check per ADVICE_BOUNDARY.md §Phase 1 Scope)

---

## Risks / open questions during build

If any of these surface, I patch this plan before continuing:

1. **Existing audit table missing fields my primitives need.** If `audit_entries` doesn't have e.g. a `payload` JSONB column adequate for `BlockedPayload`, I'll need a migration to extend it. Will flag and patch.
2. **`require_capability()` signature doesn't carry enough context for my `check_or_block()` wrapper.** If it can't easily emit audit on denial, I may need to refactor it. Will flag and patch.
3. **JSON Schema validation library not in `pyproject.toml`.** Will add `jsonschema` if absent; document in handover.
4. **WORM trigger pattern on existing audit table.** I'll need to know if SQL triggers are used (PostgreSQL) or app-level enforcement. Will match existing pattern.
5. **`owner_scope, owner_id` shape for state-machine instances.** I've proposed `(String, String)`. If existing code uses polymorphic FKs or a specific generic-reference pattern, I'll match. Otherwise document the choice.
6. **Architecture doc gaps surfaced.** I noted `state_machine.definition.registered` is not in the architecture doc but is needed for audit completeness. If I find others, I patch the docs first.

---

## Acceptance check before declaring Phase 1 done

Every box ticked:

- [ ] Three primitives implemented in `backend/app/core/{state_machine,matter_context,advice_boundary}/`
- [ ] Six models in `backend/app/models/` (3 state-machine + 2 matter-context + 1 advice-boundary)
- [ ] Three Alembic migrations applied cleanly to a fresh DB
- [ ] Three API routers wired in `app.main`
- [ ] All canonical scenarios passing per primitive (valid, denied, invalid, gate-blocked, audit)
- [ ] Schema-version write policy proven (matter-context)
- [ ] Immutability of `approved_final_advice` proven (advice-boundary)
- [ ] Cross-primitive integration tests passing
- [ ] No existing tests broken
- [ ] `HANDOVER_PHASE_1_DONE.md` written
- [ ] All work on `runtime-rewrite`; no commits to master

---

*End of build plan. Builder waits for Andy's go-ahead, then begins with the pre-build codebase read pass.*
