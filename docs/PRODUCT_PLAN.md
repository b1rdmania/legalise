# Product Plan — Legalise

> Current repo reality after the P1-P4 build pass. This is a status-and-next
> plan, not a promise that the project is live-client ready.

## Identity (what we are trying to win)

Legalise will not out-feature the funded legal-AI workspaces solo. It can be the
one whose **agent's information access and outputs are inspectable and
governed**. The substrate now supports that claim better than it did: matter
isolation, audit hash chain + WORM guard, posture gate, advice-boundary gate,
CPR 31.22 redaction, source anchors, sign-off with hash-pinning, export,
audited retrieval, and source click-back are all in the product path.

The remaining question is not "can this be launched as a full legal practice
system?" It cannot. The question is whether it is coherent enough as a forkable
evaluation workspace: create a matter, add documents, ask governed questions,
see what the AI saw, review cited passages, sign or reject outputs, and audit
the record afterwards.

## Current Shape

| Strong now | Still needs hardening |
|---|---|
| audit chain / WORM / register | hosted app role split confirmation |
| posture + advice-boundary gates | restore and key-rotation rehearsal cadence |
| CPR 31.22 chronology gate | chronology extraction quality with a real key |
| sign-off + hash-pinning | drafting/editor flow still parked |
| export / working pack | org/team model, SSO/MFA |
| source anchors + source click-back | pagination and large-document scaling work |
| audited hybrid retrieval over document chunks | durable worker/runtime operations |
| first-run matter overview and clearer model selection | production monitoring and incident process |

## What Landed

### P1 — Forkable & usable

The basic workspace no longer looks broken on first contact:

- Per-document delete/archive.
- Matter close/delete exposed in the UI.
- Matter overview as the default landing surface.
- Clearer first-run path: create matter -> add docs -> ask assistant -> run
  skill -> sign -> export.
- Honest empty states and wording around what the assistant has seen.
- Summary/document-reader misroute fixed.

### P2 — Coherent assistant: the matter spine

Every chat turn now carries the cheap structured context that stops the
assistant feeling blind:

- matter type, parties/facts, status, model, and AI-access posture
- document index metadata
- chronology digest
- outstanding outputs and sign-offs
- explicit framing about unread or unindexed material

### P3 — Audited retrieval

This is now built, not future roadmap:

- Documents are chunked and indexed on upload.
- Embeddings are stored in pgvector with a generated full-text vector.
- The default Docker image installs the local `fastembed` backend and pre-warms
  `BAAI/bge-small-en-v1.5`; slim/offline installs can use the deterministic hash
  backend.
- Retrieval is hybrid vector + keyword search and only searches indexed matter
  documents.
- Search activity writes `retrieval.search` audit rows with hit counts and
  document/chunk evidence.
- Seed matters auto-index so a fresh fork is searchable immediately.

This is the core governed-agent differentiator: "what did the AI see?" is now a
replayable audit trail, not a vague prompt claim.

### P4 — Review & legal depth

The review loop is more concrete:

- Assistant answers persist cited passages with source ranges.
- The UI links citations back to the exact document passage for review.
- Activity/audit reads more like a story than a raw event dump.
- Chronology auto-build plumbing exists.
- Model selection is clearer at matter creation and in matter settings.
- Matter status and AI-access posture are no longer conflated.

The honest caveat: chronology extraction quality is **not yet product-proven**.
The plumbing is in place, but it needs a real keyed run against synthetic legal
packs before we should trust the extracted-event quality.

## Next Build Order

### N0 — Coherent workspace (UX / IA overhaul) [IN PROGRESS]

An independent UX review (benchmarked against real apps via Mobbin) found the
bones are sound but the navigation hides the whole point: the governance
surfaces that ARE the pitch — sign-off, Activity/audit, Approvals, "what the AI
saw" — are not in the matter rail. The workspace currently reads as a chat box
with a metadata card. Frontend-only; no backend/migrations. Four file-disjoint
work-streams:

- **WS1 — Rail/IA backbone** (`tabs/types.ts`, `MatterDetail.tsx`, `Sidebar.tsx`):
  promote Activity + Approvals + Outputs to first-class rail; wire
  create→review→sign→export entry points; give Export/Close/Delete a real home
  (not an 11px link); rename the three near-identical "Skills" surfaces; move the
  capability-grant panel out of the Skills tab to an operator route. URL keys are
  NOT renamed this pass (deep-link/test stability).
