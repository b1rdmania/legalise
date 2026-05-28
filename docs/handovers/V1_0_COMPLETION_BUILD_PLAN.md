# Legalise v1.0 Completion Build Plan

**Status:** planning artefact for the "build the whole coherent product before public launch" pivot.  
**Date:** 2026-05-28.  
**Branch when written:** `phase-17-crm-pass`.  
**Purpose:** replace the v0.4 evaluation-launch framing with a v1.0 completion path. Public launch can wait; the goal is now a coherent working project, not a defensible preview.

## 1. Product Definition

v1.0 means Legalise is a coherent open-source legal-AI workspace that a serious evaluator can run end-to-end without handholding:

1. A fresh operator can set it up, bootstrap admin, configure storage/provider settings, run `legalise doctor`, and know whether the system is healthy.
2. A signed-in user can open a matter, understand documents/context/actions, run installed modules, inspect artifacts, and reconstruct the audit trail.
3. A superuser can manage users, roles, modules, provider posture, installed-module state, and workspace audit from calm operator surfaces.
4. Long-running work is durable enough not to depend on request-local tasks or Fly local disk as source of truth.
5. The audit and permission story is visible, regulator-shaped, and honest about its tamper-resistance boundary.
6. Public copy, docs, and smoke tests match what the software actually does.

v1.0 does **not** mean a regulated law firm product, full SRA-approved supervisor workflow, full marketplace economy, or enterprise compliance programme.

## 2. Non-Negotiables

- No server-paid production model keys. Hosted/prod remains BYO provider keys unless a later explicit commercial decision changes this.
- Redis never carries matter content. It may carry job ids, progress metadata, and rate-limit counters.
- Fly local filesystem is never source of truth for uploaded or generated legal material.
- No launch copy may imply Legalise gives legal advice or is ready for unsupervised live client matters.
- Firm role hierarchy stays configurable. Default public/demo mode must not require evaluators to understand `qualified_solicitor`.
- Every new operational claim needs a test, a runbook entry, or a clear "not implemented" statement.
- Do not add broad connectors before the core operator loop is coherent.
- Reuse before building. Every phase must check existing Legalise primitives, maintained open-source tools, legal/open-data sources, and MCP servers before inventing new machinery. If the phase builds custom, the handover must explain why.

## 2.1 Reuse / Integration Doctrine

Legalise should not hand-roll commodity infrastructure or legal-adjacent tooling just to keep everything first-party.

Preferred pattern:

1. Use an existing maintained tool/library/source for commodity capability.
2. Wrap it behind Legalise's matter, permission, provider, artifact, and audit boundaries.
3. Declare the dependency/trust posture clearly.
4. Build custom only where the governance substrate needs a Legalise-specific primitive.

Examples:

- Object storage: S3-compatible client + MinIO/R2, not a bespoke blob store.
- Jobs: arq/Redis + Postgres job records, not a custom queue.
- Document parsing/OCR: use proven parsers/OCR where suitable; Legalise governs inputs/outputs and audit.
- Legal data: prefer official/open sources or vendor MCP servers where licensing allows.
- Evals: use simple deterministic fixtures first; only adopt a harness if it reduces real complexity.
- Connectors: MCP/vendor servers are valid later, but broad connector work waits until the core product is coherent.

## 3. Build Sequence

### Phase 18-G — Operator Consistency Pass

**Goal:** finish the logged-in UI coherence work already planned.

Scope:
- Extract `PageHeader` for logged-in operator pages.
- Align table/section/empty-state shapes only where duplication is proven.
- Tighten grants and ceremony copy.
- Keep the visual system stable; no redesign.

Exit:
- Modules, settings, admin, matter, artifacts, and audit feel like one product.
- Full frontend test/build gate green.

### Phase 19 — Production Acceptance Walk

**Goal:** verify the actual product path after 18-G, in production or a production-equivalent deploy.

Walk:
- Fresh account.
- Provider key/no-key state.
- Open Khan.
- Install or inspect modules.
- Grant permissions.
- Run Contract Review and Pre-Motion.
- Inspect artifacts.
- Follow audit links.
- Admin user/role/module/audit surfaces.

