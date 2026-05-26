# Phase 9 Build Plan — Pre-Motion (Second Reference Module)

**Builder:** Claude (this session)
**Branch:** `runtime-rewrite`
**Base:** `872d84c` (Phase 8 done; sweep 623/8)
**Goal:** Prove the substrate is real, not theoretical. Build the second reference module — Pre-Motion — by following the Contract Review pattern with **no substrate changes**. If something has to give in the core, the substrate isn't reusable yet and Phase 9 surfaces it. If nothing has to give, the open-core thesis holds.

The KISS rule still bites here: this phase exists to test substrate reusability through a real second module, NOT to ship a feature-complete pre-motion tool. Every divergence from "module-author work only, no core edits" is a finding.

---

## What "Pre-Motion" means in this phase

For UK civil litigation, the work product before issuing a motion/application typically includes:

- Reading multiple matter documents
- Drafting the motion / application
- Identifying supporting evidence

Phase 9 ships **one capability** — `draft_motion` — that takes a claim type + a list of document ids, reads those documents, calls a provider, and produces **two artifacts** (a motion draft + an evidence list).

This is deliberately tighter than the original "Pre-Motion" framing. KISS: one capability, two outputs. No multi-step orchestration, no procedural-compliance checks, no UI wizard, no per-jurisdiction templates. The richer story is Phase 10+ if a real user asks for it.

---

## Why this is the right second module

Contract Review exercised:
- Single document read
- Single artifact write
- Single capability per module
- The full ceremony / grant / posture / advice-boundary / audit chain

Pre-Motion exercises everything Contract Review did PLUS:
- **Multi-document read** — does the `matter.document.read` capability string scale to N documents per invocation?
- **Multi-artifact output** — Phase 6 migration 0018 has `UNIQUE(invocation_id, kind)` allowing multiple artifacts per invocation; Pre-Motion is the first real module to use it
- **Multi-argument input** — capabilities can take more than `document_id`; the host's arg handling shouldn't care about shape

If these three work without any core edit, the substrate is real. If a core edit is needed, that's the most valuable finding Phase 9 could surface.

---

## Scope (deliberately small)

**In:**
- `examples/modules/pre_motion/` — full v2 manifest (signed), Python entrypoint, capability impl, README
- A second seeded document on Khan v Acme so multi-doc input is realistic
- Integration test that walks install → grant → invoke → reconstruction for Pre-Motion
- Negative tests proving the substrate's existing guarantees still hold (posture, scope, missing grant)

**Out (parked, KISS):**
- Higher advice tier (`supervised_legal_advice`) — Pre-Motion stays at `draft_advice` like Contract Review; tier-transition substrate is exercised by a future phase only if a real use case demands it
- Multi-step orchestration (e.g. "first identify claim, then draft motion")
- Procedural-compliance / jurisdiction-aware checks
- Output editing / iteration loop
- New gates beyond Contract Review's
- New substrate primitives — none
- Frontend wizard — Phase 12
- Async runtime — still parked

---

## Pre-build findings

- Contract Review is the template. Its `capability.py` + `module.json` + `README.md` should function as a copy-paste-and-adjust starter; if they don't, the README needs to improve (a substrate finding).
- The Khan v Acme seed has one NDA document today. Pre-Motion needs at least two documents to make "multi-doc read" a real test, not a decoration.
- The signer CLI from Phase 6 (`backend/scripts/sign_example_module.py`) handles any v2 manifest already — no changes.
- The `POST /api/matters/{slug}/grants` endpoint (Phase 7) takes `module_id + capability_id` — works for any module/capability pair, no Pre-Motion-specific code needed.
- The posture gate (Phase 8) is invoked from inside the capability via `check_posture(...)` with `actor_role` from `InvocationContext`. Pre-Motion follows the same pattern.

### Architectural decisions taken pre-code

**Decision #1 — One capability, two artifact kinds.**

`draft_motion` is the single capability declared in the Pre-Motion manifest. It writes two artifacts in one invocation:

- `kind="motion_draft"` — JSON `{markdown, claim_type, claim_summary}`
- `kind="evidence_list"` — JSON `{evidence: [{document_id, relevance, citation_hint}]}`

The Phase 6 `UNIQUE(invocation_id, kind)` constraint already supports this; the existing `test_different_kinds_on_same_invocation_allowed` covers it at the substrate level. Pre-Motion is the first reference module that actually uses it.

