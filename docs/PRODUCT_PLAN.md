# Product Plan — Legalise

> Working plan, reconciled from two independent agent reviews and adjusted for
> current repo reality. Sequenced by leverage and by what one person can
> realistically finish. Not a roadmap promise — a build order.

## Identity (what we are actually trying to win)

Legalise will not out-feature the funded legal-AI workspaces solo. It can be the
only one whose **agent's every information-access and every output is inspectable
and governed**. The substrate for that already exists and is honest: matter
isolation, audit hash chain + WORM, posture gate, advice-boundary gate, CPR
31.22 redaction, source anchors, sign-off with hash-pinning, export.

The gap is the *doing* layer. We built the accountability half first; the work
half (understand the file → interrogate it → produce work) is thin. The job of
this plan is to make the doing layer coherent enough that the governance layer
has something worth governing — without ever overclaiming.

**House rule (unchanged):** evaluation / forkable workspace, not live-client
ready. No "AI sees the whole matter" until retrieval is real.

## The shape of the gap

| Strong (the substrate) | Weak (the product) |
|---|---|
| audit chain / WORM / register | agent coherence (sees 3 recent or hand-picked docs) |
| posture + advice-boundary gates | retrieval (pgvector installed, unused) |
| CPR 31.22 chronology gate | per-document delete/archive (missing) |
| sign-off + hash-pinning | matter overview / dashboard (missing) |
| export / working pack | source-anchor click-back to passage |
| source anchors | chronology auto-build |
| anonymisation, original-file (audited) | first-run happy path tightness |
| bulk upload + document search (exist) | drafting/editor flow (parked) |

## Build order

### P1 — Forkable & usable (days–1 week)
Nothing lies, nothing visibly broken, the happy path is obvious. Shareable as an
honest open experiment with zero exposure. **No RAG required.**
- Per-document **delete / archive** (backend endpoint + UI).
- Surface **matter delete/archive** in the UI (backend already exists).
- **Matter overview / dashboard**: parties, key dates, doc count, outstanding
  sign-offs, retention clock, recent activity — instead of a bare tab strip.
- **Tight first-run happy path**: create matter → add docs → ask assistant →
  run skill → sign → export. Keep it obvious in the README.
- Honest **empty states**; finish the "sees the matter" softening across
  README / TRUST / ARCHITECTURE (AGENTS.md already done).
- Minimal fix to the summary→document-reader misroute (answer inline; "open"
  is secondary — proper click-back lands in P4).

### P2 — Coherent assistant: the matter spine (≈1 week)
Make the agent coherent *before* building retrieval. Inject a structured spine
every turn (cheap — metadata, not bodies):
- matter type, parties/facts, privilege posture
- **document index** (every doc's title/type/date — not contents)
- chronology digest
- outstanding outputs / sign-offs
- The assistant **explicitly states what it has not read.**

This alone fixes most incoherence ("what contracts do I have here?" works) and
removes the blind-to-the-file feeling without any embeddings.

### P3 — Audited retrieval (the real product build, ≈2–3 weeks)
The one genuine engineering investment, and the differentiator.
- Embeddings generated **async on upload** into pgvector, chunked; hybrid
  (semantic + keyword) search. Track indexing status; provide a reindex path.
- `search_documents(query)` and `read_document(id)` as **governed, audited
  tools** the agent calls — not passive stuffing.
- **Log every search and read.** "What did the AI see?" becomes a precise,
  replayable audit trail. This is thesis-reinforcing, not just a feature.
- Scales to hundreds of docs because we retrieve the few that matter, never
  stuff the whole set. Turns "AI sees the matter" into a true, demonstrable
  statement.

### P4 — Review & legal depth (≈3–4 weeks)
- **Source-anchor click-back** to the exact document / passage / search hit.
  Central to review-before-sign-off.
- **Chronology auto-build**: extract dated events from docs into proposed
  entries the user reviews/accepts; CPR 31.22 auto-flag on disclosure-sourced
  events. (After retrieval — depends on it.)
- **Drafting flow**: draft → edit/revise → sign-off → export, wired end to end
  (verify the parked editor stack first).
- Dashboard refinements, document type/date fields, better tags.

### P5 — Production-grade hardening (months, before any pilot)
- Org/team model, roles, SSO/MFA.
- Hosted WORM app-role split live (currently CI-only).
- Restore / PITR rehearsal; key-rotation rehearsal.
- Retention sweep jobs, monitoring, incident process, dependency policy.
- Pagination on unbounded lists, index on `created_by_id`, fix external-pack
  N+1, stream large document bodies, durable background jobs (arq).

## The honest call (solo capacity)

- **P1 now, regardless.** Cheap; converts "looks broken" into "honest
  experiment." Then it is safe to post.
- **P2 is cheap coherence.** Big perceived improvement for little code.
- **P3 is the real fork.** ~2–3 weeks of genuine work (async embedding pipelines
  have teeth). This is the LawJam wall — "can't build it solo and it's buggy."
  Decide honestly: solo, or bring a hand for the retrieval pipeline specifically.
- **Do not start P4 before P3.** And question whether to chase the full
  workspace at all: **P3 alone delivers the governed-agent identity nobody else
  has.** If forced to finish one thing, finish P3.

Spine of the recommendation: **P1 → ship as honest experiment → P2 → P3 as the
one real investment → P4/P5 only if it earns the right to continue.**
