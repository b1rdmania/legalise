# Peers in open-source legal AI

There are four open-source legal AI workspaces actively shipping in
June 2026: Stella, Mike, Lavern, and Legalise. Different shapes, different
jurisdictional focus, different audiences. This page is the honest
map — not a comparison table, not a ranking, not positioning.

## The four projects

### Stella

- **Repo:** [github.com/stella/stella](https://github.com/stella/stella)
- **Maintainer:** Jan Kubica
- **License:** Apache-2.0
- **Hosted at:** `my.stll.app`
- **Stack:** Bun + Elysia + React/Vite + Turbo monorepo, ~15 packages
- **Audience:** Magic Circle scale, jurisdiction-pluralist (i18n by
  design), European-built
- **Active surfaces:** Matters, document storage with full-text search +
  versioning, Folio (tabular bulk review)
- **Roadmapped surfaces** (per public README "coming soon"): Document
  anonymisation, legal research
- **Distinctive shape:** Production-grade frontend system, SOC 2 / ISO
  27001 posture mandated from day one (per their `CLAUDE.md`),
  workspace isolation via `SafeId`-branded contexts

### Mike

- **Repo:** [github.com/willchen96/mike](https://github.com/willchen96/mike)
- **Maintainer:** Will Chen
- **License:** AGPL-3.0
- **Hosted at:** `mikeoss.com`
- **Stack:** Next.js (App Router) + Express + Supabase + Cloudflare R2
- **Audience:** *"Anyone priced out by Harvey / Legora"* — small/mid
  law firms, jurisdiction-agnostic
- **Active surfaces:** Projects (matter-equivalent), assistant chat
  (global + per-project), document editing with track-changes (the
  headline UX), tabular reviews, workflow packs, generate-docx tool,
  BYO Anthropic/Gemini/OpenAI keys
- **Distinctive shape:** Polished track-changes document editor with
  accept/reject diffs, three built-in finance/M&A workflows
  (Credit Agreement Summary, Shareholder Agreement Summary, CP
  Checklist), fast OSS-Harvey-clone iteration

### Lavern

- **Repo:** [github.com/AnttiHero/lavern](https://github.com/AnttiHero/lavern)
- **Maintainer:** Antti Innanen / AnttiHero
- **License:** Apache-2.0
- **Hosted at:** `lavern.ai`
- **Stack:** TypeScript/Node repo with API server, Vite dashboard,
  menubar/local daemon surfaces, MCP tools, and optional Ollama local
  mode
- **Audience:** Builders and firms exploring a multi-agent legal
  operating model; explicitly framed as a working demo/source of ideas,
  not a finished product
- **Active surfaces:** Instruct line, briefing loop, 67 agent prompts,
  debate protocol, cited findings, verification passes, knowledge shelf,
  provider choice (Anthropic, Mistral, Ollama), and Clawern local-folder
  watch mode
- **Distinctive shape:** **Law-firm-as-software architecture.** Senior
  partner / associate / specialist personas, evidence-backed challenges,
  firm voice injected into engagements, ten-pass verification, local
  retainer mode with cost/budget controls. The useful contribution is
  orchestration shape, not legal-quality proof.

### Legalise (this project)

- **Repo:** [github.com/b1rdmania/legalise](https://github.com/b1rdmania/legalise)
- **Maintainer:** Andy Bird
- **License:** Apache-2.0
- **Stack:** FastAPI + Postgres+pgvector + React 19 + Tailwind
- **Audience:** UK solicitors at sole-practitioner to small/mid-firm
  scale; internal tech teams forking a skills catalogue
- **Distinctive shape:** **Regulator-shape first.** Audit log per LLM
  call and matter mutation, privilege posture (A_cleared / B_mixed /
  C_paused) as a first-class matter property, CPR 31.22
  implied-undertaking gate on chronology entries sourced from disclosed
  documents (server-side, not UI), per-user AES-256-GCM-encrypted
  provider keys, slug tenancy with 404-not-403 cross-user reads,
  signup auto-seeds a Khan v Acme demo matter
- **Skills via Git:** skills import from source repositories — the
  [Lawve catalogue](https://github.com/lawve-ai/awesome-legal-skills) or
  any public GitHub repo with a `SKILL.md` — at a pinned SHA, through
  the trust ceremony. Reviewing the SKILL.md at that SHA is the
  approval workflow

## Where the shapes converge

Stella, Mike, and Legalise treat a **matter/project** as the organising
primitive — a slug, a title, parties, documents, audit. Lavern starts
from an **engagement/instruct** primitive and can watch folders in local
mode. All four are self-hostable or locally runnable. All four are
BYO-provider-key or support local inference. Stella, Lavern, and
Legalise are Apache-2.0; Mike is AGPL-3.0.

A **portable matter wire format** would let documents and matter
metadata move between any of them without information loss in the
core. Legalise has authored a draft at
[`schemas/matter.json`](../schemas/matter.json) and filed an RFC as a
GitHub Discussion. Counter-proposals welcome — the goal is interop,
not authorship.

## Schema overlap

Matter primitives across the three projects, mapped against the
[`schemas/matter.json`](../schemas/matter.json) draft. This is the
field-level shape the matter wire-format RFC tries to converge.

| Primitive | Stella | Mike | Legalise |
|---|---|---|---|
| `slug` (URL-safe matter id) | yes | yes (project id) | yes |
| `title` | yes | yes | yes |
| `parties` (claimant / respondent + role) | partial | partial | yes |
| `documents` (with versions) | yes | yes (with track-changes versions) | yes |
| `audit` (per-event log) | partial (SOC 2 posture) | none in OSS surface | yes (every model call + matter mutation) |
| `chronology` (dated events sourced from documents) | none | none | yes (with CPR 31.22 gate) |
| `privilege_posture` (matter-level access flag) | none | none | yes (A_cleared / B_mixed / C_paused) |
| `jurisdictions` (matter applies under) | metadata | metadata | yes (`["EW"]` only) |

The §4g RFC (filed as a public Discussion at the Legalise repo) draws
the minimum interop surface from the union of the matter-first projects.
Lavern's useful interop contribution is less the matter schema and more
the shape of engagement briefs, agent findings, challenges, and
verification traces. Apache-Apache code can move between Stella, Lavern,
and Legalise directly; AGPL boundary applies inbound from Mike but not
outbound to Mike.

## Where the shapes diverge

| Axis | Stella | Mike | Lavern | Legalise |
|---|---|---|---|---|
| **Jurisdiction** | Pluralist (i18n by design) | Blank (inherited) | Multi-jurisdiction agent roles | E&W only, deliberately |
| **Audience scale** | Magic Circle | Small / mid firms | Builders/firms testing agentic architecture | Sole practitioner → small firm |
| **Primary differentiation** | Polish + scale + i18n | Drafting baseline + velocity | Multi-agent debate + verification loops | Regulator-shape + privilege + audit |
| **License** | Apache-2.0 | AGPL-3.0 | Apache-2.0 | Apache-2.0 |
| **Skills extension model** | Internal `skills` package | Workflow packs (RFC open at #33/#34) | Agent prompts + workflows + MCP tools | Git catalogue at pinned SHA |

## What Legalise should borrow from Lavern

Lavern is most useful as an orchestration catalogue, not as a product
template. Legalise should not copy the "67 agents" surface into the
main UI. It should borrow the parts that reinforce the existing
regulated loop:

- **Review panels, not agents.** When a skill needs multiple model
  perspectives, expose them as a named review panel inside that skill:
  `evidence reviewer`, `counter-evidence reviewer`, `risk reviewer`,
  `source verifier`. In UI, call this a **Review panel**. Keep "agent"
  as internal implementation language.
- **Workspace voice.** Lavern's firm-personality idea maps cleanly to a
  Legalise **Workspace principles** setting: tone, risk posture,
  drafting preferences, source strictness. Inject it into governed
  skill runs, record the version used, and make it auditable.
- **Evidence challenge loop.** Borrow the debate shape: every finding
  must cite evidence; every challenge must cite counter-evidence; the
  synthesiser resolves the dispute. This is a better fit for Legalise
  than autonomous task execution because it strengthens source review
  and sign-off.
- **Verification passes as receipt rows.** Lavern's ten-pass loop should
  become configurable verification passes per skill, with each pass
  recorded in the matter Record. Legalise does not need ten by default;
  it needs a visible, auditable quality loop.
- **Matter watch later.** Clawern's local-folder watch mode is a useful
  future "Matter watch" concept, but it should stay post-v0.1. It is
  powerful only once privilege posture, retention, and notification
  boundaries are boringly correct.

## Honest caveats

- **Stella ships more polish than Legalise.** Their frontend system is
  more developed; their workspace isolation is more rigorous (`SafeId`
  branded contexts vs Legalise's per-user slug tenancy).
- **Mike ships more drafting surface than Legalise.** Their
  track-changes document editor is the cleanest in the OSS legal AI
  space.
- **Lavern ships the boldest orchestration metaphor.** Its partner /
  associate / specialist roles, debate protocol, and local retainer
  mode are a rich idea bank, but the project is explicit that legal
  quality remains a hypothesis rather than a public benchmark.
- **Legalise's regulator-shape wedge is the differentiator.** Audit by
  default, privilege posture, CPR 31.22 gate, retention as a
  first-class field. These are not parity features against Stella or
  Mike or Lavern; they're the v0.1 thesis.

## How the four projects interact

- **Conversation is open.** Andy has informal channels with Jan and
  Will; Lavern is public and Apache-2.0, so the agent-architecture
  conversation can also happen in the open. The matter wire-format RFC
  is filed publicly so the schema conversation surfaces in the open.
- **Code can flow between Stella, Lavern, and Legalise** under matching
  Apache-2.0 licenses. Code can flow into Mike from any of them, but
  not out — AGPL-3.0 is one-way friction.
- **None of the four is the alternative to the others.** Stella is
  European Magic Circle scale; Mike is jurisdiction-agnostic SMB law
  firm; Lavern is an agentic architecture lab; Legalise is UK
  sole-practitioner-to-small-firm. A firm procuring open-source legal AI
  could pick the one closest to their shape — or run more than one
  alongside each other if the matter wire-format RFC lands.

## What you can do

- **Fork any of the four.** Legalise's Apache-2.0 puts no
  restrictions on internal-firm forks.
- **Contribute a skill to the open catalogue.** Publish a `SKILL.md`
  repo on GitHub (importable directly by URL), or submit it to the
  [Lawve catalogue](https://github.com/lawve-ai/awesome-legal-skills)
  for review.
- **Comment on the matter wire-format RFC.** Discussion thread at the
  Legalise repo. Counter-proposals, schema forks, and
  jurisdiction-extension packs all welcome.
- **Try Stella, Mike, and Lavern too.** They're solving adjacent
  problems honestly and you should know all four before picking what
  fits your firm's shape.
