# Supervised Autonomy

**Status:** launch definition for the Legalise V1 evaluation release.
**Date:** 2026-05-30.
**Scope:** product thesis and implementation boundary. This is not
legal advice, regulatory approval, or a claim that Legalise is
suitable for live client matters.

---

## Definition

**Supervised autonomy** is legal AI that can advance work on a matter
only inside a bounded supervisory system:

1. The matter file is the organising unit.
2. The AI can use only declared and granted capabilities.
3. Sensitive material is controlled by privilege and disclosure posture.
4. Outputs cite the matter material they relied on.
5. **A named human signs the output as a record of professional
   judgement before it leaves the workspace.**
6. Every model call, module action, gate decision, sign-off, and
   override is recorded in an audit trail and reconstructable.

The point is not "AI replaces the solicitor". The point is:

> AI can do more work only when the system makes supervision,
> provenance, permissions, source-grounding, and named professional
> accountability first-class.

---

## What Legalise V1 Implements

V1 ships an evaluation workspace around the Khan v Acme sample matter.
The shipped surface includes:

- **Matter-first workspace** with the four-tab loop
  (`Chat` / `Documents` / `Skills` / `Record`) plus signed outputs and
  the working-pack export.
- **Documents** as first-class records: ingress, extraction, versions,
  optional anonymisation, original-file retrieval through an
  owner-only backend proxy, and a `document.original.accessed` audit
  row on successful access.
- **Capability gates:** manifests declare what a module needs; the
  workspace grants it on a matter; the runtime checks it at every
  privileged boundary.
- **Privilege posture + advice-boundary gates** before every model
  call.
- **BYO model keys**, AES-256-GCM-encrypted per user. Legalise itself
  does not provide model access.
- **Two module runtimes:** first-party native modules
  (`examples.contract-review`, `examples.pre-motion`), and a `prompt`
  runtime for Lawve `SKILL.md` imports.
- **Source anchors v1** across both runtimes: server-known document
  anchors for every loaded document (independent of the model);
  optional model claim enrichment with `quote_found_in_source`, a
  normalised substring check of the model-supplied quote against the
  extracted document body. Anchors are *cited for review*, **not
  certified** — the flag means the runtime located (or did not locate)
  the quoted text in the source body it holds.
- **Professional Sign-Off:** the author reads an AI-prepared output
  and records `signed` / `signed_with_observations` / `rejected`.
  Append-only history. The exact output payload (including its
  anchors) is pinned by a hash; the signature attaches to the hash.
  The Record promotes sign-off as a foreground decision event.
- **Supervisor Review** remains available as an optional separate
  review path. It does not compete with the author sign-off path; it
  is the firm-mode "second pair of eyes" surface.
- **Export Gating v1.1:** the matter export ZIP carries documents,
  artifacts (with `signoff_status` per output and a
  `signoff_hash_matches` integrity flag), `signoffs.json`,
  `reviews.json`, and a reconstruction timeline. The export README
  describes the honesty boundaries (cited-for-review, not proof).
- **Audit reconstruction:** an ordered timeline merged from audit,
  state-machine, and advice-boundary sources, with decision events in
  the foreground lane.

Safe launch wording:

> Legalise is an open-source evaluation workspace for solicitor-owned
> AI preparation. AI prepares outputs against matter documents;
> outputs carry their cited sources; a named author signs the output
> as a record of professional judgement; the matter file preserves
> what was signed.

Unsafe launch wording:

> Legalise has solved supervised autonomy for regulated practice.

---

## What V1 Does Not Implement

V1 is not, and does not claim to be:

- a regulated law firm;
- a substitute for an SRA-supervised practice;
- a certifier of legal correctness;
- a verifier of source citations — `quote_found_in_source` is a
  literal-text presence check against the extracted body Legalise
  holds, *not* a claim that the cited material supports the legal
  claim;
- an approval gate that blocks downstream use — Supervisor Review is
  advisory and audited; author sign-off is product-binding but not a
  legal "approval".

Specific items still on the live-matter readiness ledger:

- WORM enforcement at the database level. The append-only audit
  trail is enforced by application convention today; Postgres-level
  REVOKE UPDATE/DELETE for the app role is a future gate. The
  current trail is therefore not forensically tamper-resistant
  against a DB superuser.
