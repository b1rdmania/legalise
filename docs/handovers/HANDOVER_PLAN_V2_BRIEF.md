# Handover — Plan v2 Brief

**From:** Andy + Claude (synthesis of architecture review loop, 2026-05-25)
**To:** Reviewer
**Status:** Plan v1 approved in direction, v2 rewrite required before Phase 0 begins
**Supersedes:** Reviewer brief in `HANDOVER_CAPABILITY_RUNTIME_PLAN.md` (still canonical for the foundational decisions)

---

## Reviewer response to IMPLEMENTATION_PLAN_REWRITE.md / HANDOVER_CAPABILITY_RUNTIME_PLAN.md

## Verdict

Approve the direction, but the plan needs to be rewritten as v2 rather than patched.

The current plan has the right architectural spine:

- Matter OS
- Capability Runtime
- Extension Ecosystem
- MCP-first host
- signed modules
- sandboxed execution
- verified publishers
- permission grant lifecycle
- module versioning/dependencies
- append-only failure semantics
- cost tracking
- streaming/async runtime
- firm-private modules
- regulator-legible audit reconstruction

That is the correct direction.

But the latest strategy loop exposed a missing organising layer. The product is not just "matter workspace with modules". It needs to become a legal work pipeline:

intake → matter plan → governed capabilities → human decision loops → evidence packs → audit reconstruction

That pipeline should drive the implementation plan.

## Why this matters

The strongest version of Legalise is not "Andy built several legal AI workflows".

It is:

Any tool. Any model. Any skill. Matter-scoped, permissioned, auditable.

That means Legalise is a supply-chain-aware capability runtime for legal work. Modules are not cosmetic plugins. They are controlled execution units touching sensitive legal data. This puts the reference class closer to npm/pip/cargo plus a regulator-grade matter workspace, not WordPress-style plugins.

The current plan captures much of that, but it still underplays several legal-work primitives that need a home in the architecture.

## What to keep from the current plan

Keep these exactly:

1. Three-layer architecture:
   - Matter OS
   - Capability Runtime
   - Extension Ecosystem

2. Lexicon:
   - Module = installable unit
   - Capability = declared action surface inside a module
   - A module declares one or more capabilities

3. Capability kinds:
   - skill
   - tool
   - workflow
   - provider
   - gate

4. Capability scopes:
   - matter
   - workspace
   - global

5. MCP as first-class host protocol.

6. Supply-chain framing:
   - signed modules
   - verified publisher registry
   - sandboxed execution
   - trust ceremony
   - permission expansion prompts
   - dependency/version resolution

7. Trust ceremony:
   - verified publisher fast path
   - unverified publisher full inspection path

8. Audit reconstruction:
   - filterable by module, user, model, document, gate, failed attempt, output, provider, date

9. Developer OKR:
   - clone → run → install module → execute on Khan → see audit row in under five minutes

10. Public line:
   - Any tool. Any model. Any skill. Matter-scoped, permissioned, auditable.

## What needs to change

### 1. Rewrite around the legal work pipeline

The plan should be reorganised around:

intake → matter plan → governed capabilities → human decision loops → evidence packs → audit reconstruction

This is a better product frame than "phases of module infrastructure".

It describes how legal work actually moves.

### 2. Add missing V1 core primitives

These should be treated as V1 architecture, not vague post-launch ideas:

**A. Intake state machine**

Core should model the pre-matter path:

prospect → conflict_check → scope_check → client_verified → matter_opened

Specific intake workflows can be modules, but the state machine belongs in Matter OS because it controls when a matter exists and what assumptions it was opened under.

**B. Opinion/advice boundary**

This should be a first-class gate primitive.

The system should distinguish:
- factual extraction
- legal information
- draft advice
- supervised legal advice
- approved final advice

Different gates apply to different levels. This is important for SRA/PI/regulatory framing.

**C. Output lifecycle**

Generated outputs need proper lifecycle states:

draft → reviewed → cleared → sent/signed → superseded/withdrawn

This belongs in Matter OS. Current document tagging is not enough.

**D. Matter memory**

Assistant/matter context should not be only chat history or current state. It needs structured matter memory:

- accepted facts
- disputed facts
- assumptions
- open questions
- deadlines
- authorities
- user decisions
- concessions

Capabilities should be able to read from this structured memory under declared permissions.

**E. Audit reconstruction**

