# Handover — Plan v2.1 Brief: Operational Backbone Drift

**From:** Andy + Claude
**To:** Reviewer
**Status:** Corrective brief on v2 Phase 1 — proposed split between runtime/governance primitives and first-party reference modules
**Date:** 2026-05-25
**Triggered by:** LawX AI seed funding signal (€7.5M from Motive Partners, May 2026, Berlin "Legal Operating System" for European SME firms + notaries)

---

## The drift we just made

LawX raised €7.5M in May 2026 from Motive Partners (serious infrastructure-focused fund) for "AI-native Legal Operating System" — operational backbone for European SME law firms and notaries. Their positioning: client intake, document handling, back-office coordination, task execution. Closed SaaS, vertical, firm-operations.

When we look at v2 Phase 1, three of the four primitives we added are exactly what LawX is building:

| v2 Phase 1 primitive | What it actually is |
|---|---|
| Intake state machine (prospect → conflict_check → scope_check → client_verified → matter_opened) | **Operational backbone.** LawX-shape. |
| Output lifecycle (draft → reviewed → cleared → sent/signed → superseded/withdrawn) | **Operational backbone.** Task/document state machine. |
| Matter memory (accepted_facts / disputed_facts / assumptions / etc.) | **Practice management knowledge schema.** Domain-specific. |
| Opinion/advice boundary (factual_extraction → legal_information → draft_advice → supervised_legal_advice → approved_final_advice) | **Governance primitive.** Pure SRA-grade gate. |

Three of four are operational backbone dressed in supply-chain runtime clothing. The substrate framing was about *governing AI execution* — signed modules, sandboxed execution, capability declarations, audit reconstruction, MCP host. We let legal-domain operational primitives sneak into core because they sounded legal-specific.

We also failed to apply Reviewer's own discipline consistently. Reviewer's v2 brief said *"Do not promote every useful idea into core. Build it as a reference module."* That was applied to Matter Plan and Evidence Packs. It was not applied to Intake, Matter Memory, Output Lifecycle.

## Why the drift matters

The whole positioning rests on Legalise being *governance substrate underneath* the operational layer, not competing with the operational layer:

- *"Any tool. Any model. Any skill. Matter-scoped, permissioned, auditable."*
- *"Legalise governs the work, doesn't do it."*
- *"The matter workspace where legal AI tools become governable."*

If Legalise core contains intake state machines + matter memory schemas + output lifecycle states, then Legalise *is* the operational backbone. That collapses the differentiation against LawX, Manifest OS, and the W26 NewMods. We become a closed-vs-open vertical operations product, not a governance runtime.

The YC application narrative — *"governance layer for legal AI"* — only works if the runtime is genuinely substrate, not domain. A firm running Legalise should be able to take or replace the operational backbone modules (their own intake, their own memory schema, LawX-style or build-your-own) and Legalise still works underneath.

## Proposed corrective split

### Stay in V1 core (genuine runtime / substrate / governance primitives)

1. **Opinion/advice boundary** — KEEP as `kind: gate` primitive. Pure SRA-grade governance. Runtime-enforced on every output. Multiple modules interoperate via `advice_tier_max` field. This is genuinely substrate.

2. **Generic state machine primitive** (new framing of what was "output lifecycle" + "intake state machine"). Substrate primitive: modules declare states + transitions + per-state gates under their namespace. The runtime enforces transitions, fires gates, emits audit. Not legal-domain-specific — could equally model any multi-stage workflow.

3. **Generic structured matter context store** (new framing of what was "matter memory"). Substrate primitive: modules declare typed schemas under their namespace, capability-scoped reads/writes, generic structured-data store backed by Postgres JSONB or similar. The runtime enforces capability scope on access. Not legal-domain-specific.

These three are what the runtime owes the ecosystem. Everything else is domain knowledge that lives in reference modules.

### Move to first-party reference modules

Build at the same time as Contract Review / Pre-Motion / Document Redliner (Phases 7-9), under `examples/modules/reference/`:

- **`legalise-intake`** — declares its state machine (prospect → conflict_check → scope_check → client_verified → matter_opened) using the generic state machine primitive. Defines intake-specific gates. Intake-specific sub-modules (conflict-checker, KYC, scope-agreement) plug in at each state via the standard manifest.
- **`legalise-matter-memory`** — declares structured schemas (accepted_facts, disputed_facts, assumptions, open_questions, deadlines, authorities, user_decisions, concessions) using the generic context store. Defines memory-specific capability vocabulary (`matter.memory.facts.write`, etc.). Other modules can read/write under capability scope.
- **`legalise-output-lifecycle`** — declares states (draft → reviewed → cleared → sent/signed → superseded/withdrawn) using the generic state machine. Transitions that fire gates (clearance, sign-off) hook into the advice-boundary primitive. Output-producing modules declare which state their outputs target.

