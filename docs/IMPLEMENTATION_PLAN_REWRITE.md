# Legalise Implementation Plan v2 — Capability Runtime + Legal Work Pipeline

**Status:** v2 plan written 2026-05-25. Replaces v1 in full (v1 organising spine was "phases of module infrastructure"; v2 organises around the legal work pipeline). Decision locked between Andy + Reviewer. Build not yet started. Timing explicitly off the table — first principles, best product, ship when ready.

**Reference docs:**
- Architecture decision memory: `~/.claude/projects/-Users-andy/memory/legalise-architecture-rewrite.md`
- Plan v2 brief (acceptance questions answered): `docs/handovers/HANDOVER_PLAN_V2_BRIEF.md`
- Original reviewer brief: `docs/handovers/HANDOVER_CAPABILITY_RUNTIME_PLAN.md`
- Codebase map: produced 2026-05-25, grounded in commit `5322e70`
- External line: *Any tool. Any model. Any skill. Matter-scoped, permissioned, auditable.*

---

## 0. Overview

### The organising spine

Legalise is no longer "app with modules." It is a **supply-chain-aware capability runtime for legal work**, organised around the legal work pipeline:

```
intake → matter plan → governed capabilities → human decision loops → evidence packs → audit reconstruction
```

This pipeline drives the plan. Each phase serves one or more stages of the pipeline. Modules are not cosmetic plugins — they are controlled execution units touching sensitive legal data. Reference class is npm/pip/cargo plus a regulator-grade matter workspace, not WordPress plugins.

### Three-layer architecture (unchanged from v1)

- **Matter OS** — substrate (matter, documents, chronology, parties, intake state, output lifecycle, structured matter memory, opinion/advice boundary, audit log, privilege posture, retention, users/roles)
- **Capability Runtime** — MCP-first host with Legalise-native primitives MCP doesn't provide (workflows, gates, audit, matter scoping, supply-chain enforcement)
- **Extension Ecosystem** — native modules + MCP servers + first-party reference modules + community + firm-private

### What survives the rewrite (reuse, extend)

