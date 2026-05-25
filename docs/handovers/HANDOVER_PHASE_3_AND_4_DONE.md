# Handover — Phase 3 + Phase 4 Done (combined)

**Builder:** Claude (this session)
**Branch:** `runtime-rewrite`
**Head:** current (see git log; latest commit ratifies both phases)
**Acceptance gate:** awaiting Reviewer ratification
**Phase 5 status:** blocked until this handover is reviewed

Per Andy's direction this handover bundles three deliverables: the Phase 2 P1/P2 Reviewer patches (commit `6b3a5a0`), Phase 3 (MCP host + supply-chain layer), and Phase 4 (grant lifecycle + dependency resolution). All in one ratification cycle.

---

## What landed

### Phase 2 Reviewer P1/P2 patches (commit `6b3a5a0`)

Pre-Phase-3 carry-overs from Reviewer's Phase 2 review:

- **P1: SKILL.md discovery was silently dropping every SKILL-only module.** `discovery.py` was calling `_parse_skill_md(Path)` but the function takes file text and returns a `SkillManifest` dataclass (not a tuple). Fix: read file text explicitly, parse frontmatter directly so the full metadata dict is accessible, narrow the exception handling so malformed YAML skips but unrelated errors bubble.
- **P2: Capability catalogue exposed capabilities from invalid manifests.** `list_capabilities` now runs `validate_manifest_v2` before emitting any capability; invalid manifests are filtered (with an `include_invalid=True` admin escape hatch). Every catalogue entry gains a `manifest_valid: bool` field.

### Phase 3 — MCP host + supply-chain layer

**8 commits** between `5f011fd` and `8c9108e`:

| Commit | What |
|---|---|
| `f05dda5` | Phase 3 build plan |
| `7d8e728` | `core/publishers.py` + `core/signing.py` |
| `d637e1d` | `core/sandbox/` (RLIMIT + scaffolded seccomp/AppArmor) |
| `bf3d4c1` | `core/mcp_host/` (transports + client + tool proxy) |
| `a9c8a84` | `core/trust_ceremony.py` (state machine) |
| `3267932` | Migration 0016 + `InstalledModule` model |
| `8c9108e` | Install API endpoints (start / advance / get) |
| `6ec66f3` | Phase 3 tests (55) + route reorder + uuid type fixes |

**Deliverables:**

