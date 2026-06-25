# Legalise

An open-source governance layer for legal AI: human sign-off and a
tamper-evident audit trail for AI-assisted legal work.

Open source, runs locally, bring your own model key. Evaluation release —
not for live client matters.

---

## Why

The interesting question in legal AI is no longer only what AI can
automate.

It is what a firm should choose not to automate, where human judgement
must stay named, and how the system proves that boundary held.

Legalise treats AI as preparation, not as the deliverable. Outputs sit
inside a matter file. They know what documents they used, what
permissions they had, what they produced. A solicitor reads the output
with its cited sources visible, takes professional ownership by signing
it, and the system preserves what was signed — content pinned by a
hash, available for export as a defensible record.

The audit trail makes the work inspectable. The signature makes a
human accountable. Together, that is the governance layer. Audit alone is
just the receipt.

What Legalise does and does not claim lives in [`docs/TRUST.md`](./docs/TRUST.md)
(gaps listed first). The full doc set is indexed in [`docs/`](./docs/).

---

## What is in the repo

Legalise currently ships a worked evaluation workspace around the
Khan v Acme sample matter. The matter surface now follows the golden
loop directly:

- **Documents:** where a matter opens — every file in the matter, with
  drag/drop ingress, extracted bodies, version history, the CPR 31.22
  disclosure flag, and original-file retrieval through an owner-only
  backend proxy.
- **Chat:** ask about the matter or run a ready skill against the
  selected documents.
- **Skills:** governed legal skills enabled for this matter — readiness
  shown up-front (`Ready` / `Keyless demo model` /
  `Requires Anthropic key` / `Requires OpenAI key`).
- **Activity:** the contextual proof layer — module
  invoked, model called, output written, sign-off recorded, supervisor
  decision (when used), gate denials.
- **Signed outputs** and **Working pack:** the signed material and
  exportable matter record, reached from cards and contextual links.

Skills produce **outputs** (artifacts) the user reviews,
signs, and exports:

- **Professional Sign-Off:** the author reads an AI-prepared output and
  records `signed` / `signed_with_observations` / `rejected`. The
  signature pins the exact output by hash; the record is append-only.
  Supervisor Review remains available as an optional separate review
  path.
- **Source anchors:** an output carries the documents it cited.
  Document anchors are server-known (independent of the model). Where a
  model supplied a quote, Legalise checks whether the quoted text is
  present in the extracted document body — `quote_found_in_source`,
  *cited for review*, not certified.
- **Export:** the matter export ZIP carries documents, audit trail,
  outputs, sign-off records, source anchors, and an integrity flag
  showing whether each signed output's payload still matches its
  pinned hash.

Supporting substrate:

- **Permission gates:** manifests declare what a skill needs; the
  workspace grants it on a matter; runtime checks it.
- **Privilege control + advice-boundary gate** before every model call.
- **Matter-scoped model gateway** across Anthropic, OpenAI, and Ollama.
- **BYO keys:** users store their own provider keys encrypted at rest;
  Legalise itself does not provide model access.
- **Activity / audit trail:** model calls, skill actions, denials, mutations,
  provider failures, and storage failures leave rows.

