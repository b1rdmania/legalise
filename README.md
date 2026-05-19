# Legalise

> Open a matter. Ask the assistant. Install a legal module. Run it. See what it touched. See the audit trail.

UK legal AI workspace for England & Wales. Matter-first, privilege-posture-aware, audit-logged. Apache-2.0.

`v0.1`. Live demo at [legalise.dev](https://legalise.dev). Or run it locally on Docker Compose. The Khan v Acme sample matter seeds on signup so the workspace is never empty.

## How it works

**Open a matter.** A slug, the parties, the documents, the chronology, the privilege posture, the retention clock. Every model call you make from here on lives inside this matter.

**Ask the assistant.** Matter-scoped chat. Answers against the matter context. Cites documents and chronology by ID. When you ask for one of the structured workflows below, the assistant returns a chip that routes you into it rather than improvising in prose.

**Install a legal module.** Modules ship as forkable skill catalogues. Each declares its capabilities (read documents, write generated docs, call the model, write citations). The workspace grants those capabilities; you can revoke any time from the Modules page.

**Run it.** The module operates on the matter through a privilege-aware gateway. Cloud providers, local models, and tool calls all route through the same audit-and-posture layer.

**See what it touched.** Every model call, every document mutation, every chronology entry, every capability denial writes an audit row. The Audit tab is the canonical record of what your AI saw, when, under what protection, and what it produced.

**See the audit trail.** Filter by module. Export. Show a regulator or a client or opposing counsel.

## What ships

Five surfaces inside the matter workspace, each shaped to something a UK solicitor recognises.

- **Pre-Motion.** Adversarial premortem of a draft pleading or position. Four stages (steelman / weakest-link / counter-pleading / synthesiser), nine model calls, one audited run. Useful before issuing or before a CMC.
- **Contract Review.** Parser / analyst / redliner / summariser pipeline over an uploaded contract. Returns clause-level issues, a redline, and a summary memo. Streams stage events as it runs.
- **Letters.** Drafts an LBA or other matter-shaped letter from the matter context. Exports `.docx`.
- **Anonymisation.** Presidio-based PII detection with a deterministic token map. Detokenise round-trips byte-identical. Built so external-counsel review and training-data exports go out clean.
- **Assistant.** Matter-scoped chat. Cites by ID. Routes into the structured modules above via action chips.

Plus tracked-changes document editing, tabular review across documents, case-law citation lookup, a chronology with a CPR 31.22 implied-undertaking gate.

## The trust layer

This is the wedge. Three things every solicitor needs from an AI tool, every one of them is a first-class feature here.

**Audit by default.** Every action writes an audit row. Module calls, document mutations, chronology entries, gateway dispatch decisions, capability denials. Append-only by convention; the row shape is bespoke and stable. The Audit tab is the regulator-facing record. Skill substrate is invisible; the user sees a clean module-namespaced log.

**Privilege posture as a dispatch constraint.** Every matter carries one of three flags. `A_cleared`: privileged material excluded or cleared, cloud providers permitted. `B_mixed`: opt-in per provider. `C_paused`: privileged material present or unresolved, local-model only (Ollama), cloud calls refused at the gateway. The posture decision is audited on every call. Privilege is not a soft setting.

**Capabilities, requested and granted and enforced.** Modules declare what they need: read documents, write generated docs, call the model, write citations. The workspace grants those capabilities at signup; you can revoke any time. The runtime checks the grant before every privileged operation. A denial is a structured 403 plus an audit row. The doctrine, locked: manifest requests capabilities, workspace grants capabilities, runtime enforces capabilities.

CPR 31.22 implied-undertaking gating, BYO provider keys, no provider-specific dependencies that bypass the gateway. None of this is theory; it's all in code today.

## Quick start

```bash
git clone https://github.com/b1rdmania/legalise
cd legalise
cp .env.example .env             # edit ANTHROPIC_API_KEY if you have one; stub-echo works without
docker compose -f infra/docker-compose.yml up --build
```

Brings up Postgres + pgvector, MinIO, Redis, Gotenberg, the FastAPI backend, the React frontend. Open `http://localhost:3000`, sign up, and the Khan v Acme sample matter seeds automatically. Walk the modules from there.

## Status

`v0.1`. Honest about what's in and what's not.

In:

- FastAPI + Postgres + pgvector backend, audit middleware, privilege-aware model gateway
- React 19 + Vite frontend, hash router, Tailwind + Shadcn primitives
- Five surfaces above, all wired end-to-end against the Khan sample matter
- Tracked-changes document editing with accept / reject and version timeline
- Tabular review across multiple documents
- `.docx` export for letters, Pre-Motion, and Contract Review
- fastapi-users cookie sessions, email verification, per-user AES-256-GCM-encrypted provider keys
- Runtime capability enforcement: per-skill declarations, auto-grant on signup, runtime gates at the plugin bridge, model gateway, tool invocation, document body read, citation writes
- Bootstrap audit rows on per-user seed so the Audit tab is non-empty on first paint
- Real-DB E2E test infrastructure; 121 tests passing in the container

Out, on the v0.2 list:

- Job runner (`arq` + Redis + `jobs` table). Long runs still use router-local `asyncio.create_task`.
- TanStack Router / Query migration
- Provider-native structured output and tool calling
- Docx templates for Pre-Motion and Contract Review (LBA template returns; procedural generator covers all letter types in v0.1)
- Multi-instance Redis-backed rate limiter
- Chronology-write capability wiring when a module-driven write endpoint lands

Further out (v0.3+):

- Matter export / import with privilege-aware redaction matrix. Deferred because at v0.1 there's no second user or second matter to pressure-test the wire format against.

Full picture: [`docs/ROADMAP.md`](./docs/ROADMAP.md).

## Why this exists

Post-Heppner, the regulatory shape of legal AI in the UK matters more than the model layer. The thesis and the constraints are in [`docs/MANIFESTO.md`](./docs/MANIFESTO.md).

## Architecture and design

- [`ARCHITECTURE.md`](./ARCHITECTURE.md) - stack rationale and decisions
- [`docs/AUTH.md`](./docs/AUTH.md) - auth and provider-key model
- [`docs/TRUST.md`](./docs/TRUST.md) - privilege architecture, sub-processor list, compliance order, open gaps
- [`docs/MODULE_DEVELOPMENT.md`](./docs/MODULE_DEVELOPMENT.md) - write a new module
- [`docs/ATTRIBUTIONS.md`](./docs/ATTRIBUTIONS.md) - library credits and licence notes

## Disclaimer

This repository provides software tools that may assist in the production of legal work-product. It does not provide legal services or legal advice. The workspace and modules are designed to be used by qualified solicitors under their professional supervision. Use by non-lawyers in a regulated legal context may breach the Legal Services Act 2007 and the SRA Standards and Regulations.

## Licence

Apache-2.0. See [LICENSE](./LICENSE).

## Maintainer

[@b1rdmania](https://github.com/b1rdmania)
