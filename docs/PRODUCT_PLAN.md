# Product Plan — Legalise

> Where the product stands and where it's going. A status-and-next plan, not a promise that the project is live-client ready.

## What we are trying to win

Legalise will not out-feature the funded legal-AI workspaces. It can be the one whose **agent's information access and outputs are inspectable and governed**: matter isolation, audit hash chain + WORM guard, posture and advice-boundary gates, CPR 31.22 redaction, source anchors, sign-off with hash-pinning, export, audited retrieval, and source click-back.

This cannot be launched as a full legal practice system. The question is whether it is coherent as a forkable evaluation workspace: create a matter, add documents, ask governed questions, see what the AI saw, review cited passages, sign or reject outputs, and audit the record afterwards.

## What the product does today

- **Workspace.** Create and organise a matter, with the matter overview as the default landing surface. Per-document delete/archive; matter close/delete in the UI; honest empty states about what the assistant has seen.
- **Matter spine.** Every chat turn carries cheap structured context — matter type, parties, facts, status, model, AI-access posture, document index, chronology digest, outstanding sign-offs — with explicit framing about unread or unindexed material.
- **Audited retrieval.** Documents are chunked and indexed on upload; embeddings stored in pgvector with a generated full-text vector. Retrieval is hybrid vector + keyword over indexed matter documents only, writing `retrieval.search` audit rows with hit counts and document/chunk evidence. The default Docker image pre-warms `BAAI/bge-small-en-v1.5`; slim installs use a deterministic hash backend. Seed matters auto-index. This is the core differentiator: "what did the AI see?" is a replayable audit trail, not a vague prompt claim.
- **Review loop.** Answers persist cited passages with source ranges; the UI links citations back to the exact passage. Activity reads like a story, not a raw event dump. Model selection is clear at matter creation and in settings; matter status and AI-access posture are no longer conflated.

The honest caveat: **chronology extraction quality is not yet product-proven.** The auto-build plumbing exists, but needs a real keyed run against synthetic legal packs before the extracted-event quality can be trusted.

## Current shape

| Strong now | Still needs hardening |
|---|---|
| audit chain / WORM / register | hosted app role split confirmation |
| posture + advice-boundary gates | restore and key-rotation rehearsal cadence |
| CPR 31.22 chronology gate | chronology extraction quality with a real key |
| sign-off + hash-pinning | drafting/editor flow still parked |
| export / working pack | org/team model, SSO/MFA |
| source anchors + click-back | pagination and large-document scaling |
| audited hybrid retrieval | durable worker/runtime operations |
| matter overview + clearer model selection | production monitoring and incident process |

## What's next

- **Prove chronology quality.** Run the builder with a real model key against non-client legal packs and inspect event recall, date normalization, source ranges, CPR 31.22 taint propagation, and false positives. Do not market chronology auto-build as tight until this is done.
- **Operational proof before any serious pilot.** Confirm the hosted app uses the restricted role; rehearse restore/PITR and key rotation on a schedule; decide when the hosted worker runs continuously; add monitoring and incident/runbook ownership.
- **Scale and workflow hardening.** Pagination, missing indexes, external-pack N+1, streaming large bodies, durable jobs, and an end-to-end drafting/editor flow if the product needs written outputs.

## Honest call

The core claim is real enough for evaluation: matter-scoped AI, audited retrieval, cited evidence, human sign-off, and a reconstructable record. It is still not live-client ready. The next decision is whether to prove the chronology and operational pieces for a controlled private beta, or keep it as a forkable governed-agent reference implementation.

## Gap to live-matter readiness

"Ticks all the boxes" is a much higher bar than "coherent workspace" — and part of it is not an engineering problem.

| Box | Status |
|---|---|
| Create / organise a matter | ✅ have |
| Documents: upload / bulk / delete / search / versions / anonymise | ✅ have |
| Interrogate the file (retrieval) | ✅ real — quality good only with a real model key |
| Build a chronology | 🟡 plumbing done; extraction quality unverified |
| Draft work product | 🟡 artifacts + editor exist; end-to-end drafting not wired |
| Install skills | 🟡 import + trust ceremony; signed end-to-end catalogue install still draft-only |
| Review → sign-off → audit trail | ✅ strong — the differentiator |
| Export / working pack | ✅ have |
| Firm multi-user: roles, four-eyes, supervision, SSO | ❌ firm-role gates dormant by default; no SSO; single-workspace by design |
| Data/regulatory: retention, DPIA, certifications, IDTA, residency | ❌ retention recorded-not-enforced; no SOC2/ISO/CE; DPIA owed |
| Operational: backup/restore, key rotation, monitoring, incident | ❌ |
| Firm-side: PII insurance AI exclusions, supervision policy | ❌ not ours — the firm's responsibility |

Reading: **green = an excellent evaluation workspace** that ticks the daily-work boxes and tells its own trust story. **Amber = key-gated** — validate with a real key and finish signed skill-install before any "production-ready" claim. **Red = a program**, and the regulatory/insurance/supervision rows are the firm's call, not code. Flipping "not for live client matters" off is a firm/regulatory decision, not a commit.
