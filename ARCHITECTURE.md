# Architecture

## Principles

1. **Matter is the spine.** Every entity, file, audit entry, and AI invocation belongs to a matter. No orphan data.
2. **Filesystem is the source of truth.** Postgres is a fast index; `matters/[slug]/` on disk is canonical. A matter folder can be tarballed, emailed, dropped into Stella, and re-imported.
3. **Audit everything that touches an LLM or a document.** Prompt hashes, response hashes, document hashes, user, matter, timestamp. No untracked AI inference.
4. **Privilege posture is a first-class matter property.** It changes which model gets called, which sources can be extracted from, and which outputs filter privileged entries.
5. **Skills are the brains. Workspace is the venue.** Legal logic arrives as imported skills (Lawve catalogue or any public GitHub repo with a SKILL.md), installed through the trust ceremony and run by the prompt runtime. The workspace adds matter context, audit, document handling, and UI.
6. **Boring stack, ambitious composition.** Python + FastAPI + React + Postgres. The novelty lives in the composition (adversarial premortem with parallel sub-agents, multi-agent contract pipeline, privilege-aware chronology), not the framework choice.

## Stack

| Layer | Choice | Rationale |
|---|---|---|
| Backend language | Python 3.12 | Strongest AI ecosystem (Anthropic SDK, agent frameworks, document libraries). Largest London talent pool. |
| Web framework | FastAPI | Async-native, OpenAPI for free, mature, ports to production scale without rewrite. |
| ORM + migrations | SQLAlchemy 2 + Alembic | Boring, durable, audit-friendly. |
| Database | PostgreSQL 16 | One store for relational, JSONB, and full-text. pgvector extension available but unused in v0.1 (vector search is roadmap). Will run in 30 years. |
| Storage | MinIO (S3 API) | Self-hostable; swap for Cloudflare R2 in cloud. UK data residency requirement met by deployment region. |
| Frontend | React 19 + Vite + TanStack Router | Modern but stable. Hot reload, fast build, no Next.js framework lock-in. |
| Styling | Tailwind + Shadcn primitives | Solicitor-legible defaults, customisable, no design-system rebuild needed. |
| AI gateway | `app/core/model_gateway.py` | Abstracts Anthropic, OpenAI, Ollama. Per-matter privilege posture selects provider. |
| Multi-agent | Module-local pipelines in `app/modules/<name>/pipeline.py` where a module needs one. The heavyweight built-in pipelines (pre-motion, contract review, tabular review, case law, letters) were removed in the skills-as-plugins cut; reference implementations live as installable example modules under `examples/modules/`. |
| Document conversion | Gotenberg (HTML→PDF), LibreOffice headless (DOCX) | Stella uses Gotenberg; same choice for interop. |
| Caching / queues | Redis | Background jobs (filesystem sync, retention enforcement), session state. |
| Hosting (live demo) | Cloudflare Pages (frontend) + Fly.io `lhr` (backend, default) + Neon Postgres London + R2 (storage). Cloudflare Containers optional / experimental. | UK-region database and backend; edge CDN and storage at EU / Western Europe placement (R2 hint best-effort). See `infra/deploy/cloudflare.md` for honest residency caveats. |
| Hosting (self) | Docker Compose | Single `docker compose -f infra/docker-compose.yml up` brings full stack. Operators can deploy anywhere. Cloudflare is the maintainer's choice, not a requirement. |

## Module shape

Each v1 module follows the same shape:

```
backend/app/modules/<module>/
  __init__.py
  router.py          # FastAPI routes
  service.py         # business logic
  pipeline.py        # module-local multi-stage pipeline (where the module needs one)
  schemas.py         # pydantic input/output models
  templates/         # any prompt templates or output templates

frontend/src/modules/<module>/
  index.tsx          # route entry
  components/        # module-specific components
  hooks.ts           # data fetching hooks
  types.ts           # shared types with backend (codegen from OpenAPI)
```

Modules share the matter primitive but are otherwise loosely coupled. Adding a new module is a self-contained PR, or a fork-local addition if a firm wants private modules.

## Module SDK

Legalise is a **platform-shaped, module-extensible workspace**. The platform claim becomes load-bearing once `app.core.api` is real (v0.1 build window). Until then, the SDK exists at the planning level: manifest schema, example-tab starter, documented public-surface contract, MODULE_DEVELOPMENT.md guide.

Tabs are modules. New modules (a plain-english tab, a time-recording tab, a conflicts-check tab, a firm-specific workflow) plug into the matter spine using the same primitives the built-in modules use.

The contract:

