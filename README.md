# Legalise

An open-source governance layer for legal AI: human sign-off and a
tamper-evident audit trail for AI-assisted legal work.

Open source, runs locally, bring your own model key. Evaluation release,
not for live client matters.

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
- **Source anchors.** An output carries the documents it cited. Document anchors
  are server-known, independent of the model. Where the model supplied a quote,
  Legalise checks it against the extracted body (`quote_found_in_source`): cited
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
about any AI tool used on a matter:

1. What did it see?
2. Under what protection?
3. What did it produce?
4. Who stayed accountable?

**What it saw.** Every matter has a spine: documents, chronology, parties,
retention clock, privilege posture. The assistant is scoped to one matter and
cannot see other matters. Within a matter it works from the structured spine,
audited retrieval over indexed document chunks, capped chronology context, and
recent chat, all under a token budget that can truncate. Search/read activity is
recorded as audit evidence, including the document chunks the assistant relied
on, so "what did the AI see?" is inspectable rather than implied. Cross-matter
access is scoped in the application layer and every access is audited (enforced
in the application, not a structural guarantee).
Disclosure-tainted chronology entries carry a CPR 31.22 flag; the chronology
gate withholds detail until the user acknowledges it, and the acknowledgement
is audited.

**Under what protection.** Every matter carries a privilege posture, read
before each model call:

- `A_cleared`: privileged material excluded or cleared; cloud providers permitted.
- `B_mixed`: opt-in per provider; the default.
- `C_paused`: privileged or unresolved; cloud calls refused at the gateway,
  local model (Ollama) only.

**What it produced.** Prompt, response, model, tokens, latency, posture, and
calling module are hashed and stored. Any interaction reconstructs from the
audit row.

**Who stayed accountable.** A named human signs each output, and the record
shows whether the signer was the author. Every model call, mutation, chronology
entry, and denial writes one row to an append-only audit log: timestamped,
hashed, tied to the matter and the actor. A Postgres trigger rejects UPDATE and
DELETE, and rows mirror into a hash chain.

One caveat, stated plainly: this is tamper-evidence, not tamper-proofing. A
database superuser can still rewrite and re-link history. External anchoring
would close that and is not built. See
[`docs/TRUST.md`](./docs/TRUST.md#8-audit-trail).

No background calls. No invisible inference. If it touched the matter, it's logged.

---

## Try it

[legalise.dev](https://legalise.dev) hosts a guided demo of the Khan v Acme
workspace and the architecture write-up. **Hosted accounts are not open for
sign-up right now**; the backend is request-only and paused. To run the full
workspace, fork and run it locally.

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
- GHCR images are published by `.github/workflows/container-images.yml`. Local
  quickstart builds from source by default; set
  `LEGALISE_USE_PREBUILT_IMAGES=true` to pull the published images instead.
- For setup problems, run `legalise doctor` and open an issue if a fresh fork
  won't come up.
- Backup, restore, and operations runbooks are maintained outside this public
  repo. Open an issue if you're self-hosting and need them.

## Status

Evaluation release. Honest about what's in and what isn't.

**Shipped:**

- Matter surface ordered as the loop (Documents / Chat / Skills), with Activity,
  signed outputs, and working-pack export.
- Files as first-class records: routed detail page, body / versions /
  anonymisation / edit surfaces, original-file retrieval through an owner-only
  backend proxy with a `document.original.accessed` audit row on access.
- Governed skills per matter, readiness shown from a single backend
  `Matter.required_provider` field, so the UI does no model-family guessing.
- Two module runtimes:
  - **Native modules** (`examples.contract-review`, `examples.pre-motion`)
    emitting source anchors and `findings_pack` / `motion_draft` /
    `evidence_list` artifacts.
  - **Prompt runtime** for Lawve `SKILL.md` imports: manifest-contained
    instructions, server-built document anchors, optional `quote_found_in_source`.
- **Professional sign-off** as the matter's main decision point: append-only
  history, hash pinning, promoted in Activity.
- **Source anchors v1** across the prompt runtime and the example modules.
- **Export gating v1.1:** sign-off status, integrity flag, and source anchors in
  the export bundle, with a README describing the honesty boundaries.
- Capability enforcement at five runtime boundaries; per-matter grants;
  idempotent re-grants.
- Privilege-aware gateway across Anthropic, OpenAI, Ollama, and a keyless
  `stub-echo` demo provider.
- `fastapi-users` cookie sessions, email verification, per-user AES-256-GCM
  provider keys, owner-only matter access (no superuser sign or read shortcut;
  sign-off is personal accountability).
- Audit middleware on every model call and matter mutation; a reconstruction
  endpoint merging audit, state-machine, and advice-boundary sources into one
  timeline.
- Real-DB E2E test infrastructure exercised on every push.

**Live-matter readiness gates (still open):**

- Append-only audit is enforced for normal paths by a Postgres trigger and a
  hash chain. The remaining hardening is operational WORM: split DB roles,
  app-role revokes, and external anchoring so a DB superuser cannot bypass the
  controls unnoticed.
- Module signature verification is structural today. The cryptographic
  `verified` grade (ed25519 against a registered publisher key) is implemented
  but **no publisher key is registered yet**, so every import resolves to
  `structure_verified`. Sigstore-level chain verification is backlog.
- Single workspace by design: one deployment is one workspace, the admin flag is
  the only privileged role, matters are owner-scoped. A tenancy model deserves
  its own design pass. Self-hosters who need separation run one deployment per team.
- Hosted evaluation limits on storage, runs, active jobs, artefacts, and module
  submissions.
- Configurable prompt shroud before cloud-model dispatch.
- Legal-quality evals for grounding, citation integrity, refusal, and module
  regressions.

Full roadmap: [`docs/ROADMAP.md`](./docs/ROADMAP.md).

## Docs

Start with [`docs/`](./docs/):

- [`docs/TRUST.md`](./docs/TRUST.md): privilege architecture, sub-processors, open gaps (read first)
- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md): how it works today, cited to code
- [`docs/EVALUATING.md`](./docs/EVALUATING.md): the walkthrough, the evaluation gate, the run records
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
