# Legalise

> ⚠️ **Evaluation release — a reference implementation, not production
> software. Not for live client matters.** See
> [`docs/LIMITATIONS.md`](./docs/LIMITATIONS.md) for what is and isn't ready.

An open-source governance layer for UK legal AI: human sign-off and a
tamper-evident audit trail for AI-assisted legal work.

Open source, runs locally, bring your own model key.

---

## How it works

The loop is **draft, cite, sign-off, audit**. AI prepares an output inside a
matter file and cites the documents it used. A named solicitor reviews it and
signs; the signature pins the exact output by hash. Every step writes to an
audit log the application cannot edit or delete.

AI is preparation, not the deliverable. The audit trail makes the work
inspectable; the signature makes a human accountable. What Legalise does and
does not claim is in [`docs/TRUST.md`](./docs/TRUST.md), gaps first.

---

## What you can do with it

- **Evaluate supervised autonomy.** Run a skill over a matter's documents,
  review the output, sign it, verify the audit chain — then export the working
  pack to see exactly what a regulator or insurer would receive.
- **Fork it as a reference architecture.** The governance substrate — capability
  gates, privilege posture, professional sign-off, hash-chained audit — is
  tested and runnable. Adapt it for your own legal AI, or another regulated
  domain.
- **Self-host for internal use.** Run it on your own infrastructure with your
  own model keys; privileged content is never sent off the box to be indexed.
  Your supervision, your PII cover, your call on posture per matter.

---

## What's in the repo

A worked evaluation workspace around the Khan v Acme sample matter, ordered as
the matter loop:

- **Documents.** Every file in the matter: drag/drop ingress, extracted bodies,
  version history, the CPR 31.22 disclosure flag, and original-file retrieval
  through an owner-only backend proxy.
- **Chat.** Ask about the matter, or run a ready skill against selected documents.
- **Skills.** Governed legal skills enabled per matter, readiness shown up front
  (`Ready` / `Keyless demo model` / `Requires Anthropic key` / `Requires OpenAI key`).
- **Activity.** The proof layer: module invoked, model called, output written,
  sign-off recorded, gate denials.
- **Signed outputs** and **Working pack.** The signed material and the exportable
  matter record.

Skills produce outputs the user reviews, signs, and exports:

- **Professional sign-off.** The author reads an AI-prepared output and records
  `signed`, `signed_with_observations`, or `rejected`. The signature pins the
  output by hash; the history is append-only. Supervisor Review is an optional
  second path.
- **Source anchors.** Each output carries the documents it cited — server-known,
  independent of the model. Quotes are checked against the source text: cited
  for review, not certified.
- **Export.** The matter ZIP carries documents, audit trail, outputs, sign-off
  records, source anchors, and an integrity flag showing whether each signed
  output still matches its pinned hash.

Supporting substrate:

- **Permission gates.** A manifest declares what a skill needs; the workspace
  grants it on a matter; the runtime checks it before every privileged
  operation. A denial is a structured 403 plus an audit row.
- **Privilege and advice-boundary gates** before every model call.
- **Model gateway** across Anthropic, OpenAI, and Ollama. Users bring their own
  keys, stored encrypted at rest. Legalise does not provide model access.

Skills arrive by import. The
[`awesome-legal-skills`](https://github.com/lawve-ai/awesome-legal-skills)
(Lawve) catalogue is browsable in-app, and any public GitHub repo with a
`SKILL.md` can be dropped in by URL (e.g.
[`pre-motion`](https://github.com/b1rdmania/pre-motion)). Each import becomes a
governed draft pinned to a commit SHA, passes the trust ceremony, and runs
under the same sign-off and source-anchor handling.

---

## What it proves

A regulator, insurer, supervisor, or partner eventually asks four questions
about any AI tool used on a matter. Legalise answers each with a record, not a
promise:

**1. What did it see?** The assistant is scoped to one matter and can't see
others. Every document it reads is logged — so "what did the AI look at" is a
trail, not a guess.

**2. Under what protection?** Each matter sets how AI may touch privileged
material — **cloud allowed**, **mixed** (the default), or **paused** (local
model only) — and the rule is checked before every model call. Disclosure-
restricted material (CPR 31.22) is flagged and withheld until acknowledged.

**3. What did it produce?** Prompt, response, model, tokens, and posture are
hashed and stored. Any answer reconstructs from its audit row.

**4. Who stayed accountable?** A named solicitor signs each output by hash; the
record shows whether the signer wrote it. Every model call, change, and refusal
writes one row to an append-only log — a Postgres trigger blocks edits and
deletes, and rows hash-chain.

Caveat, plainly: this is tamper-**evident**, not tamper-proof. A database
superuser can still rewrite and re-link history; external anchoring would close
that and isn't built. See [`docs/TRUST.md`](./docs/TRUST.md#8-audit-trail).

No background calls. No invisible inference. If it touched the matter, it's logged.

---

## Try it

[legalise.dev](https://legalise.dev) hosts a guided demo of the Khan v Acme
workspace and the architecture write-up. **Hosted evaluator access is by
request** — open sign-up isn't enabled; email
[andrew@legalise.dev](mailto:andrew@legalise.dev) for backend access. To run
the full workspace yourself, fork and run it locally.

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

Evaluation release — honest about what's in and what isn't.

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
- [`docs/ROADMAP.md`](./docs/ROADMAP.md): shipped, deferred, parked
- [`docs/ATTRIBUTIONS.md`](./docs/ATTRIBUTIONS.md): credits and licence notes

Operator and contributor material is maintained outside this public repo. Open
an issue if you're self-hosting and need something that isn't here.

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
