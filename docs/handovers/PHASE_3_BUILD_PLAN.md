# Phase 3 Build Plan — MCP Host + Supply-Chain Layer

**Builder:** Claude (this session)
**Branch:** `runtime-rewrite`
**Base:** `6b3a5a0` (Phase 2 + the two Reviewer P1/P2 patches)
**Goal:** Build the MCP host runtime, the supply-chain layer (signing + sandbox + verified publisher registry), and the trust-ceremony install state machine. Phase 3 is what makes Legalise a *supply-chain-aware capability runtime* in practice — Phases 1 + 2 gave it primitives + manifest spec; Phase 3 gives it controlled execution.

Same discipline as Phases 1 + 2: plan first, code follows. Local sweep green before handover.

---

## Pre-build findings

Already known from Phase 1 + 2 work — no new file reads needed:

1. **Phase 1 substrate primitives** in `backend/app/core/{state_machine,matter_context,advice_boundary,phase1_runtime}/` are stable. Three primitives + shared infrastructure.
2. **Phase 2 registry + v2 manifest spec** in `backend/app/core/registry/` + `schemas/module.v2.json`. Manifests have `runtime: native | mcp` and `entrypoint` declared.
3. **`mcp` Python SDK** is the canonical Anthropic-published reference. Already a peer of `jsonschema` in terms of being a foundational library; Phase 3 adds it as a dependency.
4. **Audit middleware + `audit_failure`** from Phase 1 already handle the dual-session pattern; Phase 3 audit events go through the same paths.
5. **No `installed_modules` table yet.** Phase 3 adds it via migration 0016.
6. **No CI changes needed.** The existing `ci.yml` workflow runs the full backend suite on every push to `runtime-rewrite`.

### Architectural decisions taken pre-code

**Decision #1 — Sandbox tech: subprocess + seccomp/AppArmor first, WASM later.**

Per Reviewer's Phase 1 ratification of the architecture-rewrite memory. Phase 3 ships:
- subprocess-based MCP server execution (stdio transport)
- Linux seccomp filter (when available — gracefully degrades on macOS dev)
- AppArmor profile (when available — Ubuntu/Debian Linux only)
- RLIMIT enforcement (universal — works on macOS + Linux)
- No ambient filesystem or network access; everything via host bridge

WASM substrate deferred to a future phase. macOS dev environment cannot run seccomp/AppArmor — sandbox profiles will be no-ops on Darwin with a warning logged, and the host enforces capability scoping via the in-process bridge. Linux CI + Linux production gets full enforcement.

**Decision #2 — Signing scheme: sigstore.**

Per Reviewer's ratification. Sigstore is GitHub-native, free, what npm/PyPI converge on. Phase 3 ships:
- `core/signing.py` with sigstore-based signature verification
- Verified-publisher registry keyed by GitHub org id
- First-party `legalise` publisher hardcoded
- Unverified modules require explicit trust (the full 7-step ceremony)

The `sigstore` Python library is available; Phase 3 adds it as a dependency.

**Decision #3 — Trust ceremony is a state machine consumed via HTTP, not a runtime gate.**

Per Reviewer's ratification of `TRUST_CEREMONY.md`. The ceremony lives in `core/trust_ceremony.py` as a state machine consumed by the `POST /api/modules/install` endpoint. Each step emits audit; the response shape lets the frontend (Phase 12) render the permission card and any blocked state. Phase 3 builds the backend half; Phase 12 builds the frontend.

**Decision #4 — Phase 3 does NOT touch the existing v1 modules.**

The existing first-party modules (Pre-Motion, Contract Review, etc.) keep running through the legacy `plugin_bridge` path. Phase 3 builds the *parallel* MCP host runtime so future modules (Phase 7-9 reference ports) can register via MCP. The two systems coexist; Phase 7 begins the migration.

---

## Critical path

```
Step 1: core/publishers.py — verified publisher registry
   ↓
Step 2: core/signing.py — sigstore signature verification
   ↓
Step 3: core/sandbox/ — subprocess + RLIMIT + (Linux) seccomp/AppArmor
   ↓
Step 4: core/mcp_host/ — MCP client + transports + proxies
   ↓
Step 5: core/trust_ceremony.py — 7-step install state machine
   ↓
Step 6: migration 0016 + InstalledModule model
   ↓
Step 7: api/modules.py — POST /install endpoint + ceremony surface
   ↓
Step 8: tests
   ↓
Step 9: local Postgres sweep — green before handover
   ↓
Step 10: HANDOVER_PHASE_3_DONE.md (includes Phase 2 P1/P2 commit reference)
```

