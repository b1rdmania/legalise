# Legalise

UK legal AI workspace. Matter-first, privilege-posture-aware, audit-logged. England & Wales only. Apache-2.0.

Not a chatbot. Every model call happens inside a matter. A slug, the parties, the documents, the audit trail. The matter is the unit of work. The model is a commodity behind a gateway. Solicitors review every output.

This repo is `v0.1`. Run locally on Docker Compose, or open the live demo at the URL above and walk the Khan v Acme sample matter.

## What it does

Five surfaces inside the matter workspace. Each one is shaped to something a UK solicitor recognises.

- **Pre-Motion** - adversarial premortem of a draft pleading or position. Four stages (steelman / weakest-link / counter-pleading / synthesiser), nine model calls, one audited run. Useful before issuing or before a CMC.
- **Contract Review** - parser / analyst / redliner / summariser pipeline over an uploaded contract. Returns clause-level issues, a redline, and a summary memo. Streams stage events so you can watch it work.
- **Letters** - drafts an LBA or other matter-shaped letter from the matter context.
- **Anonymisation** - Presidio-based PII detection with a deterministic token map. Detokenise round-trips byte-identical. Built so external-counsel review and training-data exports go out clean.
- **Assistant** - matter-scoped chat. Answers against the matter context, cites documents and chronology by ID, routes into the structured modules via action chips.

Every surface routes through one privilege-aware model gateway. Every action writes to one audit log.

## Privilege posture

Every matter carries a posture flag. The gateway reads it before every model call.

- **A_cleared** - privileged material excluded or cleared. Cloud providers permitted.
- **B_mixed** - mixed posture. Cloud providers permitted per matter, opt-in by provider.
- **C_paused** - privileged material present or unresolved. Local-model only (Ollama). Cloud calls refused at the gateway.

The posture decision is audited on every call. Chronology entries sourced from disclosed documents sit behind a CPR 31.22 implied-undertaking acknowledgement, enforced server-side.

## Quick start

```bash
git clone https://github.com/b1rdmania/legalise
cd legalise
cp .env.example .env             # edit ANTHROPIC_API_KEY if you have one; stub-echo works without
docker compose -f infra/docker-compose.yml up --build
```

Brings up Postgres + pgvector, MinIO, Redis, Gotenberg, the FastAPI backend, the React frontend. Open `http://localhost:5173`, sign up, and the Khan v Acme sample matter seeds automatically. Walk the modules from there.

## Status

`v0.1`. Honest about what's in and what's not.

In:

- FastAPI + Postgres + pgvector backend with audit middleware and privilege-aware model gateway
- React 19 + Vite frontend, hash router, Tailwind + Shadcn primitives
- Five surfaces above, all wired end-to-end against the Khan sample matter
- Tracked-changes document editing with accept / reject and version timeline
- Tabular review across multiple documents
- `.docx` export for letters, Pre-Motion, and Contract Review
- fastapi-users cookie sessions, email verification, per-user AES-256-GCM-encrypted provider keys
- Smoke evals over audit rows, posture routing, redline anchors, NDA parse, and Assistant invariants

Out, on the v0.2 list:

- Job runner (`arq` + Redis + `jobs` table). Long runs still use router-local `asyncio.create_task`.
- TanStack Router / Query migration
- Provider-native structured output and tool calling
- Template-driven LBA (procedural generator covers all letter types in v0.1)
- Docx templates for Pre-Motion and Contract Review
- Multi-instance Redis-backed rate limiter

Further out (v0.3+):

- Matter export / import with privilege-aware redaction matrix. Deferred because at v0.1 there's no second user or second matter to pressure-test the wire format against.

Full picture: [`docs/ROADMAP.md`](./docs/ROADMAP.md).

## Why this exists

Post-Heppner, the regulatory shape of legal AI in the UK matters more than the model layer. The thesis and the constraints are in [`docs/MANIFESTO.md`](./docs/MANIFESTO.md).

## Architecture and design

- [`ARCHITECTURE.md`](./ARCHITECTURE.md) - stack rationale and decisions
- [`docs/AUTH.md`](./docs/AUTH.md) - auth + provider-key model
- [`docs/TRUST.md`](./docs/TRUST.md) - privilege architecture, sub-processor list, compliance order, open gaps
- [`docs/MODULE_DEVELOPMENT.md`](./docs/MODULE_DEVELOPMENT.md) - write a new module
- [`docs/ATTRIBUTIONS.md`](./docs/ATTRIBUTIONS.md) - library credits and licence notes

## Disclaimer

This repository provides software tools that may assist in the production of legal work-product. It does not provide legal services or legal advice. The workspace and modules are designed to be used by qualified solicitors under their professional supervision. Use by non-lawyers in a regulated legal context may breach the Legal Services Act 2007 and the SRA Standards and Regulations.

## Licence

Apache-2.0. See [LICENSE](./LICENSE).

## Maintainer

[@b1rdmania](https://github.com/b1rdmania)
