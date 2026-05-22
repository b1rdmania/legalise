# Legalise: Executive Summary

## What this is

Legalise is a UK-native legal AI workspace for England & Wales. Matter-first. Privilege-preserving. Built on top of the `claude-for-uk-legal` plugin suite. Open source under Apache 2.0.

It shows what a UK AI-assisted legal practice could look like. Built for solicitors to read, developers to extend, and investors to evaluate.

## What this is not

- A production tool. v1 is a demo with substance, not something a regulated practice runs live matters on.
- Legal advice software. Every output is a draft for solicitor review.
- A general legal-tech SaaS. It is opinionated about UK practice and does not target US, Scotland, or NI workflows.
- A wrapper. The plugins ship as their own repo. The workspace is the matter-first UI and orchestration layer that composes them with audit, privilege, and matter context.

## Strategic position

Four things are happening in 2026:

1. **Anthropic shipped `claude-for-legal` for US workflows.** April 2026. 1,100+ stars in three weeks. The plugin model for legal AI is now first-party.
2. **Stella shipped an open-source legal workspace.** 87 stars in 10 days, US-shaped, Apache 2.0. Workspace primitives (matter, document, tabular review) now exist as community infrastructure.
3. **Mike owns the broad open-source Harvey / Legora lane.** Auth, projects, document assistant, tabular review, workflows, hosted demo, and strong OSS momentum. Legalise should not compete as a generic "open-source legal AI workspace"; that fight is already better served elsewhere.
4. **No UK supervised-autonomy workspace exists.** English & Welsh law differs from US law in every meaningful procedural and substantive way for these workflows. The UK gap is narrower than "workspace", but sharper: solicitor-supervised AI inside matter context with audit, privilege posture, CPR gates, and Git-pinned provenance.

Legalise fills the UK execution-layer gap. `claude-for-uk-legal` is the plugin counterpart to Anthropic's `claude-for-legal`. Legalise is the governed runtime that executes those plugins inside a UK matter.

The longer-term thesis (separate to this codebase) is that a regulated UK ABS, Bird Legal, eventually runs on this stack. The workspace is the credibility artefact for that thesis. The ABS is the moat. The plugins and workspace are the calling card.

## Why the workspace exists

Three audiences see the workspace and each takes something different from it:

| Audience | What they take | What it does for the project |
|---|---|---|
| Developers | Code quality, multi-agent architecture, plugin composition, MCP-ready primitives. Stars, forks, PRs. | Visibility. Recruitment. Compounding GitHub trail. |
| Solicitors | A matter-first workflow they recognise. Pre-Motion, chronology, CPR-letter drafting they could imagine using. | Credibility for future ABS conversations. Pipeline of co-founder candidates. |
| Investors | A demo that proves the thesis is buildable. Regulatory plumbing visible (audit log, privilege posture, local model toggle). | Series A narrative. "We built the workspace; the ABS is next." |

Build priority is developer-first (forks drive everything). Aesthetic priority is solicitor-legible (the shape is the signal). Investor evaluation falls out naturally from the same surface.

## Coverage

England & Wales civil and employment law. Does not cover:

- Scotland (separate procedure, separate ET regime).
- Northern Ireland (RCJ NI, Industrial Tribunals).
- Criminal procedure.
- Family procedure.
- Tax tribunal beyond signposting.

## v1 launch surface: one coherent sample-matter workflow