Already in the plan. Keep as V1.

### 3. Add missing Phase 0 architecture docs

Current Phase 0 docs are good but incomplete. Add:

- `docs/architecture/INTAKE_SPEC.md`
- `docs/architecture/OUTPUT_LIFECYCLE.md`
- `docs/architecture/MATTER_MEMORY.md`
- `docs/architecture/REFERENCE_MODULES.md`

Keep the existing planned docs:

- `MANIFEST_V2_SCHEMA.md`
- `TRUST_CEREMONY.md`
- `SANDBOX_STRATEGY.md`
- `SIGNING.md`
- `AUDIT_RECONSTRUCTION.md`
- `MIGRATION_TEMPLATE.md`

So Phase 0 becomes ten docs, not six.

### 4. Treat Document Redliner as third brutal reference port

We found real Counsel MVP redliner code at:

- `/Users/andy/counsel-mvp/backend/app/agents/redliner.py`
- `/Users/andy/counsel-mvp/backend/app/services/pipeline.py`
- `/Users/andy/counsel-mvp/backend/app/database.py`
- `/Users/andy/counsel-mvp/src/pages/WorkbenchPage.jsx`

This should become the third major reference module.

The three proof patterns should be:

**A. Contract Review**
Existing Legalise module. Document-heavy, model-heavy, output-generating.

**B. Pre-Motion**
Existing Legalise module. Multi-stage, audit-heavy, gate-heavy.

**C. Document Redliner**
Imported from another codebase. Proves the runtime can absorb external legal workflow code and govern it.

Document Redliner is strategically important because it expresses the supervised-autonomy loop clearly:

document → proposed amendment → human accept/reject/edit → generated output → audit

That is one of the most legible legal AI primitives.

### 5. Separate core primitives from reference modules

Do not promote every useful idea into core.

**V1 core:**
- intake state machine
- opinion/advice boundary
- output lifecycle
- matter memory
- capability runtime
- gates/grants/permissions
- audit reconstruction
- signed/sandboxed module execution

**Reference modules:**
- Contract Review
- Pre-Motion
- Document Redliner
- Matter Plan / next-action layer
- Evidence Pack composer
- Companies House connector
- legislation.gov.uk connector
- local/open document reader
- provider modules

**V2 / later:**
- full legal-output eval harness
- broad connector suite
- marketplace
- module monetisation
- full matter-schema evolution tooling

### 6. Matter Plan should be a reference module first

Do not make "matter plan" a huge core subsystem immediately.

Build it as a reference workflow:

`examples/modules/reference/matter-plan/`

It reads matter state and writes tasks/notes/recommended next actions. If it becomes essential later, promote the stable parts into Matter OS.

### 7. Evidence/source packs should be a reusable output pattern

Do not create a giant evidence-pack subsystem too early.

Evidence packs should initially be output artifacts emitted by modules:

- Pre-Motion produces an evidence pack for its conclusion.
- Contract Review produces an evidence pack for risk findings.
- Document Redliner produces an evidence pack for proposed amendments.

Later this can become a full Matter OS artifact type.

### 8. Change the document reader connector decision

Phase 10 currently asks Reviewer to pick Google Document AI vs AWS Textract vs Azure Document Intelligence.

That misses the strategic concern.

First proof should be local/open document reading.

Reason:
The Mike comparison exposed that Legalise should not try to "own" document reading. It should govern document readers. A local/open document-reader reference module proves that.

**Recommended shape:**

Runnable proof:
- local/open document reader

Roadmap/BYO connectors:
- Adobe PDF Extract
- Google Document AI
- AWS Textract
- Azure Document Intelligence

### 9. Connector ambition should be broad catalogue, narrow runnable set

The connector catalogue can list the wider universe, but launch/runtime proof should remain focused.

**Runnable proof set:**
- Companies House
- legislation.gov.uk
- local/open document reader
- Anthropic provider
- OpenAI provider
- Ollama provider

**Catalogue / roadmap:**
- Land Registry
- Charity Commission
- GLEIF
- OpenSanctions
- DocuSign
- Clio
- LEAP
- Actionstep
- Adobe PDF Extract
- Google Document AI
- AWS Textract
- Azure Document Intelligence
- DeepL
- Whisper / transcription providers
- KYC/AML providers