Output:
- One findings doc split into P1/P2/P3.
- P1/P2 only block v1.0; P3 can be follow-up polish.

### Phase 20 — First-Run and Operator Setup Completion

**Goal:** make setup self-diagnosing and non-mysterious.

Scope:
- Reuse/integration audit: existing `legalise doctor`, settings endpoints, provider-key CRUD, bootstrap CLI, and module catalogue surfaces before adding new setup machinery.
- `legalise doctor` becomes the canonical health check for DB, migrations, Redis, S3/R2/MinIO, plugin root, manifests, provider mode, and demo matter.
- First-run UI points operators to the exact bootstrap/admin/provider/storage steps.
- README, DEMO, RUNBOOK, TROUBLESHOOTING align with the live product.
- Provider settings clearly show configured/not configured and demo/stub vs real-provider mode.

Defer:
- Provider test-call endpoint unless acceptance walk shows users are genuinely confused by "configured, not tested".

### Phase 21 — Real Object Storage

**Goal:** uploaded binaries and generated artifacts use object storage as source of truth.

Scope:
- Reuse/integration audit: S3-compatible libraries, MinIO local, Cloudflare R2/S3 production, existing artifact/document metadata.
- Storage abstraction over S3-compatible backends.
- Local compose uses MinIO.
- Hosted/prod uses Cloudflare R2 or equivalent.
- Uploaded document bytes and generated artifacts record storage key, hash, size, and content type.
- Existing document, artifact, download/view, and audit surfaces continue to work.

Exit:
- Fly filesystem can be cache/materialisation only.
- Cross-user and path-traversal tests exist.

### Phase 22 — Durable Jobs

**Goal:** module runs survive disconnects and can be inspected after completion/failure.

Scope:
- Reuse/integration audit: arq/Redis and existing job/export handover work before adding custom queue mechanics.
- `jobs` table as source of truth.
- arq + Redis for queueing.
- Redis carries job ids/metadata only, never prompts, responses, or document text.
- Move genuinely long-running module flows off request-local execution.
- Job status UI is minimal but honest.

Exit:
- Disconnect/reload does not lose the run.
- Failure writes terminal job state and audit.

### Phase 23 — Migration, Limits, and Runtime Ops

**Goal:** production behaves like an operated system, not a dev server.

Scope:
- Production migrations run as release/deploy step, not accidental boot mutation.
- App fails fast if schema is behind.
- Hosted limits are enforced and rendered cleanly in UI.
- Multi-instance-ready rate limiting where needed.
- Deployment runbooks are exact.

Exit:
- New deploy can be executed from runbook without undocumented manual steps.

### Phase 24 — Matter Export, Delete, and Retention

**Goal:** matter lifecycle has a credible operator story.

Scope:
- Reuse/integration audit: standard archive formats, existing storage keys, existing audit reconstruction, current document/artifact renderers.
- Matter export bundle with documents, artifacts, metadata, and audit/reconstruction.
- Delete/archive flow with owner/admin checks.
- Refuse destructive actions while jobs are running.
- Retention/audit consequences are explicit in UI and docs.

Exit:
- Operator can answer "how do I get data out?" and "how do I delete/archive this?" without DB access.

### Phase 25 — Audit Hardening and Reconstruction Polish

**Goal:** audit becomes a real oversight surface, not just a timeline.

Scope:
- Reuse/integration audit: existing audit reconstruction primitives, known append-only/WORM database patterns, and maintained hashing/signing libraries before custom cryptography.
- Audit action constants module; remove string drift at new call sites.
- WORM groundwork: migration/app role split, revoke update/delete on `audit_entries` for app role where practical, trigger guard where feasible.
- Reconstruction view groups module invocation, model call, gate decision, artifact, and role/grant changes into readable chains.
- Exportable reconstruction pack if it drops naturally out of matter export; otherwise defer.

Exit:
- Claim remains "application-level audit with WORM groundwork", unless DB-enforced WORM is actually live.

### Phase 26 — Supervisor Gate v1

**Goal:** turn supervised autonomy from substrate vocabulary into one concrete reviewed-output workflow.