**Why not two capabilities** (`identify_evidence` + `draft_motion`):
- Two capabilities → two grant rounds the user must complete before invoking
- A user invoking the workflow once doesn't care which sub-step produced which artifact — the audit trail tells the story
- KISS rule: complexity that doesn't make the slice more truthful is breadth

If a real user needs to call `identify_evidence` standalone (e.g. without drafting), that's the moment to split. Until then, one capability, two outputs.

**Decision #2 — Same advice tier as Contract Review (`draft_advice`).**

Pre-Motion outputs are explicitly draft work product, not approved final advice. The advice-boundary substrate's tier transitions (Phase 1) are a separate axis; Pre-Motion does not exercise them, and exercising them prematurely would couple this reference module to a substrate surface that hasn't yet had a real use case.

If a future module legitimately needs `supervised_legal_advice` as its output tier, that's the time to test the transition substrate end-to-end — not now.

**Decision #3 — Multi-document input via existing capability string.**

The manifest declares `reads: ["matter.document.read"]` exactly like Contract Review. The capability function takes `document_ids: list[UUID]` as an arg. The substrate doesn't care how many documents the capability reads — the grant authorises the read action, not a particular document.

This is the most important reusability test in Phase 9. If anything is awkward about reading N documents inside one invocation, that's a substrate finding the Reviewer needs to see.

**Decision #4 — Multi-argument input, host-validated by Pydantic.**

`draft_motion(claim_type: str, document_ids: list[UUID])`:
- `claim_type` is one of a small enum: `"breach_of_contract"`, `"misrepresentation"`, `"unfair_dismissal"`. Module-defined vocabulary, declared in the manifest's `args_schema` (a new optional manifest field; see Decision #6).
- `document_ids` is a list of UUIDs. Module validates they belong to the matter; the substrate does not need a new capability for "list of documents".

Args are still passed via the existing `args: dict` shape the host already provides. No new wiring.

**Decision #5 — Khan v Acme gets a second document.**

The seed already includes the NDA. Phase 9 adds a deterministic chronology / supplementary document so Pre-Motion has multi-document context. Filename: `synthetic-chronology.md`, content fixture only.

This is a seed change, not a substrate change. It's documented because the vertical-slice equivalent for Pre-Motion needs two documents to be meaningful.

**Decision #6 — `args_schema` is an optional manifest field, not a substrate primitive.**

Phase 9 adds an OPTIONAL `args_schema` to capability declarations in the v2 manifest:

```json
{
  "id": "draft_motion",
  "args_schema": {
    "claim_type": {"type": "string", "enum": [...]},
    "document_ids": {"type": "array", "items": {"type": "string", "format": "uuid"}}
  }
}
```

The manifest validator accepts but does not enforce the schema in Phase 9 — it's documentation for callers. The capability function itself raises `ValueError` on bad args. A full host-side JSON-Schema enforcement is a future phase if module authors start requesting it. Phase 9 keeps it as a documentation surface.

This avoids adding a new substrate runtime concern just to land the second module.

---

## Critical path

```
Step 1: examples/modules/pre_motion/ skeleton
        (manifest + entrypoint + capability stub + README)
   ↓
Step 2: Pre-Motion capability implementation
        (multi-doc read + 2 artifacts + posture + grants + audit)
   ↓
Step 3: Sign the manifest
   ↓
Step 4: Khan v Acme seed gains a second document
   ↓
Step 5: Integration test — install → grant → invoke → reconstruction
   ↓
Step 6: Negative tests — posture block, missing grant, cross-matter
   ↓
Step 7: Full sweep green
   ↓
Step 8: HANDOVER_PHASE_9_PRE_MOTION_DONE.md
```

~4 days at recent cadence; ~12 new tests.

---

## Step 1 — `examples/modules/pre_motion/` skeleton

**Files (new):**
- `examples/modules/pre_motion/module.json` — v2 manifest
- `examples/modules/pre_motion/__init__.py` — Python entrypoint
- `examples/modules/pre_motion/capability.py` — `draft_motion` implementation
- `examples/modules/pre_motion/README.md` — module author's standalone reference

Manifest shape (load-bearing fields only):

