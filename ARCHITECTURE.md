# Architecture

## Principles

1. **Matter is the spine.** Every entity, file, audit entry, and AI invocation belongs to a matter. No orphan data.
2. **Filesystem is the source of truth.** Postgres is a fast index; `matters/[slug]/` on disk is canonical. A matter folder can be tarballed, emailed, dropped into Stella, and re-imported.
3. **Audit everything that touches an LLM or a document.** Prompt hashes, response hashes, document hashes, user, matter, timestamp. No untracked AI inference.
4. **Privilege posture is a first-class matter property.** It changes which model gets called, which sources can be extracted from, and which outputs filter privileged entries.
5. **Plugins are the brains. Workspace is the UI.** Modules invoke `claude-for-uk-legal` plugins for legal logic. The workspace adds matter context, audit, document handling, and UI.
6. **Boring stack, ambitious composition.** Python + FastAPI + React + Postgres. The novelty lives in the composition (multi-agent contract pipeline, Nash settlement analysis, privilege-aware chronology), not the framework choice.

## Stack

| Layer | Choice | Rationale |
|---|---|---|
| Backend language | Python 3.12 | Strongest AI ecosystem (Anthropic SDK, agent frameworks, document libraries). Largest London talent pool. |
| Web framework | FastAPI | Async-native, OpenAPI for free, mature, ports to production scale without rewrite. |
| ORM + migrations | SQLAlchemy 2 + Alembic | Boring, durable, audit-friendly. |
| Database | PostgreSQL 16 + pgvector | One store for relational, JSONB, full-text, and embeddings. Will run in 30 years. |
| Storage | MinIO (S3 API) | Self-hostable; swap for native S3 / Azure Blob in cloud. UK data residency requirement met by deployment region. |
| Frontend | React 19 + Vite + TanStack Router | Modern but stable. Hot reload, fast build, no Next.js framework lock-in. |
| Styling | Tailwind + Shadcn primitives | Solicitor-legible defaults, customisable, no design-system rebuild needed. |
| AI gateway | `app/core/model_gateway.py` | Abstracts Anthropic, OpenAI, Ollama. Per-matter privilege posture selects provider. |
| Multi-agent | `app/agents/` — BaseAgent + Orchestrator | Async, streaming, tool-call-aware. Same pattern as Bird Legal MVP. |
| Document conversion | Gotenberg (HTML→PDF), LibreOffice headless (DOCX) | Stella uses Gotenberg; same choice for interop. |
| Caching / queues | Redis | Background jobs (filesystem sync, retention enforcement), session state. |
| Hosting (live demo) | Azure UK South or AWS eu-west-2 | UK data residency. Azure preferred for M365 integration story; AWS for startup ecosystem familiarity. |
| Hosting (self) | Docker Compose | Single `docker compose up` brings full stack. |

## Module shape

Each v1 module follows the same shape:

```
backend/app/modules/<module>/
  __init__.py
  router.py          # FastAPI routes
  service.py         # business logic
  agents.py          # any module-specific agents (multi-agent pipelines)
  schemas.py         # pydantic input/output models
  templates/         # any prompt templates or output templates

frontend/src/modules/<module>/
  index.tsx          # route entry
  components/        # module-specific components
  hooks.ts           # data fetching hooks
  types.ts           # shared types with backend (codegen from OpenAPI)
```

Modules share the matter primitive but are otherwise loosely coupled. Adding a new module is a self-contained PR.

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
  action (string — e.g. "matter.created", "model.call", "document.upload")
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
- AnthropicProvider — async Anthropic SDK
- OpenAIProvider — async OpenAI SDK
- OllamaProvider — async HTTP to local Ollama instance
```

All LLM calls go through the gateway. There is no direct SDK import in any module.

## Multi-agent (BaseAgent + Orchestrator)

Same shape as Bird Legal MVP. Modules that need it (chronology, contract review) define an Orchestrator that runs Agents in series or parallel, each Agent wrapping a single LLM call with a system prompt and tool definitions.

```
agents/
  base.py            # Agent abstract base, run() returns AgentResult
  orchestrator.py    # sequential/parallel run, status streaming to client
```

Agents stream status updates to the frontend via SSE so users see "Parser → Analyst → Redliner → Summariser" progress in the contract review module.

## Plugin bridge

`adapters/plugin_bridge.py` calls `claude-for-uk-legal` plugins. Two strategies, both implemented; module chooses:

1. **Direct skill execution.** Read the SKILL.md, render with matter context, call Claude directly through the model gateway. This is the fast path for v1.
2. **MCP server invocation.** Plugins exposed as MCP servers, called from FastAPI as MCP clients. Slower to set up but cleaner for v0.2 and aligns with how Anthropic's plugin model evolves.

v1 uses (1) for speed. v0.2 migrates to (2).

## Audit log

Two layers:

- **Middleware audit** — every FastAPI request touching a matter creates an AuditEntry (`matter.read`, `matter.update`, `document.upload`, etc.).
- **Model gateway audit** — every LLM call records prompt hash, response hash, model, tokens, latency.

The audit log is exposed as a matter tab in the UI and as CSV / JSONL export.

## Privilege posture enforcement

Three matter-level states. Each module reads the posture and behaves accordingly.

| Posture | Default model | Chronology behaviour | SoF default |
|---|---|---|---|
| A — cleared | Anthropic | Extract without flags | All entries included |
| B — mixed (default) | Anthropic; local recommended for sensitive matters | Tag each entry priv: ok / flag / review | Flagged entries excluded |
| C — paused | None (refuse calls) | Refuse extraction | N/A |

Posture is mutable but every change creates an AuditEntry.

## CPR 31.22 gate

Document upload form asks "from disclosure?" If yes, captures the proceedings reference. Chronology module refuses to extract from a document marked `from_disclosure=true` unless the matter is the same proceedings (recorded on the matter).

## Local model story

Ollama is in the local Docker Compose stack but not in the live demo deployment (heavy model weights, hosting cost, demo doesn't need it). The README explains the toggle: "in self-host, switch any matter to local-only by changing `default_model_id` to `ollama-*`. The UI badge confirms no cloud egress."

For demo purposes, one sample matter is pre-set to local mode so visitors can see the badge and the workflow.

## Frontend state

- **Server state** via TanStack Query.
- **Client state** minimal — current matter, current module, selected document. Local component state.
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
- MCP-based plugin bridge
- Vector search over matter documents
- Discrimination quantum analysis (Vento)
- Settlement-agreement review module
- Interim relief and freezing orders
- Background job worker (Celery)
- Observability stack
- E-signature integration