Per the locked SCOPE.md, v0.1 is **not** five end-to-end modules. The release commitment is one coherent sample-matter narrative threading the spine, the canonical demonstrations, and the plugin bridge. (Post-pivot framing. See `README.md`. The project's identity is an open-source UK legal AI workspace for supervised autonomy; the surfaces below are proof modules, not the project.)

1. **Matter workspace.** The spine. Matter creation, document upload, audit trail, role stub, privilege posture toggle. Materialises to a filesystem-shaped folder (`matters/[slug]/matter.md`, `documents/`, `history.md`) compatible with Stella's schema.
2. **Pre-Motion.** Adversarial premortem pipeline. Four-stage orchestration (Optimistic Analyst → Evidence Inspector w/ 3 parallel sub-agents → Premortem Adversary w/ 4 parallel Opus sub-agents → Synthesiser). Returns the stress-test brief with ranked failure scenarios across procedural / substantive / evidentiary / strategic categories, settlement-posture implications, and the one brutal one-sentence verdict: "if we lose this, this will be why." The canonical demonstration of bespoke-orchestration surfaces. Ported from the existing premotion app.
3. **CPR-letter drafter as plugin-bridge proof.** Matter-aware autofill on top of the existing `cpr-letter-drafter` plugin. Proves one real plugin invocation from the workspace.
4. **Chronology read-only demo.** Seeded fixture, CPR 31.22 implied-undertaking gate, significance tagging, SoF variant filtering. Demonstrates the regulatory shape without v0.1 live extraction.
5. **Contract review.** Visible roadmap tab, clearly labelled v0.2. The proven 4-agent pipeline in counsel-mvp graduates as a port + SDK wiring in v0.2, not as a v0.1 commitment.

Post-pivot, the SDK-extensibility proof is `#/modules` Discovery over `PLUGINS_ROOT`, not a launch-week Plain-English tab. Plain-English is retired from v0.1 unless it returns as a normal v0.2 module.

## Stack

- **Backend:** Python 3.12 + FastAPI. SQLAlchemy + Alembic. Async Anthropic SDK.
- **Database:** PostgreSQL + pgvector.
- **Frontend:** React 19 + Vite + TanStack Router. Tailwind. Shadcn primitives.
- **AI:** Model gateway abstracting Anthropic, OpenAI, and local Ollama. Per-matter privilege posture controls model selection.
- **Storage:** MinIO (S3-compatible) for documents.
- **Infrastructure:** Docker Compose for self-host. Live demo at `legalise.dev` runs on Cloudflare Pages (frontend) + Fly.io `lhr` (backend, default) + Neon Postgres London + Cloudflare R2 (storage). UK-region database and backend; edge CDN and object storage at EU / Western Europe placement. See `infra/deploy/cloudflare.md` for honest residency caveats.
- **Other:** Gotenberg for HTML→PDF, LibreOffice headless for DOCX, Tesseract for OCR (post-v1).

Stack rationale: this is the stack you'd want for a regulated UK ABS in 2026. Boring is correct for regulated infrastructure. Python wins on AI ecosystem and document processing libraries. The same stack ports to production if and when the ABS exists.

## Regulatory plumbing in v1

Demo-grade, real-shaped. Visible in the UI, not hidden behind feature flags.

- Audit log: every model call, document interaction, and tool invocation hashed and recorded with user, matter, timestamp.
- Privilege posture: matter-level setting (A-cleared / B-mixed / C-paused). Enforces plugin gates.
- CPR 31.22 gate: document upload flow records disclosure-source metadata.
- Local model toggle: per-matter switch to Ollama. UI badge confirms no cloud egress.
- UK data residency: documented at the deployment layer.
- Retention policy: matters carry closed-date and retention-until fields.
- Document hashing: every upload SHA-256'd on ingest.

## Build window

3 weeks (18 days) solo. 4 weeks with 25% realistic buffer.

## Launch criteria

Success at end of launch week is **not** measured in stars. The two signals that matter:

1. One solicitor inbound (any solicitor, any role).
2. Stella's maintainer engaging publicly (star, quote-tweet, "we should chat").

If both happen, the workspace did its job. If neither, the GitHub trail still compounds. The workspace + plugins + courtless + the whitepaper read as a coherent build trajectory whether the launch week pops or not.

## What needs to be true for this scope to hold

- Bird Legal MVP code (now located at `/Users/andy/counsel-mvp/`, original name "Counsel") provides pattern references and prompt seeds: multi-agent BaseAgent, matter-first router shape, drafting/timeline/scanner/advisor prompt designs. Used as reference and seed, not wholesale port; rebuilt on the new platform layer so MVP debt isn't carried forward.
- Pre-Motion logic is extractable as a single-turn module. (Confirmed. Already exists as a stateful tool; the simplified single-turn version is what ships in v1.)
- The `claude-for-uk-legal` plugins are stable as the backend for letter drafting and research. (Confirmed. Shipped.)
- Andy ships solo for three weeks without major Lawhive/other distractions. (Risk. Flagged in BUILD_PLAN.md.)

## Reviewer notes

This document and the rest of `/docs` + the scaffolded skeleton are intended for review by another agent before build kickoff. The plan should be stress-tested against:

- Stack choices (Python/FastAPI/React vs. TypeScript/Bun alternatives).
- Module scope (the three surface patterns hold? Pre-Motion is the right canonical demonstration of the bespoke pattern?).
- Regulatory plumbing visibility (is the demo-grade implementation defensible or theatrical?).
- Stella interop strategy (data-schema match enough, or does it need code-level interop?).
- Three-week timeline (achievable solo, or fantasy?).

Critique welcome. Sycophancy not useful.
