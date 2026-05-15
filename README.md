# Legalise

UK legal AI workspace. Open source, matter-first, privilege-posture-aware, audit-logged. England & Wales only.

Legalise is a workspace, not a chatbot. Every piece of model work happens inside a matter — a slug, the parties, the documents, the audit trail. The matter is the unit of work; the model is a commodity behind a gateway. Solicitors review every output. Nothing is autonomous.

This repo is `v0.1`. It runs locally on Docker Compose, or live at the demo URL with the Khan v Acme sample matter seeded on signup. Apache-2.0.

## What it does

Four modules sit inside the matter workspace. Each one is a surface a UK solicitor recognises.

- **Pre-Motion** — adversarial premortem of a draft pleading or position. Four agent stages (steelman / weakest-link / counter-pleading / synthesiser), nine model calls, one audited run. Useful before issuing or before a CMC.
- **Contract Review** — parser / analyst / redliner / summariser pipeline over an uploaded contract. Returns clause-level issues, a redline, and a summary memo. Streams stage events so you can watch it work.
- **Letters** — drafts an LBA or other matter-shaped letter from the matter context. All letter types export through the procedural `.docx` generator in v0.1 (template-driven LBA returns in v0.2).
- **Anonymisation** — Presidio-based PII detection over a document with a deterministic token map. Detokenise round-trips byte-identical. Built so external counsel review or training-data exports go out clean.

All four route through one privilege-aware model gateway and write to one audit log.

## How privilege posture works

Every matter carries a posture flag that picks which providers can serve calls for that matter.

- **A_cleared** — privileged material excluded or cleared. Cloud providers permitted.
- **B_mixed** — mixed posture. Cloud providers permitted only where the matter explicitly opts each one in.
- **C_paused** — privileged material present or unresolved. Local-model only (Ollama). Cloud calls refused at the gateway.

The gateway audits the posture decision on every call. Chronology entries sourced from disclosed documents are gated behind a CPR 31.22 implied-undertaking acknowledgement, enforced server-side.

Module enable/disable is enforced at the `(plugin, skill)` layer. Declared capabilities in each `module.json` are schema-validated and displayed in the Modules page for review. Runtime per-capability enforcement is v0.2 doctrine — see [`docs/ROADMAP.md`](./docs/ROADMAP.md).

## Quick start

```bash
git clone https://github.com/b1rdmania/legalise
cd legalise
cp .env.example .env             # edit ANTHROPIC_API_KEY if you have one; stub-echo works without
docker compose -f infra/docker-compose.yml up --build
```

That brings up Postgres + pgvector, MinIO, Redis, Gotenberg, the FastAPI backend, and the React frontend. Open `http://localhost:5173`, sign up, and the Khan v Acme sample matter seeds automatically. Walk the four modules from there.

To point at a forked skills catalogue:

```bash
export PLUGINS_REPO=https://github.com/<your-org>/claude-for-uk-legal
export PLUGINS_REPO_REF=<your-approved-sha>
```

The installed catalogue is visible at `#/modules`. Skills come from [`claude-for-uk-legal`](https://github.com/b1rdmania/claude-for-uk-legal) by default. Fork it, review changes by PR diff, pin the SHA. Approval is code review.

## Status

This is `v0.1`. Honest about what's in and what's not.

In v0.1:

- FastAPI + Postgres + pgvector backend with audit middleware and privilege-aware model gateway
- React 19 + Vite frontend, hash router, Tailwind + Shadcn primitives
- Four modules listed above, all wired end-to-end against the Khan sample matter
- Tracked-changes document editing with accept/reject and version timeline
- Tabular review across multiple documents
- `.docx` export for letters, Pre-Motion, and Contract Review (procedural generator across all letter types in v0.1)
- Matter export / import in two modes — `full_internal` (no redaction, same posture only) and `shareable` (privilege-aware redaction matrix applied)
- Public module submission flow that opens a draft PR against `claude-for-uk-legal`
- fastapi-users cookie sessions, email verification, per-user AES-256-GCM-encrypted provider keys
- Five smoke evals covering audit-row contract, posture routing, redline anchors, NDA parse, matter portability round-trip

Not in v0.1, on the v0.2 list:

- Runtime per-capability enforcement at the call site (v0.1 ships declarations + module enable/disable enforcement)
- Job runner — direction locked as `arq` + Redis + `jobs` table; long runs still use router-local `asyncio.create_task` for now
- TanStack Router / Query migration
- Provider-native structured output / tool calling
- Docx templates for Pre-Motion and Contract Review (LBA only ships in v0.1)
- Signed module manifests
- GitHub App for the submission flow (PAT-based in v0.1)
- Multi-instance Redis-backed rate limiter

Full picture: [`docs/ROADMAP.md`](./docs/ROADMAP.md).

## Peers

Three open-source UK / European legal AI workspaces are shipping in parallel in mid-2026. We are one of them. The other two:

- **Mike** — Will Chen, [`willchen96/mike`](https://github.com/willchen96/mike), AGPL-3.0. Jurisdiction-agnostic, drafting-baseline-first, the cleanest tracked-changes UX in the open-source legal AI space.
- **Stella** — Jan Kubica, [`stella/stella`](https://github.com/stella/stella), Apache-2.0. Jurisdiction-pluralist, Magic Circle scale, mature anonymisation pipeline and tabular review.

These are independent builds tackling the same wedge from different angles. Legalise's wedge is **regulator shape** — audit by default, privilege posture, CPR 31.22 gate, retention as a first-class field, England & Wales only. Stella ships more polish in anonymisation. Mike ships more drafting surface. The matter wire-format RFC at [`schemas/matter.json`](./schemas/matter.json) is open so matters can move between any of the three.

Full credit and honest divergence map: [`docs/PEERS.md`](./docs/PEERS.md).

## Why this exists

Post-Heppner, the regulatory shape of legal AI in the UK matters. The thesis, the bet, and the constraints are written down in [`docs/MANIFESTO.md`](./docs/MANIFESTO.md).

## Architecture and design

- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — stack rationale and decisions
- [`docs/AUTH.md`](./docs/AUTH.md) — auth + provider-key model
- [`docs/TRUST.md`](./docs/TRUST.md) — privilege architecture, sub-processor list, compliance order, open gaps
- [`docs/MODULE_DEVELOPMENT.md`](./docs/MODULE_DEVELOPMENT.md) — write a new module
- [`docs/ATTRIBUTIONS.md`](./docs/ATTRIBUTIONS.md) — library credits and licence notes

## Disclaimer

This repository provides software tools that may assist in the production of legal work-product. It does not provide legal services or legal advice. The workspace and skills are designed to be used by qualified solicitors under their professional supervision. Use by non-lawyers in a regulated legal context may breach the Legal Services Act 2007 and the SRA Standards and Regulations.

## Licence

Apache-2.0. See [LICENSE](./LICENSE).

## Maintainer

[@b1rdmania](https://github.com/b1rdmania)
