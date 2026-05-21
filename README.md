# Legalise

Open-source UK legal AI workspace.

Open a matter. Ask the assistant. Install legal modules. Run them through capability and privilege gates. Keep the record.

Legalise is open source. The hosted site is a limited evaluation environment. Real AI workflows require your own model key. Legalise does not provide model access and is not for live client matters.

![Audit tab. Khan v Acme sample matter.](docs/img/audit-tab.png)

---

## Why

Most legal AI starts in the wrong place.

It starts with chat. Or a CRM. Or a workflow builder. Then it tries to bolt legal trust on afterwards.

Legal work does not start with a chat box. It starts with a matter file.

A matter has documents, dates, parties, privilege, disclosure constraints, draft outputs, solicitor judgement, and a record of what happened. If AI is going to advance legal work, it has to live inside that structure.

That is what Legalise is testing.

The audit trail matters because it makes the work inspectable. But audit is not the product. Audit is the receipt.

The product thesis is supervised autonomy: AI can advance a matter only if matter context, permissions, provenance, review gates, and accountability are first-class.

Legalise is the open-source substrate for that thesis. The hosted site is only an evaluation environment.

---

## What a reviewer will ask

A regulator, insurer, supervisor, or partner will eventually ask four questions about any AI tool used on a matter:

1. What did it see?
2. When?
3. Under what protection?
4. What did it produce?

Most legal AI tools can answer one of them, partially. Legalise is built so the workspace can answer all four by default.

---

## What did it see?

Every matter has a spine: documents, chronology, parties, retention clock, privilege posture. The AI only sees what lives inside the matter. Cross-matter leakage is structurally impossible.

Disclosure-tainted chronology entries carry a CPR 31.22 implied-undertaking flag. The chronology gate withholds detail until acknowledgement. The acknowledgement is audited.

## When?

Every model call, document mutation, chronology entry, and capability denial writes one row to an audit log that the application never updates or deletes. Timestamped, hashed, tied to the matter and the actor. The Audit tab is the regulator-facing record.

Append-only is enforced by convention today: the application never writes UPDATE or DELETE against `audit_entries`. Postgres-level WORM grants (REVOKE UPDATE/DELETE on the table for the app role) are a live-matter readiness gate; the current audit trail is therefore not forensically tamper-resistant against a DB superuser. See [`docs/TRUST.md`](./docs/TRUST.md#8-audit-trail).

No background calls. No invisible inference. If it touched the matter, it's logged.

## Under what protection?

Every matter carries one of three privilege flags.

- `A_cleared`: privileged material excluded or cleared. Cloud providers permitted.
- `B_mixed`: opt-in per provider. Default for most matters.
- `C_paused`: privileged material present or unresolved. Cloud calls refused at the gateway. Local model only (Ollama).

The gateway reads the posture before every model call. Privilege is a hard dispatch constraint, not a checkbox.

## What did it produce?

Prompt and response are hashed and stored. So is the model, the tokens, the latency, the posture, the module that made the call. Any AI interaction on the matter can be reconstructed from the audit row, subject to the tamper-resistance caveat above.

Capabilities for each module are declared in the manifest (read documents, call the model, write citations, etc.), granted on install, and checked at runtime before every privileged operation. A denial is a structured 403 plus an audit row.

The doctrine:

> Manifest requests capabilities. Workspace grants capabilities. Runtime enforces capabilities.

---

## In 60 seconds

Five surfaces inside the matter workspace:

- **Pre-Motion.** Adversarial premortem of a draft pleading. Four stages, nine model calls, one audited run.
- **Contract Review.** Parser, analyst, redliner, summariser pipeline. Streams stage events.
- **Letters.** LBA and matter-shaped letters from context. `.docx` export.
- **Anonymisation.** Presidio + deterministic token map. Detokenise byte-identical.
- **Assistant.** Matter-scoped chat with document and chronology citations.

Plus tracked-changes document editing, tabular review across documents, case-law citation lookup.

The plugin layer (where the legal logic actually lives) is at [`claude-for-uk-legal`](https://github.com/b1rdmania/claude-for-uk-legal). 15 skills across UK employment law, civil litigation, and legal research. Apache 2.0. Pinned by SHA so the install surface is reproducible.

## Try it

The hosted evaluation environment at [legalise.dev](https://legalise.dev) seeds the Khan v Acme sample matter on signup. To run it locally:

```bash
git clone https://github.com/b1rdmania/legalise
cd legalise
cp .env.example .env             # ANTHROPIC_API_KEY optional; stub-echo works without
docker compose -f infra/docker-compose.yml up --build
```

Postgres + pgvector + MinIO + Redis + Gotenberg + FastAPI + React. One command. Open `http://localhost:3000`.

## Status

Evaluation release candidate. Honest about what's in and what isn't.

**Shipped:**

- Five surfaces wired end-to-end against the Khan v Acme matter
- Audit middleware on every model call and matter mutation
- Privilege-aware gateway across Anthropic, OpenAI, Ollama
- Runtime capability enforcement at five boundaries (plugin bridge, model gateway, tool invocation, document body read, citation writes)
- Tracked-changes editing with accept / reject and version timeline
- fastapi-users cookie sessions, email verification, per-user AES-256-GCM-encrypted provider keys
- Bootstrap audit rows on per-user seed so the Audit tab is non-empty on first paint
- Real-DB E2E test infrastructure; 155 passed, 53 skipped in backend CI

**Live-matter readiness gates:**

- Real R2/S3 object storage for uploaded and generated artefacts. Fly filesystem remains cache/materialisation only.
- Durable jobs (`arq` + Redis + `jobs` table). Long runs should not depend on a live request.
- Release-step migrations instead of app-boot schema mutation.
- Hosted evaluation limits: storage, workflow runs, active jobs, generated artefacts, and public submissions.
- Matter export / delete with retention-aware audit handling.
- WORM audit groundwork.
- Key-rotation runbook for encrypted provider keys.

**v0.6 trust layer:**

- Configurable prompt shroud before cloud model dispatch.
- Legal-quality evals for grounding, citation integrity, refusal behaviour, and module regressions.

Full roadmap: [`docs/ROADMAP.md`](./docs/ROADMAP.md).

## Read deeper

- [`docs/MANIFESTO.md`](./docs/MANIFESTO.md): commitments that don't move
- [`docs/TRUST.md`](./docs/TRUST.md): privilege architecture, sub-processor list, open gaps
- [`docs/SUPERVISED_AUTONOMY.md`](./docs/SUPERVISED_AUTONOMY.md): launch definition and claim boundary
- [`ARCHITECTURE.md`](./ARCHITECTURE.md): stack rationale and decisions
- [`docs/ENGINEERING.md`](./docs/ENGINEERING.md): bespoke vs boring; what's custom, what's stock
- [`docs/AUTH.md`](./docs/AUTH.md): auth and provider-key model
- [`docs/MODULE_DEVELOPMENT.md`](./docs/MODULE_DEVELOPMENT.md): write a new module
- [`docs/ATTRIBUTIONS.md`](./docs/ATTRIBUTIONS.md): library credits and licence notes

## Caveat

This is software that helps produce legal work-product. It is not legal advice. The workspace and modules are designed for qualified solicitors under their professional supervision. Use by non-lawyers in a regulated legal context may breach the Legal Services Act 2007 and the SRA Standards and Regulations.

## Licence

Apache 2.0. See [LICENSE](./LICENSE).

## Maintainer

[@b1rdmania](https://github.com/b1rdmania). Open an issue. Or, if you're a UK solicitor wondering what your AI did with the client documents, get in touch.