Scope:
- Reuse/integration audit: existing advice-boundary tables, role/admin substrate, audit reconstruction, and public supervision guidance before adding new models.
- Named supervisor identity/role model.
- Gate decision model: requested, approved, rejected, changes requested, overridden.
- Evidence refs, output hash, notes, actor, timestamp, immutable audit link.
- One UI review panel for a bounded output type.
- Default demo mode may keep this staged/dormant; firm mode can enable it.

Exit:
- We can honestly claim a reference supervisor-gate primitive exists.

### Phase 27 — Prompt Shroud and Provider Routing Policy

**Goal:** answer the obvious "what leaves the firm?" objection.

Scope:
- Reuse/integration audit: existing anonymisation/redaction modules, provider-native structured output/tool calling, and simple policy engines before bespoke prompt-shroud machinery.
- Configurable redaction/anonymisation policy before cloud dispatch.
- Local/cloud routing policy visible to operators.
- Audit records what policy applied and which provider was used.
- No claim of perfect anonymisation.

Exit:
- A solicitor/evaluator can understand what was sent, where, and under which policy.

### Phase 28 — Legal-Quality Eval Harness Lite

**Goal:** test output posture without pretending to certify legal correctness.

Scope:
- Reuse/integration audit: existing Playwright/pytest fixtures and lightweight OSS eval patterns before adopting a heavy eval platform.
- Deterministic fixtures for core modules.
- Expected output shape and required-source checks.
- Citation/refusal/unsupported-claim checks.
- Regression fixtures per reference module.

Exit:
- Public copy can say Legalise has regression evals for grounding/citation posture, not that outputs are legally correct.

### Phase 29 — Module and Marketplace Completion

**Goal:** make module install/management feel complete without opening an uncontrolled marketplace.

Scope:
- Reuse/integration audit: existing module catalogue/install/update/revoke endpoints, installed-module rows, trust ceremony, and compatible MCP/vendor module patterns.
- Installed-module admin page polish: installed, disabled, update available, broken manifest, trust state.
- Module detail/permission card polish.
- Manual update/revoke repair flows.
- Public submission remains controlled unless explicitly opened.
- Module DX CLI remains optional; pull forward only if module authoring becomes the bottleneck.

Exit:
- The module manager reads as an integrations/admin product, not a manifest browser.

### Phase 30 — Release Candidate Freeze

**Goal:** stop adding product surface and ship v1.0.

Scope:
- Full production smoke.
- Full CI/e2e.
- Fresh machine local setup.
- Hosted deployment verification.
- README/docs/copy claim-parity sweep.
- Known limitations.
- Tag release.

Exit:
- v1.0 public launch.

## 4. Items Still Deliberately Post-v1 Unless Pulled Forward

- Broad vendor connectors.
- E-disclosure / court-filing / billing integrations.
- Full third-party marketplace governance, ratings, payments.
- Multi-firm SaaS orchestration.
- Enterprise SSO / SCIM.
- SOC 2 / ISO 27001 certification programme.
- Client portal.
- Third/fourth/fifth reference module unless a real evaluator demands it.
- Module DX CLI unless module authorship becomes the bottleneck.
- Full legal benchmark suite beyond the v1 eval harness lite.

## 5. Immediate Next Step

Finish **Phase 18-G** first. It is already planned and small. Then run **Phase 19 Production Acceptance Walk**. The acceptance findings decide whether the next implementation phase is setup/docs, module polish, provider clarity, or a hard backend foundation.

Do not jump straight to object storage/jobs before the product surface is coherent enough to inspect. Do not keep polishing UI once the acceptance walk shows backend foundations are the real blocker.

## 6. Reviewer Questions

1. Is v1.0 allowed to mean "serious open-source evaluation product with live-matter foundations", or must it mean "safe for real client matters"?
2. Should Supervisor Gate v1 land before or after object storage/jobs?
3. Should prompt shroud be v1.0-critical, or v1.1 if BYO/open-source claim boundary is honest?
4. Do we keep broad connectors post-v1 even under the new "build the whole thing" posture?
5. Is legalise.dev still BYO-key only for v1.0?
