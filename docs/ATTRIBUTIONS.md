# Attributions

Library credits and design-idea credits for Legalise v0.1. No code is
copied from peer projects; influence is at the design-idea level and
named where load-bearing.

## Design-idea credits

- **Mike** ([github.com/willchen96/mike](https://github.com/willchen96/mike), AGPL-3.0)
  — the tracked-changes accept/reject UX in Mike was the cleanest
  reference for our diff surface. Implemented independently;
  AGPL boundary respected.
- **Stella** ([github.com/stella/stella](https://github.com/stella/stella), Apache-2.0)
  — the Folio (tabular bulk review) shape and the anonymise-chat
  shape informed our tabular review and anonymisation surfaces.
  Apache-Apache means code could move; in v0.1 nothing has.
- **counsel-mvp** (internal prototype) — the four-stage redliner pattern
  used in Contract Review (parser / analyst / redliner / summariser)
  is a port from the counsel-mvp pipeline.
- **pre-motion** ([github.com/b1rdmania/pre-motion](https://github.com/b1rdmania/pre-motion), Apache-2.0)
  — the adversarial-premortem skill, importable into the workspace via the
  GitHub skill importer. Same maintainer; same project family.
- **awesome-legal-skills** ([github.com/lawve-ai/awesome-legal-skills](https://github.com/lawve-ai/awesome-legal-skills))
  — the Lawve open legal-skills catalogue Legalise browses and imports from.

## Backend runtime dependencies

From `backend/pyproject.toml`. Direct runtime deps only; transitive deps
inherit their own licences.

| Package | Licence | Used for |
|---|---|---|
| `fastapi[standard]` | MIT | HTTP framework and async router |
| `uvicorn[standard]` | BSD-3-Clause | ASGI server |
| `sqlalchemy` | MIT | ORM and migrations base |
| `alembic` | MIT | Schema migrations |
| `asyncpg` | Apache-2.0 | Async PostgreSQL driver |
| `psycopg[binary]` | LGPL-3.0 | Sync Postgres driver (used by Alembic) |
| `pydantic` | MIT | Data validation and settings |
| `pydantic-settings` | MIT | Env-var-driven settings |
| `python-multipart` | Apache-2.0 | Multipart form parsing |
| `anthropic` | MIT | Anthropic SDK (gateway provider) |
| `openai` | Apache-2.0 | OpenAI SDK (gateway provider) |
| `httpx` | BSD-3-Clause | Async HTTP client |
| `redis` | MIT | Redis client (job-runner direction; v0.2) |
| `boto3` | Apache-2.0 | S3 / MinIO client |
| `python-docx` | MIT | `.docx` read/write |
| `pypdf` | BSD-3-Clause | PDF parsing |
| `pdfplumber` | MIT | PDF text extraction with layout |
| `structlog` | Apache-2.0 / MIT | Structured logging |
| `fastapi-users[sqlalchemy]` | MIT | Auth (cookie sessions + email verification) |
| `cryptography` | Apache-2.0 / BSD | AES-256-GCM encryption of provider keys |
| `resend` | MIT | Email delivery (verification + password reset) |
| `presidio-analyzer` | MIT | PII detection for anonymisation module |
| `presidio-anonymizer` | MIT | PII replacement / detokenisation |
| `spacy` | MIT | NLP backbone for Presidio (uses `en_core_web_sm`) |
| `pyyaml` | MIT | YAML for `matter.md` frontmatter |
| `python-frontmatter` | MIT | Frontmatter parsing for SKILL.md and matter.md |
| `jsonschema` | MIT | Schema validation for `module.json` and `matter.json` imports |

### Frontend runtime dependencies

From `frontend/package.json`. Direct runtime deps only.

| Package | Licence | Used for |
|---|---|---|
| `react`, `react-dom` | MIT | UI framework |
| `@tanstack/react-query` | MIT | Installed; unused in v0.1 (TanStack migration is v0.2) |
| `@tanstack/react-router` | MIT | Installed; unused in v0.1 (TanStack migration is v0.2) |
| `clsx` | MIT | Class composition |
| `diff-match-patch` | Apache-2.0 | Tracked-changes diff computation |
| `lucide-react` | ISC | Icon set |
| `recharts` | MIT | Charts in matter dashboard |
| `tailwind-merge` | MIT | Tailwind class deduplication |

Build deps (`vite`, `typescript`, `tailwindcss`, `eslint`, `postcss`,
`autoprefixer`, `@vitejs/plugin-react`, type-only packages) are
MIT-licensed and not bundled into the runtime artifact.

## Model and NLP assets

- **spaCy `en_core_web_sm`** — MIT. Downloaded at Dockerfile build:
  `python -m spacy download en_core_web_sm`. Used by Presidio for
  English-language PII detection.
- **Anthropic, OpenAI, Ollama models** — proprietary terms apply per
  provider; access via the gateway respects per-matter privilege
  posture.

## What Legalise contributes back

- The matter wire-format RFC at [`schemas/matter.json`](../schemas/matter.json),
  filed as a public Discussion at the Legalise repo, is offered as a
  cross-project interop surface for Stella, Mike, and any future
  open-source legal AI workspace.
- The Apache-2.0 licence puts no restriction on Stella using any
  Legalise code; Mike can consume Legalise code into AGPL without
  back-pressure on Legalise itself.
