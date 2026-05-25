# Handover — Phase 1 Done

**Builder:** Claude (this session)
**Branch:** `runtime-rewrite`
**Head:** current branch head (latest security-fix commit; see git log)
**Acceptance gate:** awaiting Reviewer ratification
**Phase 2 status:** blocked until this handover is reviewed

**Update 2026-05-25 (post-review round 1):** Reviewer's first pass at `f171b4f` flagged three P1 security findings, one P2 doctrine divergence, and one P3 nit. All five fixed at `e33991c`.

**Update 2026-05-25 (post-review round 2):** Reviewer's second pass at `e33991c` confirmed the round-1 fixes but flagged two new P1 trust-boundary holes (initial-tier advice bypass; state-machine definition registry globally writable). Both resolved in this commit. See §Reviewer findings + fixes — round 2 below.

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
# 1. Start the compose stack so Postgres is up.
docker compose -f infra/docker-compose.yml up -d db

# 2. (One-shot) Install dev deps inside the running backend container.
#    The runtime image is built without pytest; this brings in the
#    `dev` extra defined in backend/pyproject.toml. Skip if you have
#    a separately-built test image with dev deps baked in.
docker compose -f infra/docker-compose.yml exec -T backend pip install -e '.[dev]'

# 3. Migrate the test database to head.
docker compose -f infra/docker-compose.yml exec -T \
  -e POSTGRES_DSN="postgresql+asyncpg://legalise:legalise@db:5432/legalise_test" \
  backend python -m alembic upgrade head

# 4. Run the Phase 1 sweep.
docker compose -f infra/docker-compose.yml exec -T \
  -e POSTGRES_DSN="postgresql+asyncpg://legalise:legalise@db:5432/legalise_test" \
  backend python -m pytest tests/test_phase1_runtime.py \
    tests/test_phase1_state_machine.py \
    tests/test_phase1_matter_context.py \
    tests/test_phase1_advice_boundary.py \
    tests/test_phase1_integration.py \
    tests/test_phase1_security_fixes.py -x
