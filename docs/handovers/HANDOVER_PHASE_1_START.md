# Handover — Phase 1 Start

**From:** Andy
**To:** Reviewer
**Branch:** `runtime-rewrite`
**Base commit:** `f9b411c` (canonical runtime rewrite plan with substrate/domain split applied)
**Status:** Phase 0 docs complete. Phase 1 starts here. Phase 2 does not start until Phase 1 is reviewed.

---

## Instruction

Work on `runtime-rewrite` from `f9b411c`. Public launch is held until v2 is real. Do not optimise for time or backwards-compatible v0.4 launch polish.

First, review `docs/IMPLEMENTATION_PLAN_REWRITE.md` and all `docs/architecture/*.md`.

Then do Phase 1 only:

- implement the generic state-machine primitive
- implement the generic matter-context store
- implement the advice-boundary gate
- add migrations, models, API surfaces, tests, and minimal UI/API contracts where the plan requires them
- do not build intake/output lifecycle/matter memory as core domain schemas; those are reference modules later

## Acceptance bar

- generic primitives only in core
- no intake-specific / output-specific / matter-memory-specific states in core
- every transition / context write / advice-boundary decision is audited
- capability checks apply to state transitions and context namespace reads/writes
- tests prove valid path, denied capability, invalid transition, gate-blocked transition, and audit emission

## If Phase 1 reveals the architecture docs are wrong

Patch the docs in the same branch before coding further. Do not start Phase 2 until Phase 1 is reviewed.

---

## Concrete deliverables expected on this branch

Code (substrate primitives only, no domain schemas):

- `backend/app/core/state_machine/` — generic primitive. Modules declare states + transitions + per-state gates under their namespace. Runtime enforces transitions, fires gates, emits audit. Not legal-domain-specific.
- `backend/app/core/matter_context/` — generic structured context store. Modules declare typed schemas under their namespace, capability-scoped reads/writes, generic JSONB-backed store. Runtime enforces capability scope on access.
- `backend/app/core/advice_boundary/` — opinion/advice tier gate primitive. Five tiers: `factual_extraction → legal_information → draft_advice → supervised_legal_advice → approved_final_advice`. Runtime-enforced on every output via `advice_tier_max` manifest field. Tier transitions require explicit human approval and emit audit.

Models:

- `models/state_machine_instance.py` — `(namespace, instance_id, current_state, history JSONB, created_at, updated_at)`
- `models/matter_context_item.py` — `(matter_id, namespace, schema_id, key, value JSONB, created_by_module_id, created_by_capability_id, created_at, updated_at, superseded_by_id)`
- `models/advice_boundary_decision.py` — `(output_id, from_tier, to_tier, actor_id, module_id, capability_id, gate_state, audited_at)`

Migrations:

- new tables for the three primitives
- backfill not required (no existing data uses these primitives)

API surfaces (minimal contracts; UI lands in Phase 12):

- `POST /api/state/{namespace}/{instance_id}/transition` — transition request, capability-checked, gate-fired, audited
- `GET /api/state/{namespace}/{instance_id}` — read current state + history (capability-scoped)
- `POST /api/matter-context/{namespace}/{schema_id}` — write item (capability-scoped, audited)
- `GET /api/matter-context/{namespace}/{schema_id}` — read items (capability-scoped)
- `POST /api/advice-boundary/transition` — request tier transition on an output, gate-fired, audited

Capability grammar additions (per `MANIFEST_V2_SCHEMA.md`):

- `<scope>.state_machine.<namespace>.read`
- `<scope>.state_machine.<namespace>.transition`
- `<scope>.matter_context.<namespace>.<schema_id>.read`
- `<scope>.matter_context.<namespace>.<schema_id>.write`
- `<scope>.advice_boundary.transition`

Audit events emitted:

- `state_machine.transition.requested`
- `state_machine.transition.completed`
- `state_machine.transition.blocked`
- `state_machine.transition.denied`
- `matter_context.item.created`
- `matter_context.item.updated`
- `matter_context.item.superseded`
- `matter_context.read.denied`
- `advice_boundary.transition.requested`
- `advice_boundary.transition.completed`
- `advice_boundary.transition.blocked`
- `advice_boundary.transition.denied`

Tests (every primitive, all paths):

- valid path — request succeeds, audit row emitted
- denied capability — request blocked, audit row emitted
- invalid transition (unknown state, unauthorised transition, missing required input) — blocked, audit row emitted
- gate-blocked transition — blocked, audit row emitted with gate state
- audit emission — every code path that mutates state or writes context produces an audit row

## What this phase explicitly does NOT do

- Does not implement intake state machine (that is a Phase 7-11 reference module on top of the generic state machine primitive)
- Does not implement output lifecycle state machine (Phase 7-11 reference module)
- Does not implement matter memory schemas (accepted_facts / disputed_facts / etc. — Phase 7-11 reference module)
- Does not implement manifest v2 (Phase 2)
- Does not implement MCP host (Phase 3)
- Does not implement signing or sandbox (Phase 3)
- Does not implement frontend UI surfaces beyond the API contracts the primitives expose (Phase 12)

## Branch hygiene

- All Phase 1 work commits to `runtime-rewrite`
- Hosted-eval on master stays untouched
- No merge to master during Phase 1

## Hand-off back to Andy

When Phase 1 is complete:

- write `docs/handovers/HANDOVER_PHASE_1_DONE.md` describing what landed, what tests pass, anything the architecture docs got wrong (and where they were patched), and any open questions
- do not start Phase 2

---

*End of handover. Reviewer begins Phase 1 implementation on `runtime-rewrite` from `f9b411c`.*
