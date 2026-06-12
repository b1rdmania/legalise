# ENGINEERING.md — Bespoke vs Boring

> We build custom only where legal trust requires it. Everything else
> is boring.

The product spine is bespoke: the parts of Legalise that are different
from a generic SaaS, where the legal-trust requirements changed the
shape of the code. Everything outside that spine is a boring library
choice that should not surprise anyone reading the repo.

This doc names both. If you are reviewing the codebase, this is where
to start.

## Bespoke (where the custom code earns its weight)

These are the surfaces where Legalise is genuinely doing something
that a generic SaaS does not, and where forking the library would
have meant losing the legal-trust requirement.

- **Matter model.** Slug, parties, documents, chronology, privilege
  posture, retention clock. The whole product hangs off the matter
  primitive; every other surface scopes to one. See
  `backend/app/models/matter.py`.
- **Privilege posture as a dispatch constraint.** Per-matter flag
  (`A_cleared` / `B_mixed` / `C_paused`) that the model gateway reads
  before every call. `C_paused` refuses cloud providers at the
  gateway, not at the UI. See `backend/app/core/model_gateway.py`.
- **Audit by default.** Every API request touching a matter resource,
  every model call, every privilege change, every capability denial
  writes an `AuditEntry` row. Append-only by convention; WORM
  enforcement is v0.2 plumbing. The audit log is the regulator-facing
  record, not a debug surface. See `backend/app/core/audit.py` and
  `backend/app/core/api.py`.
- **Capability vocabulary + grants + enforcement.** Manifest declares,
  workspace grants, runtime enforces. Single vocabulary at
  `backend/app/core/capabilities.py::CAPABILITY_VOCABULARY`; the
  module schema validates against it; workflow definitions are tested
  against it; the runtime denies any call lacking a grant with a
  structured 403 + audit row. The whole doctrine survives only because
  the vocabulary has one source of truth — do not introduce new
  capability strings outside the vocabulary file.
- **CPR 31.22 implied-undertaking gate on disclosed chronology.**
  Server-side access gate, not a UI hint. Acknowledgement writes
  audit. See `backend/app/api/matters.py` chronology routes and
  `frontend/src/matter/CprGateBanner.tsx`.
- **Workflow taxonomy.** Built-in v0.1 catalogue of five legal
  workflows (premotion / letters / contract-review / reviews /
  research). Mapped to in-app pipelines, not installed skills.
  `declared_capabilities` is a subset of the runtime vocabulary;
  workspace-level capability coverage is surfaced as a workflows
  card signal, not as per-skill enforcement. See `WORKFLOW_DEFS` in
  `backend/app/api/matters.py`.
- **Design + product doctrine.** `docs/DESIGN.md` (visual contract,
  v0.4 FROZEN) and `docs/JOY.md` (calm-power product feel) define
  what "good" looks like before the code does. Both are linked from
  every relevant handover so future agents do not drift.
- **Legal source / citation UX.** Citation chips, Source · filename,
  Event · 12 Mar 2026, audit-confirmation in the assistant metadata
  line. These read as a workspace surface a solicitor recognises,
  not a generic chat product.

## Boring (where stock libraries do the work)

These are the surfaces where Legalise uses the obvious mainstream
choice and nothing more. If you find yourself reading bespoke code
in these areas, that is a smell.

- **Backend framework:** FastAPI. Async by default. No layer on top.
- **ORM + migrations:** SQLAlchemy 2 async + Alembic. Standard.
- **Database:** PostgreSQL 16 + pgvector. One store for relational,
  JSONB, full-text, embeddings.
- **Auth:** `fastapi-users` with cookie transport + DB-backed access
  tokens. Email verification, password reset, register/login flows
  all unchanged from upstream.
- **API client (Anthropic / OpenAI):** vendor async SDKs, wrapped by
  the model gateway only because of posture + audit.
- **Local-model fallback:** Ollama HTTP.
- **Document conversion:** Gotenberg (HTML → PDF), LibreOffice headless
  for DOCX.
- **PDF / DOCX text extraction:** `pypdf`, `pdfplumber`, `python-docx`.
- **PII detection:** Microsoft Presidio + spaCy.
- **Structured output parsing:** `app/core/structured_output.py`
  centralises the JSON-from-text mess. Boring, legible, no
  provider-native tool calling complexity until needed.
- **Frontend framework:** React 19 + Vite + Tailwind. Hash router
  (not TanStack Router yet — see "What's not landed yet" below).
- **Logging:** `structlog`.

## What's not landed yet (and what we'll use when it lands)

Honest about the shapes Legalise has not yet adopted. None of these
are blockers for v0.1; each is on the v0.2/v0.3 backlog. When they
land, they will be boring libraries, not invented in-house.

| Concern | v0.1 shape | When it grows up |
|---|---|---|
| Frontend data fetching / cache | Hand-rolled `useEffect` + per-component loading/error state | TanStack Query (`@tanstack/react-query` is already a dependency, just not consumed yet) |
| Tables (audit, documents, citations) | Hand-rolled grid + headers | TanStack Table once sorting/filtering/column visibility become real |
| Frontend routing | Hash router | TanStack Router migration when the route surface grows |
| Long-running workflow runs | durable jobs (`POST … /export` → job row; `GET /jobs/{id}/events` SSE status transport) | `arq` + Redis + a `jobs` table, with `POST /run -> job_id`, `GET /jobs/{id}/events`. Not invented in-house |
| Rate limiting | In-memory per-IP token bucket on `POST /api/modules/submit` | Cloudflare-level rate limiting + Turnstile; `slowapi` if we keep it app-side |
| Error shape on the frontend | Per-component string handling, action-shaped prefixes piped through `ErrorCallout` | Single `ApiError` class; `jsonOrThrow` throws it; `ErrorCallout` consumes it |
| Audit action vocabulary | Free-typed strings at emit sites | A `backend/app/core/audit_actions.py` constants module, validated against the emitted set in a test |
| Module discovery | In `backend/app/api/modules.py` alongside HTTP shaping | Extracted into `backend/app/core/module_catalogue.py` so the API module is just response shaping |

## v0.1 demo shapes — explicit caveats

Three things the live demo at `legalise.dev` does that are deliberately
not production-shaped. Called out here so a reviewer is not surprised.

1. **In-memory rate limiting** on `POST /api/modules/submit`. Single-
   instance only. Cloudflare-level limiting is the production answer.
2. **SSE bound to request lifecycle.** A long Pre-Motion run holds the
   HTTP connection for ~30-60s; if the client disconnects, the
   asyncio task continues (via `asyncio.create_task` with a bridge
   queue), but the connection cannot be resumed. Durable jobs land in
   v0.2.
3. **Built-in workflow catalogue.** `WORKFLOW_DEFS` ships five
   workflows; the matter Workflows endpoint always returns them.
   `not-installed` is intentionally absent from the response enum
   for v0.1; v0.2 may add concrete `(plugin, skill)` mapping when
   workflows become skill-backed runs rather than in-app pipelines.

## How to read the codebase

Pull request 101: focus on the bespoke list above. That's the spine.
The boring list is exactly what it says — stock libraries, no
surprise. The "not landed yet" table is the honest backlog; if any
of those surfaces has grown bespoke wrapping without a matching
library, that is a regression and worth flagging.

## Related

- `docs/DESIGN.md` — visual contract (v0.4 FROZEN)
- `docs/JOY.md` — product-feel doctrine
- `docs/TRUST.md` — privilege + audit architecture
- `docs/MANIFESTO.md` — why this exists
- `ARCHITECTURE.md` — stack rationale and decisions
