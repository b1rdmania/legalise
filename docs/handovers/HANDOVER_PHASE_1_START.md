# Handover — Phase 1 Start

**From:** Andy
**To:** Reviewer
**Branch:** `runtime-rewrite`
**Base commit:** `124a516` (canonical runtime rewrite plan with substrate/domain split applied; includes MCP portability addendum)
**Status:** Phase 0 docs complete. Phase 1 starts here. Phase 2 does not start until Phase 1 is reviewed.

**Patch history:**
- 2026-05-25 round 1 (commit `f39d3d1`): Patched after Reviewer review at `86e4062`. Five findings resolved: (1) capability grammar aligned to canonical `<scope>.<resource>.<action>` per `MANIFEST_V2_SCHEMA.md` and `MATTER_CONTEXT_STORE.md`; (2) state-machine models expanded to three tables per `STATE_MACHINE_PRIMITIVE.md`; (3) matter-context schema registry added and endpoints made matter-scoped per `MATTER_CONTEXT_STORE.md`; (4) advice-boundary Phase 1 scope clarified — primitive + callable gate/check API, manifest integration deferred to Phase 2; (5) audit events aligned with architecture docs.
- 2026-05-25 round 2: Patched after second Reviewer review. Three findings resolved: (1) `docs/architecture/ADVICE_BOUNDARY.md` authored — five tiers, transition rules, role constraints, immutability of terminal tier, gate API surface, audit semantics, Phase 1 scope; (2) matter-context items extended with `schema_id` + `schema_version` so every item is bound to the schema it was validated against, with write policy (default latest, optional explicit version, no auto-migration); (3) stale `f9b411c` references replaced with "current branch head" throughout; (4) canonical denied/blocked payload convention added (denied capability = `blocked` with `blocked_reason: "capability_denied"`); explicit `matter_context.write.blocked` and `matter_context.read.blocked` events added.

---

## Instruction

Work on `runtime-rewrite` from current branch head (see header for latest patch commit). Public launch is held until v2 is real. Do not optimise for time or backwards-compatible v0.4 launch polish.

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

- `backend/app/core/state_machine/` — generic primitive per `docs/architecture/STATE_MACHINE_PRIMITIVE.md`. Modules declare definitions (states, transitions, per-transition gates, per-transition required_capabilities) under their namespace. Runtime owns definition registry, instance lifecycle, transition validation, gate execution, audit. Not legal-domain-specific. Does not introduce its own capability strings — enforces module-declared capabilities on each transition.
- `backend/app/core/matter_context/` — generic structured context store per `docs/architecture/MATTER_CONTEXT_STORE.md`. Modules register typed schemas (namespace + JSON schema + version) under their module id. Runtime owns schema registry, schema validation, item storage, capability-scoped reads/writes, source-reference enforcement, audit emission.
- `backend/app/core/advice_boundary/` — opinion/advice tier gate primitive. Five tiers: `factual_extraction → legal_information → draft_advice → supervised_legal_advice → approved_final_advice`. **Phase 1 scope:** primitive logic + callable gate/check API exposed as `core.advice_boundary.check(output_id, requested_tier, declared_tier_max)`. **Deferred to Phase 2:** wiring this gate to the `advice_tier_max` manifest field (manifest v2 lands in Phase 2). Tier transitions emit audit unconditionally in Phase 1; manifest-driven enforcement activates in Phase 2.

> **Note for Reviewer:** `docs/architecture/` does not yet contain a dedicated `ADVICE_BOUNDARY.md`. The tier vocabulary lives in `MANIFEST_V2_SCHEMA.md` (`advice_tier_max`) and `OUTPUT_LIFECYCLE.md` (transition gates). Authoring `ADVICE_BOUNDARY.md` may be necessary before Phase 1 — at minimum to lock the five tier names, the transition rules between tiers, and the gate API surface. Patch in this branch if needed.

Models (per architecture docs):

State machine (three tables per `STATE_MACHINE_PRIMITIVE.md` §Storage):

- `models/state_machine_definition.py` — `(id, module_id, version, states JSONB, initial_state, terminal_states JSONB, transitions JSONB, created_at)`. Versioned per `STATE_MACHINE_PRIMITIVE.md` §56 ("Definitions are versioned. Instances record the definition version they were created under.").
- `models/state_machine_instance.py` — `(id, definition_id, definition_version, owner_scope, owner_id, current_state, created_at, updated_at)`. `(owner_scope, owner_id)` carries matter_id / workspace_id / prospect_id depending on the consuming module.
- `models/state_machine_transition.py` — `(id, instance_id, from_state, to_state, actor_id, module_id, capability_id, reason, metadata JSONB, gate_state JSONB, status, occurred_at)`. `status ∈ {requested, completed, blocked, failed}`. Append-only.

Matter context (two tables per `MATTER_CONTEXT_STORE.md` §Storage):

