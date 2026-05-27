# Post-Phase-17 Backlog (non-binding candidates)

Started 2026-05-27. Not a roadmap, not a commitment — a place to
park substrate-level work surfaced during Phase 17 prep so it's
not lost. Each entry has enough detail that a planning session
can pick it up cold.

Reviewer holds the priority and order. Nothing here advances
without ratify.

---

## P18-A — Document Parser reference module

**Trigger:** Phase 17 inventory + an Andy/agent exchange on
OmniParse (2026-05-27). Document ingestion is the missing first-
class feature for a legal-AI workspace. Every comparable
evaluator-facing tool has a PDF → structured-text pipeline; we
have Gotenberg for rendering but no parse layer.

**Posture: we build this ourselves, informed by OmniParse, not
based on it.** OmniParse demonstrates the value shape (local
PDF → markdown, sidecar service, GenAI-ready output) but its
scope is too broad (video / audio / web) and its licence is
GPL-3.0. Zero OmniParse code in the Legalise tree. Engine
choice (Marker) is a direct dependency on Marker's own
library, not on OmniParse's wrapping of it.

**Shape (consistent with the architecture-rewrite line):**

- Capability module, not backend feature.
- Declares `documents.parse` (or similar) in its v2 manifest.
- Installs via the existing trust ceremony.
- Granted per matter, audited per parse.
- Posture-aware: parse calls inherit the matter's privilege flag.
  `B_mixed` and `C_paused` matters parse without leakage to a
  cloud OCR API (local engine only).
- Ships installed-by-default as the third reference module
  alongside Contract Review and Pre-Motion.

**Engine choice (legal-document parsing only — not the
everything-parser OmniParse is):**

- **Marker (Apache 2.0)** is the recommended starting bet for
  dense PDF → markdown. Direct dependency on the Marker
  library, not via OmniParse.
- Docling (MIT, IBM) is the fallback if Marker proves wrong for
  legal docs in practice.
- **Out of scope:** audio transcription, video, web scraping.
  OmniParse bundles all of these; we don't need them. If we
  later want any of them, they become their own capability
  modules, not bolted onto this one.

**Architecture:**

- Sidecar service in compose; own container, own healthcheck.
- Backend calls it via HTTP — matches the gateway → provider
  pattern already in place.
- New `parse_jobs` table (or hook into existing artifact / job
  pipeline) for async work.
- Audit emissions: `documents.parse.requested`,
  `documents.parse.completed`, `documents.parse.failed`.

**GPU question:**

- Marker wants a GPU for reasonable latency.
- Fly LHR currently has no GPU machines.
- Options: (a) provision GPU on a separate host, (b) accept
  CPU latency for hosted prod and document it, (c) fork a
  smaller-model parse path for the hosted demo and let
  self-hosters pick their tier.
- Decision deferred to plan-step.

**Honest scope estimate:** 1–2 weeks. Sidecar Docker setup,
capability module + manifest, backend route + audit emissions
+ posture gate, frontend upload + view-result surface, trust
ceremony coverage, pytest + e2e, docs. Not a sub-step — its
own phase.

**Open question:** does this belong as Phase 18, or folded into
the architecture-rewrite's launch connector slate (Companies
House, legislation.gov.uk, doc reader, provider modules)?
Reviewer's call.

---

## P18-B — Bug: signup form returns HTTP 404 (walkthrough finding L-2)

**Trigger:** Andy-fallback walkthrough 2026-05-27 17:23 BST.
Logged in `PHASE_17_COLD_WALKTHROUGH.md` as finding L-2.

**Symptom:** POST from `/auth/signup` → `Error · HTTP 404`.
Blocks new account creation.

**Why it matters:** Phase 17 walkthrough is blocked until this
is fixed (cold evaluator cannot register). Also a real
forker-experience regression.

**Not yet diagnosed.** Likely candidates: fastapi-users router
prefix drift, frontend pointing at wrong endpoint path,
`VITE_API_BASE_URL` mismatch with backend mount. Needs
investigation before scoping.

---

## P18-C — Bug: backend pytest red on master after Phase 16 merge