```json
{
  "schema_version": "2.0.0",
  "id": "examples.pre-motion",
  "name": "Pre-Motion",
  "version": "1.0.0",
  "publisher": "legalise",
  "visibility": "example",
  "runtime": "native",
  "entrypoint": {
    "python_module": "examples.modules.pre_motion",
    "entry": "PreMotionModule"
  },
  "capabilities": [
    {
      "id": "draft_motion",
      "kind": "skill",
      "scope": "matter",
      "reads": ["matter.document.read"],
      "writes": ["matter.artifact.write"],
      "model_access": "required",
      "external_network": false,
      "data_movement": {"local_only": true, "external_destinations": []},
      "gates": ["privilege_posture"],
      "ui": {"slot": "matter.workflows", "label": "Draft pre-motion"},
      "streaming_mode": "sync",
      "advice_tier_max": "draft_advice",
      "audit_events": [
        "module.capability.invoked",
        "model.invoked",
        "advice_boundary.decision.allowed",
        "artifact.created",
        "module.capability.completed"
      ],
      "args_schema": {
        "claim_type": {
          "type": "string",
          "enum": ["breach_of_contract", "misrepresentation", "unfair_dismissal"]
        },
        "document_ids": {
          "type": "array",
          "minItems": 1,
          "items": {"type": "string", "format": "uuid"}
        }
      }
    },
    {
      "id": "default-provider",
      "kind": "provider",
      "scope": "workspace",
      "reads": [],
      "writes": [],
      "model_access": "none",
      "external_network": false,
      "data_movement": {"local_only": true, "external_destinations": []},
      "gates": [],
      "ui": {"slot": "matter.workflows", "label": "Provider (internal)"},
      "streaming_mode": "sync",
      "advice_tier_max": "factual_extraction",
      "audit_events": ["model.invoked"]
    }
  ]
}
```

The provider declaration is identical to Contract Review's — both modules satisfy the validator's `model_access=required` rule by carrying a provider capability inline. (Phase 10+ may extract this into a shared provider module that Pre-Motion + Contract Review both depend on; KISS punts that until depended-on shape becomes clear.)

~250 LOC across all four files.

---

## Step 2 — Capability implementation

**File:** `examples/modules/pre_motion/capability.py`

`draft_motion(...)` walks the canonical order Contract Review pinned in Phase 6 R2:

```
0. check_posture(matter, actor_role)
1. require_capability(matter.document.read, matter_id=matter.id)
2. Load + validate every document_id (each must belong to matter)
3. advice_boundary.check(requested_tier=draft_advice, matter_id=matter.id)
4. audit_phase1("module.capability.invoked")
5. provider_call(prompt) — prompt embeds claim_type + concat of all docs
6. audit_emit_model_invoked(...) with cost columns
7. Parse {motion: str, evidence: list}
8. require_capability(matter.artifact.write, matter_id=matter.id)
9. write_artifact(kind="motion_draft", payload={markdown, claim_type, claim_summary})
10. write_artifact(kind="evidence_list", payload={evidence: [...]})
11. audit_phase1("module.capability.completed")
12. return DraftMotionResult(motion_artifact_id, evidence_artifact_id, evidence_count)
```

Provider call is monkey-patched at the capability boundary in tests (same seam Contract Review uses); production uses the real model gateway.

~250 LOC.

---

## Step 3 — Sign the manifest

```bash
PYTHONPATH=backend python3 -m scripts.sign_example_module \
  examples/modules/pre_motion/module.json
```

No tooling change. Existing CLI handles any v2 manifest.

---

## Step 4 — Khan v Acme seed gains a second document

**File:** `backend/app/core/seed.py` (extend)

Adds `KHAN_CHRONOLOGY_BODY` constant + a second `Document` seeded alongside the NDA. Filename `synthetic-chronology.md`; content is a short timeline fixture sufficient for Pre-Motion to have multi-doc input.

The vertical-slice test for Pre-Motion calls `draft_motion(claim_type=..., document_ids=[nda.id, chronology.id])`.

~40 LOC delta.

---

## Step 5 — Integration test

**File:** `backend/tests/test_phase9_pre_motion_vertical_slice.py` (new)

Single integration test walking the entire flow against real Postgres:

