# KISS Review — Roadmaps, Handovers, and v1 Build Plan

**Status:** consolidation review.  
**Date:** 2026-05-28.  
**Branch when written:** `phase-17-crm-pass`.  
**Purpose:** preserve the core Legalise philosophy while collapsing the accumulated roadmap / handover history into one buildable v1 path.

## 1. Review Summary

The project has not gone off the rails architecturally. The core bet is still coherent:

> A matter-first legal AI workspace where signed modules run only through permission, posture, provider, artifact, and audit controls.

What has gone off the rails is the planning surface. The repo now contains several generations of plans:

- early v0.x evaluation launch plans;
- runtime-rewrite substrate phase handovers;
- serious-backend/live-matter readiness notes;
- product-surface specs;
- IA/design-pass plans;
- post-launch/v0.5/v0.6 roadmaps;
- the new v1.0 completion pivot.

Most are individually useful, but together they create false choices and duplicate sequencing. The implementation team should stop treating every historical phase as live. Use this document as the current plan index.

## 2. What Must Be Preserved

These are core to the project. Do not simplify them away.

1. **Matter-first substrate**
   - Matter is the unit of permission, audit, artifact, document context, and reconstruction.
   - Avoid global "agent workspace" framing.

2. **Signed modules + trust ceremony**
   - Modules are not random tool calls.
   - Install / update / revoke / permission expansion must remain explicit and auditable.
   - The module area must stand alone as a product surface: browse, install, switch on/off, understand permissions, and start creating modules.

3. **Matter-scoped grants**
   - Permissions are scoped to a matter unless deliberately workspace/global.
   - Do not return to plugin-wide loose grants.

4. **Audit reconstruction**
   - The audit trail is the product thesis, not an admin afterthought.
   - Every important action must either emit a row or be explicitly recorded as a none-row action.

5. **Visible supervised autonomy**
   - Legalise cannot feel like "chat plus modules".
   - At least one workflow must show the loop: AI/module produces an output, human supervisor reviews it, decision is recorded, audit reconstructs the chain.
   - This should be a simple approval surface, not a revived qualified-solicitor onboarding wall.

6. **BYO provider keys**
   - Legalise does not silently supply production model access.
   - The product must make keyless/demo/stub mode obvious.

7. **Dormant firm hierarchy by default**
   - The role/substrate can stay.
   - Public/default mode must not make normal evaluators satisfy `qualified_solicitor`.
   - Firm mode can reactivate hierarchy gates.

8. **No matter content in Redis**
   - Redis can queue ids and metadata.
   - Postgres/object storage remain source of truth.

9. **Honest claim boundary**
   - Legalise is not a law firm.
   - It does not give legal advice.
   - It should not claim forensic WORM, SRA approval, live-client readiness, or legal correctness until those are actually implemented.

10. **Reuse before building**
   - Before building a new subsystem, check whether a maintained open-source tool, legal data source, MCP server, or existing Legalise primitive can carry it.
   - Prefer integrating boring proven tools over hand-rolling legal/document infrastructure.
   - Integration still goes through Legalise's trust ceremony, matter-scoped grants, audit, provider, and artifact rules.

## 3. What To Stop Doing

1. **Stop reopening old phase plans unless they contain a concrete unresolved item.**
   - `IMPLEMENTATION_PLAN_REWRITE.md` is useful history, not the active plan.
   - Phase 1-16 handovers are provenance, not instructions.

2. **Stop adding broad connectors before the core product is calm.**
   - Companies House / legislation / vendor MCP connectors are strategically valid.
   - They are not the next thing if module/settings/matter/audit still feel bolted together.

3. **Stop using "v0.4 vs v0.5" as the active decision frame.**
   - The user has chosen to delay public launch and build a coherent v1.
   - Keep old version docs for claim-boundary history, but do not let them drive sequencing.

4. **Stop designing new primitives before proving the product loop needs them.**
   - The substrate is already dense.
   - New primitives must support setup, module execution, artifact/audit, live-matter foundations, or supervisor review.

