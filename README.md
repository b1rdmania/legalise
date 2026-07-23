# Legalise

> ⚠️ **Evaluation release — a reference implementation, not production
> software. Not for live client matters.** See
> [`docs/LIMITATIONS.md`](./docs/LIMITATIONS.md) for what is and isn't ready.

An open-source workspace for AI-assisted legal work in England and Wales.
It records sources, model calls, review, edits, and human sign-off against
each matter.

Open source, runs locally, bring your own model key.

---

## How it works

The loop is **draft, cite, sign-off, audit**. AI prepares an output inside a
matter and cites the documents used. A named person reviews it and records a
decision. The decision pins the reviewed output by hash.

Matter actions handled by Legalise write to an append-only, hash-chained audit
log. The log is tamper-evident, not tamper-proof. See
[`docs/TRUST.md`](./docs/TRUST.md) for the claim boundary and open gaps.

---

## What's in the repo

A worked evaluation workspace around the Khan v Acme sample matter:

- **Documents:** upload, extraction, version history, disclosure flags, and
  owner-scoped original-file access.
- **Chat and skills:** work against selected matter documents through a shared
  model gateway.
- **Review and sign-off:** record `signed`, `signed_with_observations`, or
  `rejected`; pin the reviewed output by hash.
- **Activity and export:** inspect the matter record and export its documents,
  outputs, sign-offs, source anchors, and audit data.

The runtime includes capability checks, matter privilege settings, an
advice-boundary gate, and one model gateway for Anthropic, OpenAI, OpenRouter,
and Ollama. Users bring their own model keys. Legalise does not provide model
access.