**Trigger:** CI run 26514572895 on master @ a364952.

**Symptom:** `test_invoke_posture_block_returns_403` returns 500
instead of 403. Server log surfaces `audit_entries is
append-only` errors (UPDATE + DELETE attempts blocked by the
WORM trigger).

**Diagnosis hypothesis:** the 500-path is attempting to mutate
an existing audit row instead of appending a new one. Suggests a
regression where a code path bypasses the
`app.core.api.audit_failure` helper Phase R3 mandated. Six
failure paths route through that helper today; this one likely
doesn't.

**Why it matters:** Phase 15 e2e remains green and is masking
this in CI overall. Substrate doctrine ("audit_entries is
append-only") is the regulator-facing claim — a test landing on
this exact failure mode is a P0.

---

## P18-D — Stale `worktree-agent-*` directories

Three sub-agent worktree branches still in `git worktree list`:

- `worktree-agent-a2244fa89422353aa` — upload validation: 25 MB
  cap + MIME allowlist (`255ba37`)
- `worktree-agent-a52f0d6df69637a5f` — provider-key-missing:
  unified backend error shape + frontend banner (`ae65e9e`)
- `worktree-agent-ac621250c350397c0` — provider upstream errors:
  structured 502 + audited UI surface (`b76851e`)

**Action:** review each branch; salvage any unmerged work into a
sub-step PR or prune. Not blocking but accumulates.

---

## P18-E — Audit export

Mentioned in earlier planning. Audit reconstruction surface
exists; an export-to-PDF or export-to-CSV path for a matter's
audit trail would let a regulator or insurer take a copy
offline. Bounded scope: one export endpoint, signed bundle, no
new substrate semantics.

---

## P18-F — Security hardening sweep

Pre-public-launch checklist. Inputs:

- WORM role split (R2 item #7 from substrate hardening; still
  on Andy's desk).
- Enqueue-counting policy (R2 item #5; defaulted to "count
  attempts").
- Secret rotation runbook (encrypted provider keys).
- Rate-limit posture on `/auth/*` endpoints.

Substrate-side; touches `backend/app/**` so explicitly out of
Phase 17 scope.

---

## P18-G — Module DX

Make writing a new capability module less hand-rolled. Today
the path is "read MODULE_DEVELOPMENT.md, copy an example,
hand-craft a manifest, wire into discovery." A
`legalise module new <name>` scaffold + a validator that
explains failures in module-author language (not JSON Schema
language) would lower the new-module bar significantly. Needed
before the public open-source release if we want third parties
to actually write modules.

---

## P18-H — Document Redliner

Mentioned in the master branch's plan commits (`823c4cf`).
A capability module that surfaces a tracked-changes editing
flow inside the matter — Phase 17 inventory should surface
whether the existing document-edit surface already covers
this or whether it's a distinct module.

---

## P18-I — Lawve AI skill submissions

**Trigger:** Anthropic launched Claude for the Legal Industry
on 2026-05-20 with Lawve AI as the curated skill catalogue +
MCP connector. Lawve manually reviews submissions; permissive
licences (MIT / Apache 2.0 / AGPL) standard; submission via
PR to `lawve-ai/awesome-legal-skills`.

**Why submit:**

1. Distribution: every Claude user who installs the Lawve
   connector can discover the skills.
2. Credibility signal for SRA pre-app + YC framing —
   "practitioner-authored, curated" is the kind of marker that
   travels.
3. Free brand placement (Andy + Legalise link on each listing).
4. Strategic alignment with the architecture-rewrite line —
   Lawve is the spec layer (discovery/distribution), Legalise
   is the runtime layer (matter-scoped, posture-aware, audited).
   Submitting positions Legalise to add "installs Lawve skills
   natively" as a future capability via MCP.

**Precondition:** verify per-skill licence headers in
`claude-for-uk-legal` repo. Repo root has a `LICENSE` — confirm
it's permissive (Apache 2.0 or MIT) and add SPDX headers in
each `SKILL.md` if missing. One-PR fix before submissions.

### Submission batches

The pattern: every batch carries one obvious-legal-procedure
skill AND one esoteric methodology skill. That mix is what
makes Andy-as-author distinctive vs another solicitor who just
submits drafters.

**Batch 1 (first 3 — establishes presence + range):**

1. `pre-motion` (from claude-for-uk-legal) — adversarial
   premortem on UK litigation matters. Biggest skill, most
   distinctive methodology, narrates Legalise's thesis.
2. `memo` (from `/Users/andy/Cursor Projects 2026/memo`) —
   three-audience legal memo (client / junior / senior) with
   cited claims + confidence levels. Practitioner-shaped,
   unusual.
3. `unfair-dismissal-screener` (claude-for-uk-legal) — decision
   tree against s.94 ERA framework. Screeners are rarer +
   higher-value than drafters.

**Batch 2 (esoteric depth — once Batch 1 lands):**

4. `acas-early-conciliation` — s.18A "stop the clock"
   computation; checkable correctness.
5. `disclosure-list` — Standard vs Extended Disclosure,
   procedure-heavy.
6. **Kramer v AI Nash settlement bands** — if the divorce
   game-theory logic crystallises as a standalone skill
   post-Lawhive Saturday, this is category-of-one in Lawve's
   catalog. UK family law + Nash equilibrium = distinctive.
7. **Courtless dispute-audit / settlement-band logic** —
   consumer-dispute version of the same shape; could become
   "structured negotiation envelope generator."
8. `premortem` (generic Klein-method version from
   `~/.claude/skills/premortem/`) — pre-motion is the legal
   application; this is the meta-methodology. Lawve catalogues
   both legal AND methodology skills.

**Batch 3 (cross-cutting + canonical fillers):**

9. `plain-english` — Orwell/Gowers methodology, strips AI tics.
   Real value as "redraft this for a lay client."
10. `date-diligence` re-cut — the 6-phase pipeline (social →
    footprint → claims → steelman → brief) repositioned as
    **opposing-party diligence** or **witness-statement
    steelman**. Same methodology, legal context.
11. `part-36-offer`, `without-prejudice-drafter`, `chronology`,
    `settlement-agreement-review` — solid canonical fillers.
12. `skill-auditor` — meta-methodology. Recursive value
    (Lawve's reviewers may use something similar themselves).

**Probably skip for Lawve specifically:**

`find-case-law`, `citation-verifier`, `legislation-lookup`,
`practice-direction-lookup` — tool wrappers around public APIs.
Useful inside Legalise's integrated workflow; weaker as
standalone Claude skills. Submit later if Lawve's catalogue
direction includes tool wrappers.

`et1-claim-drafter`, `lba-drafter`, `cpr-letter-drafter` —
templated drafters; lower methodology signal. Submit after the
distinctive ones if engagement is good.

### Author framing

Author = Andy Williams. Project affiliation = Legalise (with
link to the repo + legalise.dev). Position skills as
practitioner-authored UK methodology, NOT as "examples for a
runtime." Legalise's runtime framing is the separate story;
to Lawve, these are standalone Claude-native skills that happen
to also work inside a matter-scoped runtime if anyone wants
that.

### Risks / caveats

- Manual review may reject some submissions. Plan for it; the
  first batch is the strongest, so rejection there would be a
  signal to refine before the rest.
- Engagement obligation: once listed, expect issues / questions
  / update requests. Small ongoing cost.
- Lawve is new (renamed from Lawvable; ~6 months old as a
  product). If they pivot or fold, value diminishes — but
  submitting is reversible.
- IP: confirm the Kramer + Courtless skills are extractable
  without leaking strategic IP (the Nash band methodology is
  arguably valuable enough to be a Legalise-specific moat
  rather than a Lawve giveaway). Reviewer's call.

---

## Reviewer notes

- This file is non-binding. Order, priority, and inclusion all
  reviewer-driven.
- Anything added here should be specific enough that a planning
  conversation can pick it up cold — symptom, why-it-matters,
  candidate shape if known.
- Bugs (P18-B, P18-C) probably should NOT be backlog — they
  should jump the queue. Listed here for completeness while we
  decide.
