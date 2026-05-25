# Legalise Implementation Plan — Capability Runtime Rewrite

**Status:** Plan drafted 2026-05-25. Decision locked between Andy + Reviewer. Build not yet started. Timing explicitly off the table per Andy's direction — first principles, best product, ship when ready.

**Reference docs:**
- Architecture decision: `~/.claude/projects/-Users-andy/memory/legalise-architecture-rewrite.md`
- Codebase map: produced 2026-05-25, grounded in commit `5322e70`
- External line: *Any tool. Any model. Any skill. Matter-scoped, permissioned, auditable.*

---

## 0. Overview

This plan executes the architecture decision: turn Legalise from "app with modules" into a **supply-chain-aware capability runtime for legal work** (MCP-first, signed modules, sandboxed execution, regulator-legible audit).

**What survives the rewrite (reuse, extend):**
- `core/api.py` — public module API surface (extends, doesn't rewrite)
- `core/audit.py` + `core/api.py:audit_failure` — audit subsystem stays; instrumentation extended to MCP boundary
- `core/capabilities.py` — grant table + `require_capability()` stay; vocabulary expands from 7 flat strings to a full capability grammar
- `core/model_gateway.py` — privilege-aware routing (Anthropic/OpenAI/Ollama) stays
- `core/user_keys.py` + encryption — BYO key flow stays
- `models/matter.py`, `models/document.py`, `models/event.py`, `models/audit.py` — Matter OS schema stays
- `providers/*` — provider implementations become provider-kind modules but logic survives
- `modules/pre_motion/` + `modules/contract_review/` — bespoke orchestrators stay (become the two reference ports)

**What gets rebuilt:**
- `adapters/plugin_bridge.py` — replaced by MCP host + capability runtime
- `api/modules.py` — extended to v2 manifest schema, registry surface
- `schemas/module.json` — replaced by `schemas/module.v2.json` (richer declaration)
- First-party module dispatch path — direct skill rendering → MCP server invocation
- Frontend module catalogue + permission UI — rewrite for capability cards, trust ceremony, audit reconstruction

**What gets added (new):**
- `core/mcp_host/` — MCP transport, sandboxing, tool/resource proxies
- `core/registry.py` — module discovery, manifest validation, capability registration
- `core/grants_lifecycle.py` — permission expansion detection, revocation
- `core/signing.py` — sigstore integration, publisher verification
- `core/sandbox/` — subprocess + seccomp/AppArmor wrapper
- `examples/modules/` — reference modules (hello-matter + useful examples)
- `cli/legalise.py` — `legalise module add | inspect | enable | validate | test | audit-preview`

**Total estimated scope:** 16 phases, ~6-8K LOC backend changes, ~3-4K LOC frontend changes, plus first-party workflow ports (~8.5K LOC of existing modules to migrate, of which ~3K become reference ports and the rest gets MIGRATION.md treatment first).

---

## Critical path (dependencies)

```
Phase 0 (decisions) → Phase 1 (manifest v2 + registry)
                   ↓
                   Phase 2 (MCP host) → Phase 7 (Contract Review port)
                   ↓                                      ↓
                   Phase 3 (signing/sandbox)              Phase 8 (Pre-Motion port)
                   ↓                                      ↓
                   Phase 4 (grants lifecycle)             Phase 9 (MIGRATION.md for 4 others)
                   ↓                                      ↓
                   Phase 5 (audit reconstruction)         Phase 10 (connector proof set)
                   ↓                                      ↓
                   Phase 6 (streaming/async)              Phase 11 (frontend rewrite, runs alongside 7-10)
                                                          ↓
                                                          Phase 12 (Kramer v AI as reference module — Lawhive 30 May)
                                                          ↓
                                                          Phase 13 (Khan demo matter productionisation)
                                                          ↓
                                                          Phase 14 (DevX + CLI + quickstart)
                                                          ↓
                                                          Phase 15 (docs + release prep)
                                                          ↓
                                                          Phase 16 (pre-launch hardening)
```

Phases 1-6 are sequential foundation. Phases 7-11 can run in parallel once 1-6 are stable. 12-16 are sequential finishing.

---

## Phase 0 — Foundation decisions (Reviewer)

**Goal:** Lock the open architectural calls before any code is written.

**Deliverables (all in `docs/architecture/`):**
- `MANIFEST_V2_SCHEMA.md` — full capability declaration grammar
- `TRUST_CEREMONY.md` — verified vs unverified flows, state machine
- `SANDBOX_STRATEGY.md` — subprocess + seccomp/AppArmor profiles, future WASM path
- `SIGNING.md` — sigstore integration, publisher verification, key management
- `AUDIT_RECONSTRUCTION.md` — nine-dimension filter design, storage strategy
- `MIGRATION_TEMPLATE.md` — canonical `MIGRATION.md` template

**Acceptance:** Reviewer signs off. All five subsequent phases reference these as canonical.

**Dependencies:** None. Starts now.

---

## Phase 1 — Manifest v2 + capability registry

**Goal:** Replace v1 SKILL.md-only manifest with full capability declaration grammar. Build the registry that discovers, validates, and exposes modules.

**Deliverables:**
- `schemas/module.v2.json` — JSON Schema for manifest v2 (kind, scope, reads, writes, gates, model_access, external_network, ui.slot, version, runtime, entrypoint, requires, visibility, jurisdictions)
- `backend/app/core/registry.py` — new module; discovers manifests in `backend/app/modules/`, `examples/modules/`, and user-installed paths; validates against schema; exposes capability catalogue
- `backend/app/core/capabilities.py` — extend vocabulary from 7 flat strings to grammar: `<scope>.<resource>.<action>` (e.g. `matter.documents.read`, `matter.notes.write`, `workspace.providers.invoke`)
- v1 → v2 manifest auto-derivation shim: existing SKILL.md files get auto-promoted to v2 manifests (kind=skill, scope=matter, reads/writes inferred from existing capability grants)
- DB migration: extend `workspace_skill_capability_grants` table — add `capability_version`, `granted_at_module_version`, `granted_permissions_snapshot` (JSONB) for permission expansion detection
- Updated `backend/app/api/modules.py` — exposes v2 manifest, capability grammar, registry surface

**Files touched:**
- New: `schemas/module.v2.json`, `backend/app/core/registry.py`
- Extended: `backend/app/core/capabilities.py`, `backend/app/api/modules.py`
- DB: new migration in `backend/alembic/versions/`

**Acceptance:** All 10 existing first-party modules surface in registry via v1→v2 shim. New `examples/modules/hello-matter/` with hand-written v2 manifest also surfaces. No behaviour change for end users.

**Dependencies:** Phase 0 complete.

---

## Phase 2 — MCP host integration

**Goal:** Make Legalise an MCP host. Modules can be MCP servers (stdio or SSE transport). Existing first-party modules stay native temporarily; new modules can be MCP.

**Deliverables:**
- `backend/app/core/mcp_host/` package:
  - `client.py` — MCP client wrapper, lifecycle management
  - `transports.py` — stdio + SSE transport implementations
  - `tool_proxy.py` — proxies MCP tool calls through capability enforcement + audit
  - `resource_proxy.py` — exposes matter data as MCP resources under declared scopes
  - `prompt_proxy.py` — exposes matter context as MCP prompts
- Extend `backend/app/adapters/plugin_bridge.py` — dispatches to either native handler or MCP host based on manifest `runtime` field
- Backend dependency: add `mcp` Python SDK (Anthropic-published)
- New per-call enforcement: every MCP tool invocation routed through `require_capability()` — capability denial raises `CapabilityDenied`, captured in audit
- New MCP boundary audit events: `mcp.tool.invoked`, `mcp.resource.read`, `mcp.prompt.expanded`, with payload including module_id, capability, token usage if model called

**Files touched:**
- New: `backend/app/core/mcp_host/*` (5 files)
- Extended: `backend/app/adapters/plugin_bridge.py`, `backend/app/core/api.py` (export MCP-aware surfaces)
- `backend/pyproject.toml` — add `mcp` dependency

**Acceptance:** A trivial MCP server (e.g. `examples/modules/hello-matter/`) can be registered, invoked, hit capability enforcement, and produce audit rows. Existing native modules continue to work unchanged.

**Dependencies:** Phase 1 complete.

---

## Phase 3 — Supply-chain layer (signing + sandboxing + trust ceremony)

**Goal:** Make module install a supply-chain trust ceremony. Untrusted code never executes without explicit user grant; trusted publishers get a fast path.

**Deliverables:**
- `backend/app/core/signing.py` — sigstore-based manifest signing + verification
- `backend/app/core/sandbox/` package:
  - `subprocess_runner.py` — subprocess MCP server with seccomp (Linux) / AppArmor profile / RLIMIT enforcement
  - `profiles/` — seccomp profiles per capability kind (skill, tool, workflow, provider, gate have different syscall needs)
  - File system access via host bridge only; no ambient FS access
  - Network access disallowed unless `external_network: true` declared; even then routed through audited proxy
- `backend/app/core/publishers.py` — verified publisher registry (GitHub org-based to start), stored in config file initially
- `backend/app/core/trust_ceremony.py` — state machine for install flow (verified fast path: 3 steps; unverified: 7 steps)
- `backend/app/api/modules.py` — `POST /api/modules/install` endpoint that runs the ceremony
- Frontend: trust ceremony modal flow (Phase 11)
- DB: new `installed_modules` table — id, module_id, version, publisher, verified_at, install_path, signature_status, permissions_snapshot

**Files touched:**
- New: `backend/app/core/signing.py`, `backend/app/core/sandbox/*`, `backend/app/core/publishers.py`, `backend/app/core/trust_ceremony.py`
- Extended: `backend/app/api/modules.py`, `backend/app/core/mcp_host/client.py` (MCP servers launched in sandbox)
- DB: new migration

**Acceptance:** An unsigned module from an unverified publisher cannot be installed without seven-step ceremony. A signed module from a verified publisher (e.g. first-party `legalise/companies-house`) installs in three steps. Subprocess MCP servers cannot read arbitrary filesystem paths or open arbitrary network connections.

**Dependencies:** Phase 2 complete.

---

## Phase 4 — Grant lifecycle + dependency resolution

**Goal:** Permission grants persist correctly through module updates and version changes; permission expansion re-prompts user; module dependencies resolve at install.

**Deliverables:**
- `backend/app/core/grants_lifecycle.py` — detects permission expansion between installed version and update; triggers re-prompt; supports revocation from UI
- DB: extend `installed_modules` with `requires` (JSONB), `module_versions` table for dependency graph
- `backend/app/core/registry.py` extended — dependency resolution at install; conflicting requirements produce clear UI error
- `backend/app/api/modules.py` — `POST /api/modules/{id}/revoke`, `POST /api/modules/{id}/update`
- Matter closure revokes all grants on that matter automatically (extend matter close endpoint in `backend/app/api/matters.py`)
- Semver enforcement on manifest `version`, `schema_version`, `host_version` fields

**Files touched:**
- New: `backend/app/core/grants_lifecycle.py`
- Extended: `backend/app/core/registry.py`, `backend/app/api/modules.py`, `backend/app/api/matters.py`, `backend/app/models/workspace_skill_capability_grant.py`
- DB: migration

**Acceptance:** Module update with new permissions triggers re-prompt before activation. Module with unmet dependency fails install with explicit error. Closing a matter revokes its grants; audit captures revocations.

**Dependencies:** Phase 3 complete.

---

## Phase 5 — Audit reconstruction (nine-dimension regulator view)

**Goal:** "Show me everything AI did on this matter" — filterable by module, user, model, document, gate, failed-attempt, output artifact, external provider, date. Plus cost tracking on every model invocation.

**Deliverables:**
- Extend `models/audit.py` — additional fields: `cost_estimate_pence`, `gate_state`, `output_artifact_id`, `external_provider`, `module_id`, `capability_id`, `permission_grant_id`. Backfill via migration.
- `backend/app/api/audit.py` — new module; nine-dimension filter endpoint (`GET /api/matters/{slug}/audit?module=&user=&model=&document=&gate=&failed=&output=&provider=&from=&to=`)
- Click-through endpoint: `GET /api/matters/{slug}/audit/{entry_id}` — input sources, capability grant snapshot, gate state at time, prompt_hash, response_hash, output artifact ref, supervisor approval ref if any
- Cost tracking instrumentation in `core/model_gateway.py` — every model call emits cost_estimate_pence based on provider + model + tokens
- Frontend: audit reconstruction view (Phase 11)

**Files touched:**
- New: `backend/app/api/audit.py`
- Extended: `backend/app/models/audit.py`, `backend/app/core/model_gateway.py`, `backend/app/core/api.py`
- DB: migration

**Acceptance:** Given a matter with 50+ audit events across modules, the API correctly filters by any combination of the nine dimensions in <500ms. Clicking an event surfaces full reconstruction including input documents, capability state, and output artefact.

**Dependencies:** Phase 4 complete.

---

## Phase 6 — Streaming / async runtime support

**Goal:** Modules can declare sync, streaming, or async-with-callback execution mode. Long-running modules (OCR 500-page bundle, multi-stage Pre-Motion) surface progress correctly.

**Deliverables:**
- Manifest extension: `execution_mode: sync | streaming | async` (in Phase 0 schema)
- Extend `backend/app/core/mcp_host/tool_proxy.py` — handles all three modes
- Existing `core/jobs.py` (Redis-backed) extended to support module invocations as durable jobs
- SSE endpoints for streaming modules (pattern already in place from Pre-Motion `/run-stream`)
- Frontend: progress tile component, background job tray (Phase 11)
- Module-level concurrency limits (per matter, per user) via existing `core/limits.py`

**Files touched:**
- Extended: `backend/app/core/mcp_host/tool_proxy.py`, `backend/app/core/jobs.py`, `backend/app/core/limits.py`
- New SSE endpoints in module routers (per-module router update; pattern in `modules/pre_motion/router.py`)

**Acceptance:** A streaming module (e.g. OCR on a large bundle) renders progress to UI. An async module returns a job_id; user can navigate away and return; result lands in matter when ready.

**Dependencies:** Phase 5 complete.

---

## Phase 7 — Reference port: Contract Review

**Goal:** First brutal port. Validates document-heavy + model-heavy + output-generating runtime path.

**Deliverables:**
- `backend/app/modules/contract_review/` → restructured as native module with v2 manifest declaring: `kind: workflow, scope: matter, reads: [matter.documents.body, matter.metadata], writes: [matter.documents.generated, matter.audit.entry], model_access: required, gates: [privilege_posture]`
- `backend/app/modules/contract_review/MIGRATION.md` written *after* the port as canonical example
- Manifest at `backend/app/modules/contract_review/legalise.module.json`
- All existing routes (`POST /run`, `/run-stream`, `/docx`) preserved
- Audit emission goes through new instrumentation; cost tracking on every model call
- Capability enforcement on every read/write — existing checks migrate to new vocabulary

**Files touched:**
- Extended: `backend/app/modules/contract_review/*` (4 files)
- New: `backend/app/modules/contract_review/legalise.module.json`, `backend/app/modules/contract_review/MIGRATION.md`

**Acceptance:** Contract Review continues to work end-to-end against Khan matter. All audit rows now carry capability + cost data. Existing frontend (`frontend/src/modules/contract_review/`) requires zero changes (router contract preserved).

**Dependencies:** Phase 6 complete.

---

## Phase 8 — Reference port: Pre-Motion

**Goal:** Second brutal port. Validates multi-stage orchestration + audit-heavy + gate-intensive runtime path.

**Deliverables:**
- `backend/app/modules/pre_motion/` → restructured as native module; manifest declares: `kind: workflow, scope: matter, reads: [matter.documents.body, matter.events.read, matter.metadata], writes: [matter.documents.generated, matter.events.write, matter.audit.entry], model_access: required, gates: [privilege_posture, multi_agent_throttle], execution_mode: streaming`
- 4-stage orchestrator (`OptimisticAnalyst → EvidenceInspector×3 → PremortemAdversary×4 → Synthesiser`) becomes a sub-MCP-tool sequence with explicit capability checks per stage
- `backend/app/modules/pre_motion/MIGRATION.md`
- Manifest: `backend/app/modules/pre_motion/legalise.module.json`
- TODO from line ~134 in `modules/pre_motion/router.py` (durable jobs migration) gets resolved here via Phase 6 job system

**Files touched:**
- Extended: `backend/app/modules/pre_motion/*` (6 files), `backend/app/agents/orchestrator.py`
- New: manifest + MIGRATION.md

**Acceptance:** Pre-Motion runs end-to-end with all 9 model calls visible in audit reconstruction view, capability checks per stage, streaming progress to UI. SSE stream still works.

**Dependencies:** Phase 7 complete.

---

## Phase 9 — MIGRATION.md for remaining workflows

**Goal:** Force runtime stress test through the discipline of writing each migration target. Anything that can't be filled in = runtime gap.

**Deliverables (one file per workflow, full canonical template):**
- `backend/app/modules/letters/MIGRATION.md`
- `backend/app/modules/tabular_review/MIGRATION.md`
- `backend/app/modules/case_law/MIGRATION.md`
- `backend/app/modules/anonymisation/MIGRATION.md`
- `backend/app/modules/chronology/MIGRATION.md`
- `backend/app/modules/document_edit/MIGRATION.md`

Each file fills the canonical template (module id, runtime, kind, scope, UI slot, reads, writes, model access, external network, required gates, required capabilities, dependencies, sandboxing approach, streaming mode, failure semantics, audit events, permission card copy, test matter, migration risks).

**Acceptance:** All six files written and reviewed by Reviewer. Any gaps surface as runtime extension tickets, fixed before Phase 10. Workflows themselves continue running on legacy bridge during this phase — port happens post-launch.

**Dependencies:** Phase 8 complete (reference ports prove the template works).

---

## Phase 10 — Launch connector proof set

**Goal:** Four first-party signed reference modules that demonstrate the runtime is real and useful.

**Deliverables:**
- `examples/modules/connectors/legalise-companies-house/` — MCP server wrapping Companies House Public Data API. Manifest: `kind: tool, scope: workspace, external_network: true, gates: [external_data_consent], reads: [], writes: [matter.notes.write], jurisdictions: [england-wales]`. Capabilities: party diligence (search by name, fetch officers, fetch charges, fetch filing history).
- `examples/modules/connectors/legalise-legislation-gov-uk/` — MCP server wrapping legislation.gov.uk API. Manifest: `kind: tool, scope: workspace, external_network: true, reads: [], writes: [matter.citations.write], jurisdictions: [united-kingdom]`. Capabilities: statute lookup, version diff, section retrieval.
- `examples/modules/connectors/legalise-document-reader/` — wraps Google Document AI or AWS Textract (pick one; pdfplumber stays as local fallback). Manifest: `kind: tool, scope: matter, external_network: true, gates: [privilege_posture, external_data_consent], reads: [matter.documents.body], writes: [matter.documents.generated, matter.documents.annotations]`.
- `examples/modules/providers/` — wrap existing `backend/app/providers/anthropic_provider.py`, `openai_provider.py`, `ollama_provider.py` as `kind: provider` modules. Existing logic preserved; manifest layer added. Demonstrates provider plurality.
- All four signed by first-party Legalise key via sigstore.

**Files touched:**
- New: `examples/modules/connectors/legalise-companies-house/` (MCP server + manifest + README)
- New: `examples/modules/connectors/legalise-legislation-gov-uk/` (MCP server + manifest + README)
- New: `examples/modules/connectors/legalise-document-reader/` (MCP server + manifest + README)
- New: `examples/modules/providers/{anthropic,openai,ollama}/` (manifest wrappers)
- Extended: `backend/app/providers/__init__.py` — provider modules now discovered via registry

**Acceptance:** Each connector installs via trust ceremony (fast path because first-party signed), surfaces in module catalogue, runs against Khan matter, produces audit rows. Companies House query auto-populates party diligence on Khan matter; legislation lookup adds Employment Rights Act citations; document reader OCRs Khan disclosure bundle.

**Dependencies:** Phase 9 complete.

---

## Phase 11 — Frontend rewrite for capability runtime

**Goal:** Frontend surfaces the new capability model. Runs in parallel with Phases 7-10 once the API contracts are stable.

**Deliverables:**
- `frontend/src/modules-page/Modules.tsx` — overhaul; capability cards (declared reads/writes/gates/external network/scope); badges (`bundled | example | first-party | community | firm-private`); install / enable / revoke / update UI
- New: `frontend/src/trust-ceremony/` — modal flow for install. Verified fast path (3 steps) and unverified full inspection (7 steps). Permission card component used in both.
- New: `frontend/src/audit/` — audit reconstruction view. Nine-dimension filter sidebar. Event list with click-through detail panel. Cost summary per module, per matter, per user.
- New: `frontend/src/workspace/plug-points/` — named UI slots that modules surface in. Initial slots: `matter.workflows`, `matter.documents.actions`, `matter.chronology.augment`, `assistant.tools`, `gate.interruption`.
- Per-module React UI in `frontend/src/modules/*` — preserve existing surfaces for backwards compatibility; future modules opt into standard plug-point rendering per `kind`.
- Permission card UX language (copy provided in each module's manifest `permission_card_copy` field)

**Files touched:**
- Rewritten: `frontend/src/modules-page/Modules.tsx`
- New: `frontend/src/trust-ceremony/*`, `frontend/src/audit/*`, `frontend/src/workspace/plug-points/*`
- Extended: existing module UIs in `frontend/src/modules/*`

**Acceptance:** Module catalogue shows clear distinction between first-party, example, community, firm-private. Installing a Companies House connector triggers the 3-step trust ceremony. Audit reconstruction view loads <500ms, filters work correctly.

**Dependencies:** Phase 2 (MCP host stable), Phase 5 (audit reconstruction API). Can run alongside 7-10.

---

## Phase 12 — Kramer v AI as reference module

**Goal:** Lawhive hackathon (30 May 2026) ships Kramer v AI as a Legalise reference module, not a side prototype. Tests dual-party + gates + provider plurality in public.

**Deliverables:**
- `examples/modules/reference/kramer-v-divorce/` — workflow module. Manifest: `kind: workflow, scope: matter, reads: [matter.documents.body, matter.events.read, matter.metadata, matter.parties.read], writes: [matter.documents.generated, matter.notes.write, matter.audit.entry], model_access: required, gates: [privilege_posture, emotional_discovery, dual_party_consent, nash_settlement_threshold], execution_mode: streaming`
- Exercises new runtime surfaces:
  - Dual-party flow (two `actor_id` audit dimension)
  - Nash settlement bands as a capability (returns suggested settlement zone with confidence interval)
  - Emotional discovery gate (interrupt for human acknowledgement at conflict points; pulls from [[couples therapy bot]] patterns)
  - Provider plurality (Claude for legal reasoning, optionally local model for emotional summarisation per privilege posture)
  - Streaming progress through 4-5 stages
- White paper at `docs/reference-modules/KRAMER_V_AI.md` writes itself from the manifest + audit reconstruction artefacts
- Frontend: dedicated workspace view for the dual-party matter type

**Files touched:**
- New: `examples/modules/reference/kramer-v-divorce/*`
- Extended: `backend/app/models/matter.py` if dual-party matter type needs new column (likely just a new `matter_type` value)
- Frontend: new view under `frontend/src/modules/`

**Acceptance:** Kramer v AI runs end-to-end at the hackathon, produces a complete audit trail that becomes the white paper appendix, demonstrates the runtime publicly under a real legal use case (amicable divorce).

**Dependencies:** Phase 11 complete; hackathon date 30 May 2026 (timing not the constraint — if the runtime isn't ready, Kramer v AI is a prototype at hackathon and gets converted to reference module post-hardening).

---

## Phase 13 — Khan demo matter productionisation

**Goal:** Khan v Acme is treated as a product surface, not seed data. Any reference module running against it produces visibly useful output.

**Deliverables:**
- Comprehensive chronology (20+ events across the dispute timeline)
- Full disclosure bundle (10+ real-shape documents — contracts, emails, performance reviews, correspondence)
- Parties properly modelled (claimant, respondent, witnesses, solicitors on record)
- Privilege posture set with rationale annotations
- Pre-rendered audit history showing past module runs (so audit reconstruction view has data on first visit)
- Khan-specific seed migration in `backend/app/core/seed.py` (already exists, extend significantly)

**Files touched:**
- Extended: `backend/app/core/seed.py` (large extension)
- New: `backend/seed_data/khan_v_acme/` (markdown documents, structured chronology JSON)

**Acceptance:** Fresh install + Khan matter load + any reference module run produces visibly useful output within 30 seconds. Audit reconstruction view shows real data immediately.

**Dependencies:** Phase 10 complete (reference modules exist to run against Khan).

---

## Phase 14 — Developer experience + CLI

**Goal:** Time-to-first-audit-row <5 minutes for a developer landing on the repo. CLI surface for module ops.

**Deliverables:**
- `cli/legalise.py` — `legalise module add | inspect | enable | disable | revoke | update | validate | test | audit-preview`. Python entry point installed via `pyproject.toml`.
- `examples/modules/hello-matter/` — toy module (echoes matter name, demonstrates manifest)
- `examples/modules/limitation-checker/` — useful module (reads chronology, flags upcoming limitation dates)
- `docs/BUILD_YOUR_FIRST_MODULE.md` — 10-minute quickstart guide
- `legalise module validate` runs manifest schema check + dry-run capability check
- `legalise module test --matter khan` runs module against Khan in test mode, prints audit rows
- `legalise module audit-preview` shows what audit rows a module *would* emit given current grants

**Files touched:**
- New: `cli/legalise.py`, `examples/modules/hello-matter/*`, `examples/modules/limitation-checker/*`, `docs/BUILD_YOUR_FIRST_MODULE.md`
- Extended: `pyproject.toml` (entry points)

**Acceptance:** A developer who has never seen the repo can: clone → `make up` → open browser → install `hello-matter` → run on Khan → see audit row. End-to-end in <5 minutes on standard dev hardware. The OKR.

**Dependencies:** Phase 13 complete.

---

## Phase 15 — Documentation + release prep

**Goal:** README rewrite, architecture docs, public connector roadmap, LinkedIn thesis update. Land the new positioning.

**Deliverables:**
- `README.md` rewrite leading with *"Any tool. Any model. Any skill. Matter-scoped, permissioned, auditable."*
- `docs/ARCHITECTURE.md` — three-layer model (Matter OS / Capability Runtime / Extension Ecosystem)
- `docs/SUPERVISED_AUTONOMY.md` updated to reference the new runtime
- `docs/MODULES.md` — public module roadmap, connector tiers
- `docs/SECURITY.md` — sandbox model, signing, trust ceremony, threat model
- `docs/handovers/HANDOVER_CAPABILITY_RUNTIME_LANDED.md` — Reviewer's exit handover
- LinkedIn thesis update (deferred from w/c 2 June 2026 — new draft incorporates the supply-chain framing)
- Public connector roadmap as `docs/CONNECTORS.md`

**Files touched:**
- Rewritten: `README.md`, `docs/SUPERVISED_AUTONOMY.md`
- New: `docs/ARCHITECTURE.md`, `docs/MODULES.md`, `docs/SECURITY.md`, `docs/CONNECTORS.md`, `docs/handovers/HANDOVER_CAPABILITY_RUNTIME_LANDED.md`

**Acceptance:** Reviewer signs off on all public-facing copy. LinkedIn draft ready to post.

**Dependencies:** Phase 14 complete.

---

## Phase 16 — Pre-launch hardening

**Goal:** Survive contact with users, regulators, and attackers.

**Deliverables:**
- Extended `docs/handovers/PRE_FLIGHT.md` — adds new surfaces (trust ceremony, audit reconstruction, module install, capability enforcement)
- Browser smoke walk run end-to-end against hosted-eval at `legalise.dev` covering all 12 surfaces + new module surfaces
- Sandbox penetration testing — escape attempts: filesystem traversal, network exfil, fork bomb, memory exhaustion, syscall fuzzing. Document results in `docs/security/SANDBOX_PEN_TEST.md`.
- Audit reconstruction validation — regulator-grade scenarios. "Show me everything AI did on Khan matter between dates X-Y filtered by external provider." Verify completeness, integrity (no missing rows), tamper-evidence.
- Performance: install ceremony <30s for first-party signed module. Module invocation cold-start <2s. Audit reconstruction view <500ms.
- Security review on: sigstore integration, sandbox profile coverage, grant lifecycle race conditions, multi-tenant isolation, audit immutability (WORM still holds).
- Open-source release tag

**Files touched:**
- Extended: `docs/handovers/PRE_FLIGHT.md`
- New: `docs/security/SANDBOX_PEN_TEST.md`, `docs/security/AUDIT_INTEGRITY_REVIEW.md`
- Git tag for release

**Acceptance:** All smoke tests pass. No sandbox escape achieved in pen test (or documented escape with mitigation). Audit reconstruction passes regulator-grade scenarios. Release tag cut. **Open-source release lands.**

**Dependencies:** Phase 15 complete.

---

## Open architectural calls (Reviewer to resolve before Phase 1 starts)

Per memory:
- **Sandbox tech:** subprocess + seccomp/AppArmor first; WASM later for compilable targets. Confirm.
- **Signing scheme:** sigstore (not custom PKI, not raw GPG). Confirm.
- **Publisher registry:** GitHub-based first; central registry later if scale demands. Confirm.
- **Audit storage:** Postgres append-only table first; separate event-log service later if scale demands. Confirm.
- **Update mechanics:** always re-prompt on permission expansion; manual updates at first (no auto-update). Confirm.

Plus new calls surfaced by this plan:
- **Document reader pick** (Phase 10): Google Document AI vs AWS Textract vs Azure Document Intelligence. Local pdfplumber stays as fallback.
- **Practice management connector** (deferred to roadmap, but pick for first community demo): Clio vs LEAP — which one to court for the first bidirectional connector?
- **Frontend state management for plug-points** (Phase 11): existing React patterns or do we need a new context/store for module-rendered slots?

---

## Risks + mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| MCP spec evolves and breaks our integration | Medium | High | Pin MCP SDK version; track spec changes; abstract MCP version behind `core/mcp_host` interface so swap is local |
| Sandbox escape via subprocess primitive | Medium | Critical | Phase 16 pen test; defense-in-depth (seccomp + AppArmor + RLIMIT + minimal capabilities); audit emits on every syscall denial |
| Workflow port reveals runtime gaps mid-port | High | Medium | Phase 9 (MIGRATION.md discipline) surfaces gaps before code; Phase 7 + 8 (the two brutal ports) are the stress test that proves runtime can carry the rest |
| Connector ToS violations (Companies House throttling, legislation.gov.uk rate limits) | Low | Low | Built-in throttling at MCP host layer; respect documented limits; cache where ToS permits |
| Frontend rewrite ships behind backend | Medium | Medium | API contracts locked in Phase 1-6; Phase 11 (frontend) can run in parallel with 7-10 |
| Reviewer disagrees with architectural calls in Phase 0 | Low | High | Plan explicitly assumes Reviewer resolves; if calls go differently, downstream phases adapt |

---

## What this plan deliberately does NOT include

- Full module marketplace (post-launch)
- Hosted module submission flow (post-launch; manual PR submission to first-party `awesome-legal-skills`-style repo until then)
- Module monetisation (post-launch, post-foundation)
- Provider marketplace (post-launch)
- WASM sandbox (post-launch; subprocess + seccomp is the V1)
- Automatic module updates (manual updates only; prompt on permission expansion)
- Multi-firm SaaS orchestration (post-launch; firms self-host or use hosted-eval at `legalise.dev`)
- LexisNexis / Westlaw / Practical Law connectors (Tier 3, partnership-track, parallel to main build but not blocking launch)
- Full audit replay (post-launch enhancement to audit reconstruction view)
- SAML / federated identity (post-launch)
- Schema evolution + migration tooling for matter model (post-launch; freeze matter schema for V1)

---

## Cross-references

- Architecture decision memory: `~/.claude/projects/-Users-andy/memory/legalise-architecture-rewrite.md`
- YC application context: `~/.claude/projects/-Users-andy/memory/yc-application-legalise.md`
- Launch state: `~/.claude/projects/-Users-andy/memory/legalise-launch-state.md`
- Codebase map: produced 2026-05-25 (in conversation, can be regenerated)
- Reviewer's brief in conversation history

---

*End of plan. Reviewer to acknowledge, then begin Phase 0.*