- `models/matter_context_schema.py` — `(id, namespace, module_id, version, json_schema JSONB, registered_at, registered_by_module_id)`. Schema registry per `MATTER_CONTEXT_STORE.md` §29.
- `models/matter_context_item.py` — `(id, matter_id, namespace, schema_id, schema_version, payload JSONB, source_type, source_id, created_by_user_id, created_by_module_id, created_at, updated_at, superseded_by_id)`. Fields per `MATTER_CONTEXT_STORE.md` §55, extended with `schema_id` + `schema_version` so every item is bound to the exact schema it was validated against (Reviewer P1.2 from round 2 review).

**Schema-version write policy:**

- Writes accept an optional `schema_version` parameter. If omitted, the runtime resolves to the **latest registered schema version for that namespace** at write time, and stores both `schema_id` and `schema_version` on the item.
- Writes that specify an explicit `schema_version` are validated against that specific version. The runtime stores both `schema_id` and `schema_version`.
- Reads return items with their bound `schema_version`. Reconstruction across schema evolutions remains possible because the originating schema is permanently linked.
- When a new schema version is registered, existing items are not migrated. The runtime supports reading items at their original schema version indefinitely. Migration is a module-level concern (a future schema-migration module may sweep items forward, but that is not a core responsibility).

Advice boundary:

- `models/advice_boundary_decision.py` — `(id, output_id, from_tier, to_tier, actor_id, module_id, capability_id, gate_state JSONB, status, decided_at)`. `status ∈ {requested, completed, blocked, denied, failed}`. Append-only.

Migrations:

- new tables for all six models (three state-machine, two matter-context, one advice-boundary)
- backfill not required (no existing data uses these primitives)

API surfaces (minimal contracts; UI lands in Phase 12). All endpoints capability-checked and audit-emitting:

State machine:

