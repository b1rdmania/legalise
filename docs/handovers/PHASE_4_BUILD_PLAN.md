# Phase 4 Build Plan — Grant Lifecycle + Dependency Resolution

**Builder:** Claude (this session)
**Branch:** `runtime-rewrite`
**Base:** `6ec66f3` (Phase 3 complete; tests green; handover doc deferred to bundle with Phase 4)
**Goal:** Phase 4 layers governance on top of Phase 3's installed-module surface. Three deliverables:
1. Permission-expansion detection on module update (re-prompt requirement)
2. Semver-aware dependency resolution at install time
3. Grant revocation (explicit + matter-close cascade)

Same discipline as Phases 1-3. Build plan first, code follows. Phase 3 + 4 handover lands together per Andy's direction.

---

## Pre-build findings

Already known:
- Phase 3 ships `installed_modules.permissions_snapshot` JSONB — Phase 4 reads it for diff.
- Phase 2 ships `workspace_skill_capability_grants.granted_permissions_snapshot` JSONB — Phase 4 reads it for per-user grant lifecycle.
- Phase 1 advice-boundary tier ordering exists in `core/advice_boundary/tiers.py` — Phase 4 reuses for tier-bump detection.
- Existing `matters.py` has a close endpoint (status→archived). Phase 4 hooks into it.
- The `manifest.requires` field is structurally validated by Phase 2 but no runtime resolution yet.

### Architectural decisions taken pre-code

**Decision #1 — Permission expansion is purely additive comparison.**

A permission expansion is any of:
- new reads or writes capability that wasn't in the old snapshot
- `advice_tier_max` increases (per the canonical tier ordering)
- `external_network` flips from False to True
- new entries in `data_movement.external_destinations`
- new gate that wasn't previously declared
- `model_access` increases (none < optional < required)

`detect_expansion(old_snapshot, new_snapshot) -> ExpansionReport` returns a structured diff. The trust ceremony's update path consumes this to decide between fast-path approve and re-prompt.

**Decision #2 — Dependency resolution is best-effort at install time.**

Phase 4 ships:
- Semver range parsing (uses `packaging.specifiers` from the `packaging` library — already a transitive dep via SQLAlchemy)
- Resolver walks the `requires` array and confirms each dependency is in `installed_modules` OR `discover_modules()` with a satisfying version
- On unresolvable dependency: ceremony transitions to `DEPENDENCY_MISSING` (terminal failure)
- Cycle detection: rejects manifests whose dependency graph has cycles
- No transitive auto-install: Phase 4 reports missing deps but doesn't recursively install them (admin installs explicitly)

**Decision #3 — Matter closure cascades grant revocation.**

When a matter transitions to `archived`, every grant scoped to that matter is revoked. Phase 4 adds a hook in the matters API. Audit emission per revoked grant via `module.grant.revoked`.

For Phase 4, scoping is approximate — `WorkspaceSkillCapabilityGrant` rows don't yet have a matter_id column. The cascade applies to grants whose `granted_permissions_snapshot.matter_id` matches the closing matter. v1 grants without a snapshot (legacy) are NOT cascaded; they survive matter close as before.

**Decision #4 — No new DB tables.**

Phase 4 reuses `installed_modules.permissions_snapshot` and extends usage of `workspace_skill_capability_grants.granted_permissions_snapshot`. No migration needed.

---

## Critical path

```
Step 1: core/grants_lifecycle.py — expansion detection
   ↓
Step 2: core/dependency_resolver.py — semver + cycle detection
   ↓
Step 3: api/modules.py — POST /revoke, POST /update endpoints
   ↓
Step 4: api/matters.py — hook into close → cascade revoke
   ↓
Step 5: Tests
   ↓
Step 6: Full sweep green
   ↓
Step 7: HANDOVER_PHASE_3_AND_4_DONE.md (bundles both phases)
```

---

## Step 1 — `core/grants_lifecycle.py`