- `core/api.py` — public module API surface (extends, doesn't rewrite)
- `core/audit.py` + `core/api.py:audit_failure` — audit subsystem stays; instrumentation extended to MCP boundary
- `core/capabilities.py` — grant table + `require_capability()` stay; vocabulary expands from 7 flat strings to full grammar
- `core/model_gateway.py` — privilege-aware routing stays
- `core/user_keys.py` + encryption — BYO key flow stays
- `models/matter.py`, `document.py`, `event.py`, `audit.py` — base Matter OS schema stays (extended in Phase 1)
- `providers/*` — provider implementations become provider-kind modules but logic survives
- `modules/pre_motion/` + `modules/contract_review/` — bespoke orchestrators stay (become first two reference ports)

### What gets rebuilt

- `adapters/plugin_bridge.py` — replaced by MCP host + capability runtime
- `api/modules.py` — extended to v2 manifest schema, registry surface
- `schemas/module.json` — replaced by `schemas/module.v2.json` (richer declaration)
- First-party module dispatch path — direct skill rendering → MCP server invocation
- Frontend module catalogue + permission UI — rewrite for capability cards, trust ceremony, audit reconstruction
- Document tagging — promoted to proper output lifecycle state machine

### What gets added (new)

- `core/intake/` — intake state machine (prospect → conflict_check → scope_check → client_verified → matter_opened)
- `core/output_lifecycle/` — output state machine (draft → reviewed → cleared → sent/signed → superseded/withdrawn)
- `core/matter_memory/` — structured matter memory (accepted facts, disputed facts, assumptions, open questions, deadlines, authorities, user decisions, concessions)
- `core/advice_boundary/` — opinion/advice tier system (factual extraction → legal information → draft advice → supervised legal advice → approved final advice) — first-class gate primitive
- `core/mcp_host/` — MCP transport, sandboxing, tool/resource proxies
- `core/registry.py` — module discovery, manifest validation, capability registration
- `core/grants_lifecycle.py` — permission expansion detection, revocation
- `core/signing.py` — sigstore integration, publisher verification
- `core/sandbox/` — subprocess + seccomp/AppArmor wrapper
- `examples/modules/reference/` — reference modules including Document Redliner ported from counsel-mvp
- `cli/legalise.py` — module CLI

### Branch strategy

Cut a dedicated `runtime-rewrite` branch from master at the start of Phase 0. Hosted-eval at `legalise.dev` stays stable on master throughout the rebuild. Merge from `runtime-rewrite` back to master only at coherent phase boundaries (suggested merges: after Phase 6 foundation lands, after Phase 9 all three reference ports proven, after Phase 16 pre-launch hardening complete).

**Failure mode to avoid:** half-rebuilding the runtime on master while keeping old tab/workflow assumptions underneath.

---

## Critical path (dependencies)

```
Phase 0 (branch + decisions + 10 architecture docs)
   ↓
Phase 1 (Matter OS primitives: intake / output lifecycle / matter memory / advice boundary)
   ↓
Phase 2 (manifest v2 + capability registry)
   ↓
Phase 3 (MCP host + supply-chain: signing + sandbox + trust ceremony)
   ↓
Phase 4 (grant lifecycle + dependency/version resolution)
   ↓
Phase 5 (audit reconstruction + cost tracking)
   ↓
Phase 6 (streaming/async runtime)
   ↓
   ├─ Phase 7 (Reference port 1: Contract Review)
   ├─ Phase 8 (Reference port 2: Pre-Motion)
   ├─ Phase 9 (Reference port 3: Document Redliner from counsel-mvp)
   ├─ Phase 10 (MIGRATION.md for remaining workflows)
   ├─ Phase 11 (Connector proof set)
   └─ Phase 12 (Frontend capability runtime UX) — runs alongside 7-11
       ↓
Phase 13 (Khan canonical demo matter)
   ↓
Phase 14 (Developer CLI + 5-min OKR)
   ↓
Phase 15 (Docs + README + launch copy)
   ↓
Phase 16 (Pre-launch hardening)
   ↓
Open-source release tag → legalise.dev cut-over from master to runtime-rewrite
```

Phases 0-6 are sequential foundation. Phases 7-12 can run in parallel once foundation is stable. 13-16 are sequential finishing.

---

## Phase 0 — Foundation: branch + decisions + ten architecture docs

**Goal:** Cut the rewrite branch. Lock all open architectural calls. Author the ten Phase 0 architecture docs before any code is written.

**Deliverables:**

Branch:
- `git checkout -b runtime-rewrite` from master at current head
- All Phase 0-16 work happens on this branch
- Hosted-eval at `legalise.dev` stays on master

Locked architectural calls (per Reviewer brief, ratified 2026-05-25):
- Sandbox tech: subprocess + seccomp/AppArmor first; WASM later for compilable targets
- Signing scheme: sigstore
- Publisher registry: GitHub-based first (verified-publisher = verified GitHub org)
- Audit storage: Postgres append-only table first; separate event-log service later if scale demands
- Update mechanics: always re-prompt on permission expansion; manual updates first (no auto-update)
- Document reader proof: local/open first (pdfplumber-based reference module); Google/AWS/Azure as BYO roadmap connectors
- Practice management connector for first community demo: deferred decision (Clio vs LEAP, pick when community track opens)
- Frontend state pattern for plug-points: extend existing React Context patterns; introduce dedicated module-slot context

Ten architecture docs (all in `docs/architecture/`):
- `MANIFEST_V2_SCHEMA.md` — full capability declaration grammar
- `TRUST_CEREMONY.md` — verified vs unverified flows, state machine
- `SANDBOX_STRATEGY.md` — subprocess + seccomp/AppArmor profiles, future WASM path
- `SIGNING.md` — sigstore integration, publisher verification, key management
- `AUDIT_RECONSTRUCTION.md` — nine-dimension filter design, storage strategy
- `MIGRATION_TEMPLATE.md` — canonical `MIGRATION.md` template
- `INTAKE_SPEC.md` — pre-matter state machine (NEW)
- `OUTPUT_LIFECYCLE.md` — generated-output state machine (NEW)
- `MATTER_MEMORY.md` — structured matter memory schema (NEW)
- `REFERENCE_MODULES.md` — reference module taxonomy + explicit acceptance bars (NEW)

`REFERENCE_MODULES.md` acceptance bars (per Andy's addition to v2 brief):
A module qualifies as a reference module when:
1. Manifest complete (all required v2 fields populated)
2. Permission card complete (clear user-facing copy of reads/writes/gates/data movement)
3. Gate behaviour tested (each declared gate has explicit pass/fail/block test)
4. Audit rows emitted (every read/write/model_call surfaces in audit)
5. Failure semantics documented (what happens when module errors mid-run)
6. Runnable against Khan (executes end-to-end against the canonical demo matter)

**Acceptance:** Branch cut. All ten architecture docs reviewed and signed off by Reviewer. Phase 1 starts.

**Dependencies:** None. Starts after v2 plan replaces v1.

---

## Phase 1 — Matter OS primitives

**Goal:** Build the four V1 core primitives Matter OS needs before the capability runtime can govern legal work properly. These are not modules — they are substrate.

### 1.1 — Intake state machine

**Why:** Matter creation is currently arbitrary. Real legal work starts before the matter exists: conflict checks, KYC, scope agreement. The state machine controls *when* a matter exists and *what assumptions it was opened under*.

**States:** `prospect → conflict_check → scope_check → client_verified → matter_opened`

**Deliverables:**
- `backend/app/core/intake/` package (`states.py`, `transitions.py`, `models.py`)
- New DB table: `prospects` (id, source, contact_info, status, intake_module_id, created_at, conflict_check_status, scope_agreed_at, kyc_verified_at, matter_id when opened)
- Transition functions enforce ordering (cannot open matter without `client_verified`)
- Intake-specific audit events emitted (`intake.prospect.created`, `intake.conflict.checked`, `intake.scope.agreed`, `intake.kyc.verified`, `intake.matter.opened`)
- Modules can declare `kind: workflow, scope: workspace` to participate in intake (e.g. an intake-conflicts-check module reads `prospect.contact_info` and writes `prospect.conflict_check_status`)

**Files:**
- New: `backend/app/core/intake/*`, `backend/app/models/prospect.py`
- Extended: `backend/app/api/matters.py` (matter creation now goes through intake state transition)
- DB migration

### 1.2 — Output lifecycle

**Why:** Generated outputs (letters, drafts, redlines, contract reviews) need proper lifecycle states. Current `document.tag` (draft|cleared|signed) is too thin.

**States:** `draft → reviewed → cleared → sent/signed → superseded/withdrawn`

**Deliverables:**
- `backend/app/core/output_lifecycle/` package
- Extend `models/document.py` — new fields: `lifecycle_state`, `lifecycle_history` (JSONB), `superseded_by_id`, `cleared_by_user_id`, `cleared_at`, `signed_at`, `withdrawn_at`, `withdrawal_reason`
- Transition functions enforce ordering
- Each transition emits audit events
- UI surfaces lifecycle state on every generated document
- Module manifests can declare `output_lifecycle_target: cleared | signed` so capabilities know which state their output should reach

**Files:**
- New: `backend/app/core/output_lifecycle/*`
- Extended: `backend/app/models/document.py`
- DB migration (backfill existing documents to `draft` state)

### 1.3 — Matter memory

**Why:** Capabilities need to read structured matter context, not just chat history or current state. Today the matter assistant has limited memory; a real legal substrate needs structured memory.

**Schema:**
- `accepted_facts` — facts both parties (or this firm + client) agree on
- `disputed_facts` — facts in dispute
- `assumptions` — assumptions the matter is operating under
- `open_questions` — things still to resolve
- `deadlines` — time-bound obligations
- `authorities` — cited cases/statutes/regulations
- `user_decisions` — decisions the lawyer has made + rationale
- `concessions` — concessions made (or refused) on this matter

**Deliverables:**
- `backend/app/core/matter_memory/` package
- New DB tables: `matter_facts` (id, matter_id, fact_text, status [accepted|disputed], source, added_by_id, added_at), `matter_assumptions`, `matter_open_questions`, `matter_deadlines`, `matter_authorities`, `matter_decisions`, `matter_concessions`
- Capabilities declare what memory they read/write (e.g. `reads: [matter.memory.accepted_facts, matter.memory.deadlines]`)
- UI surfaces matter memory as a structured sidebar
- Assistant pulls from matter memory in context construction (extend `plugin_bridge._render_matter_block()`)

**Files:**
- New: `backend/app/core/matter_memory/*`, `backend/app/models/matter_memory.py` (combined)
- Extended: `backend/app/adapters/plugin_bridge.py` (matter context construction)
- DB migration

### 1.4 — Opinion/advice boundary

**Why:** Legal AI output must be classified by advice tier. This is load-bearing for SRA / PI insurance / regulatory framing. Different gates apply to different tiers.

**Tiers:**
1. `factual_extraction` — extracting facts from documents (low risk)
2. `legal_information` — general statements about law (moderate risk)
3. `draft_advice` — provisional legal advice (high risk, requires supervision)
4. `supervised_legal_advice` — reviewed by qualified solicitor (highest risk, billable advice)
5. `approved_final_advice` — signed off, sent to client (final, immutable)

**Deliverables:**
- `backend/app/core/advice_boundary/` package
- New `kind: gate` subtype: `advice_boundary` — modules declare which tier their outputs reach
- Capability manifest field: `advice_tier_max` (the highest tier the capability may produce)
- Transitions between tiers require explicit human approval (for `draft_advice → supervised_legal_advice → approved_final_advice`)
- Audit events for tier transitions
- UI badge on every output showing current advice tier

**Files:**
- New: `backend/app/core/advice_boundary/*`
- Extended: `backend/app/core/capabilities.py` (manifest schema includes advice_tier_max)
- DB migration

**Acceptance for Phase 1:** All four primitives ship with: DB migrations applied, audit events emitting, UI surfaces (even if minimal), test coverage on state transitions. Phase 2 can build the capability registry on top.

**Dependencies:** Phase 0 complete.

---

## Phase 2 — Manifest v2 + capability registry

**Goal:** Replace v1 SKILL.md-only manifest with full capability declaration grammar. Build the registry that discovers, validates, and exposes modules.

**Deliverables:**
- `schemas/module.v2.json` — JSON Schema for v2 manifest. Required fields: `id`, `name`, `version`, `runtime` (mcp|native), `kind`, `scope`, `reads`, `writes`, `model_access`, `external_network`, `gates`, `ui.slot`, `entrypoint`. Optional: `requires`, `jurisdictions`, `advice_tier_max`, `visibility` (public|firm_private), `output_lifecycle_target`, `streaming_mode` (sync|streaming|async).
- `backend/app/core/registry.py` — new module; discovers manifests in `backend/app/modules/`, `examples/modules/`, and user-installed paths; validates against schema; exposes capability catalogue.
- `backend/app/core/capabilities.py` — extend vocabulary from 7 flat strings to full grammar: `<scope>.<resource>.<action>` (e.g. `matter.documents.read`, `matter.memory.facts.write`, `workspace.providers.invoke`, `workspace.intake.prospects.write`).
- v1 → v2 manifest auto-derivation shim: existing SKILL.md files get auto-promoted (kind=skill, scope=matter, reads/writes inferred from existing capability grants).
- DB migration: extend `workspace_skill_capability_grants` table — add `capability_version`, `granted_at_module_version`, `granted_permissions_snapshot` (JSONB) for permission expansion detection.
- Updated `backend/app/api/modules.py` — exposes v2 manifest, capability grammar, registry surface.

**Files touched:**
- New: `schemas/module.v2.json`, `backend/app/core/registry.py`
- Extended: `backend/app/core/capabilities.py`, `backend/app/api/modules.py`
- DB: new migration

**Acceptance:** All 10 existing first-party modules surface in registry via v1→v2 shim. New `examples/modules/hello-matter/` with hand-written v2 manifest also surfaces. No behaviour change for end users.

**Dependencies:** Phase 1 complete.

---

## Phase 3 — MCP host + supply-chain layer

**Goal:** Make Legalise an MCP host with full supply-chain enforcement. Modules can be MCP servers (stdio or SSE). Untrusted code never executes without explicit user grant.

### 3.1 — MCP host

**Deliverables:**
- `backend/app/core/mcp_host/` package:
  - `client.py` — MCP client wrapper, lifecycle management
  - `transports.py` — stdio + SSE transport implementations
  - `tool_proxy.py` — proxies MCP tool calls through capability enforcement + audit
  - `resource_proxy.py` — exposes matter data as MCP resources under declared scopes
  - `prompt_proxy.py` — exposes matter context as MCP prompts
- Backend dependency: add `mcp` Python SDK (Anthropic-published)
- Per-call enforcement: every MCP tool invocation routed through `require_capability()` — denial raises `CapabilityDenied`, captured in audit
- New MCP boundary audit events: `mcp.tool.invoked`, `mcp.resource.read`, `mcp.prompt.expanded`, with payload including module_id, capability, advice_tier, token usage if model called
- Resource proxy enforces matter memory permissions (e.g. `matter.memory.disputed_facts.read` only returns disputed facts if granted)

### 3.2 — Sandboxing

**Deliverables:**
- `backend/app/core/sandbox/` package:
  - `subprocess_runner.py` — subprocess MCP server with seccomp (Linux) / AppArmor profile / RLIMIT enforcement
  - `profiles/` — seccomp profiles per capability kind (skill, tool, workflow, provider, gate have different syscall needs)
  - File system access via host bridge only; no ambient FS access
  - Network access disallowed unless `external_network: true` declared; even then routed through audited proxy

### 3.3 — Signing

**Deliverables:**
- `backend/app/core/signing.py` — sigstore-based manifest signing + verification
- `backend/app/core/publishers.py` — verified publisher registry (GitHub org-based to start, stored in config file initially)

### 3.4 — Trust ceremony

**Deliverables:**
- `backend/app/core/trust_ceremony.py` — state machine for install flow
  - Verified publisher fast path (3 steps): show publisher → show permission card → enable
  - Unverified publisher full inspection (7 steps): inspect manifest → verify signature → show publisher/warning → show permissions → show data movement → show gates → explicit trust + grant
- `backend/app/api/modules.py` — `POST /api/modules/install` endpoint that runs the ceremony
- DB: new `installed_modules` table (id, module_id, version, publisher, verified_at, install_path, signature_status, permissions_snapshot)

**Files touched:**
- New: `backend/app/core/mcp_host/*`, `backend/app/core/sandbox/*`, `backend/app/core/signing.py`, `backend/app/core/publishers.py`, `backend/app/core/trust_ceremony.py`
- Extended: `backend/app/api/modules.py`, `backend/app/adapters/plugin_bridge.py` (dispatches to MCP host based on manifest `runtime` field)
- `backend/pyproject.toml` — add `mcp` dependency
- DB: new migration

**Acceptance:** An unsigned module from an unverified publisher cannot be installed without seven-step ceremony. A signed module from a verified publisher (e.g. first-party `legalise/companies-house`) installs in three steps. Subprocess MCP servers cannot read arbitrary filesystem paths or open arbitrary network connections. A trivial MCP server (`examples/modules/hello-matter/`) can be registered, invoked, hit capability enforcement, and produce audit rows.

**Dependencies:** Phase 2 complete.

---

## Phase 4 — Grant lifecycle + dependency resolution

**Goal:** Permission grants persist correctly through module updates and version changes; permission expansion re-prompts user; module dependencies resolve at install.

**Deliverables:**
- `backend/app/core/grants_lifecycle.py` — detects permission expansion between installed version and update; triggers re-prompt; supports revocation from UI
- DB: extend `installed_modules` with `requires` (JSONB); new `module_versions` table for dependency graph
- `backend/app/core/registry.py` extended — dependency resolution at install; conflicting requirements produce clear UI error
- `backend/app/api/modules.py` — `POST /api/modules/{id}/revoke`, `POST /api/modules/{id}/update`
- Matter closure revokes all grants on that matter automatically (extend `backend/app/api/matters.py`)
- Semver enforcement on manifest `version`, `schema_version`, `host_version` fields

**Files touched:**
- New: `backend/app/core/grants_lifecycle.py`
- Extended: `backend/app/core/registry.py`, `backend/app/api/modules.py`, `backend/app/api/matters.py`, `backend/app/models/workspace_skill_capability_grant.py`
- DB: migration

**Acceptance:** Module update with new permissions triggers re-prompt before activation. Module with unmet dependency fails install with explicit error. Closing a matter revokes its grants; audit captures revocations.

**Dependencies:** Phase 3 complete.

---

## Phase 5 — Audit reconstruction + cost tracking

**Goal:** Nine-dimension regulator-legible view of "everything AI did on this matter." Cost tracking on every model invocation.

**Deliverables:**
- Extend `models/audit.py` — additional fields: `cost_estimate_pence`, `gate_state`, `output_artifact_id`, `external_provider`, `module_id`, `capability_id`, `permission_grant_id`, `advice_tier`. Backfill via migration.
- `backend/app/api/audit.py` — new module; nine-dimension filter endpoint (`GET /api/matters/{slug}/audit?module=&user=&model=&document=&gate=&failed=&output=&provider=&from=&to=`)
- Click-through endpoint: `GET /api/matters/{slug}/audit/{entry_id}` — input sources, capability grant snapshot, gate state at time, prompt_hash, response_hash, output artifact ref, supervisor approval ref
- Cost tracking instrumentation in `core/model_gateway.py` — every model call emits cost_estimate_pence based on provider + model + tokens
- Frontend audit reconstruction view (Phase 12)

**Files touched:**
- New: `backend/app/api/audit.py`
- Extended: `backend/app/models/audit.py`, `backend/app/core/model_gateway.py`, `backend/app/core/api.py`
- DB: migration

**Acceptance:** Given a matter with 50+ audit events across modules, API correctly filters by any combination of nine dimensions in <500ms. Click-through surfaces full reconstruction.

**Dependencies:** Phase 4 complete.

---

## Phase 6 — Streaming / async runtime

**Goal:** Modules declare sync, streaming, or async execution mode. Long-running modules surface progress correctly.

**Deliverables:**
- Manifest field `streaming_mode: sync | streaming | async` (from Phase 2 schema)
- Extend `backend/app/core/mcp_host/tool_proxy.py` — handles all three modes
- Existing `core/jobs.py` (Redis-backed) extended to support module invocations as durable jobs
- SSE endpoints for streaming modules (pattern already in place from Pre-Motion `/run-stream`)
- Module-level concurrency limits via existing `core/limits.py`

**Files touched:**
- Extended: `backend/app/core/mcp_host/tool_proxy.py`, `backend/app/core/jobs.py`, `backend/app/core/limits.py`

**Acceptance:** A streaming module renders progress to UI. An async module returns a job_id; user navigates away and returns; result lands in matter when ready.

**Dependencies:** Phase 5 complete.

---

## Phase 7 — Reference port 1: Contract Review

**Goal:** First brutal port. Validates document-heavy + model-heavy + output-generating runtime path.

**Deliverables:**
- `backend/app/modules/contract_review/` → restructured as native module
- Manifest at `backend/app/modules/contract_review/legalise.module.json`:
  - `kind: workflow`
  - `scope: matter`
  - `reads: [matter.documents.body, matter.metadata, matter.memory.assumptions]`
  - `writes: [matter.documents.generated, matter.audit.entry, matter.memory.open_questions]`
  - `model_access: required`
  - `gates: [privilege_posture, advice_boundary]`
  - `advice_tier_max: draft_advice`
  - `output_lifecycle_target: cleared`
- `backend/app/modules/contract_review/MIGRATION.md` written *after* the port as canonical example
- All existing routes (`POST /run`, `/run-stream`, `/docx`) preserved
- Audit emission through new instrumentation; cost tracking on every model call
- Capability enforcement on every read/write — existing checks migrate to new vocabulary
- Evidence pack emission: structured output of risk findings + cited clauses

**Files touched:**
- Extended: `backend/app/modules/contract_review/*` (4 files)
- New: `backend/app/modules/contract_review/legalise.module.json`, `backend/app/modules/contract_review/MIGRATION.md`

**Acceptance:** Meets all six reference module acceptance bars from `REFERENCE_MODULES.md`. Contract Review continues end-to-end against Khan. Audit rows now carry capability + cost + advice_tier data. Frontend (`frontend/src/modules/contract_review/`) requires zero changes (router contract preserved).

**Dependencies:** Phase 6 complete.

---

## Phase 8 — Reference port 2: Pre-Motion

**Goal:** Second brutal port. Validates multi-stage orchestration + audit-heavy + gate-intensive runtime path.

**Deliverables:**
- `backend/app/modules/pre_motion/` → restructured as native module
- Manifest:
  - `kind: workflow`
  - `scope: matter`
  - `reads: [matter.documents.body, matter.events.read, matter.metadata, matter.memory.disputed_facts, matter.memory.assumptions]`
  - `writes: [matter.documents.generated, matter.events.write, matter.audit.entry, matter.memory.open_questions]`
  - `model_access: required`
  - `gates: [privilege_posture, multi_agent_throttle, advice_boundary]`
  - `advice_tier_max: draft_advice`
  - `streaming_mode: streaming`
- 4-stage orchestrator (OptimisticAnalyst → EvidenceInspector×3 → PremortemAdversary×4 → Synthesiser) becomes a sub-MCP-tool sequence with explicit capability checks per stage
- `MIGRATION.md` after the fact
- Manifest at `backend/app/modules/pre_motion/legalise.module.json`
- TODO from `modules/pre_motion/router.py` (durable jobs migration) resolved via Phase 6 job system
- Evidence pack emission: structured output of conclusion + cited evidence + adversary considerations

**Files touched:**
- Extended: `backend/app/modules/pre_motion/*` (6 files), `backend/app/agents/orchestrator.py`
- New: manifest + MIGRATION.md

**Acceptance:** Meets all six acceptance bars. Pre-Motion runs end-to-end with all 9 model calls visible in audit reconstruction view, capability checks per stage, streaming progress to UI. SSE stream still works.

**Dependencies:** Phase 7 complete (sequencing for de-risking; could run in parallel after Phase 6 if Reviewer prefers).

---

## Phase 9 — Reference port 3: Document Redliner (from counsel-mvp)

**Goal:** Third brutal port. Validates the runtime can absorb external legal workflow code and govern it. Expresses the supervised-autonomy loop explicitly: document → proposed amendment → human accept/reject/edit → generated output → audit.

**Source material** (verified to exist 2026-05-25):
- `/Users/andy/counsel-mvp/backend/app/agents/redliner.py` — Redliner agent (Agent 3 in the 4-agent pipeline)
- `/Users/andy/counsel-mvp/backend/app/agents/parser.py` — Parser (Agent 1)
- `/Users/andy/counsel-mvp/backend/app/agents/analyst.py` — Analyst (Agent 2)
- `/Users/andy/counsel-mvp/backend/app/agents/summariser.py` — Summariser (Agent 4)
- `/Users/andy/counsel-mvp/backend/app/services/pipeline.py` — Sequential orchestrator
- `/Users/andy/counsel-mvp/backend/app/database.py` — Schema (documents, clauses, analyses, redlines, summaries)
- `/Users/andy/counsel-mvp/src/pages/WorkbenchPage.jsx` — Human accept/reject/edit UI

**Do NOT copy blindly.** Port deliberately as a proper Legalise reference module.

**Deliverables:**
- `examples/modules/reference/document-redliner/` — the ported module
- Module structure:
  - MCP server wrapping the 4-agent pipeline (parser → analyst → redliner → summariser)
  - Native Python; runtime `mcp` so it goes through the standard sandbox + capability path
  - Sub-tools: `parse_document`, `analyse_clauses`, `generate_redlines`, `summarise_findings`
- Manifest:
  - `kind: workflow`
  - `scope: matter`
  - `reads: [matter.documents.body]`
  - `writes: [matter.documents.generated, matter.notes.write, matter.audit.entry]`
  - `model_access: required`
  - `gates: [privilege_posture, advice_boundary]`
  - `advice_tier_max: draft_advice`
  - `output_lifecycle_target: reviewed`
  - `streaming_mode: streaming` (progress per agent stage)
- Adapt counsel-mvp's `WorkbenchPage.jsx` accept/reject/edit loop into a new `frontend/src/modules/document_redliner/WorkbenchPanel.tsx`
- Schema mapping:
  - counsel-mvp `documents` → Legalise `Document` (already exists)
  - counsel-mvp `clauses` → new Legalise table `matter_clauses` (clause-level extraction per document)
  - counsel-mvp `analyses` → matter memory `disputed_facts` + `open_questions` (or dedicated `matter_clause_analyses` if cleaner)
  - counsel-mvp `redlines` → new Legalise table `matter_redlines` (linked to clause, with priority + status [proposed|accepted|declined|edited])
  - counsel-mvp `summaries` → matter memory + `Document` of kind `generated`
- Evidence pack emission: proposed amendments with risk_score + priority + plain-English explanations
- Human decision loop produces explicit audit entries per redline (`redline.proposed`, `redline.accepted`, `redline.declined`, `redline.edited_and_accepted`)
- `MIGRATION.md` documents the port: what was kept, what was rewritten, why

**Files touched:**
- New: `examples/modules/reference/document-redliner/*` (manifest + MCP server + sub-tools + README + MIGRATION.md)
- New: `backend/app/models/matter_clause.py`, `backend/app/models/matter_redline.py`
- New: `frontend/src/modules/document_redliner/*` (workbench UI adapted from counsel-mvp)
- DB: migration for `matter_clauses`, `matter_redlines`

**Acceptance:** Meets all six reference module acceptance bars. Running Document Redliner against a Khan disclosure contract produces: parsed clauses, risk-scored analysis, proposed amendments with priority, summariser output, all visible in audit reconstruction, accept/reject/edit loop working in UI, evidence pack emitted as generated document.

**Dependencies:** Phase 6 complete. Can run in parallel with Phases 7 + 8.

---

## Phase 10 — MIGRATION.md for remaining workflows

**Goal:** Force runtime stress test through the discipline of writing each migration target. Anything that can't be filled in = runtime gap.

**Deliverables (one file per workflow, full canonical template per `MIGRATION_TEMPLATE.md`):**
- `backend/app/modules/letters/MIGRATION.md`
- `backend/app/modules/tabular_review/MIGRATION.md`
- `backend/app/modules/case_law/MIGRATION.md`
- `backend/app/modules/anonymisation/MIGRATION.md`
- `backend/app/modules/chronology/MIGRATION.md`
- `backend/app/modules/document_edit/MIGRATION.md`

Each fills: module id, runtime, kind, scope, UI slot, reads, writes, model access, external network, required gates, required capabilities, dependencies, sandboxing approach, streaming mode, failure semantics, audit events, permission card copy, advice_tier_max, output_lifecycle_target, test matter, migration risks.

**Acceptance:** All six files written and reviewed by Reviewer. Runtime gaps surfaced (if any) become tickets, fixed before Phase 11. These workflows continue running on legacy bridge during this phase — port happens post-launch.

**Dependencies:** Phase 9 complete (three reference ports prove the template).

---

## Phase 11 — Launch connector proof set

**Goal:** Small set of first-party signed reference modules that demonstrate the runtime is real and useful. Local/open document reader is the proof, not cloud document AI.

**Deliverables:**

Runnable proof set (ship at launch):
- `examples/modules/connectors/legalise-companies-house/` — MCP server wrapping Companies House Public Data API. Manifest: `kind: tool, scope: workspace, external_network: true, gates: [external_data_consent], reads: [], writes: [matter.notes.write, matter.memory.accepted_facts.write], jurisdictions: [england-wales]`. Capabilities: party diligence (search, officers, charges, filings).
- `examples/modules/connectors/legalise-legislation-gov-uk/` — MCP server wrapping legislation.gov.uk API. Manifest: `kind: tool, scope: workspace, external_network: true, reads: [], writes: [matter.citations.write, matter.memory.authorities.write], jurisdictions: [united-kingdom]`. Capabilities: statute lookup, version diff, section retrieval.
- `examples/modules/connectors/legalise-local-document-reader/` — MCP server wrapping local pdfplumber + optional OCR (Tesseract). Manifest: `kind: tool, scope: matter, external_network: false, gates: [privilege_posture], reads: [matter.documents.body], writes: [matter.documents.generated.annotations]`. Capabilities: PDF text extraction, table extraction, structured-form parsing, local OCR. **This is the strategic proof**: Legalise governs document intelligence, doesn't own it.
- `examples/modules/providers/` — wrap existing `backend/app/providers/anthropic_provider.py`, `openai_provider.py`, `ollama_provider.py` as `kind: provider` modules. Existing logic preserved; manifest layer added.

All four signed by first-party Legalise key via sigstore.

**Catalogue / roadmap (build later, public roadmap):**
- Land Registry, Charity Commission, GLEIF, OpenSanctions
- DocuSign, Adobe Sign
- Clio, LEAP, Actionstep, iManage, NetDocuments
- Adobe PDF Extract, Google Document AI, AWS Textract, Azure Document Intelligence (BYO cloud document processors)
- DeepL, Whisper, AssemblyAI, Deepgram
- Thirdfort, Onfido, ComplyAdvantage, SmartSearch

**Partner track (firm API / tenant-admin integration, do not imply username/password):**
- LexisNexis (Lexis+ UK via TPP), Westlaw / Practical Law Data API, vLex
- iManage, NetDocuments (firm-tenant integration)

**Mike — explicitly NOT integrated:**
Mike is a peer/inspiration, not a dependency. Likely AGPL licensing, no stable external API token found, private-route integration would be brittle. Correct posture: Legalise should be able to govern a Mike-like document-analysis service if Mike exposes a clean MCP or service API later. Do not vendor or import Mike code.

**Files touched:**
- New: `examples/modules/connectors/legalise-companies-house/*`
- New: `examples/modules/connectors/legalise-legislation-gov-uk/*`
- New: `examples/modules/connectors/legalise-local-document-reader/*`
- New: `examples/modules/providers/{anthropic,openai,ollama}/*`
- Extended: `backend/app/providers/__init__.py` — provider modules now discovered via registry

**Acceptance:** Each connector installs via trust ceremony (fast path because first-party signed), surfaces in module catalogue, runs against Khan matter, produces audit rows. Companies House auto-populates party diligence on Khan. Legislation lookup adds Employment Rights Act citations to Khan. Local document reader OCRs Khan disclosure bundle without external network.

**Dependencies:** Phase 10 complete. Can run alongside Phase 12 frontend rewrite.

---

## Phase 12 — Frontend capability runtime UX

**Goal:** Frontend surfaces the new capability model. Runs in parallel with Phases 7-11 once API contracts are stable.

**Deliverables:**
- `frontend/src/modules-page/Modules.tsx` — overhaul; capability cards (declared reads/writes/gates/external network/scope/advice tier); badges (`bundled | example | first-party | community | firm-private`); install / enable / revoke / update UI
- New: `frontend/src/trust-ceremony/` — modal flow for install. Verified fast path (3 steps) and unverified full inspection (7 steps). Permission card component used in both.
- New: `frontend/src/audit/` — audit reconstruction view. Nine-dimension filter sidebar. Event list with click-through detail panel. Cost summary per module, per matter, per user.
- New: `frontend/src/workspace/plug-points/` — named UI slots that modules surface in. Initial slots: `matter.workflows`, `matter.documents.actions`, `matter.chronology.augment`, `matter.memory.augment`, `assistant.tools`, `gate.interruption`, `intake.module`, `output.lifecycle.action`.
- New: `frontend/src/intake/` — intake state machine UI (prospect → conflict_check → scope_check → client_verified → matter_opened with module plug-points for each stage)
- New: `frontend/src/matter-memory/` — structured matter memory sidebar (facts, assumptions, deadlines, authorities, decisions)
- New: `frontend/src/output-lifecycle/` — lifecycle state badges + transition controls on every generated document
- New: `frontend/src/advice-boundary/` — advice tier badge on every output, transition gates
- Frontend state pattern: dedicated `ModuleSlotContext` for plug-point rendering, sitting alongside existing React Query patterns
- Per-module React UI in `frontend/src/modules/*` — preserve existing surfaces; future modules opt into standard plug-point rendering by `kind`
- Permission card UX language pulled from each module's manifest `permission_card_copy` field

**Files touched:**
- Rewritten: `frontend/src/modules-page/Modules.tsx`
- New: `frontend/src/trust-ceremony/*`, `frontend/src/audit/*`, `frontend/src/workspace/plug-points/*`, `frontend/src/intake/*`, `frontend/src/matter-memory/*`, `frontend/src/output-lifecycle/*`, `frontend/src/advice-boundary/*`
- Extended: existing module UIs in `frontend/src/modules/*`

**Acceptance:** Module catalogue shows clear distinction between first-party, example, community, firm-private. Installing a Companies House connector triggers the 3-step trust ceremony. Audit reconstruction view loads <500ms. Intake UI walks a prospect through the five states. Matter memory sidebar populates from any module that writes to it.

**Dependencies:** Phase 2 (API contracts) stable. Can run alongside 7-11.

---

## Phase 13 — Khan canonical demo matter

**Goal:** Khan v Acme is the canonical test/demo matter for the full legal work pipeline. Treat as product surface, not seed data. Every reference module runs visibly useful against Khan.

**Deliverables:**
- **Intake history** — Khan opened via the new intake state machine: prospect record → conflict check passed → scope agreed → KYC verified → matter opened. All five intake events visible in audit.
- **Comprehensive chronology** — 20+ events across the dispute timeline (employment start → performance reviews → grievance → dismissal → ACAS conciliation → ET1 lodged)
- **Full disclosure bundle** — 10+ real-shape documents (employment contract, performance reviews, dismissal letter, internal emails, witness statements, correspondence)
- **Parties** — claimant (Khan), respondent (Acme Ltd), witnesses, solicitors on record, expert witnesses
- **Privilege posture** — set with rationale annotations
- **Matter memory pre-populated** — accepted facts, disputed facts, assumptions, open questions, deadlines (limitation, ET3 response, hearing date), authorities (Employment Rights Act sections cited)
- **Output lifecycle history** — past generated outputs at various lifecycle states (some drafts, some cleared, one signed)
- **Audit history** — past module runs (Contract Review on employment contract, Pre-Motion on dismissal claim, Document Redliner on settlement proposal) so audit reconstruction view has data on first visit
- **Khan-specific seed migration** in `backend/app/core/seed.py` (extends existing seed)

**Files touched:**
- Extended: `backend/app/core/seed.py` (large extension)
- New: `backend/seed_data/khan_v_acme/` (markdown documents, structured chronology JSON, intake history JSON, matter memory JSON, audit history JSON)

**Acceptance:** Fresh install + Khan matter load + any reference module run produces visibly useful output within 30 seconds. Audit reconstruction view shows real data immediately. Intake history fully populated. Matter memory sidebar shows substantive content.

**Dependencies:** Phase 11 complete (reference modules + connectors exist to run against Khan).

---

## Phase 14 — Developer CLI + 5-minute first audit row

**Goal:** Time-to-first-audit-row <5 minutes for a developer landing on the repo. CLI surface for module ops.

**Deliverables:**
- `cli/legalise.py` — `legalise module add | inspect | enable | disable | revoke | update | validate | test | audit-preview`. Python entry point via `pyproject.toml`.
- `examples/modules/hello-matter/` — toy module (echoes matter name, demonstrates manifest)
- `examples/modules/limitation-checker/` — useful module (reads chronology + matter memory deadlines, flags upcoming limitation dates)
- `docs/BUILD_YOUR_FIRST_MODULE.md` — 10-minute quickstart guide
- `legalise module validate` runs manifest schema check + dry-run capability check
- `legalise module test --matter khan` runs module against Khan in test mode, prints audit rows
- `legalise module audit-preview` shows what audit rows a module *would* emit given current grants

**Files touched:**
- New: `cli/legalise.py`, `examples/modules/hello-matter/*`, `examples/modules/limitation-checker/*`, `docs/BUILD_YOUR_FIRST_MODULE.md`
- Extended: `pyproject.toml` (entry points)

**Acceptance:** A developer who has never seen the repo can: clone → `make up` → open browser → install `hello-matter` → run on Khan → see audit row. End-to-end in <5 minutes on standard dev hardware. **The OKR.**

**Dependencies:** Phase 13 complete.

---

## Phase 15 — Docs + release prep

**Goal:** README rewrite, architecture docs, public connector roadmap, launch copy. Land the new positioning.

**Deliverables:**
- `README.md` rewrite leading with *"Any tool. Any model. Any skill. Matter-scoped, permissioned, auditable."*
- `docs/ARCHITECTURE.md` — three-layer model, legal work pipeline spine
- `docs/SUPERVISED_AUTONOMY.md` updated to reference the new runtime (intake → matter plan → governed capabilities → human decision loops → evidence packs → audit reconstruction)
- `docs/MODULES.md` — public module roadmap, connector tiers, reference module taxonomy
- `docs/SECURITY.md` — sandbox model, signing, trust ceremony, threat model
- `docs/CONNECTORS.md` — connector catalogue (runnable proof set + roadmap + partner track)
- `docs/handovers/HANDOVER_CAPABILITY_RUNTIME_LANDED.md` — Reviewer's exit handover
- LinkedIn thesis update incorporating the supply-chain framing (deferred from w/c 2 June 2026; will land when this phase completes)

**Files touched:**
- Rewritten: `README.md`, `docs/SUPERVISED_AUTONOMY.md`
- New: `docs/ARCHITECTURE.md`, `docs/MODULES.md`, `docs/SECURITY.md`, `docs/CONNECTORS.md`, `docs/handovers/HANDOVER_CAPABILITY_RUNTIME_LANDED.md`

**Acceptance:** Reviewer signs off on all public-facing copy. LinkedIn draft ready to post.

**Dependencies:** Phase 14 complete.

---

## Phase 16 — Pre-launch hardening

**Goal:** Survive contact with users, regulators, and attackers. Open-source release tagged.

**Deliverables:**
- Extended `docs/handovers/PRE_FLIGHT.md` — adds new surfaces (trust ceremony, audit reconstruction, module install, capability enforcement, intake, output lifecycle, matter memory, advice boundary)
- Browser smoke walk run end-to-end against `runtime-rewrite` branch deployed to staging covering all surfaces + new module surfaces
- Sandbox penetration testing — escape attempts (filesystem traversal, network exfil, fork bomb, memory exhaustion, syscall fuzzing). Document in `docs/security/SANDBOX_PEN_TEST.md`.
- Audit reconstruction validation — regulator-grade scenarios ("Show me everything AI did on Khan matter between dates X-Y filtered by external provider"). Verify completeness, integrity, tamper-evidence.
- Performance: install ceremony <30s for first-party signed module. Module invocation cold-start <2s. Audit reconstruction view <500ms.
- Security review on: sigstore integration, sandbox profile coverage, grant lifecycle race conditions, multi-tenant isolation, audit immutability (WORM still holds), advice-tier transition enforcement.
- **Merge `runtime-rewrite` into master**
- **Cut over `legalise.dev` from master-old to master-new**
- **Open-source release tag (v0.2.0)**

**Files touched:**
- Extended: `docs/handovers/PRE_FLIGHT.md`
- New: `docs/security/SANDBOX_PEN_TEST.md`, `docs/security/AUDIT_INTEGRITY_REVIEW.md`
- Git tag for release

**Acceptance:** All smoke tests pass. No sandbox escape achieved in pen test (or documented escape with mitigation). Audit reconstruction passes regulator-grade scenarios. Release tag cut. **Open-source release lands.**

**Dependencies:** Phase 15 complete.

---

## Reference module taxonomy (per REFERENCE_MODULES.md)

This taxonomy is canonical in `docs/architecture/REFERENCE_MODULES.md` (authored in Phase 0). Summary here:

**Immediate brutal ports (Phases 7-9, prove the runtime):**
- Contract Review — document/model/output
- Pre-Motion — multi-stage orchestration/audit/gates
- Document Redliner — imported external + human accept/reject/edit loop

**Immediate proof connectors (Phase 11):**
- Companies House
- legislation.gov.uk
- Local/open document reader
- Providers: Anthropic / OpenAI / Ollama

**Migration targets (Phase 10, MIGRATION.md only at launch; ports happen post-launch):**
- Letters
- Tabular Review
- Case Law
- Anonymisation
- Chronology
- Document Edit

**Experimental / reference (build alongside critical path, not blocking):**
- Matter Plan / next-action layer (reads matter state + matter memory, writes tasks/notes/recommended next actions)
- Evidence Pack composer (consumes outputs from Contract Review / Pre-Motion / Document Redliner, composes a regulator-legible evidence bundle)
- Kramer v AI / dual-party amicable divorce (dual-party flow, settlement bands, emotional-discovery gates, provider plurality — does NOT dictate core runtime unless it exposes a generalised primitive)

---

## Open architectural calls — resolved

All previously open calls are now resolved (per Reviewer's ratification in v2 brief):

| Call | Resolution |
|------|------------|
| Sandbox tech | subprocess + seccomp/AppArmor first; WASM later |
| Signing scheme | sigstore |
| Publisher registry | GitHub-based first; central registry later if scale demands |
| Audit storage | Postgres append-only; separate event-log later if scale demands |
| Update mechanics | always re-prompt on permission expansion; manual updates only at launch |
| Document reader proof | local/open first (pdfplumber + Tesseract); cloud processors as BYO roadmap |
| Practice management first community connector | deferred (Clio vs LEAP, decide when community track opens) |
| Frontend plug-point state | extend React Context patterns with dedicated `ModuleSlotContext` |

---

## Risks + mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| MCP spec evolves and breaks our integration | Medium | High | Pin MCP SDK version; track spec changes; abstract MCP version behind `core/mcp_host` interface so swap is local |
| Sandbox escape via subprocess primitive | Medium | Critical | Phase 16 pen test; defense-in-depth (seccomp + AppArmor + RLIMIT + minimal capabilities); audit emits on every syscall denial |
| Workflow port reveals runtime gaps mid-port | High | Medium | Phase 10 (MIGRATION.md discipline) surfaces gaps before code; Phases 7-9 (three brutal ports) are the stress test |
| Counsel-mvp redliner port has hidden coupling to counsel-mvp infra | Medium | Medium | Phase 9 explicitly ports deliberately (not blind copy); rewrite of database layer, integration with Matter OS clauses + redlines tables, manifest layer added; counsel-mvp SQLite schema mapped to Postgres + matter scoping |
| Intake state machine over-architects pre-matter flow | Medium | Low | Keep V1 minimal (five states); intake-specific workflows are modules, not core |
| Matter memory becomes a dumping ground | Medium | Medium | Each memory type (facts/assumptions/etc.) has structured schema; capabilities declare which types they write; UI surfaces structure |
| Advice boundary tiers add friction without value | Low | Medium | Tier transitions are required *only* for outputs leaving draft state; pre-launch UI is minimal badge + transition control |
| Connector ToS violations (Companies House throttling, legislation.gov.uk rate limits) | Low | Low | Built-in throttling at MCP host layer; respect documented limits |
| Frontend rewrite ships behind backend | Medium | Medium | API contracts locked Phase 1-6; Phase 12 runs in parallel with 7-11 |
| Branch divergence between master and runtime-rewrite | Medium | Medium | Coherent-phase merges; security/audit fixes on master back-port to rewrite branch immediately |
| Half-rebuild with old tab/workflow assumptions underneath | Low (mitigated by branch strategy) | High | Explicit branch strategy; new primitives (intake, memory, lifecycle, advice) are not optional — Phase 1 is non-skippable |

---

## What this plan deliberately does NOT include

- Full module marketplace (post-launch)
- Hosted module submission flow (post-launch; manual PR to first-party `awesome-legal-skills`-style repo until then)
- Module monetisation (post-launch, post-foundation)
- Provider marketplace (post-launch)
- WASM sandbox (post-launch; subprocess + seccomp is V1)
- Automatic module updates (manual only; prompt on permission expansion)
- Multi-firm SaaS orchestration (post-launch; firms self-host or use hosted-eval at `legalise.dev`)
- Full legal-output eval harness (post-launch; pre-launch validation = manifest + dry-run + smoke test only)
- LexisNexis / Westlaw / Practical Law connectors (Tier 3 partner-track; parallel to main build but not blocking launch)
- Multi-firm cross-matter capabilities (post-launch)
- SAML / federated identity (post-launch)
- Schema evolution + migration tooling for matter model (post-launch; freeze matter schema for V1 except Phase 1 primitives)
- Mike integration (peer/inspiration, not a dependency; Legalise should be able to govern a Mike-like service via clean MCP/API boundary if Mike exposes one)

---

## Cross-references

- Architecture decision memory: `~/.claude/projects/-Users-andy/memory/legalise-architecture-rewrite.md`
- YC application context: `~/.claude/projects/-Users-andy/memory/yc-application-legalise.md`
- Launch state: `~/.claude/projects/-Users-andy/memory/legalise-launch-state.md`
- Deploy doctrine: `~/.claude/projects/-Users-andy/memory/legalise-deploy.md`
- v2 brief (ratified): `docs/handovers/HANDOVER_PLAN_V2_BRIEF.md`
- Original handover: `docs/handovers/HANDOVER_CAPABILITY_RUNTIME_PLAN.md`

---

*End of plan v2. Reviewer begins Phase 0: cut `runtime-rewrite` branch from master, author the ten architecture docs in `docs/architecture/`, lock the remaining configuration calls. Phase 1 starts when Phase 0 ships.*