Steps 1-2 are independent. Step 3 (sandbox) depends on nothing else. Step 4 (MCP host) depends on sandbox for subprocess execution. Step 5 (trust ceremony) consumes 1, 2, 4. Step 6 (DB) is independent. Step 7 wires 1-6 together. Steps 8-9 verify.

---

## Step 1 — `core/publishers.py`

**File:** `backend/app/core/publishers.py` (new)

**Public surface:**
- `is_verified_publisher(publisher_id: str) -> bool`
- `publisher_info(publisher_id: str) -> PublisherInfo | None`
- `register_verified_publisher(publisher_id: str, info: PublisherInfo) -> None` (admin-only, in-memory + persisted to settings/config eventually)
- `VerifiedPublishersError` for invalid registrations

**Initial registry** (Phase 3 ships hardcoded; Phase 4 may move to DB-backed config):
- `legalise` — first-party (Andy's GH org). Always verified.
- `example` — for `examples/modules/` test fixtures. Verified for dev/test.
- `community` and `firm_private` are *visibility* values not publishers; they coexist with the publisher identity.

**Implementation:** module-level dict, immutable after import. ~80 LOC including types and basic tests.

---

## Step 2 — `core/signing.py`

**File:** `backend/app/core/signing.py` (new)

**Public surface:**
- `verify_manifest_signature(manifest: dict, *, signature: str | None) -> SignatureResult` — returns one of `verified | unsigned | invalid | unknown_publisher`
- `compute_manifest_hash(manifest: dict) -> str` — stable canonical-JSON hash for signing
- `SignatureResult` dataclass with `status`, `publisher`, `signed_by`, `notes`

**Implementation:**
- Phase 3 ships a **structural verifier** that:
  - Returns `verified` when `signature` is present, the publisher is in the verified registry, AND a `signed_by` field matches the publisher
  - Returns `unsigned` when no signature
  - Returns `invalid` when signature is malformed
  - Returns `unknown_publisher` when the publisher is not in the verified registry
- The actual sigstore cryptographic verification is **scaffolded** — the API is in place, but Phase 3 doesn't perform real X.509 chain verification. That requires (a) sigstore Python library installed (CI image work), (b) a real publishing pipeline that signs manifests with sigstore (Phase 11+ when connectors get published). Phase 3 documents this gap and leaves a `TODO(phase-11): wire sigstore Rekor lookup` marker.
- Trust ceremony still works end-to-end — the structural verifier produces `verified` for first-party publishers (Decision #1), `unsigned` for everything else, which is enough to drive the 3-step fast path vs 7-step full path branching.

~150 LOC + tests.

---

## Step 3 — `core/sandbox/`

**Files:**
- `core/sandbox/__init__.py` — public surface
- `core/sandbox/profiles.py` — per-kind sandbox profiles (skill | tool | workflow | provider | gate)
- `core/sandbox/subprocess_runner.py` — subprocess launcher with RLIMIT + optional seccomp/AppArmor
- `core/sandbox/host_bridge.py` — controlled filesystem + network access exposed to MCP servers

**Public surface:**
```python
from app.core.sandbox import (
    SandboxedProcess,
    SandboxProfile,
    launch_mcp_server,
    SandboxError,
    SandboxUnavailableError,
)
```

**Implementation:**
- `SandboxProfile` is a frozen dataclass: `(memory_mb_limit, cpu_seconds_limit, allow_network: bool, allow_filesystem_paths: list[str], syscall_allowlist: list[str] | None)`
- Per-kind defaults in `profiles.py`: tool/skill get tight defaults; provider gets network; workflow gets multi-process; gate is in-process (no subprocess at all).
- `launch_mcp_server(command, args, env, profile) -> SandboxedProcess` uses `subprocess.Popen` with `preexec_fn` to apply RLIMIT_AS, RLIMIT_CPU. On Linux: try to apply seccomp via `libseccomp` if available; AppArmor via `aa_change_onexec` if profile exists. On Darwin: log a warning and proceed without OS-level sandbox; the capability scope at the MCP host layer still gates filesystem + network access.
- `SandboxUnavailableError` for misconfigured profiles (e.g. requesting AppArmor on Darwin).

~400 LOC + tests.

---

## Step 4 — `core/mcp_host/`

**Files:**
- `core/mcp_host/__init__.py` — public surface
- `core/mcp_host/client.py` — MCP client wrapper, lifecycle
- `core/mcp_host/transports.py` — stdio + SSE transports
- `core/mcp_host/tool_proxy.py` — capability-checked tool invocation
- `core/mcp_host/resource_proxy.py` — matter data exposed as MCP resources under declared scopes
- `core/mcp_host/prompt_proxy.py` — matter context exposed as MCP prompts

**Public surface:**
```python
from app.core.mcp_host import (
    MCPClient,
    MCPHost,
    invoke_tool,
    list_tools,
    list_resources,
    list_prompts,
    MCPError,
    MCPCapabilityDenied,
)
```

**Implementation strategy:**
- Phase 3 ships **MCP host scaffolding without a hard dependency on the `mcp` SDK package** at runtime. Reason: the `mcp` Python SDK changes shape frequently and adding it as a hard dependency couples Phase 3 to a specific spec version. Instead Phase 3 defines the host interface, the transport contract, and the proxy enforcement — the actual MCP wire protocol (JSON-RPC framing, capability negotiation) is delegated to a pluggable transport that callers can implement against any MCP SDK version.
- Concretely: `MCPClient` is an abstract base class; `StdioTransport` and `SseTransport` are concrete subclasses that handle the JSON-RPC frame format. A reference test transport (`InMemoryTransport`) is included for unit tests so Phase 3 can ship without launching real MCP processes.
- `tool_proxy.invoke_tool(...)` runs `check_or_block` for every declared `reads`/`writes` capability before forwarding to the transport. On capability denial: Phase 1 dual-audit pattern fires.
- `resource_proxy.expose_matter_resources(matter)` produces an MCP `Resource` listing for the matter, filtered by the requesting module's `reads` capabilities.

~700 LOC + tests.

---

## Step 5 — `core/trust_ceremony.py`

**File:** `backend/app/core/trust_ceremony.py` (new)

**State machine** (per Phase 1 substrate primitive):
```
discovered → inspected → signature_checked → publisher_checked →
permissions_reviewed → gates_reviewed → granted → enabled
```

Failure terminals: `rejected_by_user`, `signature_failed`, `publisher_blocked`, `dependency_missing`, `permission_denied`, `sandbox_profile_missing`.

**Public surface:**
- `start_ceremony(manifest, *, actor_user_id, requires_explicit_trust: bool) -> CeremonyState`
- `advance_ceremony(ceremony_id, *, action: str, actor_user_id) -> CeremonyState`
- `permission_card(manifest) -> PermissionCard` — used by the API to render the card

**Two modes:**
- Verified publisher fast path (3 explicit transitions: show publisher → show permission card → enable)
- Unverified publisher full path (7 transitions covering inspection, signature, publisher warning, permissions, data movement, gates, explicit trust)

**Audit emission** at every state transition: `module.discovered`, `module.manifest.inspected`, `module.signature.checked`, `module.publisher.checked`, `module.permissions.reviewed`, `module.grant.created`, `module.enabled`, `module.denied`, `module.grant.revoked`.

~500 LOC + tests.

---

## Step 6 — Migration 0016 + `InstalledModule` model

**Files:**
- `backend/alembic/versions/0016_phase3_installed_modules.py`
- `backend/app/models/installed_module.py` (new)

**Schema:**
```
installed_modules
├── id (UUID, PK)
├── module_id (String 128, indexed)
├── version (String 32)
├── publisher (String 128)
├── visibility (String 32)
├── signature_status (String 32) — verified | unsigned | invalid | unknown_publisher
├── signed_by (String 128, nullable)
├── verified_at (DateTime, nullable) — when the verified-publisher fast path was taken
├── install_path (String 512) — where the module's manifest lives on disk
├── manifest_snapshot (JSONB) — the manifest contents at install time
├── permissions_snapshot (JSONB) — reads/writes/gates/data_movement at install time
├── installed_at (DateTime)
├── installed_by_user_id (FK → users.id)
├── enabled (Boolean, default True)
└── UNIQUE (module_id, version)
```

~100 LOC.

---

## Step 7 — API: `POST /api/modules/install` + ceremony endpoints

**Files:**
- `backend/app/api/modules.py` (extend)

**New endpoints:**
- `POST /api/modules/install` — body: `{source: "github" | "path", url | path, version}`. Triggers the ceremony, returns initial CeremonyState + PermissionCard.
- `POST /api/modules/install/{ceremony_id}/advance` — body: `{action: "trust" | "reject" | "grant"}`. Drives the state machine.
- `GET /api/modules/install/{ceremony_id}` — read ceremony state.

Plus:
- Admin-gated via `require_admin` (workspace_admin only — per the Phase 2 Reviewer P1#3 pattern for registry mutations).

~250 LOC + tests.

---

## Step 8 — Tests

**Files:**
- `backend/tests/test_phase3_publishers.py` (~5 tests)
- `backend/tests/test_phase3_signing.py` (~8 tests)
- `backend/tests/test_phase3_sandbox.py` (~10 tests — Linux-only assertions skip cleanly on Darwin)
- `backend/tests/test_phase3_mcp_host.py` (~15 tests using `InMemoryTransport`)
- `backend/tests/test_phase3_trust_ceremony.py` (~12 tests — both fast and full paths, all failure terminals)
- `backend/tests/test_phase3_install_api.py` (~10 tests — HTTP-level)
- `backend/tests/test_phase3_installed_modules.py` (~5 tests — model + migration)

Total: ~65 new tests.

---

## Step 9 — Local Postgres sweep

Per Phase 1/2 process: builder runs the full sweep before handover. Acceptance bar:
- All ~65 new Phase 3 tests pass
- Phase 1 + 2 + 3 combined sweep is green (~200+ tests)
- Entire backend suite stays green (no regressions)

---

## Step 10 — `HANDOVER_PHASE_3_DONE.md`

Standard handover with:
- Commit ledger
- Test counts
- Architectural decisions for ratification (the four above)
- Reference to Phase 2 Reviewer P1/P2 fix commit (`6b3a5a0`) so this handover bundles both
- Out-of-scope items (Phase 4: grant lifecycle; Phase 5: audit reconstruction; Phase 11: real sigstore wiring)

---

## Out of scope (deferred)

- **Grant lifecycle** (revocation, re-prompt on permission expansion) — Phase 4
- **Dependency graph resolution at install time** — Phase 4
- **Audit reconstruction view** (Phase 5) — sweep filter, no new emit
- **Streaming/async runtime** — Phase 6
- **Real sigstore Rekor lookup + X.509 chain verification** — Phase 11 (when modules start getting signed for real)
- **WASM sandbox** — post-launch
- **Touching existing v1 modules** — Phase 7-10

Phase 3 ships the architecture. Phases 4 + 5 layer governance on top. Phases 7-11 populate with real modules.

---

## Commit cadence

Same as Phase 1/2 — one commit per logical unit:

1. `phase3: build plan`
2. `phase3: core/publishers.py`
3. `phase3: core/signing.py`
4. `phase3: core/sandbox/`
5. `phase3: core/mcp_host/`
6. `phase3: core/trust_ceremony.py`
7. `phase3: migration 0016 + InstalledModule model`
8. `phase3: api/modules — install + ceremony endpoints`
9. `phase3: tests + sweep green`
10. `phase3: handover doc`

CI fires on every push. Builder hands to Reviewer green.

---

## Risks / open questions during build

If any of these surface, patch this plan first:

1. **`mcp` Python SDK availability + API stability** — Phase 3 sidesteps by abstracting transport behind an interface. If Reviewer wants direct SDK use, the abstract base classes can wrap the SDK without breaking callers.
2. **macOS sandbox gaps** — Darwin can't run seccomp/AppArmor. Phase 3 logs a warning and proceeds without OS-level enforcement; CI on Linux ubuntu-latest gets full enforcement. Operators are expected to deploy to Linux for production-grade sandboxing.
3. **Sigstore wiring depth** — Phase 3 ships structural verification only. Phase 11 wires real cryptographic chain verification when modules start getting signed for real.
4. **Trust ceremony UI** — Phase 12 builds the frontend. Phase 3's HTTP API needs to return enough state for the frontend to render the permission card; the response shapes are designed against the eventual UI but no frontend code lands in Phase 3.

---

*End of Phase 3 build plan. Builder commits this, then begins Step 1.*