- **WS2 — Overview dashboard** (`tabs/OverviewTab.tsx`): parties, dates, doc
  count, outstanding sign-offs, recent activity, retention clock, and a
  self-completing happy-path checklist; model/posture demoted to a quiet "Matter
  settings" block.
- **WS3 — Create + jargon + state** (`NewMatter.tsx`, `MatterList.tsx`,
  `posture.ts`, `SignOff.tsx`): `matter_type` free-text → select (a real bug —
  free text breaks type-aware suggestions); cut invented jargon ("pivot fact",
  "the instrument", heavy "cause list" voice); posture text chip + distinct
  colours.
- **WS4 — Chat dedup + weighty sources** (`AssistantTab.tsx`): make "Sources /
  what the AI saw" a weighty affordance, not a grey line; reconcile duplicate
  model/attach/pause controls.

Goal of N0: a coherent **evaluation** workspace a lawyer can drive end-to-end and
trust the record of — not "production-ready for live client matters" (see Gap
section).

### N1 — Prove chronology quality

Run the chronology builder with a real Anthropic key against non-client legal
packs and inspect:

- event recall
- date normalization
- source ranges
- CPR 31.22 taint propagation
- false positives that would waste reviewer time

Do not market chronology auto-build as tight until this is done.

### N2 — Production-grade operational proof

Before any serious pilot:

- confirm hosted app DSN uses the restricted app role
- rehearse restore/PITR on schedule, not just once
- rehearse encryption key rotation
- decide when the hosted worker should run continuously
- add monitoring and incident/runbook ownership

### N3 — Scale and workflow hardening

The next technical debt cluster is predictable:

- pagination on unbounded lists
- index on `created_by_id`
- external-pack N+1 cleanup
- streaming large document bodies
- durable background jobs and retry semantics
- drafting/editor flow if the product needs end-to-end written outputs

## Honest Call

Legalise is no longer just a governance shell. P1-P4 make the core claim real
enough for evaluation: matter-scoped AI, audited retrieval, cited evidence,
human sign-off, and a reconstructable record.

It is still not live-client ready. The next decision is whether to prove the
chronology and operational pieces well enough for a controlled private beta, or
keep it explicitly as a forkable governed-agent reference implementation.

## Gap to live-matter readiness

What a lawyer actually needs to run a matter, and where each box stands. "Ticks
all the boxes" is a much higher bar than "coherent workspace" — and part of it
is not an engineering problem.

| Box | Status |
|---|---|
| Create / organise a matter | ✅ have (N0 makes it coherent) |
| Documents: upload / bulk / delete / search / versions / anonymise | ✅ have |
| Interrogate the file (retrieval) | ✅ real — quality good only with a real model key |
| Build a chronology | 🟡 plumbing done; extraction quality unverified → **N1** |
| Draft work product | 🟡 artifacts + editor exist; end-to-end drafting flow not wired → **N3** |
| Install skills | 🟡 import-as-draft + trust ceremony work; **signed end-to-end catalogue install is still draft-only** (v0.2 finish line) |
| Review → sign-off → audit trail | ✅ strong — the differentiator |
| Export / working pack | ✅ have |
| Firm multi-user: roles, four-eyes, supervision, SSO | ❌ firm-role gates dormant by default; no SSO; single-workspace by design |
| Data/regulatory: enforced retention, DPIA, certifications, IDTA, residency | ❌ retention recorded-not-enforced; no SOC2/ISO/CE; DPIA owed |
| Operational: backup/restore, key rotation, monitoring, incident | ❌ → **N2** |
| Firm-side: PII insurance AI exclusions, supervision policy | ❌ not ours — the firm's responsibility |

Reading: **green + N0 = an excellent evaluation workspace** that ticks the
daily-work boxes and tells its own trust story. **Amber = key-gated** (validate
with a real key + finish signed skill-install) before any "production-ready"
claim. **Red = a program**, and the regulatory/insurance/supervision rows are
the firm's call, not code. Flipping "not for live client matters" off is a
firm/regulatory decision, not a commit.