5. **Stop treating full enterprise readiness as v1.**
   - SSO/SCIM, SOC 2, client portal, e-disclosure connectors, billing, court filing, and multi-firm SaaS orchestration are not needed for the first coherent open-source v1.

6. **Stop hand-rolling commodity/legal-adjacent infrastructure by default.**
   - OCR, PDF parsing, docx rendering, object storage, queues, auth-adjacent flows, legal data lookups, and observability should start with a reuse/integration audit.
   - Build custom only where Legalise's governance substrate genuinely needs a bespoke surface.

## 4. Current Product Reality

Already present:

- Public/logged-in product shell.
- Module catalogue / module detail / install ceremony.
- Installed/disabled module state.
- Matter-scoped grants.
- Module invocation endpoint.
- Artifacts list/detail/preview.
- Matter audit reconstruction.
- Workspace/admin audit reconstruction.
- Admin user list/detail/role mutation.
- Bootstrap CLI.
- `legalise doctor`.
- Provider key CRUD and settings surface.
- Phase 17.5 dormant firm gates.
- Playwright coverage for core evaluator paths.

Therefore, the immediate work is not "build the module marketplace" or "build the product surface from scratch". It is:

> Make the existing operator product coherent, then harden the live-matter foundations underneath it.

## 5. KISS v1 Definition

v1.0 should mean:

> Legalise is a coherent open-source legal-AI workspace that a serious evaluator or self-host operator can run end-to-end without handholding, with real storage/jobs/export/audit foundations, a standalone module install/create surface, and one concrete supervisor-review primitive.

v1.0 should **not** mean:

- certified regulated-firm deployment;
- full marketplace economy;
- full connector suite;
- enterprise SSO;
- SOC 2 / ISO 27001;
- guaranteed legal-quality outputs;
- multi-firm SaaS orchestration.

v1.0 is not a quiet scope-slimming exercise. The user has chosen to delay public launch if needed. Live-matter foundations, module creation, and visible supervisor review stay in the v1 plan unless explicitly removed by reviewer decision.

## 6. New Active Build Plan

### Workstream 1 — Operator UI Coherence

**Goal:** one calm logged-in product.

Build:
- Finish Phase 18-G.
- Standardise page headers, table/section shapes, empty states, and operator copy.
- Make module/settings/admin/matter/audit screens feel like one CRM/admin product.
- Keep existing routes and substrate.

Exit:
- User can move from `/app` to Khan, modules, settings, admin, artifacts, and audit without feeling like they crossed product eras.

### Workstream 2 — Acceptance Walk and Findings Freeze

**Goal:** stop guessing what is broken.

Build:
- One production-equivalent walkthrough after Workstream 1.
- Use a fresh account.
- Walk setup, provider state, Khan, module install/inspect, grants, module run, artifacts, audit, admin.
- Record P1/P2/P3.

Exit:
- P1/P2 become blocking implementation tasks.
- P3 becomes polish, not churn.

### Workstream 3 — Supervisor Review v1

**Goal:** prove the central thesis early: supervised autonomy must be visible before broader platform hardening.

Build:
- This is net-new product/substrate, not just reuse. Existing advice-boundary tables help with vocabulary and reconstruction, but they do not model human approve/reject/request-changes/override decisions today.
- Add the smallest concrete review loop:
  - one bounded module output type can be marked "requires review";
  - a matter-level review/approvals surface lists pending/completed review items;
  - reviewer sees artifact/output, source refs/citations, model/provider metadata, permission/gate history, and audit reconstruction link;
  - reviewer can approve, reject, request changes, or override with notes;
  - decision stores reviewer identity, decision status, output hash, notes, evidence refs, timestamp, and immutable audit link;
  - reconstruction shows the chain.
- Default mode must not reintroduce the `qualified_solicitor` wall. "Supervisor" in default mode can be an authorised signed-in reviewer; firm mode can later make role requirements stricter.