1. Register user; promote to `qualified_solicitor` (Phase 8 posture); promote to `is_superuser` (install gate).
2. Confirm Khan v Acme seeds with NDA + chronology documents.
3. Install `examples.pre-motion` via the trust ceremony (3 trusts + 1 grant).
4. `POST /api/matters/{slug}/grants` with `{module_id, capability_id="draft_motion"}` — assert 201 and the two grants (read + write) land matter-scoped.
5. Invoke `draft_motion(claim_type="breach_of_contract", document_ids=[nda_id, chronology_id])`.
6. Confirm:
   - `model.invoked` audit carries cost columns
   - Two `matter_artifacts` rows with `kind="motion_draft"` and `kind="evidence_list"` and the same `invocation_id`
   - Both files on disk parse as expected JSON
   - `advice_boundary_decisions` row with `gate_state.matter_id = matter.id`
7. `GET /api/matters/{slug}/audit/reconstruction` — assert the timeline includes:
   - `module.installed` (from Phase 3 install)
   - `module.grant.created` × 2 (Phase 7)
   - `module.capability.invoked` (Pre-Motion entry)
   - `advice_boundary.decision.completed`
   - `model.invoked` with cost columns
   - `module.capability.completed`
   - `audit.reconstruction.viewed` (this very call)

~250 LOC.

---

## Step 6 — Negative tests

**Same file** — same setup helpers, different assertions:

- Posture block: matter `B_mixed` + actor role `solicitor` → `PostureBlocked`, no documents read, no provider call, no artifacts
- Missing read grant: only write grant present → `CapabilityDenied` on the read check, no artifacts
- Missing write grant: read grant only, advice-boundary passes → `CapabilityDenied` on the write check, model called but no artifacts persist (Phase 6 R2 ordering)
- Cross-matter grant: grants on Matter A, invocation on Matter B → `CapabilityDenied`, no artifacts
- Document not in matter: `document_ids` includes a UUID belonging to a different matter → `ValueError` from the capability, no artifacts
- Empty `document_ids` → `ValueError` before any side effect

~6 negative tests + the 1 happy path = **~7 tests**, plus ~5 unit tests on the capability's pure-functional helpers (prompt builder, finding parser, evidence-list parser). **~12 tests total**.

---

## Step 7 — Full sweep

- Phase 9 only: ~12 new tests
- Phases 1–9 combined: ~635 tests
- Entire backend stays green.

If any test requires a core change (not just module-author code), that's a substrate finding the handover must call out explicitly — it's the most important output Phase 9 can produce.

---

## Step 8 — Handover

`HANDOVER_PHASE_9_PRE_MOTION_DONE.md` covers:
- Six architectural decisions for Reviewer ratification
- The substrate-reusability ledger: explicit "core was edited / core was NOT edited" answer for each substrate surface (manifest validator, install ceremony, grant endpoint, posture gate, advice boundary, audit, artifacts, reconstruction)
- Pre-Motion's manifest as a copy-of-Contract-Review with the load-bearing differences highlighted
- Note: if Pre-Motion lands with zero core edits, the substrate hypothesis is empirically confirmed. If any core edits are needed, the handover names them as findings to defer or split into a substrate phase.
- Hand-off line for Reviewer

---

## What success looks like

Phase 9 is the first phase where "success" is measured against the substrate, not the module. Three things to watch:

1. **No core code edits** — if `core/`, `api/`, or `models/` gain new code, the substrate hypothesis weakened.
2. **No new vocabulary** — no new capability strings, no new audit actions, no new BlockedReason values, no new posture postures.
3. **No new tests outside `test_phase9_*`** — existing tests stay green without modification.

If all three hold, Pre-Motion proves the substrate is real. If one breaks, the handover documents why.

The only deliberate exception is the Khan v Acme seed gaining a second document — that's a fixture change, not a substrate change. Called out in the handover so the audit of "core touched" is clean.

---

## Out of scope (intentional)

- Higher advice tier — Phase 10+ if real
- Multi-step orchestration — out
- Per-jurisdiction templates — out
- Procedural-compliance check — out
- Iterative edit loop — out
- Shared provider module across reference modules — Phase 10+ if pattern emerges
- Frontend wizard — Phase 12
- Async runtime — still parked
- New connectors — still parked
- New substrate primitives — out (the whole point of Phase 9 is to NOT need any)

If anything in this list creeps in during build, that's a sign the scope drifted. Push back.

---

*End of Pre-Motion build plan. Builder commits this, then waits for Reviewer redline before Step 1.*