- Every module ships a `module.json` validated against `/schemas/module.json`, declaring name, version, nav entry, routes, plugin/env/MCP dependencies, permissions.
- Every module imports only from `app.core.api`, the documented stable surface. Internals (`app.core.config`, `app.core.audit`, etc.) are not stable across patches.
- Every module gets matter context, audit logging, model gateway access, and storage for free. No module re-implements those primitives.
- Every module respects the matter's privilege posture and the audit log. These are not optional.

Modules **cannot** in v0.1: bring their own database tables, define their own auth, bypass audit, ignore privilege. Items 1 and 2 relax in v0.2; items 3 and 4 are permanent.

A minimal worked example lives at `examples/modules/example-tab/`. Full developer guide at `docs/MODULE_DEVELOPMENT.md`.

### Module registration (v0.1)

Two paths:

1. **First-party routers** are registered manually in
   `backend/app/main.py` via `app.include_router(...)`.
2. **Installable modules** (example modules, plugin `SKILL.md` skills,
   Lawve imports) are discovered by the registry
   (`backend/app/core/registry/discovery.py`) and installed through the
   trust ceremony; no code edit required. The frontend lists them from
   the installed-modules API — there is no frontend registry file.

### Module migrations (v0.1)

Modules cannot bring database tables in v0.1. Per-module data lives in `Matter.metadata` (JSONB) or in the materialised matter folder.

v0.2 introduces per-module alembic version directories so modules can own tables. Until then, the matter spine is the only authoritative database surface.

### Module sandboxing

Out of scope for v0.1 (single-tenant demo). Multi-tenant isolation and module permission enforcement land with the broader multi-tenancy work in v0.5+.

### Private (firm-internal) modules

An internal firm dev team can fork the repo and add modules under `backend/app/modules/firm_specific/` and `frontend/src/modules/firm_specific/`. Because modules use `app.core.api` rather than internals, upstream `master` changes rarely break them. Maintenance is `git pull upstream master` periodically.

## Data model

### Core entities

```
User
  id, email, name, role (solicitor | paralegal | client | external)

Matter
  id, slug, title, status (open | closed | archived)
  case_theory (text), pivot_fact (text)
  privilege_posture (A_cleared | B_mixed | C_paused)
  default_model_id (anthropic-claude-* | ollama-* | openai-*)
  opened_at, closed_at, retention_until
  created_by_id (User)

Document
  id, matter_id, filename, mime_type, size_bytes
  sha256, storage_uri (s3://...)
  from_disclosure (bool), disclosure_proceedings_ref (nullable)
  uploaded_at, uploaded_by_id

Event              # chronology entries
  id, matter_id, date, description
  significance (red | amber | white)
  source_doc_ids (array)
  priv_flag (ok | flag | review | null)
  created_at

AuditEntry
  id, actor_id (User), matter_id (nullable)
  action (string, e.g. "matter.created", "model.call", "document.upload")
  resource_type, resource_id
  prompt_hash (nullable), response_hash (nullable)
  model_used (nullable), token_count (nullable), latency_ms (nullable)
  metadata (JSONB)
  timestamp

PluginInvocation   # records each plugin call (subset of AuditEntry)
  id, audit_entry_id, plugin_name, skill_name
  inputs (JSONB), outputs (JSONB)
  status (pending | success | error)
```

### Filesystem materialisation

Each matter mirrors to `matters/<slug>/`:

```
matters/example-v-respondent-2026/
  matter.md          # YAML front-matter (parties, dates, theory) + prose
  history.md         # append-only log of internal actions
  chronology.md      # written by chronology module
  documents/
    [original files, or symlinks to MinIO if storage_uri is set]
  audit/
    YYYY-MM-DD.jsonl # daily audit log shard
```

`schemas/matter.json` documents the format. Stella-compatible.

## AI gateway

```
core/model_gateway.py

class ModelGateway:
  def call(matter_id, prompt, *, model=None, posture=None, ...) -> Response

  Logic:
  1. Resolve model:
     - If matter has privilege_posture == C_paused → refuse.
     - If matter has privilege_posture == B_mixed AND default_model is cloud → optionally route to local; require explicit override.
     - If matter has privilege_posture == A_cleared → use default (cloud OK).
     - Override via `model` argument always wins (with audit entry recording the override).
  2. Call provider.
  3. Log AuditEntry with prompt hash, response hash, model, tokens, latency.
  4. Return Response.

Providers:
- AnthropicProvider: async Anthropic SDK
- OpenAIProvider: async OpenAI SDK
- OllamaProvider: async HTTP to local Ollama instance
```

All LLM calls go through the gateway. There is no direct SDK import in any module.

## Multi-stage pipelines (module-local)

