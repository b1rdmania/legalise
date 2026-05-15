# Peers in open-source legal AI

There are three open-source legal AI workspaces actively shipping in
May 2026: Stella, Mike, and Legalise. Different shapes, different
jurisdictional focus, different audiences. This page is the honest
map — not a comparison table, not a ranking, not positioning.

## The three projects

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
- **Skills via Git:** Plugin catalogue
  ([github.com/b1rdmania/claude-for-uk-legal](https://github.com/b1rdmania/claude-for-uk-legal))
  rendered into the workspace at a pinned SHA. Fork-and-PR-review is
  the approval workflow

## Where the shapes converge

All three treat a **matter** as the organising primitive — a slug, a
title, parties, documents, audit. All three are self-hostable via
Docker. All three are BYO-provider-key. All three either are
Apache-2.0 or compatible with it as a downstream consumer.

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
the minimum interop surface from the union of the three. Apache-Apache
code can move between Stella and Legalise directly; AGPL boundary
applies inbound from Mike but not outbound to Mike.

## Where the shapes diverge

| Axis | Stella | Mike | Legalise |
|---|---|---|---|
| **Jurisdiction** | Pluralist (i18n by design) | Blank (inherited) | E&W only, deliberately |
| **Audience scale** | Magic Circle | Small / mid firms | Sole practitioner → small firm |
| **Primary differentiation** | Polish + scale + i18n | Drafting baseline + velocity | Regulator-shape + privilege + audit |
| **License** | Apache-2.0 | AGPL-3.0 | Apache-2.0 |
| **Skills extension model** | Internal `skills` package | Workflow packs (RFC open at #33/#34) | Git catalogue at pinned SHA |

## Honest caveats

- **Stella ships more polish than Legalise.** Their frontend system is
  more developed; their workspace isolation is more rigorous (`SafeId`
  branded contexts vs Legalise's per-user slug tenancy).
- **Mike ships more drafting surface than Legalise.** Their
  track-changes document editor is the cleanest in the OSS legal AI
  space.
- **Legalise's regulator-shape wedge is the differentiator.** Audit by
  default, privilege posture, CPR 31.22 gate, retention as a
  first-class field. These are not parity features against Stella or
  Mike; they're the v0.1 thesis.

## How the three projects interact

- **Conversation is open.** Andy has informal channels with both Jan
  and Will. The matter wire-format RFC is filed publicly so the
  conversation surfaces in the open.
- **Code can flow between Stella and Legalise** under matching
  Apache-2.0 licenses. Code can flow into Mike from either, but not
  out — AGPL-3.0 is one-way friction.
- **None of the three is the alternative to the others.** Stella is
  European Magic Circle scale; Mike is jurisdiction-agnostic SMB law
  firm; Legalise is UK sole-practitioner-to-small-firm. A firm
  procuring open-source legal AI could pick the one closest to their
  shape — or run more than one alongside each other if the matter
  wire-format RFC lands.

## What you can do

- **Fork any of the three.** Legalise's Apache-2.0 puts no
  restrictions on internal-firm forks.
- **Submit a module to the `claude-for-uk-legal` catalogue.** Public
  submission flow at `legalise.dev/#/modules/submit` (post-launch).
  PRs land on
  [github.com/b1rdmania/claude-for-uk-legal](https://github.com/b1rdmania/claude-for-uk-legal)
  for review.
- **Comment on the matter wire-format RFC.** Discussion thread at the
  Legalise repo. Counter-proposals, schema forks, and
  jurisdiction-extension packs all welcome.
- **Try Stella + Mike too.** They're solving adjacent problems
  honestly and you should know all three before picking what fits
  your firm's shape.
