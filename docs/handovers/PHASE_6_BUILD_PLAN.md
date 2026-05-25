# Phase 6 Build Plan — Vertical Slice (Contract Review)

**Builder:** Claude (this session)
**Branch:** `runtime-rewrite`
**Base:** Phase 5 v3 handover commit (TBC; this plan assumes Phase 5 v3 closed and ratified)
**Replaces:** The original async-runtime Phase 6 plan, now parked at `PHASE_7_ASYNC_RUNTIME_PLAN_PARKED.md`.

**Goal:** Ship the narrowest complete vertical slice of the v2 runtime. One matter, one installed module, one permission card, one supervised/gated action, one output, one audit reconstruction. Prove the substrate; do not add breadth.

**Acceptance bar (Andy's words):**

> Install/enable module, grant capabilities, run against Khan NDA, hit any required gate, produce output/artifact, and reconstruct the full trail. No new breadth until that path is boring.

---

## Why Contract Review (not Pre-Motion)

Per Andy's redirect:
- Reads a document
- Invokes a provider/model
- Produces a concrete legal output
- Creates an artifact/citation pack
- Exercises permissions, model access, document access, output lifecycle, audit, advice boundary
- Single-actor flow — easier to reason about than Pre-Motion's multi-agent orchestration

Pre-Motion is the second module, *after* Contract Review proves the shape.

---

## Pre-build findings

Already known from earlier phases:
- Phases 1–5 ship the substrate: matter context, advice boundary, capability registry, manifest v2, signed modules + sandbox, MCP host, trust ceremony, grant lifecycle, dependency resolver, audit reconstruction, cost metadata.
- Sample matter `khan-v-acme` is seeded by the existing demo-mode fixtures. The NDA document is the natural pick because it's a single self-contained contract — Contract Review on a longer commercial agreement is the next-step expansion.
- Phase 2's example module path (`examples/modules/`) is where the Contract Review module belongs — `examples/modules/contract-review/`. This is a **reference module**, not a built-in. The intent is that an external author could read this and write their own.
- The provider modules from Phase 1 expose model invocations through MCP tools. Contract Review's provider call routes through whichever provider the matter's `default_model_id` points to. **No server-paid keys** (non-negotiable from memory) — user supplies their own key in the workspace settings.
- Privilege posture (`privilege_posture` on `Matter`) is the gate this slice exercises. `mixed` and `legally_privileged` mattter postures require the user to have a qualified_solicitor role *or* explicit acknowledgement that they're inspecting privileged content under a documented purpose.

### Architectural decisions taken pre-code

**Decision #1 — The module is a real signed manifest, not a stub.**

`examples/modules/contract-review/module.json` is a complete v2 manifest:
- `id: "examples.contract-review"`
- `publisher: "legalise"` (uses the existing first-party verified publisher entry from Phase 3)
- `signature: <real signature over canonical manifest hash>` — produced by a tiny `scripts/sign_example_module.py` helper that uses the same `compute_manifest_hash` from `core/signing.py`. Phase 3 left structural verification in place; Phase 11 deferred real sigstore/Rekor lookup. The signed example exercises the structural path.
- One capability: `id: "review"`, `kind: skill`, `scope: matter`, `reads: ["matter.document.read"]`, `writes: ["matter.artifact.write"]`, `model_access: required`, `external_network: false`, `gates: ["privilege_posture"]`, `advice_tier_max: "draft_advice"`.
- One MCP tool: `review_contract(document_id) -> {findings: [...]}`.

No new module shape. Reuses Phase 2 manifest v2 + Phase 3 install ceremony + Phase 4 grant lifecycle exactly as built.

**Decision #2 — Acceptance is end-to-end, scripted, and rerunnable.**

`backend/tests/test_phase6_vertical_slice.py` is a single integration test that walks the entire acceptance bar in one Python function:

1. Register a qualified_solicitor user.
2. Confirm Khan v Acme matter exists with the NDA document attached.
3. Start install ceremony for `examples.contract-review`.
4. Trust → trust → trust → grant (verified fast path).
5. Confirm grant row + `InstalledModule` row written.
6. Invoke the `review` capability against the NDA.
7. Confirm the privilege gate fires + records its decision.
8. Confirm the artifact row is written.
9. Pull the reconstruction view for the matter.
10. Assert the timeline contains: ceremony events, grant write, capability invocation, gate decision, model invocation (with cost columns), artifact write — all in canonical order.

That single test is the contract. It must pass under the same sweep as everything else, with no DEMO_MODE shortcuts, no test-only branches in production code.

**Decision #3 — No new infrastructure.**

The slice runs synchronously over HTTP. No SSE. No async runtime. No new tables beyond what Phases 1–5 already ship. If the synchronous call times out at the HTTP layer, that's the signal to unpark Phase 7+ async runtime — not the trigger to inline async machinery here.

**Decision #4 — Artifact storage reuses the matter file store.**

`Matter` already has the matter filesystem path (`matter_fs`). Artifacts written by capabilities land at `{matter_fs}/artifacts/{capability_id}/{invocation_id}.json` + a Postgres row in a new lightweight `matter_artifacts` table. The row is the authoritative reference; the file is the payload.

`matter_artifacts` is the only new table Phase 6 adds:
```
matter_artifacts
  id              UUID PK
  matter_id       UUID NOT NULL REFERENCES matters(id)
  capability_id   VARCHAR(256) NOT NULL
  module_id       VARCHAR(128) NOT NULL
  invocation_id   UUID NOT NULL
  kind            VARCHAR(64) NOT NULL  -- "findings_pack" for Contract Review
  storage_path    TEXT NOT NULL
  created_by_id   UUID NOT NULL REFERENCES users(id)
  created_at      TIMESTAMPTZ NOT NULL
  size_bytes      BIGINT NOT NULL

  INDEX (matter_id, created_at DESC)
  INDEX (invocation_id)
```

WORM trigger on this table (artifacts are append-only; new versions get new rows).

**Decision #5 — Privilege gate uses the existing advice_boundary surface.**

`gates: ["privilege_posture"]` in the manifest wires up to the existing `check_or_block(gate="privilege_posture", ...)` from Phase 1. The gate inspects the matter's `privilege_posture` and the caller's role:
- `privilege_posture in {"mixed", "legally_privileged"}` AND caller role != `qualified_solicitor` → block, emit `module.capability.blocked{reason: "privilege_gate_failed"}`.
- Otherwise → allow, emit `advice_boundary_decisions` row (Phase 1 WORM table).

No new gate code. Phase 1 already shipped this; the slice exercises it.

**Decision #6 — The provider call is real, but the model can be a deterministic stub in tests.**

In production: the user-supplied provider key is used, the actual LLM API is called.

In the integration test: the provider module is monkey-patched to return a fixed canned `{findings: [...]}`. The cost columns get populated by the helper from Phase 5 with the same shape they'd have for a real call.

This is the only place test seams matter. The runtime code path is identical to production.

---

## Critical path

```
Step 1: scripts/sign_example_module.py — minimal CLI signer
   ↓
Step 2: examples/modules/contract-review/ — manifest + entry stub
   ↓
Step 3: migration 0018 — matter_artifacts table + WORM trigger
   ↓
Step 4: core/matter_artifacts.py — write_artifact helper
   ↓
Step 5: Contract Review capability implementation
   ↓
Step 6: Ensure Khan v Acme seed includes the NDA document
   ↓
Step 7: The single vertical-slice integration test
   ↓
Step 8: Targeted unit tests for the new helper + manifest discovery
   ↓
Step 9: Full sweep green
   ↓
Step 10: HANDOVER_PHASE_6_DONE.md
```

---

## Step 1 — `scripts/sign_example_module.py`

**File:** `backend/scripts/sign_example_module.py` (new)

CLI: `python -m scripts.sign_example_module examples/modules/contract-review/module.json`.

Reads the manifest, computes `compute_manifest_hash` from `core/signing.py`, writes a `signature` field back to the file. Idempotent — rewrites the same signature given the same input. Phase 11 swaps this out for real sigstore/Rekor signing; this is the structural placeholder.

~50 LOC.

---

## Step 2 — `examples/modules/contract-review/`

**Files (new):**
- `examples/modules/contract-review/module.json` — full v2 manifest per Decision #1.
- `examples/modules/contract-review/__init__.py` — Python entrypoint declared by the manifest.
- `examples/modules/contract-review/capability.py` — `review_contract(document_id) -> {findings: [...]}` implementation.
- `examples/modules/contract-review/README.md` — short description for the catalogue + a copy of Decision #1 so external authors can read it standalone.

~250 LOC across all four files.

---

## Step 3 — Migration `0018_matter_artifacts.py`

**File:** `backend/alembic/versions/0018_matter_artifacts.py` (new)

Per Decision #4. Creates `matter_artifacts` + WORM trigger (mirrors the existing audit/state-machine/advice-boundary triggers).

~60 LOC.

---

## Step 4 — `core/matter_artifacts.py`

**File:** `backend/app/core/matter_artifacts.py` (new)

**Public surface:**
- `async def write_artifact(session, *, matter, capability_id, module_id, invocation_id, kind, payload: bytes | dict, actor_user_id) -> MatterArtifact`
- Resolves storage path (`{matter_fs}/artifacts/{capability_id}/{invocation_id}.json`).
- Writes the file atomically (write to `.tmp`, fsync, rename).
- Inserts the `matter_artifacts` row.
- Returns the row.

Used by Contract Review and by any future capability that produces an artifact.

~120 LOC.

---

## Step 5 — Capability implementation

**File:** `examples/modules/contract-review/capability.py`

`review_contract(document_id: UUID)`:
1. Resolve document via `matter_context` (reads scoped to grant).
2. Check the privilege gate via `check_or_block(...)`.
3. Build a prompt from the document text.
4. Call the matter's default provider (model_access=required → provider module dispatched via MCP host).
5. Parse the model output into the findings shape: `[{clause_id, severity, comment, citation}]`.
6. Write a findings artifact via `write_artifact(...)`.
7. Return `{findings_artifact_id, findings_count}`.

Audit emissions along the way (`module.capability.invoked` → `model.invoked` → `module.capability.completed`) all happen via the MCP host wrappers established in Phases 1–3.

~180 LOC.

---

## Step 6 — Khan v Acme NDA seed

**File:** `backend/app/seed/khan_v_acme.py` (existing — verify or extend)

Confirm the seeded matter includes an NDA document. If missing, add a deterministic NDA text file referenced by a `Document` row. Fixture text only — no real privileged content.

~30 LOC delta.

---

## Step 7 — The single vertical-slice integration test

**File:** `backend/tests/test_phase6_vertical_slice.py` (new)

Single test function `test_contract_review_vertical_slice` walking Decision #2 step-by-step. Hits real HTTP endpoints. Hits real Postgres. The provider model call is monkey-patched at the provider-module level only — every other code path is production.

Acceptance assertions (in order, in the same test):
- Ceremony reaches `enabled` after the canonical 3 trusts + 1 grant.
- `InstalledModule` row written with `signature_status='verified'`.
- Grant row written with the correct snapshot.
- Capability invocation returns success.
- `advice_boundary_decisions` row written for the privilege gate.
- `matter_artifacts` row written; storage_path file exists and parses as JSON.
- `model.invoked` audit row populated with `cost_micros`, `currency`, `tokens_in`, `tokens_out`.
- `GET /audit/reconstruction` returns a timeline containing all of: `module.installed`, `module.granted`, `module.capability.invoked`, `gate.decided{gate:"privilege_posture"}`, `model.invoked`, `artifact.created`, `module.capability.completed`. Order matches timestamp.

If this single test passes against `runtime-rewrite` head, the vertical slice is real.

~250 LOC.

---

## Step 8 — Targeted unit tests

- `test_phase6_sign_example_module.py` (~3 tests) — signer is deterministic, signature roundtrips through `verify_manifest_signature`.
- `test_phase6_matter_artifacts.py` (~5 tests) — WORM rejects UPDATE/DELETE, atomic write survives crash mid-write (use a fault-injection mock), storage path scopes to matter_fs.
- `test_phase6_example_module_discovery.py` (~3 tests) — Phase 2 discovery picks up `examples/modules/contract-review/`, manifest validates, capability_catalogue includes it.

~11 supporting unit tests + the single integration test = **12 new tests total**.

---

## Step 9 — Full sweep

- Phase 6 only: 12 tests
- Phases 1–6 combined: ~570 tests
- Entire backend stays green.

---

## Step 10 — Handover

`HANDOVER_PHASE_6_DONE.md` covers:
- Phase 6 vertical-slice deliverables ledger
- Six architectural decisions requesting Reviewer ratification
- The integration test as the canonical proof artifact
- Walkthrough output: the actual JSON the reconstruction view returns for one real run (so Reviewer can read the timeline without spinning the stack)
- Hand-off line for Reviewer
- Explicit list of what is **still** out of scope at the end of Phase 6 (async runtime, second reference module, marketplace, admin console, frontend)

---

## Out of scope (intentional)

This is where the framing earns its keep. All of the following are explicitly NOT in Phase 6:

- Async runtime / SSE / background jobs → parked at `PHASE_7_ASYNC_RUNTIME_PLAN_PARKED.md`
- Second reference module (Pre-Motion) → Phase 8+
- Marketplace UI, publisher economy → Phase 9+
- Connector breadth (Companies House, legislation.gov.uk) → Phase 10+
- Admin console / cross-matter view → later
- Frontend timeline UI → Phase 12
- Sigstore/Rekor real verification → Phase 11
- Cost dashboards → reopen with a real spending signal
- New gates beyond `privilege_posture` → reopen with a real second module

If any of these creep in during Phase 6 build, push back. The framing is "ship the smallest real proof of the big thesis." Breadth is the failure mode.

---

*End of Phase 6 vertical-slice build plan. Builder commits this together with Phase 5 v3, then waits for Reviewer ratification before starting Phase 5 Step 0.*