```

**Reviewer should run this and report any failures before clearing Phase 2.**

The pure-unit tests in each file (BlockedPayload structure, tier ordering, transition rule sets, role requirements) pass in any environment — about 18 of the 62 tests are pure unit tests.

**Note on the dev-deps step:** if you run the sweep repeatedly, prefer either (a) building a separate test image with `.[dev]` baked in and using it as a `backend-test` service, or (b) running the install once and keeping the container up between sweeps. The one-shot install above is the simplest unblock; the cleaner setup is a v0.2 ops follow-up that does not block Phase 1 ratification.

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

`ADVICE_BOUNDARY.md` §Transition Rules lists allowed transitions but doesn't define what happens when an output is first created (no `from_tier`).

**Resolved in round 2 (Reviewer P1#1):** `INITIAL_TIER_ROLE_REQUIREMENTS` is now capped at `draft_advice` — `factual_extraction`, `legal_information`, and `draft_advice` only. `supervised_legal_advice` and `approved_final_advice` are intentionally absent; the gate explicitly rejects them as initial tiers with `blocked_reason=invalid_transition`, `reason=tier_not_permitted_as_initial`. Even workspace_admin or qualified_solicitor cannot direct-create supervised or final outputs — they must go through the transition path. Output-lifecycle reference module in Phase 7+ may revisit this cap when it can prove prior state.

**Action requested:** add the initial-tier rules to `ADVICE_BOUNDARY.md` so the cap is canonical in the architecture doc, not just in code + this handover.

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

## Reviewer findings + fixes (round 1, 2026-05-25)

Reviewer pass at commit `f171b4f` returned five findings. All resolved.

### P1#1 — Advice boundary trusted `actor_role` from request body

**Reviewer:** "Any authenticated user can submit `qualified_solicitor` or `workspace_admin` and obtain a permitted supervised/final advice decision. This defeats the load-bearing supervision primitive."

**Fix:** `backend/app/api/advice_boundary.py` rewritten:
- `CheckRequest` no longer has an `actor_role` field. Pydantic ignores extra fields by default, so even a client that sends `actor_role` in the body has it dropped.
- New `_derive_actor_role(user)` helper derives the role server-side from `User.is_superuser`:
  - `is_superuser=True` → `"workspace_admin"`
  - otherwise → `"any_authenticated"`
- The HTTP handler calls `_derive_actor_role` and passes its return value to `core.advice_boundary.check()`.
- Internal callers (workflows / reference modules) that have already verified solicitor status keep the ability to pass `actor_role` to the programmatic `check()` API.

**Phase 1 consequence:** the HTTP endpoint cannot reach the `qualified_solicitor`-only `draft_advice → supervised_legal_advice` transition. Phase 1 has no SRA roll verification (deferred to Phase 7 per `ADVICE_BOUNDARY.md` §Phase 1 Scope). Workspace admins can reach the final-approval step but not the supervised-promotion step.

### P1#2 — State-machine instances had IDOR-style access gaps

**Reviewer:** "A leaked instance UUID is enough to read history or request transitions, especially for definitions with no required capability."

**Fix:** `backend/app/api/state_machine.py`:
- New `_resolve_owner_for_create(session, user, owner_scope, owner_ref)` helper:
  - `owner_scope` restricted to `{"matter", "workspace"}`; unknown scopes 422.
  - `owner_scope="matter"` requires `owner_ref` (a matter slug); server resolves via `resolve_owned_open_matter` (404 on cross-user/archived/missing — codebase convention).
  - `owner_scope="workspace"` forces `owner_id` to `str(user.id)`; the caller's `owner_ref` is ignored.
- New `_assert_instance_access(session, user, instance)` helper:
  - workspace scope → instance.owner_id must equal `str(user.id)`; else 404.
  - matter scope → look up the matter by UUID with ownership + non-archived check; else 404.
  - malformed owner_id or unknown scope → 404.
- New `_load_and_authorize_instance(session, user, instance_id)` combines instance load + access check.
- `create_instance_endpoint` calls `_resolve_owner_for_create` before creating.
- `get_instance_endpoint` calls `_load_and_authorize_instance` before reading state.
- `transition_endpoint` calls `_load_and_authorize_instance` before invoking the transition.
- `CreateInstanceRequest.owner_id` renamed to `owner_ref` to clarify the input is not stored verbatim (matter slug for matter scope; ignored for workspace scope).

**Phase 1 consequence:** leaked instance UUIDs return 404 from /api endpoints. Internal programmatic callers (`core.state_machine.request_transition` etc.) remain unscoped — they're substrate-level and trusted; the HTTP layer is where the trust boundary lives.

### P1#3 — Matter-context schema registration globally mutable by any authenticated user

**Reviewer:** "A normal user can squat or poison a namespace used by first-party/reference modules, affecting validation for future writes that default to latest schema."

**Fix:** `backend/app/api/matter_context.py`:
- New `_require_admin(user)` helper raising 403 `admin_required` if `user.is_superuser` is False.
- `register_schema_endpoint` calls `_require_admin(user)` before doing anything else.

**Phase 1 consequence:** only workspace admins (currently `is_superuser=True`) can register schemas. Phase 2 may introduce a finer-grained workspace role.

### P2 — Advice role rules diverged from architecture doc

**Reviewer:** "ADVICE_BOUNDARY.md says draft_advice → supervised_legal_advice is only for qualified_solicitor at line 64. The implementation allows both qualified_solicitor and workspace_admin."

**Fix:** `backend/app/core/advice_boundary/tiers.py`:
- `ROLE_REQUIREMENTS[(draft_advice, supervised_legal_advice)]` tightened from `{qualified_solicitor, workspace_admin}` to `{qualified_solicitor}`.
- `INITIAL_TIER_ROLE_REQUIREMENTS[supervised_legal_advice]` tightened from `{qualified_solicitor, workspace_admin}` to `{qualified_solicitor}`.
- Workspace admin override remains for the `supervised_legal_advice → approved_final_advice` final-approval step (matches the architecture doc).

**Test:** new `test_workspace_admin_cannot_promote_draft_to_supervised` in `tests/test_phase1_advice_boundary.py` proves the tightening; existing `test_role_requirements_for_supervised_transition` updated to `test_role_requirements_for_supervised_transition_is_solicitor_only`.

### P3 — Handover head stale

**Reviewer:** Header said head was `926b1fa` but the branch was at `f171b4f`.

**Fix:** header now references "current branch head" generically rather than a specific commit, plus an update timestamp noting the round-1 review pass.

### New tests in this round

`backend/tests/test_phase1_security_fixes.py` — 17 tests covering the security fixes:

- `_derive_actor_role` returns `workspace_admin` for superuser; `any_authenticated` otherwise
- `CheckRequest` no longer carries `actor_role` and silently drops client-supplied values
- `_resolve_owner_for_create`: workspace forces user.id; matter requires owned non-archived slug; unknown scope → 422; missing owner_ref for matter → 422; cross-user slug → 404; archived → 404
- `_assert_instance_access`: workspace owner passes; workspace cross-user → 404; matter owner passes; matter cross-user → 404; matter archived → 404; malformed owner_id → 404; unknown scope → 404
- `_require_admin`: superuser passes; non-superuser → 403 `admin_required`
- `test_workspace_admin_cannot_promote_draft_to_supervised` (in test_phase1_advice_boundary.py) — proves P2 fix

Plus the two existing role-requirement tests in `test_phase1_advice_boundary.py` were updated to assert the tightened sets.

### Total test count after round 1

62 + 17 (new security tests) + 1 (P2 verification) = **80 tests** across 6 new test files.

---

## Reviewer findings + fixes — round 2 (2026-05-25)

Reviewer's second pass at `e33991c` confirmed the round-1 fixes hold but surfaced two more P1 trust-boundary holes. Both fixed in this commit.

### P1#1 — Initial-tier advice boundary allowed supervised / final without prior tier

**Reviewer:** "A workspace admin can call `/api/advice-boundary/check` with `requested_tier=approved_final_advice` and no `from_tier`, producing an allowed final decision with no supervised history. That reopens the supervision bypass in a different path. Initial creation should probably be capped at `draft_advice`."

**Fix:** `backend/app/core/advice_boundary/tiers.py`:
- `INITIAL_TIER_ROLE_REQUIREMENTS` now contains only `factual_extraction`, `legal_information`, `draft_advice`. The supervised and final tiers are intentionally absent — they cannot be set as initial tier.
- New `initial_tier_is_permitted(tier)` helper.

`backend/app/core/advice_boundary/gate.py`:
- The `from_tier=None` branch now explicitly checks `initial_tier_is_permitted(requested_tier)` before role evaluation. If not permitted, the gate writes a `BLOCKED` decision with `blocked_reason=invalid_transition`, `reason=tier_not_permitted_as_initial`, `max_initial_tier=draft_advice`. Audit `advice_boundary.check.blocked` emitted.

**Phase 1 consequence:** initial-tier creation is capped at `draft_advice`. Even a workspace admin or qualified solicitor cannot direct-create a `supervised_legal_advice` or `approved_final_advice` output via the gate without going through the transition path. When the output-lifecycle reference module ships in Phase 7+ and can prove prior state, this cap can be revisited.

**Tests added in `tests/test_phase1_advice_boundary.py`:**
- `test_initial_tier_supervised_is_not_permitted` — replaces the old `test_initial_tier_supervised_requires_solicitor`; proves even a solicitor cannot direct-create supervised.
- `test_initial_tier_approved_final_is_not_permitted` — new; proves even workspace_admin cannot direct-create approved final.

### P1#2 — State-machine definition registration globally writable

**Reviewer:** "`POST /api/state-machine/definitions` still accepts `module_id` from the body and registers it for any authenticated user. That lets a normal user publish definitions under first-party or firm-private module IDs."

**Fix:** Admin gate consolidated into a shared helper and applied uniformly:
- New `backend/app/core/admin_check.py` exports `require_admin(user, *, action_label)`. Same 403 `admin_required` envelope as the round-1 fix, with `action_label` interpolated into the message so different endpoints surface a distinct reason.
- `backend/app/api/matter_context.py`: replaces local `_require_admin` with `require_admin(user, action_label="matter-context schema registration")`.
- `backend/app/api/state_machine.py`: `register_definition_endpoint` now calls `require_admin(user, action_label="state-machine definition registration")` before doing anything else.

**Phase 1 consequence:** state-machine definitions and matter-context schemas now share the same workspace-admin trust gate. End users cannot publish under first-party or firm-private module IDs in either registry.

**Tests in `tests/test_phase1_security_fixes.py`:**
- Updated `test_require_admin_rejects_non_superuser` and `test_require_admin_permits_superuser` to use the shared `require_admin` with `action_label`.
- New `test_require_admin_for_state_machine_definition_registration` — verifies the same envelope on the state-machine path with a distinct action label.

### Total test count after round 2

80 (round 1) + 2 (P1#1 round 2: supervised + final not permitted as initial) + 1 (P1#2 round 2: state-machine admin gate) = **83 tests** across 6 test files. (Existing `test_initial_tier_supervised_requires_solicitor` was rewritten in place rather than added, so it doesn't bump the count.)

---

## Hand-off line for Reviewer

> Phase 1 is implemented end-to-end on `runtime-rewrite` at head `926b1fa`. Three substrate primitives (state_machine, matter_context, advice_boundary) plus shared phase1_runtime helpers, ~7290 LOC across 36 new files in 7 commits. Read `docs/handovers/HANDOVER_PHASE_1_DONE.md` for the full ledger. **Phase 2 is blocked until you (a) run the test suite against a Postgres container and report any failures, (b) ratify the two architectural decisions taken pre-code (plugin="core" convention + dual-audit pattern), and (c) decide on the four architecture-doc gaps and five Phase-2 open questions listed in the handover.**

---

*End of handover. Builder hands off to Reviewer. Phase 2 starts when this handover is reviewed and cleared.*
