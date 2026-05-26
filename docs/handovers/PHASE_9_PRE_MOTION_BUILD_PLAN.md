# Phase 9 Build Plan v2 — Pre-Motion (Second Reference Module)

**Builder:** Claude (this session)
**Branch:** `runtime-rewrite`
**Base:** `eb2d71d` (Phase 8 ratified; sweep 623/8)
**Supersedes:** Phase 9 v1 (in this same file, pre-redline).
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

**Decision #5 (v2) — Use existing Khan v Acme documents for multi-doc input.**

Reviewer Phase 9 v1 P2: the v1 plan was wrong on the seed premise — Khan v Acme already seeds with three documents (`khan-dismissal-letter.pdf`, `witness-statement-khan.docx`, `synthetic-mutual-nda.docx` at `backend/app/core/seed.py`). Adding a fourth `synthetic-chronology.md` would touch core seed code for no real reason, weakening the "no core edits" success criterion.

v2 cut: Pre-Motion's vertical-slice test calls `draft_motion(claim_type="unfair_dismissal", document_ids=[dismissal_letter.id, witness_statement.id])`. Both documents are already in the seed; both have extracted bodies. Multi-doc input is realistic against the actual matter, not a fixture grafted on.

No seed change. The "core touched / not touched" ledger in the handover stays clean: ZERO core edits is the empirical claim.

**Decision #6 (v2) — Args are validated in the module, documented in the README. No `args_schema` manifest field.**

Reviewer Phase 9 v1 P1: the v1 plan proposed adding an OPTIONAL `args_schema` to capability declarations in the v2 manifest. Two problems:

1. `schemas/module.v2.json` has `additionalProperties: false` at the top level and no `args_schema` property declared — even if the per-capability item shape technically allows extras, the manifest validator surfaces would need code review to confirm. The v1 plan claimed "the validator already accepts it" which would have been a substrate-surface change discovered at build time.

2. The whole point of Phase 9 is to land a second module **with zero substrate edits**. Introducing a new manifest field — even an optional one — couples this phase to schema work. That's the wrong sequencing.

v2 cut: drop the field. `draft_motion(claim_type, document_ids)` validates its arguments in code (`ValueError` on bad claim_type, on empty document_ids, on documents from a different matter). The `README.md` documents the args as the module-author surface.

A future host-side JSON-Schema enforcement layer can land as a deliberate substrate phase if module authors start asking for it. Today, no module author has. Don't build for a hypothetical.

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
Step 4: Integration test — install → grant → invoke → reconstruction
        against EXISTING Khan documents (dismissal letter +
        witness statement). No seed change.
   ↓
Step 5: Negative tests — posture block, missing grant, cross-matter,
        document-not-in-matter, empty document_ids
   ↓
Step 6: Full sweep green
   ↓
Step 7: HANDOVER_PHASE_9_PRE_MOTION_DONE.md
```

~3 days at recent cadence (v1 was ~4; dropping the seed change tightens it); ~12 new tests.

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
        "advice_boundary.decision.completed",
        "artifact.created",
        "module.capability.completed",
        "posture_gate.check.blocked"
      ]
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

## Step 4 — Integration test

**File:** `backend/tests/test_phase9_pre_motion_vertical_slice.py` (new)

Single integration test walking the entire flow against real Postgres against the **existing** Khan v Acme documents (no seed change):

1. Register user; promote to `qualified_solicitor` (Phase 8 posture); promote to `is_superuser` (install gate).
2. Resolve the seeded Khan documents — `khan-dismissal-letter.pdf` + `witness-statement-khan.docx` — by filename. Both already carry extracted bodies.
3. Install `examples.pre-motion` via the trust ceremony (3 trusts + 1 grant).
4. `POST /api/matters/{slug}/grants` with `{module_id, capability_id="draft_motion"}` — assert 201 and the two grants (read + write) land matter-scoped.
5. Invoke `draft_motion(claim_type="unfair_dismissal", document_ids=[dismissal_letter.id, witness_statement.id])`.
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

## Step 5 — Negative tests

**Same file** — same setup helpers, different assertions:

- Posture block: matter `B_mixed` + actor role `solicitor` → `PostureBlocked`, no documents read, no provider call, no artifacts
- Missing read grant: only write grant present → `CapabilityDenied` on the read check, no artifacts
- Missing write grant: read grant only, advice-boundary passes → `CapabilityDenied` on the write check, model called but no artifacts persist (Phase 6 R2 ordering)
- Cross-matter grant: grants on Matter A, invocation on Matter B → `CapabilityDenied`, no artifacts
- Document not in matter: `document_ids` includes a UUID belonging to a different matter → `ValueError` from the capability, no artifacts
- Empty `document_ids` → `ValueError` before any side effect
- Unknown `claim_type` → `ValueError` before any side effect

~7 negative tests + the 1 happy path = **8 tests**, plus ~4 unit tests on the capability's pure-functional helpers (prompt builder, motion parser, evidence-list parser, claim-type validator). **~12 tests total**.

---

## Step 6 — Full sweep

- Phase 9 only: ~12 new tests
- Phases 1–9 combined: ~635 tests
- Entire backend stays green.

If any test requires a core change (not just module-author code), that's a substrate finding the handover must call out explicitly — it's the most important output Phase 9 can produce.

---

## Step 7 — Handover

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

## Reviewer redlines applied (v2)

Three Phase 9 v1 findings closed before build:

1. **P1 — `args_schema` removed.** v1 proposed an OPTIONAL `args_schema` field on capability declarations, claiming the v2 schema accepted it. `schemas/module.v2.json` has `additionalProperties: false` at top level; the validator would need code review to confirm capability-item shape would accept it. Phase 9 is the **zero-substrate-edits test** — introducing a new manifest field even speculatively couples this phase to schema work. v2 drops the field entirely. Args are validated in code; the README documents them. JSON-Schema host-side enforcement is deferred until a real module author asks for it.

2. **P1 — Audit event list corrected.** v1 copied Contract Review's *pre-Phase-8* event list verbatim:
   - `advice_boundary.decision.allowed` → corrected to `advice_boundary.decision.completed` (matches what the substrate actually emits, and what the v1 integration test already expected)
   - `posture_gate.check.blocked` added, since the module declares `gates: ["privilege_posture"]` (matches the Phase 8 follow-up patch Contract Review just shipped at `eb2d71d`)

3. **P2 — Seed change dropped.** v1 was wrong on the premise. Khan v Acme already seeds with three documents (dismissal letter + witness statement + NDA) at `backend/app/core/seed.py`. Adding a fourth `synthetic-chronology.md` would have touched core code for no real gain. v2 uses the existing dismissal letter + witness statement for multi-doc input. Claim type aligns: `unfair_dismissal` over `breach_of_contract`. The "ZERO core edits" success criterion stays clean.

---

*End of Pre-Motion build plan v2. Builder commits this, then waits for Reviewer ratification before Step 1.*