These three reference modules ship as first-party signed, install on every Legalise deployment by default, but are conceptually replaceable. A firm could fork or swap.

### What this changes in v2

Phase 1 split into two:
- **Phase 1a: Substrate primitives** — opinion/advice boundary + generic state machine primitive + generic structured context store
- **Phase 1b: Reference operational modules** — `legalise-intake` + `legalise-matter-memory` + `legalise-output-lifecycle` built as reference modules. Move out of Phase 1, run alongside Phases 7-9.

`backend/app/core/` structure changes:
- `core/advice_boundary/` — STAY (governance primitive)
- `core/state_machine/` — REPLACE `core/intake/` + `core/output_lifecycle/` with a generic primitive that intake and output-lifecycle modules consume
- `core/matter_context/` — REPLACE `core/matter_memory/` with a generic structured context store that the matter-memory module declares schemas against
- `core/intake/` — DELETE (becomes `examples/modules/reference/legalise-intake/`)
- `core/output_lifecycle/` — DELETE (becomes `examples/modules/reference/legalise-output-lifecycle/`)
- `core/matter_memory/` — DELETE (becomes `examples/modules/reference/legalise-matter-memory/`)

Three architecture docs from Phase 0 still apply but reframe:
- `INTAKE_SPEC.md` — moves from "core intake design" to "first-party intake reference module design + generic state machine primitive it consumes"
- `OUTPUT_LIFECYCLE.md` — moves from "core output lifecycle design" to "first-party output-lifecycle reference module + generic state machine primitive"
- `MATTER_MEMORY.md` — moves from "core matter memory design" to "first-party matter memory reference module + generic context store primitive"

Phase 0 deliverable list grows by one: `STATE_MACHINE_PRIMITIVE.md` + `MATTER_CONTEXT_STORE.md` get added. Or roll them into the three existing docs as the substrate sections. Reviewer's call.

## Why this is the right split

1. **Preserves positioning.** Legalise stays "governance substrate underneath operational backbone." LawX builds operational backbone, Legalise governs whatever operational backbone runs on top.

2. **Makes the ecosystem real.** A community can write alternative intake modules, alternative memory schemas, alternative output lifecycles. The runtime doesn't dictate domain choices.

3. **Sharpens the YC narrative.** *"LawX builds operational backbone. We build the governance substrate underneath. Their products and ours don't compete — theirs could run on ours."* That's a much sharper investor pitch than *"we have intake state machines too."*

4. **Stays consistent with Reviewer's own discipline.** *"Do not promote every useful idea into core."* Applied uniformly this time.

5. **Reduces V1 core surface area.** Three generic primitives are smaller and more testable than three legal-domain state machines + a memory schema. The substrate becomes a tighter, more defensible artefact.

6. **Future-proofs against domain drift.** When (not if) new operational primitives surface — billing, time recording, trust accounting, KYC orchestration, conflict registries — the answer is "build a reference module that uses the generic primitives" rather than expanding the runtime core.

## Reviewer answer requested

1. Do you accept the diagnosis that v2 Phase 1 drifted into operational backbone?
2. Do you accept the split: opinion/advice boundary stays in core; intake/matter memory/output lifecycle become first-party reference modules built on generic substrate primitives (state machine + structured context store)?
3. Do you accept introducing two new substrate primitives (`core/state_machine/`, `core/matter_context/`) to replace the three deleted ones?
4. Do you want to fold STATE_MACHINE_PRIMITIVE and MATTER_CONTEXT_STORE into the existing INTAKE_SPEC / OUTPUT_LIFECYCLE / MATTER_MEMORY docs, or add them as separate Phase 0 docs (making it 12 total)?
5. Will you author plan v2.1 incorporating the split, or want Claude to draft and you ratify?

## Verdict (proposed)

Approve the corrective split. Plan v2 hasn't started Phase 0 yet — clean moment to patch. Do not start any Phase 1 code on the operational backbone primitives. Patch v2 to v2.1 first.

If accepted, Phase 0 starts on the corrected plan with: cut `runtime-rewrite` branch, author ten (or twelve) architecture docs in `docs/architecture/`, ratify the substrate primitive surfaces, then Phase 1 substrate work begins.

The three "operational reference modules" (`legalise-intake`, `legalise-matter-memory`, `legalise-output-lifecycle`) get built in the Phase 7-11 window alongside Contract Review, Pre-Motion, Document Redliner, and the connector proof set — they prove the substrate primitives carry real domain workloads.