Skills arrive by import: the
[`awesome-legal-skills`](https://github.com/lawve-ai/awesome-legal-skills)
(Lawve) catalogue is browsable in-app, and any public GitHub repository
with a `SKILL.md` can be dropped in by URL (e.g.
[`pre-motion`](https://github.com/b1rdmania/pre-motion)). Every import
converts to a governed draft at a pinned commit SHA, passes the trust
ceremony, and runs under the same governance — a `prompt` runtime that
produces a `skill_response` artifact subject to the same sign-off and
source-anchor handling.

---

## What the system is trying to prove

A regulator, insurer, supervisor, or partner will eventually ask four questions about any AI tool used on a matter:

1. What did it see?
2. Under what protection?
3. What did it produce?
4. Who remained accountable?

Every matter has a spine: documents, chronology, parties, retention clock, privilege posture. The AI only sees what lives inside the matter. Cross-matter access is scoped by access control at the application layer, and every access is audited. This is enforced in the application, not a structural guarantee. See [`docs/TRUST.md`](./docs/TRUST.md).

Disclosure-tainted chronology entries carry a CPR 31.22 implied-undertaking flag. The chronology gate withholds detail until acknowledgement. The acknowledgement is audited.

Every model call, document mutation, chronology entry, and capability denial writes one row to an audit log that the application never updates or deletes. Timestamped, hashed, tied to the matter and the actor. Activity is the user-facing receipt; the raw audit log remains inspectable for reconstruction.

Append-only is enforced in the database for normal application paths:
`audit_entries` has a Postgres trigger that rejects UPDATE and DELETE,
and new rows are mirrored into an append-only audit hash chain. The
remaining live-matter caveat is operational: a DB superuser can still
bypass database controls, and external notary/anchoring is not yet part
of the shipped loop. See [`docs/TRUST.md`](./docs/TRUST.md#8-audit-trail).

That makes Activity a receipt today: useful for reconstruction,
review, and export integrity. A future notary/anchoring step can pin
audit-chain heads outside the database, but that is a credibility layer,
not a prerequisite for the local demo loop.

No background calls. No invisible inference. If it touched the matter, it's logged.

---

## Trust mechanics

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

## Try it

[legalise.dev](https://legalise.dev) hosts the public demo (a guided walk through the Khan v Acme workspace) and the architecture write-up. **Hosted workspace accounts are not open for sign-up right now** — the hosted backend is request-only and currently paused. To run the full workspace yourself today, fork and run the stack locally (below).

Stack: Postgres + MinIO + Redis + Gotenberg + FastAPI + React.

### Local fork — two-minute path

1. **Clone.**

   ```bash
   git clone https://github.com/b1rdmania/legalise
   cd legalise
   ```

2. **Run quickstart.** It copies `.env` if needed and starts the
   compose stack.

   ```bash
   ./scripts/quickstart.sh
   ```

   To skip local backend/frontend image builds when published images are
   available:

   ```bash
   LEGALISE_USE_PREBUILT_IMAGES=true ./scripts/quickstart.sh
   ```

3. **Create the first account.** Open <http://localhost:3000> and sign
   up. In local dev, the first user is verified, seeded with Khan v
   Acme, and promoted to workspace admin automatically. No bootstrap
   CLI step is needed.

4. **Run the loop.** Open Khan v Acme, use Chat, and open **Skills → Add
   skill** to inspect a Lawve skill, convert it to a governed draft, run
   the trust ceremony, enable it on the matter, and run it from chat.

5. **Check the stack with `legalise doctor`.** Inspection-only; verifies
   the database is reachable, migrations are current, MinIO is
   responding, plugins are mounted, and the v2 manifests validate.

   ```bash
   docker compose -f infra/docker-compose.yml exec backend python -m app.tools.doctor
   ```

To prove the fork is healthy end-to-end without driving the UI by hand,
run `./scripts/smoke.sh`. It executes the same Playwright first-run spec
the CI workflow runs (truncates the local database — see the script's
prompt).

### Manual local path

If you do not want quickstart to clone the skills catalogue or start
compose for you, the manual path is:

1. Copy env.

   ```bash
   cp .env.example .env
   ```

2. Bring the stack up.

   ```bash
   docker compose -f infra/docker-compose.yml up -d
   ```

3. Register the first user at <http://localhost:3000>. With
   `LEGALISE_DEV_AUTO_ADMIN_FIRST_USER=true` (the local default), that
   user becomes the workspace admin. If you turn that flag off, run the
   explicit bootstrap CLI after signup:

   ```bash
   docker compose -f infra/docker-compose.yml exec backend \
       python -m app.tools.bootstrap_admin --email you@example.com
   ```

### Self-hosting notes

- If deploying your fork to Fly, change `app = "legalise-backend"` in `backend/fly.toml` before `fly deploy`.
- GHCR images are published by `.github/workflows/container-images.yml`.
  Local quickstart uses source builds by default; set
  `LEGALISE_USE_PREBUILT_IMAGES=true` to pull the published
  backend/frontend images instead.
- For setup problems, run `legalise doctor` (above) for diagnostics, and open an issue if a fresh fork won't come up.
- Backup, restore, and deployment/operations runbooks are maintained by the project outside this public repo — open an issue if you're self-hosting and need them.

## Status

Evaluation release. Honest about what's in and what isn't.

**Shipped:**

- Matter surface ordered around the matter loop: Documents / Chat /
  Skills, with Activity, signed outputs, and working-pack export
  reached from cards and contextual links.
- Files are first-class records: routed detail page, body/versions/
  anonymisation/edit surfaces, original-file retrieval through an
  owner-only backend proxy with an `document.original.accessed` audit
  row on successful access.
- Governed skills on a matter, with readiness shown up-front from a
  single backend `Matter.required_provider` field — no model-family
  guessing in the UI.
- Two module runtimes:
  - **Native modules** (`examples.contract-review`, `examples.pre-motion`)
    that emit source anchors and `findings_pack` / `motion_draft` /
    `evidence_list` artifacts.
  - **Prompt runtime** for Lawve `SKILL.md` imports — manifest-contained
    instructions, server-built document anchors, optional model claim
    enrichment with `quote_found_in_source`.
- **Professional Sign-Off:** author sign-off as the matter's main
  decision point. Append-only history. Hash pinning. Activity
  promotes sign-off as a foreground event.
- **Source anchors v1** across the prompt runtime and the example modules.
- **Export Gating v1.1:** sign-off status + integrity flag + source
  anchors preserved in the export bundle; README in the bundle
  describes the honesty boundaries.
- Capability enforcement at five runtime boundaries; per-matter
  matter-scoped grants; idempotent re-grants.
- Privilege-aware gateway across Anthropic, OpenAI, Ollama, and a
  keyless `stub-echo` demo provider.
- `fastapi-users` cookie sessions, email verification, per-user AES-256-
  GCM-encrypted provider keys, owner-only matter access (no superuser
  signing or read shortcut on matters; sign-off is *personal*
  accountability).
- Audit middleware on every model call and matter mutation; matter
  reconstruction endpoint merges audit / state-machine / advice-
  boundary sources into one ordered timeline.
- Real-DB E2E test infrastructure with the backend and Playwright suite
  exercised on every push.

**Live-matter readiness gates (still):**

- Append-only audit is enforced for normal application paths by a
  Postgres trigger, and new rows are mirrored into an audit hash chain.
  The remaining hardening gate is operational WORM: split DB roles,
  app-role revokes, and external notary/anchoring so a DB superuser
  cannot bypass the controls unnoticed.
- Module signature verification is structural today. The cryptographic
  `verified` grade (ed25519 against a registered publisher key) is
  implemented but **no publisher key is registered yet**, so every imported
  skill currently resolves to `structure_verified`. Sigstore-level chain
  verification is hardening backlog.
- Single workspace by design. There is no organisation or multi-tenant
  model in the beta: one deployment is one workspace, the admin flag is
  the only privileged role, and matters are owner-scoped. This is a
  deliberate scope decision, not an accident — a tenancy model (who is
  the tenant: a firm, a team, a chambers?) changes the data model and
  deserves its own design pass rather than complicating the beta.
  Self-hosters who need separation today run one deployment per team.
- Hosted evaluation limits on storage, workflow runs, active jobs,
  generated artefacts, and public module submissions.
- Configurable prompt shroud before cloud-model dispatch.
- Legal-quality evals for grounding, citation integrity, refusal
  behaviour, and module regressions.

Full roadmap: [`docs/ROADMAP.md`](./docs/ROADMAP.md).

## Read deeper

Start with [`docs/`](./docs/) — the curated doc set. Highlights:

- [`docs/TRUST.md`](./docs/TRUST.md): privilege architecture, sub-processor list, open gaps (read this first)
- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md): how the system works today, cited to code
- [`docs/EVALUATING.md`](./docs/EVALUATING.md): the walkthrough, the evaluation gate, and the gate run records
- [`docs/THREAT_MODEL.md`](./docs/THREAT_MODEL.md): adversary model and what we don't defend against
- [`docs/ROADMAP.md`](./docs/ROADMAP.md): shipped, deferred, parked
- [`docs/ATTRIBUTIONS.md`](./docs/ATTRIBUTIONS.md): library credits and licence notes

Operator and contributor material (ops runbooks, engineering notes, design
specs) is maintained by the project outside this public repo — open an issue
if you're self-hosting and need something that isn't covered here.

## Caveat

This is software for evaluating legal-AI workflows. It is not legal advice, not a law firm, and not for live client matters. Real regulated use needs the firm’s own supervision, policies, model-key posture, and professional controls.

## Licence

Apache 2.0. See [LICENSE](./LICENSE).

## Maintainer

[@b1rdmania](https://github.com/b1rdmania). Open an issue. Or, if you're a UK solicitor wondering what your AI did with the client documents, get in touch.

Canonical upstream: [`github.com/b1rdmania/legalise`](https://github.com/b1rdmania/legalise). Forks are independent deployments and are not operated, reviewed, or endorsed by the maintainer unless explicitly stated.