- Cryptographic signature verification on installed modules.
  Signature checking today is structural; sigstore Rekor + X.509
  chain + OIDC identity claim verification is hardening backlog.
- Configurable cloud prompt shroud with matter-scoped encrypted
  token maps.
- Legal-quality evals for grounding, citation integrity, refusal
  behaviour, unsupported facts, non-existent source IDs, and
  module-specific regressions.
- Durable long-running jobs across all module runtimes.
- Automatic retention purge.
- Hosted-evaluation limits on storage, workflow runs, active jobs,
  generated artefacts, and public module submissions.

These are roadmap items, not hidden features.

---

## Prior Art And Positioning

Relevant public signals:

- Flank describes supervised rollouts, task-level supervision,
  thresholds, a supervision cockpit, and approve / edit / escalate
  queues. It also names Simmons & Simmons as launch partner for
  partner-firm supervision.
- Flank's own category argument distinguishes assistants from systems
  where confidence / risk routes work into a supervision queue.
- The SRA's effective-supervision guidance stresses oversight while
  work is live, supervisor accountability, and checks of substantive
  legal quality, sign-off policies, ethics / regulatory issues, and
  file management.
- The SRA's Garfield AI approval note emphasises quality checks,
  confidentiality, conflicts, hallucination risk, client approval
  before steps, supervision / monitoring, and named regulated
  solicitors remaining accountable.
- The Law Society's 2026 AI commentary centres confidentiality, data
  security, accuracy, oversight, liability, and clearer practical
  guidance.

Legalise's defensible claim:

> Legalise is an open-source substrate for solicitor-owned AI
> preparation, with named human sign-off and source-anchored outputs
> as first-class primitives. It is an evaluation tool, not a regulated
> service.

Not:

> Legalise is the first legal AI supervision system.

---

## Worked Example: Khan v Acme

The V1 flow:

1. Open the Khan matter.
2. Documents are present (seeded) or added through the Documents tab.
3. Disclosure-tainted entries are flagged; the chronology gate
   requires acknowledgement before detail renders.
4. From Chat or the Skills tab, run a governed skill against matter material
   under declared, granted capabilities.
5. The action emits an output that carries its **source anchors** —
   the documents it used, and (where the model returned a quote) a
   `quote_found_in_source` flag.
6. The author reads the output with cited sources visible, then signs:
   `signed`, `signed_with_observations` (free-text reasoning), or
   `rejected`. The exact output payload is pinned by hash. The
   sign-off event lands in the Record as a foreground
   decision row.
7. Export the matter; the bundle preserves documents, audit,
   reconstruction, outputs, sign-off status, and integrity flags.

A separate-reviewer pass (Supervisor Review) is available when a
second pair of eyes is wanted — it is the firm-mode path, not the
default loop.

---

## Launch Copy Guard

Use:

> Open a matter. Add documents. Run skills. Review outputs
> with cited sources visible. Sign the output as a record of
> professional judgement. Export the matter record.

Avoid:

> Legalise has solved supervised autonomy.

Avoid:

> Nobody in legal AI has shipped this.

Use:

> I have not seen these primitives — named professional sign-off,
> document-grounded outputs with an honest quote-presence check, and
> a defensible export — made inspectable as an open-source UK legal
> AI evaluation workspace.

Use, specifically about source anchors:

> Sources are cited for review. Legalise does not certify they
> prove the claim. A `quote_found_in_source: false` flag means the
> quoted text was not located in the source body Legalise holds —
> not that the legal claim is false.

---

## Source Notes

- Flank product page: https://flank.ai/product
- Flank blog, "The ChatGPT Moment for Legal Agents":
  https://blog.flank.ai/the-chatgpt-moment-for-legal-agents/
- SRA effective supervision guidance:
  https://www.sra.org.uk/supervision-guidance
- SRA Garfield AI approval note:
  https://media.sra.org.uk/news/news/press/2025-press-releases/garfield-ai-authorised/
- Law Society AI and lawtech hub:
  https://www.lawsociety.org.uk/topics/ai-and-lawtech
- Law Society press note on AI risk guide:
  https://www.lawsociety.org.uk/Contact-or-visit-us/Press-office/Press-releases/Law-Society-publishes-new-guide-warning-over-AI-risks