- `POST /api/state-machine/definitions` — register a definition (caller's module asserted via auth context; idempotent on `(module_id, id, version)`)
- `GET /api/state-machine/definitions/{id}/versions/{version}` — read a definition
- `POST /api/state-machine/instances` — create an instance from a definition
- `GET /api/state-machine/instances/{instance_id}` — read current state, available transitions, history
- `POST /api/state-machine/instances/{instance_id}/transitions` — request a transition (capability-checked, gate-fired, audited)

Matter context (matter-scoped — Reviewer P1.3):

- `POST /api/matter-context/schemas` — register a schema (idempotent on `(namespace, version)`)
- `GET /api/matter-context/schemas/{namespace}` — read a schema
- `POST /api/matters/{matter_id}/context/{namespace}` — write item (capability `matter.context.<namespace>.write` required, schema-validated, audited)
- `GET /api/matters/{matter_id}/context/{namespace}` — read items (capability `matter.context.<namespace>.read` required, audited per `MATTER_CONTEXT_STORE.md` §109)
- `PATCH /api/matters/{matter_id}/context/items/{item_id}` — supersede / update (capability-checked, audited)

Advice boundary:

- `POST /api/advice-boundary/check` — invoke the gate programmatically with `(output_id, requested_tier, declared_tier_max, actor, module_id, capability_id)`. Returns `{allowed, gate_state, decision_id}`. Manifest-driven enforcement deferred to Phase 2.

Capability grammar (aligned to canonical `<scope>.<resource>.<action>` shape per `MANIFEST_V2_SCHEMA.md` §107):

Phase 1 substrate primitives do not introduce per-namespace capability strings of their own — modules declare capability strings under their own namespace, and the runtime enforces them at transition / read / write boundaries. The substrate adds only the *enforcement-point* capabilities used by the primitives' own APIs:

- `matter.context.<namespace>.read` — read items in the given context namespace (per `MATTER_CONTEXT_STORE.md` §74)
- `matter.context.<namespace>.write` — write items in the given context namespace (per `MATTER_CONTEXT_STORE.md` §74)
- For state-machine transitions, the `required_capabilities` field on each transition declaration (per `STATE_MACHINE_PRIMITIVE.md` §42) carries the module-owned capability string that the runtime checks. The substrate does not invent its own state-machine grammar.
- For advice-boundary, Phase 1 invokes the gate directly via API; manifest-driven enforcement via `advice_tier_max` lands in Phase 2.

Schema-registry and definition-registry endpoints (admin-level operations) are scoped to module identity asserted via auth context, not via capability strings — modules can only register schemas / definitions under their own `module_id`.

Audit events emitted (aligned with architecture docs):

**Canonical denied/blocked convention (Reviewer P2 round 2):**

The architecture docs (`STATE_MACHINE_PRIMITIVE.md`, `MATTER_CONTEXT_STORE.md`) use `blocked` as the umbrella status for any non-success outcome that is not a system failure. Denied capability is represented as `blocked` with a canonical payload shape:

```json
{
  "status": "blocked",
  "blocked_reason": "capability_denied | gate_blocked | invalid_transition | schema_violation | role_denied | missing_input | tier_exceeded | tier_disallowed",
  "denied_capability": "<capability string if applicable>",
  "gate_state": "<gate-specific state if applicable>"
}
```

No separate `*.denied` events. All denial paths use `*.blocked` with `blocked_reason: "capability_denied"`. This is the unifying pattern across all three primitives.

State machine (per `STATE_MACHINE_PRIMITIVE.md` §82):

- `state_machine.instance.created`
- `state_machine.transition.requested`
- `state_machine.transition.completed`
- `state_machine.transition.blocked` (covers capability denial, gate block, invalid transition; `blocked_reason` carries the cause)
- `state_machine.transition.failed` (system error only)

Matter context (per `MATTER_CONTEXT_STORE.md` §102, extended with explicit blocked events for write and read paths since the architecture doc is positive-path only):

- `matter_context.schema.registered`
- `matter_context.item.created`
- `matter_context.item.updated`
- `matter_context.item.superseded`
- `matter_context.item.withdrawn`
- `matter_context.item.read`
- `matter_context.write.blocked` (covers capability denial, schema violation)
- `matter_context.read.blocked` (covers capability denial)

Advice boundary (per `docs/architecture/ADVICE_BOUNDARY.md` §Audit Events — note that ADVICE_BOUNDARY uses both `blocked` and `denied` as separate statuses because the distinction matters for SRA framing: `blocked` = transition rules violated; `denied` = caller authority insufficient):

- `advice_boundary.check.requested`
- `advice_boundary.check.completed`
- `advice_boundary.check.blocked` (transition not allowed by rules)
- `advice_boundary.check.denied` (caller lacks role / tier exceeds declared max)
- `advice_boundary.check.failed` (system error)

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

## Addendum — strategic context for later phases (does not change Phase 1)

Anthropic's Claude for Legal (released 12 May 2026, repo at `github.com/anthropics/claude-for-legal`, Apache 2.0) validates the runtime direction. MCP is now the shared legal-AI connector substrate, not just our architectural preference. Anthropic donated MCP to the Linux Foundation's Agentic AI Foundation on 9 December 2025 (co-founded with Block and OpenAI; supported by Google, Microsoft, AWS, Cloudflare, Bloomberg). Vendor MCP servers (DocuSign, iManage, Harvey, CourtListener, Trellis, Solve Intelligence, Thomson Reuters CoCounsel, etc.) are vendor-published, host-agnostic by design, and demonstrably portable to non-Claude hosts.

Legalise should treat vendor-published MCP servers as portable capability modules where possible, rather than rebuilding every connector itself.

**This does not change Phase 1.** Phase 1 still builds generic state machine, generic matter context store, and advice-boundary gate. Substrate primitives only.

**It does affect later phases:**

- Phase 2/3 manifest + runtime should support host-agnostic MCP servers cleanly. The MCP host abstraction must not bake in Legalise-authored assumptions about the server side.
- Phase 3 trust ceremony should assume third-party vendor MCP servers as a first-class install path, not just Legalise-authored modules. Verified publisher registry needs to accommodate vendor-published servers (DocuSign, iManage, etc.) under their own publisher identities.
- Phase 11 connector proof set should **prefer installing existing vendor MCP servers** where they exist. Do not build a Legalise-authored DocuSign module if DocuSign already publishes one — install theirs through the trust ceremony.
- Legalise-built connectors should focus on sources **without** MCP servers, especially UK public data: Companies House, legislation.gov.uk, BAILII, Land Registry, Charity Commission. That is where Legalise adds real connector value.

**Positioning to preserve:**

Claude for Legal is validation, not the enemy. Legalise differentiates on:

- multi-provider routing (Anthropic / OpenAI / Gemini / local Ollama by privilege posture)
- self-hosting (no matter data to Anthropic infrastructure)
- UK / SRA posture (Anthropic is US-centric)
- firm-private modules (`visibility: private`)
- audit/gate governance around any MCP server (sandbox, signing, capability scope, audit reconstruction, advice-boundary tiers)

## Architecture review criteria (add to every phase review)

> Do not accidentally make Legalise a Claude-for-Legal clone. Legalise is the governance host around MCP capabilities: any tool, any model, any skill, matter-scoped, permissioned, auditable.

## MCP portability spike (required before Phase 11)

Before Phase 11 connector proof set begins, run a portability spike:

- install one real external MCP server (preferably DocuSign or CourtListener — both are well-documented and host-agnostic) through the Legalise trust ceremony
- prove end-to-end: install ceremony → permission card → capability grant → invocation → audit row → cost attribution → revocation
- document the result in `docs/handovers/HANDOVER_MCP_PORTABILITY_SPIKE.md` including: which authentication model worked, any vendor ToS gotchas, any places the Legalise manifest assumed too much about the server side, any places the trust ceremony UX broke for a non-Legalise-authored module

If the spike reveals architectural assumptions that need correcting, patch on `runtime-rewrite` before Phase 11 begins. This is the single most important validation of the whole ecosystem claim — if vendor MCP servers cannot run through Legalise cleanly, the substrate story collapses.

## Branch hygiene

- All Phase 1 work commits to `runtime-rewrite`
- Hosted-eval on master stays untouched
- No merge to master during Phase 1

## Hand-off back to Andy

When Phase 1 is complete:

- write `docs/handovers/HANDOVER_PHASE_1_DONE.md` describing what landed, what tests pass, anything the architecture docs got wrong (and where they were patched), and any open questions
- do not start Phase 2

---

*End of handover. Reviewer begins Phase 1 implementation on `runtime-rewrite` from current branch head.*