Multi-stage AI workflows live in each module's own `pipeline.py` where a
module needs one; the assistant's tool-calling turn loop
(`app/modules/assistant/pipeline.py`) is the main in-tree example. The
heavyweight built-in pipelines (Pre-Motion's four-stage premortem,
Contract Review's parser → analyst → redliner → summariser, tabular
review, case law, letters) were removed from the app in the
skills-as-plugins cut — the platform ships chat + governance + the
document workspace, and skills install as governed modules. Reference
module implementations live under `examples/modules/`.

`backend/app/agents/` (a `BaseAgent` ABC + orchestrator stub scaffolded
during early planning) was never wired up and has been deleted; there is
no shared agent abstraction at runtime.

## Skill importers

Two import paths, one contract (`app/core/lawve_import.py` +
`app/core/github_import.py`): fetch a SKILL.md from the source, pin the
commit SHA for provenance, convert to a manifest-v2 draft with
conservative default permissions, validate. The draft is never
installed by the importer — it goes through the trust ceremony, lands
in `installed_modules`, and executes via the `prompt` runtime under the
posture gate, capability grants, and audit chain. Imported scripts are
never executed.

The earlier filesystem plugin bridge (a `claude-for-uk-legal` checkout
mounted at PLUGINS_ROOT, executed in-process) was removed in June 2026;
imports are the only external-skill path.

## Audit log

Two layers:

- **Middleware audit.** Every FastAPI request touching a matter creates an AuditEntry (`matter.read`, `matter.update`, `document.upload`, etc.).
- **Model gateway audit.** Every LLM call records prompt hash, response hash, model, tokens, latency.

The audit log is exposed as a matter tab in the UI and as CSV / JSONL export.

## Privilege posture enforcement

Three matter-level states. Each module reads the posture and behaves accordingly.

| Posture | Default model | Chronology behaviour | SoF default |
|---|---|---|---|
| A_cleared | Anthropic | Extract without flags | All entries included |
| B_mixed (default) | Anthropic; local recommended for sensitive matters | Tag each entry priv: ok / flag / review | Flagged entries excluded |
| C_paused | None (refuse calls) | Refuse extraction | N/A |

Posture is mutable but every change creates an AuditEntry.

## Advice boundary

Every imported-skill run passes through the advice-boundary gate. Chat tool calls and `POST /api/invocations` both dispatch via `core.runtime.dispatch_capability`; prompt-runtime capabilities (the only kind skills import as) run `core.prompt_runtime.run_prompt_capability`, which calls `core.advice_boundary.check()` per invocation and raises `AdviceBoundaryDenied` on denial — a 403 from the invocations endpoint, a refusal message in chat. Tier vocabulary, transition rules (no skipping supervised review, no transition out of approved final advice), the initial-tier cap, and the manifest's `declared_tier_max` are enforced unconditionally; the per-tier role requirement additionally gates on `LEGALISE_FIRM_ROLE_GATES_ENABLED`. Every check writes an `AdviceBoundaryDecision` row, surfaced through audit reconstruction. (Its Phase 1 sibling, the generic state-machine primitive, is dormant in v0.1 and parked in `backend/contrib/state_machine/` until the v0.2 output-lifecycle work revives it.)

## CPR 31.22 gate

Document upload form asks "from disclosure?" If yes, captures the proceedings reference. Chronology module refuses to extract from a document marked `from_disclosure=true` unless the matter is the same proceedings (recorded on the matter).

## Local model story

Ollama is in the local Docker Compose stack but not in the live demo deployment (heavy model weights, hosting cost, demo doesn't need it). The README explains the toggle: "in self-host, switch any matter to local-only by changing `default_model_id` to `ollama-*`. The UI badge confirms no cloud egress."

For demo purposes, one sample matter is pre-set to local mode so visitors can see the badge and the workflow.

## Frontend state

- **Server state** via TanStack Query.
- **Client state** minimal. Current matter, current module, selected document. Local component state.
- **Routing** TanStack Router, file-based.
- **Auth** session cookie, refreshed via `/auth/me`. v0.2 swaps to WorkOS / Stytch.

## What is intentionally absent in v1

- No real auth (username/password stub, single tenant).
- No e-signature, no e-billing, no client portal.
- No mobile UI optimisation (works on mobile, not designed for it).
- No multi-tenant isolation (single workspace per deployment).
- No background-job worker beyond Redis simple queue (Celery / RQ at v0.2).
- No observability stack (Sentry / OpenTelemetry at v0.2).
- No vector search over documents (pgvector available, no module uses it in v1; chronology does extraction not RAG).
- No ETL from external systems (Clio, LEAP, etc.).

## What v0.2 looks like (not in scope)

- Real auth via WorkOS or Stytch
- MCP-runtime skills (imported skills exposing MCP servers)
- Vector search over matter documents
- Discrimination quantum analysis (Vento)
- Settlement-agreement review module
- Interim relief and freezing orders
- Background job worker (Celery)
- Observability stack
- E-signature integration