Skills arrive by import. The
[`awesome-legal-skills`](https://github.com/lawve-ai/awesome-legal-skills)
(Lawve) catalogue is browsable in-app, and any public GitHub repo with a
`SKILL.md` can be dropped in by URL (e.g.
[`pre-motion`](https://github.com/b1rdmania/pre-motion)). Each import becomes a
draft pinned to a commit SHA. It must pass the admission flow and receive
matter-level permissions before it can run.

---

## What it records

- Documents and source anchors used by a Legalise workflow.
- Model, token, latency, posture, and prompt/response hashes for gateway calls.
- Review decisions, tracked edits, sign-offs, and refusals.
- An append-only audit row and hash-chain entry for recorded matter actions.

A database superuser can rewrite unanchored history by disabling the controls.
External anchoring is not built. See
[`docs/TRUST.md`](./docs/TRUST.md#8-audit-trail).

---

## Try it

[legalise.dev](https://legalise.dev) hosts a guided demo of the Khan v Acme
workspace and the architecture write-up. **The hosted backend is currently
turned off:** there are no hosted accounts, model calls, or matter storage.
Run the complete workspace locally or on your own infrastructure with your own
model keys.

Email [andrew@legalise.dev](mailto:andrew@legalise.dev) with questions.

Stack: Postgres, MinIO, Redis, Gotenberg, FastAPI, React.

### Local fork

1. **Clone.**

   ```bash
   git clone https://github.com/b1rdmania/legalise
   cd legalise
   ```

2. **Run quickstart.** It copies `.env` if needed and starts the compose stack.

   ```bash
   ./scripts/quickstart.sh
   ```

   To skip local image builds when published images are available:

   ```bash
   LEGALISE_USE_PREBUILT_IMAGES=true ./scripts/quickstart.sh
   ```

3. **Create the first account.** Open <http://localhost:3000> and sign up. In
   local dev the first user is verified, seeded with Khan v Acme, and promoted to
   workspace admin automatically. No bootstrap CLI step is needed.

4. **Run the loop.** The five steps the workspace exists for, in order:

   1. **Create a matter** — or open the seeded Khan v Acme.
   2. **Add documents** — drag/drop into the matter; bodies are extracted.
   3. **Ask the assistant** — Chat over the documents you select.
   4. **Run a skill** — **Skills → Add skill** to inspect a Lawve skill, convert
      it to a governed draft, run the trust ceremony, enable it on the matter,
      then run it from chat.
   5. **Sign the output, then export the working pack** — review the output and
      record a sign-off, then export the matter ZIP (documents, audit trail,
      outputs, sign-off records, source anchors, integrity flag).

5. **Check the stack with `legalise doctor`.** Inspection only; verifies the
   database is reachable, migrations are current, MinIO is responding, plugins
   are mounted, and the v2 manifests validate.

   ```bash
   docker compose -f infra/docker-compose.yml exec backend python -m app.tools.doctor
   ```

To check the fork end-to-end without driving the UI by hand, run
`./scripts/smoke.sh`. It runs the same Playwright first-run spec as CI
(truncates the local database; see the script's prompt).

### Manual local path

If you don't want quickstart to clone the skills catalogue or start compose:

1. Copy env.

   ```bash
   cp .env.example .env
   ```

2. Bring the stack up.

   ```bash
   docker compose -f infra/docker-compose.yml up -d
   ```

3. Register the first user at <http://localhost:3000>. With
   `LEGALISE_DEV_AUTO_ADMIN_FIRST_USER=true` (the local default), that user
   becomes workspace admin. With the flag off, run the bootstrap CLI after signup:

   ```bash
   docker compose -f infra/docker-compose.yml exec backend \
       python -m app.tools.bootstrap_admin --email you@example.com
   ```

### Self-hosting notes

- Deploying your fork to Fly: change `app = "legalise-backend"` in
  `backend/fly.toml` before `fly deploy`.
- GHCR images are published by `.github/workflows/container-images.yml` as
  multi-arch (`linux/amd64` + `linux/arm64`, incl. Apple Silicon). Local
  quickstart builds from source by default; set
  `LEGALISE_USE_PREBUILT_IMAGES=true` to pull the published images instead.
- For setup problems, run `legalise doctor` and open an issue if a fresh fork
  won't come up.
- Backup, restore, and operations runbooks are maintained outside this public
  repo. Open an issue if you're self-hosting and need them.

## Status

Evaluation release. Not for live client matters.

- **What works** is in the [CHANGELOG](./CHANGELOG.md), and you can run all of
  it: the full matter loop, audited retrieval, sign-off, export, and a
  deterministic eval harness ([agent-kit](https://github.com/b1rdmania/agent-kit))
  that gates grounding, refusal, and audit-chain integrity in CI.
- **What's deliberately out of scope, or not production-grade**, is in
  [`docs/LIMITATIONS.md`](./docs/LIMITATIONS.md) — gaps first.
- **What's planned** is in [`docs/ROADMAP.md`](./docs/ROADMAP.md).

## Docs

Start with [`docs/`](./docs/):

- [`docs/TRUST.md`](./docs/TRUST.md): privilege architecture, sub-processors, open gaps (read first)
- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md): how it works today, cited to code
- [`docs/EVALUATING.md`](./docs/EVALUATING.md): the walkthrough and the evaluation gate
- [`docs/THREAT_MODEL.md`](./docs/THREAT_MODEL.md): adversary model and what we don't defend
- [`docs/LIMITATIONS.md`](./docs/LIMITATIONS.md): what is not production-grade and what a fork must build (read before building on top)
- [`docs/adr/`](./docs/adr/): architecture decision records — why the system is shaped this way and what not to refactor
- [`docs/ROADMAP.md`](./docs/ROADMAP.md): shipped, deferred, parked
- [`docs/ATTRIBUTIONS.md`](./docs/ATTRIBUTIONS.md): credits and licence notes

Operator material is maintained outside this public repo. Open an issue if
you're self-hosting and need something that isn't here.

## Contributing

You don't need to touch the core. The easiest ways in: practitioner feedback
(no code, corrections with authority attached), a one-row eval case, or a
governed legal skill built in your own repo and listed in the
[community catalogue](./docs/CATALOGUE.md) with a one-row PR. The ladder, the
ground rules, and the dev setup are in [CONTRIBUTING.md](./CONTRIBUTING.md);
skill authoring is in [`docs/BUILDING_SKILLS.md`](./docs/BUILDING_SKILLS.md).

## Caveat

Not legal advice, not a law firm, not for live client matters. Real regulated
use needs the firm's own supervision, policies, model-key posture, and
professional controls.

## Licence

Apache 2.0. See [LICENSE](./LICENSE).

## Maintainer

[@b1rdmania](https://github.com/b1rdmania). Open an issue, or get in touch if
you're a UK solicitor wondering what your AI did with the client documents.

Forks are independent deployments, not operated, reviewed, or endorsed by the
maintainer unless stated.