**Partner track:**
- LexisNexis
- Westlaw / Practical Law
- vLex
- iManage
- NetDocuments

Do not imply normal username/password login for Lexis/Westlaw/iManage. Those are firm API / partner / tenant-admin integration tracks.

### 10. Mike should not be integrated directly

Mike is a peer/inspiration, not a dependency.

**Reasons:**
- likely AGPL licensing
- no stable external API/service token found
- private-route integration would be brittle
- product posture gets confused

**Correct posture:**
- Legalise should be able to govern a Mike-like document-analysis service.
- Do not vendor or import Mike code.
- If collaboration happens later, use MCP or a clean service API boundary.

### 11. Branch strategy should be explicit

Create a dedicated runtime rewrite branch off master.

- hosted eval / `legalise.dev` stays stable on master
- capability runtime work happens on rewrite branch
- merge only at coherent phase boundaries
- avoid half-rebuild on master

**Failure mode to avoid:**
half-rebuilding while retaining old tab/workflow assumptions underneath.

### 12. Phase 13 Khan demo should move up in importance

Khan v Acme should not be treated as seed data.

It should become the canonical test/demo matter for:
- intake
- matter plan
- document reader
- Contract Review
- Pre-Motion
- Document Redliner
- evidence packs
- audit reconstruction

The developer OKR depends on it:
clone → run → install module → execute on Khan → see audit row.

### 13. Avoid calendar estimates

The plan should avoid calendar guesses. Timing is explicitly off the table for this rewrite.

Use dependency/risk language instead:
- foundation
- reference port
- proof connector
- demo hardening
- release hardening

Not "3-4 weeks".

### 14. Add `REFERENCE_MODULES.md`

This doc should specify:

- which first-party workflows become reference modules
- which get immediate ports
- which get MIGRATION.md first
- where Document Redliner sits
- how Kramer v AI fits
- what the acceptance bar is for a reference module
- how reference modules differ from core runtime

**Suggested reference module tiers:**

Immediate brutal ports:
- Contract Review
- Pre-Motion
- Document Redliner

Immediate proof connectors:
- Companies House
- legislation.gov.uk
- local/open document reader
- providers: Anthropic/OpenAI/Ollama

Migration targets:
- Letters
- Tabular Review
- Case Law
- Anonymisation
- Chronology
- Document Edit

Experimental/reference:
- Matter Plan
- Evidence Pack composer
- Kramer v AI

### 15. Keep Kramer v AI, but don't let it distort the runtime

Kramer v AI should be a reference module, not a side prototype.

It should test:
- dual-party flow
- settlement bands
- emotional-discovery gates
- provider plurality
- streaming progress
- audit trail

But it should not dictate the core runtime unless it exposes a generalised primitive.

## Recommended final plan structure

Rewrite `IMPLEMENTATION_PLAN_REWRITE.md` v2 around:

0. Branch strategy + Phase 0 architecture docs
1. Matter OS primitives:
   - intake state machine
   - output lifecycle
   - matter memory
   - opinion/advice boundary
2. Manifest v2 + capability registry
3. MCP host + sandbox/signing/trust ceremony
4. Grant lifecycle + dependency/version resolution
5. Audit reconstruction + cost tracking
6. Streaming/async runtime
7. Reference port 1: Contract Review
8. Reference port 2: Pre-Motion
9. Reference port 3: Document Redliner from Counsel MVP
10. MIGRATION.md targets for remaining workflows
11. Connector proof set
12. Frontend capability runtime UX
13. Khan canonical demo matter
14. Developer CLI + five-minute first audit row
15. Docs / README / launch copy
16. Pre-launch hardening

## Reviewer answer requested

Please return:

1. Do you accept the V1 core / reference module / V2 categorisation?
2. Do you accept Document Redliner as the third brutal reference port?
3. Do you accept the four added Phase 0 docs?
4. Do you accept local/open document reader as the first proof, with Google/AWS/Azure as BYO roadmap connectors?
5. Do you accept the branch strategy?
6. Will you rewrite `IMPLEMENTATION_PLAN_REWRITE.md` as v2 rather than patch it?

## Verdict

Approve the current direction.

Do not start Phase 1 code yet.

First rewrite the plan as v2 with the legal-work pipeline, the added Matter OS primitives, the Document Redliner reference port, the reference-module taxonomy, the connector correction, and the branch strategy.

Then Phase 0 starts.