**File:** `backend/app/core/grants_lifecycle.py` (new)

**Public surface:**
- `detect_expansion(old: dict, new: dict) -> ExpansionReport`
- `requires_reprompt(report: ExpansionReport) -> bool`
- `ExpansionReport` dataclass with `reads_added`, `writes_added`, `tier_raised`, `external_network_added`, `new_destinations`, `new_gates`, `model_access_raised`

**Implementation:** pure-functional diff of two snapshots. ~200 LOC including types and unit tests.

---

## Step 2 — `core/dependency_resolver.py`

**File:** `backend/app/core/dependency_resolver.py` (new)

**Public surface:**
- `resolve_dependencies(manifest: dict, *, session) -> ResolutionResult`
- `ResolutionResult.is_satisfied: bool`
- `ResolutionResult.missing: list[MissingDependency]`
- `ResolutionResult.cycles: list[list[str]]` (each cycle is a list of module ids forming the loop)
- `MissingDependency` dataclass with `module_id`, `required_version_spec`, `available_versions`

**Implementation:**
- Use `packaging.specifiers.SpecifierSet` for version range matching
- Topological sort via DFS for cycle detection
- Reads `installed_modules` for already-installed deps; falls back to `discover_modules()` for not-yet-installed

~250 LOC.

---

## Step 3 — Revoke + Update API endpoints

**File:** `backend/app/api/modules.py` (extend)

- `POST /api/modules/{module_id}/revoke` — disables the module; revokes all per-user grants for it. Admin-only. Audited `module.grant.revoked` + `module.disabled`.
- `POST /api/modules/{module_id}/update` — body: `{new_version, new_manifest, signature?}`. Runs `detect_expansion`; if expansion detected, starts a new trust ceremony (re-prompt path); if no expansion, updates the installed_modules row directly. Admin-only.

~200 LOC.

---

## Step 4 — Matter close cascade

**File:** `backend/app/api/matters.py` (extend)

- Existing matter-archive transition gains a side effect: iterate over `WorkspaceSkillCapabilityGrant` rows where `granted_permissions_snapshot ->> 'matter_id' == closing_matter.id`, revoke each, emit `module.grant.revoked` audit row per revocation.
- Idempotent: re-archiving an already-archived matter does not re-revoke (since the rows are already gone).

~100 LOC.

---

## Step 5 — Tests

- `test_phase4_grants_lifecycle.py` (~10 tests) — expansion detection cases
- `test_phase4_dependency_resolver.py` (~10 tests) — resolution, missing, cycles
- `test_phase4_revoke_update_api.py` (~12 tests) — HTTP-level admin-only + behaviour
- `test_phase4_matter_close_cascade.py` (~5 tests) — archive triggers revocation

~37 new tests.

---

## Step 6 — Full sweep

- Phase 4 only: ~37 tests
- Phase 1+2+3+4 combined: ~250+ tests
- Entire backend: must stay green

---

## Step 7 — Combined Phase 3 + Phase 4 handover

`HANDOVER_PHASE_3_AND_4_DONE.md` covers:
- Phase 3 deliverables ledger
- Phase 4 deliverables ledger
- Reference to Phase 2 P1/P2 fix commit (`6b3a5a0`) that's also bundled in this handover
- Combined test counts
- Architectural decisions across both phases
- Out-of-scope items (Phase 5 audit reconstruction; Phase 6 streaming; Phase 7+ reference module ports)

---

## Out of scope (deferred)

- Audit reconstruction view (Phase 5)
- Cost tracking on model invocations (Phase 5)
- Streaming/async runtime (Phase 6)
- Reference module ports (Phase 7-10)
- Connector proof set (Phase 11)
- Frontend (Phase 12)
- Transitive auto-install of dependencies — Phase 4 reports missing, doesn't recursively install

---

*End of Phase 4 build plan. Builder commits this, then starts Step 1.*
