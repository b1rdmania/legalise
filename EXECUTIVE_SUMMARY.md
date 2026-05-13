# Legalise — Executive Summary

## What this is

Legalise is a UK-native legal AI workspace for England & Wales. Matter-first. Privilege-preserving. Built on top of the `claude-for-uk-legal` plugin suite. Open source under Apache 2.0.

It is the workspace that demonstrates what a UK-jurisdiction AI-assisted legal practice could look like — designed to be solicitor-legible, developer-extensible, and investor-evaluatable.

## What this is not

- A production tool. v1 is a demo with substance, not something a regulated practice runs live matters on.
- Legal advice software. Every output is a draft for solicitor review.
- A general legal-tech SaaS. It is opinionated about UK practice and does not target US, Scotland, or NI workflows.
- A wrapper. The plugins ship as their own repo. The workspace is the matter-first UI and orchestration layer that composes them with audit, privilege, and matter context.

## Strategic position

Three things are happening simultaneously in 2026:

1. **Anthropic shipped `claude-for-legal` for US workflows.** April 2026. 1,100+ stars in three weeks. The plugin model for legal AI is now first-party.
2. **Stella shipped an open-source legal workspace.** 87 stars in 10 days, US-shaped, Apache 2.0. Workspace primitives (matter, document, tabular review) now exist as community infrastructure.
3. **No UK equivalent of either.** English & Welsh law differs from US law in every meaningful procedural and substantive way for these workflows. The UK gap is wide open.

Legalise fills the UK gap. It is the **workspace counterpart** to `claude-for-uk-legal`'s **plugin counterpart** to Anthropic's `claude-for-legal`.

The longer-term thesis (separate to this codebase) is that a regulated UK ABS — Bird Legal — eventually runs on this stack. The workspace is the credibility artefact for that thesis. The ABS is the moat. The plugins and workspace are the calling card.

## Why the workspace exists

Three audiences see the workspace and each takes something different from it:

| Audience | What they take | What it does for the project |
|---|---|---|
| Developers | Code quality, multi-agent architecture, plugin composition, MCP-ready primitives. Stars, forks, PRs. | Visibility. Recruitment. Compounding GitHub trail. |
| Solicitors | A matter-first workflow they recognise. Pre-Motion, chronology, CPR-letter drafting they could imagine using. | Credibility for future ABS conversations. Pipeline of co-founder candidates. |
| Investors | A demo that proves the thesis is buildable. Regulatory plumbing visible (audit log, privilege posture, local model toggle). | Series A narrative — "we built the workspace; the ABS is next." |

Build priority is developer-first (forks drive everything). Aesthetic priority is solicitor-legible (the shape is the signal). Investor evaluation falls out naturally from the same surface.

## Coverage

England & Wales civil and employment law. Does not cover:

- Scotland (separate procedure, separate ET regime).
- Northern Ireland (RCJ NI, Industrial Tribunals).
- Criminal procedure.
- Family procedure.
- Tax tribunal beyond signposting.

## v1 modules (5 surfaces)

1. **Matter workspace** — the spine. Matter creation, document upload, audit trail, role stub. Materialises to a filesystem-shaped folder (`matters/[slug]/matter.md`, `documents/`, `history.md`) compatible with Stella's schema.
2. **Pre-Motion** — adversarial premortem pipeline. Four-stage orchestration (Optimistic Analyst → Evidence Inspector w/ 3 parallel sub-agents → Premortem Adversary w/ 4 parallel Opus sub-agents → Synthesiser). Returns the stress-test brief with ranked failure scenarios across procedural / substantive / evidentiary / strategic categories and the one brutal one-sentence verdict: "if we lose this, this will be why." The hero module. Ported from the existing premotion app.
3. **Chronology builder** — document upload, dated event extraction, CPR 31.22 implied-undertaking gate, significance tagging. SoF and working-chronology variants.
4. **Contract review (multi-agent)** — Parser → Analyst → Redliner → Summariser pipeline. Visible stage status. Output redlined .docx + summary. Developer catnip.
5. **CPR-letter drafter** — UI on top of the `uk-litigation-legal` plugin. Form-driven, matter-aware drafting.

Each module is independently shippable but shares the matter primitive. All five hit v1.

## Stack

- **Backend:** Python 3.12 + FastAPI. SQLAlchemy + Alembic. Async Anthropic SDK.
- **Database:** PostgreSQL + pgvector.
- **Frontend:** React 19 + Vite + TanStack Router. Tailwind. Shadcn primitives.
- **AI:** Model gateway abstracting Anthropic, OpenAI, and local Ollama. Per-matter privilege posture controls model selection.
- **Storage:** MinIO (S3-compatible) for documents.
- **Infrastructure:** Docker Compose for self-host. Azure UK South or AWS eu-west-2 for live demo (UK data residency).
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

If both happen, the workspace did its job. If neither, the GitHub trail still compounds — the workspace + plugins + courtless + the whitepaper read as a coherent build trajectory whether the launch week pops or not.

## What needs to be true for this scope to hold

- Bird Legal MVP code (now located at `/Users/andy/counsel-mvp/`, original name "Counsel") provides pattern references and prompt seeds — multi-agent BaseAgent, matter-first router shape, drafting/timeline/scanner/advisor prompt designs. Used as reference and seed, not wholesale port; rebuilt on the new platform layer so MVP debt isn't carried forward.
- Pre-Motion logic is extractable as a single-turn module. (Confirmed — already exists as a stateful tool; the simplified single-turn version is what ships in v1.)
- The `claude-for-uk-legal` plugins are stable as the backend for letter drafting and research. (Confirmed — shipped May 2026.)
- Andy ships solo for three weeks without major Lawhive/other distractions. (Risk — flagged in BUILD_PLAN.md.)

## Reviewer notes

This document and the rest of `/docs` + the scaffolded skeleton are intended for review by another agent before build kickoff. The plan should be stress-tested against:

- Stack choices (Python/FastAPI/React vs. TypeScript/Bun alternatives).
- Module scope (five is the right number? Pre-Motion is the right hero?).
- Regulatory plumbing visibility (is the demo-grade implementation defensible or theatrical?).
- Stella interop strategy (data-schema match enough, or does it need code-level interop?).
- Three-week timeline (achievable solo, or fantasy?).

Critique welcome. Sycophancy not useful.