Exit:
- Legalise no longer feels like "chat plus modules"; one real output can move through human review and audit.

### Workstream 4 — Setup, Provider, and Module Completeness

**Goal:** an operator/evaluator knows how to get from zero to useful, and the module section explains the thesis without narration.

Build:
- Run a reuse audit before adding new setup/provider/module machinery:
  - existing settings/key endpoints;
  - existing module catalogue/install endpoints;
  - existing `legalise doctor`;
  - existing open-source provider-health patterns if a test-call endpoint is pulled forward.
- Make `legalise doctor` the canonical health indicator.
- Keep README / DEMO / TROUBLESHOOTING aligned with the actual UI.
- Make provider states unavoidable and honest:
  - no key configured;
  - key configured, not tested;
  - demo/stub mode;
  - provider failure.
- Polish installed-module management:
  - installed;
  - disabled;
  - update available if detectable;
  - broken manifest;
  - trust status;
  - permission card.
- Make `/modules` stand alone:
  - explain "what modules are" in product language;
  - separate available modules, installed modules, and disabled modules clearly;
  - make install/update/revoke/setup paths obvious;
  - show which modules are switched on/off;
  - show what each module can read/write before install and after install.
- Resolve the module-state design decision explicitly:
  - public catalogue and v2 registry are currently separate surfaces;
  - grants/runnability are matter-scoped;
  - installed/enabled state is not the same as "available on this matter";
  - decide whether the main module screen is workspace-global, matter-contextual, or split into "Browse modules" and "Manage installed modules" before adding badges/copy.
- Add a minimal **Create Module** path:
  - not a full SDK/CLI unless needed;
  - start with a guided page/checklist/template that explains manifest, permissions, entrypoint, signing/trust, local validation, and how a module becomes installable;
  - allow self-host operators to understand how to add their own module without reading the whole codebase.

Defer:
- Provider test-call endpoint unless the acceptance walk proves the current labels confuse users.
- Module DX CLI unless the guided create-module surface proves insufficient.

### Workstream 5 — Live-Matter Foundations

**Goal:** remove the obvious "demo substrate" objections.

Build:
- Reuse first:
  - S3-compatible object storage client/library rather than bespoke storage protocol;
  - MinIO for local object storage;
  - arq/Redis for jobs rather than a home-grown worker queue;
  - existing migration tooling rather than a custom migration runner.
- Real object storage:
  - MinIO local;
  - R2/S3 prod;
  - uploaded document bytes and generated artifacts stored by key/hash/content type.
- Durable jobs:
  - `jobs` table;
  - arq/Redis queue;
  - Redis stores job ids/metadata only;
  - job status survives disconnect/reload;
  - failure writes terminal state and audit.
- Production migration discipline:
  - release/deploy migration step;
  - app fails fast if schema behind.
- Hosted/self-host limits rendered cleanly.

Exit:
- Fly filesystem is cache only.
- Long module runs do not depend on request-local tasks.
- Production deploy is operationally sane.

### Workstream 6 — Matter Lifecycle and Portability

**Goal:** operators can get data out and retire matters without DB access.

Build:
- Reuse first:
  - standard archive formats;
  - existing document/artifact storage metadata;
  - existing audit reconstruction rows;
  - existing document conversion/rendering tools already in the stack.
- Matter export bundle:
  - metadata;
  - documents;
  - document versions where available;
  - artifacts;
  - audit/reconstruction;
  - hashes/pointers.
- Matter archive/delete:
  - owner/admin checks;
  - refuse while jobs run;
  - storage cleanup failure does not fake success;
  - retention/audit consequences visible.
- Key rotation runbook/CLI for encrypted provider keys.

Exit:
- "What if I want to leave?" and "what if I need to delete/archive?" have product answers.

### Workstream 7 — Audit and Oversight Hardening

**Goal:** make the oversight surface and audit substrate strong enough for the v1 claim.