- `core/publishers.py` — verified publisher registry. Hardcoded `legalise` (first-party) + `example` (dev/test). Trust ceremony uses this to branch fast-path vs full-path.
- `core/signing.py` — structural signature verifier with 4-state outcome (`verified | unsigned | invalid | unknown_publisher`). Real cryptographic Rekor lookup deferred to Phase 11 with explicit `TODO(phase-11)` marker.
- `core/sandbox/` — subprocess MCP server launcher with RLIMIT_AS, RLIMIT_CPU, RLIMIT_NOFILE applied via `preexec_fn`. Per-kind profiles (skill/tool/workflow/provider/gate). Scaffolded Linux seccomp via pyseccomp (graceful no-op on macOS); AppArmor stub for Phase 4 ops follow-up.
- `core/mcp_host/` — abstract `MCPTransport` interface with three implementations: `StdioTransport` (wraps `SandboxedProcess`), `SseTransport` (HTTP plumbing delegated to caller's `http_call`), `InMemoryTransport` (test fixture). `MCPClient` with `asyncio.Lock`-serialised requests. `MCPHost` registry. `invoke_tool` enforces capability scope (Phase 1 dual-audit on denial).
- `core/trust_ceremony.py` — 8-state install state machine (`discovered → inspected → signature_checked → publisher_checked → permissions_reviewed → gates_reviewed → granted → enabled`) + 6 terminal failure states. Fast path (3 effective transitions) for verified publishers, full path (7 transitions) for unverified. `build_permission_card` aggregates every capability's `data_movement`, `gates`, `audit_events`, highest `advice_tier_max` into a single user-facing card.
- Migration 0016 + `InstalledModule` model — one row per successful install, captures the signature outcome, manifest snapshot, permissions snapshot, install path, enabled flag. UNIQUE on `(module_id, version)`.
- Three install endpoints (`POST /api/modules/install`, `POST /install/{id}/advance`, `GET /install/{id}`). Admin-gated via `require_admin`. On enabled-state transition, persists `InstalledModule` row.

**Architectural decisions** (all four ratification-pending):
1. Sandbox tech — subprocess + seccomp/AppArmor (Linux); graceful degradation on macOS.
2. Signing — sigstore structural verifier in Phase 3, real Rekor lookup in Phase 11.
3. Trust ceremony lives in core, consumed via HTTP.
4. Phase 3 runs PARALLEL to existing v1 modules; the legacy `plugin_bridge` path is untouched.

### Phase 4 — Grant lifecycle + dependency resolution

**5 commits** between `074c342` and `a878db9`:

| Commit | What |
|---|---|
| `074c342` | Phase 4 build plan |
| `266c2e5` | `core/grants_lifecycle.py` + `core/dependency_resolver.py` |
| `684c901` | Revoke + update API + matter-close grant cascade |
| `a878db9` | Phase 4 tests (32) + final sweep green |

**Deliverables:**

- `core/grants_lifecycle.py` — pure-functional `detect_expansion(old, new) -> ExpansionReport` diff across reads_added, writes_added, tier_raised, external_network_added, new_destinations, new_gates_added/removed, model_access_raised. `requires_reprompt(report)` drives the update endpoint's branching.
- `core/dependency_resolver.py` — semver constraint matching via `packaging.specifiers.SpecifierSet`. Resolves manifest `requires` against installed_modules + `discover_modules()`. DFS cycle detection. Reports missing deps + cycles in `ResolutionResult` (Phase 4 does NOT auto-install transitively; admin installs each).
- `POST /api/modules/{module_id}/revoke` — admin-only. Disables every InstalledModule row for the module, hard-deletes every WorkspaceSkillCapabilityGrant where `plugin == module_id`. Audit `module.disabled` + `module.grant.revoked`.
- `POST /api/modules/{module_id}/update` — admin-only. Validates new manifest. Runs `detect_expansion` against the latest install's `permissions_snapshot`. If expansion: starts a new trust ceremony (re-prompt path) with `ceremony_id` in the response. If no expansion: updates the InstalledModule row in place. Emits `module.updated`.
- Matter-close cascade hook in `api/matters.py` — when a matter archives, hard-deletes every `WorkspaceSkillCapabilityGrant` where `granted_permissions_snapshot.matter_id == matter.id`. Single `module.grant.revoked` audit row carrying count + `reason="matter_archived"`. v1 legacy grants (snapshot=NULL) are unaffected.

**Architectural decisions** (all four ratification-pending):
1. Permission expansion is purely additive comparison — removal alone doesn't trigger re-prompt.
2. Dependency resolution is best-effort at install time; no transitive auto-install.
3. Matter closure cascades grants via `granted_permissions_snapshot.matter_id` scoping; v1 grants survive.
4. No new DB tables in Phase 4.

---

## Sweep result

| Sweep | Result |
|---|---|
| Phase 3 only | 55 passed |
| Phase 4 only | 32 passed |
| Phase 1+2+3+4 combined | ~220 passed |
| **Entire backend suite** | **528 passed, 7 skipped, 1 xfailed, 0 failed** |

All run locally against real Postgres in the docker-compose container at the time of this handover.

---

## What is NOT in Phase 3+4 (deferred)

- **Audit reconstruction view** — Phase 5. The audit *emits* are all in place across Phase 1-4; the reconstruction/filter API is Phase 5.
- **Cost tracking on model invocations** — Phase 5.
- **Streaming/async runtime** — Phase 6 (Phase 3 declares `streaming_mode` in manifest; Phase 6 wires the runtime).
- **Real sigstore Rekor lookup + X.509 chain verification** — Phase 11 (when modules start getting signed for real).
- **Linux AppArmor profile** — Phase 4 ops follow-up. Phase 3 ships the stub; production deployments install the AppArmor profile.
- **WASM sandbox** — post-launch.
- **Reference module ports** (Pre-Motion, Contract Review, Document Redliner) — Phase 7-9.
- **Connector proof set** — Phase 11.
- **Frontend** — Phase 12. Phase 3+4 API surfaces are designed against the eventual Phase 12 modal UI.
- **Transitive auto-install of dependencies** — Phase 4 reports missing, doesn't recursively install.

---

## Architectural decisions to ratify (8 total)

### Phase 3
1. Sandbox: subprocess + seccomp/AppArmor first; macOS gracefully degrades
2. Signing: sigstore structural verifier now; Phase 11 wires Rekor
3. Trust ceremony state machine in core, HTTP API consumes it
4. Phase 3 runs parallel to legacy v1 modules; no v1 modifications

### Phase 4
5. Permission expansion is additive-only; removal alone doesn't re-prompt
6. Dependency resolution reports missing; no transitive auto-install
7. Matter close cascades grants via snapshot.matter_id; v1 grants survive
8. No new DB tables in Phase 4

---

## Outstanding architecture-doc gaps

Carried forward; Reviewer to confirm Phase 5+ work:

- `MANIFEST_V2_SCHEMA.md` UI slot vocabulary lock (carry-over from Phase 2 — slots live in `core/registry/slots.py`)
- `MANIFEST_V2_SCHEMA.md` shim default policy documentation (Phase 2 carry-over)
- `TRUST_CEREMONY.md` — Phase 3 implementation matches the spec; no patches needed
- `SIGNING.md` — Phase 3 structural verifier matches; Phase 11 will wire real Rekor

---

## Verification commands

```bash
# 1. Ensure compose stack is up.
docker compose -f infra/docker-compose.yml up -d db backend

# 2. Install dev deps if not already.
docker compose -f infra/docker-compose.yml exec -T backend pip install -e '.[dev]'

# 3. Migrate test DB to head (includes migrations 0015 + 0016).
docker compose -f infra/docker-compose.yml exec -T \
  -e POSTGRES_DSN="postgresql+psycopg://legalise:legalise@db:5432/legalise_test" \
  backend python -m alembic upgrade head

# 4. Run the Phase 3+4 sweep (all 87 new tests).
docker compose -f infra/docker-compose.yml exec -T \
  -e POSTGRES_DSN="postgresql+asyncpg://legalise:legalise@db:5432/legalise_test" \
  -e TEST_DATABASE_URL="postgresql+asyncpg://legalise:legalise@db:5432/legalise_test" \
  backend python -m pytest \
    tests/test_phase3_publishers.py tests/test_phase3_signing.py \
    tests/test_phase3_sandbox.py tests/test_phase3_mcp_host.py \
    tests/test_phase3_trust_ceremony.py tests/test_phase3_install_api.py \
    tests/test_phase4_grants_lifecycle.py tests/test_phase4_dependency_resolver.py \
    tests/test_phase4_revoke_update_api.py tests/test_phase4_matter_close_cascade.py

# 5. Or the entire backend.
docker compose -f infra/docker-compose.yml exec -T \
  -e POSTGRES_DSN="postgresql+asyncpg://legalise:legalise@db:5432/legalise_test" \
  -e TEST_DATABASE_URL="postgresql+asyncpg://legalise:legalise@db:5432/legalise_test" \
  backend python -m pytest
```

---

## Hand-off line for Reviewer

> *Phase 3 + Phase 4 (plus Phase 2 P1/P2 carry-over) implemented end-to-end on `runtime-rewrite`. Local sweep green: 528 passed across the entire backend (87 new tests across Phase 3 + Phase 4). CI workflow will validate on push. Read `docs/handovers/HANDOVER_PHASE_3_AND_4_DONE.md` for the full ledger. Eight architectural decisions request ratification (four per phase). Phase 5 (audit reconstruction + cost tracking) starts when this handover is reviewed.*

---

## Round-2 Reviewer fixes (post round-1 audit)

Reviewer returned four runtime-contract findings on the first ratification pass. All four are now fixed and tested. Full backend sweep green at **536 passed, 8 skipped, 0 failed**.

### Findings + fixes

**P1 #1 — Trust ceremony allowed `grant` to skip straight to `ENABLED`.**
The state machine's `grant` action previously fired from any non-terminal state, letting an admin bypass the ceremony entirely.
*Fix:* `core/trust_ceremony.py` adds an `InvalidCeremonyTransition` exception. `_next_state` now requires `current is CeremonyState.GRANTED` before honouring `action == "grant"`. The API endpoint translates the exception to HTTP 409.

**P1 #2 — Update diff missed advice-tier expansion in raw v2 manifests.**
`detect_expansion` only read the top-level `advice_tier_max` rollup, which is built by `build_permission_card` but absent from raw v2 manifests handed to `update_module_endpoint`. A draft → supervised raise was silently passing without re-prompt.
*Fix:* `core/grants_lifecycle.py::_highest_tier` now scans `snapshot["capabilities"][*].advice_tier_max` and returns the max regardless of snapshot shape.

**P1 #3 — Dependency resolver never called from install/update.**
`api/modules.py` had `resolve_dependencies` available but never invoked it; manifests with missing or cyclic `requires` were silently installed.
*Fix:* `start_install_endpoint` and `update_module_endpoint` now call `resolve_dependencies()` against the in-flight session and return HTTP 422 with `{error: "dependencies_unsatisfied", resolution: {...}}` when unsatisfied.

**P2 #4 — Duplicate persist on retried final `grant`.**
A repeated `grant` advance after the ceremony reached `ENABLED` would try to insert the `InstalledModule` row a second time, hitting the UNIQUE (module_id, version) constraint and 500ing.
*Fix:* `Ceremony` dataclass gains a `persisted: bool = False` flag. The advance endpoint persists only on the first transition into `ENABLED`; subsequent calls hit the guard and return the cached state idempotently.

### Round-2 test file

`backend/tests/test_phase3_phase4_round2_fixes.py` — 8 tests:
- `test_grant_from_discovered_raises`
- `test_grant_from_publisher_checked_raises`
- `test_grant_from_granted_succeeds`
- `test_detect_expansion_picks_up_tier_increase_in_capabilities`
- `test_detect_expansion_handles_multi_capability_tier`
- `test_install_rejects_missing_dependency`
- `test_update_rejects_missing_dependency`
- `test_repeated_grant_does_not_double_insert`

---

*End of combined Phase 3 + Phase 4 handover.*