Build:
- Reuse first:
  - existing advice-boundary tables and audit reconstruction primitives;
  - existing role/admin substrate;
  - existing legal/professional supervision guidance as product copy constraints, not as hard-coded legal conclusions;
  - maintained append-only / audit-chain patterns where practical before inventing new cryptography.
- Audit action constants for new/changed call sites.
- WORM groundwork:
  - split app/migration roles where practical;
  - revoke update/delete on audit for app role where practical;
  - trigger guard where feasible.
- Reconstruction polish:
  - group invocation/model/gate/artifact chains;
  - show blocked/denied attempts clearly;
  - make role/grant/module lifecycle rows readable.
Exit:
- Legalise can honestly explain what was reviewed, by whom, with which source/model/gate context, while still avoiding "SRA-approved workflow" language.

### Workstream 8 — Provider Trust Layer and Eval Harness Lite

**Goal:** answer "what was sent?" and "how do you know it did not obviously hallucinate?"

Build:
- Reuse first:
  - existing anonymisation/redaction modules where they fit prompt shrouding;
  - open-source eval harness patterns only where they can run deterministically against seeded matters;
  - provider-native structured output/tool-calling where available before inventing parser layers.
- Prompt shroud / redaction policy before cloud dispatch.
- Local/cloud routing policy visible to operators.
- Audit records provider, policy, and what class of material left the system.
- Eval harness lite:
  - deterministic seeded matters;
  - output-shape checks;
  - source-required/citation-required checks;
  - refusal/unsupported-claim checks;
  - module regression fixtures.

Exit:
- Public copy can claim tested grounding/citation posture without claiming legal correctness.

### Workstream 9 — Release Candidate Freeze

**Goal:** stop building and ship.

Build:
- Full CI/e2e.
- Fresh-machine local install.
- Production smoke.
- Module install/create smoke.
- Supervisor-review smoke.
- Docs/copy claim-parity sweep.
- Known limitations.
- Tag v1.0.

Exit:
- Public launch.

## 7. Explicitly Post-v1

These remain parked unless a real evaluator/customer need pulls them forward:

- Broad vendor connectors.
- E-disclosure connectors.
- Court filing.
- Billing/time recording.
- Client portal.
- Enterprise SSO/SCIM.
- SOC 2 / ISO 27001 programme.
- Full third-party marketplace governance/payments/ratings.
- General module DX CLI.
- Third/fourth/fifth reference modules.
- Full legal benchmark suite beyond the v1 eval harness lite.
- Multi-firm SaaS orchestration.

## 8. Source-of-Truth Rules Going Forward

1. This document is the active KISS plan.
2. `V1_0_COMPLETION_BUILD_PLAN.md` is the phase-style expansion of this plan.
3. `ROADMAP.md`, `LAUNCH_TRUTH.md`, `SUPERVISED_AUTONOMY.md`, and `CLAIM_BOUNDARY.md` remain philosophy/claim-boundary references.
4. Old handovers remain provenance only unless explicitly cited in a new workstream plan.
5. Every new workstream should start with a short build plan and end with a short handover. Do not revive the 30-phase planning style.
6. Every new workstream build plan must include a short **reuse/integration audit**:
   - existing Legalise primitive to reuse;
   - open-source tool/library to consider;
   - legal/open-data source or MCP server to consider;
   - reason for building custom if none is used.

## 9. Immediate Next Action

If `phase 18-G: one logged-in PageHeader + retire serif on operator screens` is ratified, move straight to **Workstream 2 / Acceptance Walk**.

If 18-G is not ratified, close only its review findings first. Do not broaden it into another design phase.

Only after that should the team choose between:

- Supervisor Review v1 immediately, if the walk confirms the central thesis still feels invisible;
- setup/provider/module work, if the product loop still feels confusing;
- live-matter foundations, if the product loop is clear but the substrate is operationally weak.

This keeps the project simple without throwing away the serious architecture.
