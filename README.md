# Legalise

Open-source infrastructure for solicitor-owned AI preparation in
England & Wales.

Open a matter. Add documents. Run governed actions. Review outputs with
cited sources visible. **Sign the output as a record of professional
judgement.** Export the matter record.

Legalise is open source. The hosted site is a limited evaluation
environment. Real AI workflows require your own model key. Legalise
does not provide model access and is not for live client matters.

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
human accountable. Together they are the product. Audit alone is just
the receipt.

The full thesis lives in [`docs/MANIFESTO.md`](./docs/MANIFESTO.md). The claim boundary lives in [`docs/SUPERVISED_AUTONOMY.md`](./docs/SUPERVISED_AUTONOMY.md). The hosted site is only an evaluation environment.

---

## What is in the repo

Legalise currently ships a worked evaluation workspace around the
Khan v Acme sample matter. The matter surface compresses to four tabs:

- **Matter desk:** parties, posture, retention clock, readiness.
- **Documents:** drag/drop ingress, extracted bodies, version history,
  CPR 31.22 disclosure flag, original-file retrieval through an
  owner-only backend proxy.
- **Actions:** governed actions an installed module can run on this
  matter — readiness shown up-front (`Ready` / `Keyless demo model` /
  `Requires Anthropic key` / `Requires OpenAI key`).
- **Activity Trail:** the matter's record of what happened — module
  invoked, model called, output written, sign-off recorded, supervisor
  decision (when used), gate denials.

Available actions produce **outputs** (artifacts) the user reviews,
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

- **Capability gates:** manifests declare what a module needs; the
  workspace grants it on a matter; runtime checks it.
- **Privilege posture + advice-boundary gate** before every model call.
- **Matter-scoped model gateway** across Anthropic, OpenAI, and Ollama.
- **BYO keys:** users store their own provider keys encrypted at rest;
  Legalise itself does not provide model access.
- **Audit trail:** model calls, module actions, denials, mutations,
  provider failures, and storage failures leave rows.

A second module path imports prompt-only skills from the
[`awesome-legal-skills`](https://github.com/lawve-ai/awesome-legal-skills)
catalogue and runs them under the same governance — a `prompt` runtime
that produces a `skill_response` artifact subject to the same sign-off
and source-anchor handling. The first-party plugin layer where most
legal logic lives is
[`claude-for-uk-legal`](https://github.com/b1rdmania/claude-for-uk-legal).

---

## What the system is trying to prove

A regulator, insurer, supervisor, or partner will eventually ask four questions about any AI tool used on a matter:

1. What did it see?
2. Under what protection?
3. What did it produce?
4. Who remained accountable?

Every matter has a spine: documents, chronology, parties, retention clock, privilege posture. The AI only sees what lives inside the matter. Cross-matter leakage is structurally impossible.

Disclosure-tainted chronology entries carry a CPR 31.22 implied-undertaking flag. The chronology gate withholds detail until acknowledgement. The acknowledgement is audited.

Every model call, document mutation, chronology entry, and capability denial writes one row to an audit log that the application never updates or deletes. Timestamped, hashed, tied to the matter and the actor. The Audit tab is the regulator-facing record.

Append-only is enforced by convention today: the application never writes UPDATE or DELETE against `audit_entries`. Postgres-level WORM grants (REVOKE UPDATE/DELETE on the table for the app role) are a live-matter readiness gate; the current audit trail is therefore not forensically tamper-resistant against a DB superuser. See [`docs/TRUST.md`](./docs/TRUST.md#8-audit-trail).

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

The hosted evaluation environment at [legalise.dev](https://legalise.dev) is open for evaluation accounts. You can browse the Khan v Acme demo on the hosted site, create an account to run the workspace, or run the full stack locally.

Stack: Postgres + pgvector + MinIO + Redis + Gotenberg + FastAPI + React.

### Local fork — clone to signed-in superuser

1. **Clone.**

   ```bash
   git clone https://github.com/b1rdmania/legalise
   cd legalise
   ```

2. **Copy env.** Every variable has a working default for the Khan v Acme demo. The only decision is whether to set a provider key (Anthropic / OpenAI) or run the keyless `stub-echo` model.

   ```bash
   cp .env.example .env
   ```

3. **Bring the stack up.**

   ```bash
   docker compose -f infra/docker-compose.yml up --build -d
   ```

4. **Check the stack with `legalise doctor`.** Inspection-only; verifies the database is reachable, migrations are current, MinIO is responding, plugins are mounted, and the v2 manifests validate.

   ```bash
   docker compose -f infra/docker-compose.yml exec backend python -m app.tools.doctor
   ```

   Pre-signup, `khan.demo_present` will soft-note `no users yet — seed lands on first signup`. That's expected.

5. **Register an account.** Open <http://localhost:3000> and use the signup form. Dev-autoverify is on, so registration immediately verifies the account — no SMTP setup or email click is needed. You'll land signed in as a non-superuser; the Khan demo matter seeds on first signup.

6. **Promote yourself to superuser via the bootstrap CLI.** The CLI promotes an **existing** user — run it after step 5, not before.

   ```bash
   docker compose -f infra/docker-compose.yml exec backend \
       python -m app.tools.bootstrap_admin --email you@example.com
   ```

7. **Reload the browser** so `AuthProvider` re-fetches `/auth/users/me`. Superuser context loads.

8. **Re-run doctor** — `khan.demo_present` should now be `ok`. The full Khan v Acme demo is wired; see [`docs/DEMO.md`](./docs/DEMO.md) for the install → grant → run → audit walkthrough.

To prove the fork is healthy end-to-end without driving the UI by hand, run `./scripts/smoke.sh`. It executes the same Playwright first-run spec the CI workflow runs (truncates the local database — see the script's prompt).

### Self-hosting notes

- If deploying your fork to Fly, change `app = "legalise-backend"` in `backend/fly.toml` before `fly deploy`.
- The backend image vendors [`claude-for-uk-legal`](https://github.com/b1rdmania/claude-for-uk-legal) at a pinned SHA. Forks can point at their own plugin catalogue with the Docker build args `PLUGINS_REPO` and `PLUGINS_REPO_REF`.
- Common setup errors and their fixes live in [`docs/TROUBLESHOOTING.md`](./docs/TROUBLESHOOTING.md).

## Status

Evaluation release. Honest about what's in and what isn't.

**Shipped:**

- Compressed four-tab matter surface (Matter desk / Documents / Actions
  / Activity Trail) with the Activity Trail as the explanatory spine.
- Documents are first-class: routed detail page, body/versions/
  anonymisation/edit surfaces, original-file retrieval through an
  owner-only backend proxy with an `document.original.accessed` audit
  row on successful access.
- Governed actions on a matter, with readiness shown up-front from a
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
  decision point. Append-only history. Hash pinning. Activity Trail
  promotes sign-off as a foreground event.
- **Source anchors v1** across the prompt runtime and Contract Review.
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

- Append-only audit is enforced by application convention; Postgres-
  level WORM grants are a future gate, so the audit trail is **not**
  forensically tamper-resistant against a DB superuser.
- Sigstore-level signature verification on installed modules is
  structural today; cryptographic chain verification is hardening
  backlog.
- Hosted evaluation limits on storage, workflow runs, active jobs,
  generated artefacts, and public module submissions.
- Configurable prompt shroud before cloud-model dispatch.
- Legal-quality evals for grounding, citation integrity, refusal
  behaviour, and module regressions.

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

This is software for evaluating legal-AI workflows. It is not legal advice, not a law firm, and not for live client matters. Real regulated use needs the firm’s own supervision, policies, model-key posture, and professional controls.

## Licence

Apache 2.0. See [LICENSE](./LICENSE).

## Maintainer

[@b1rdmania](https://github.com/b1rdmania). Open an issue. Or, if you're a UK solicitor wondering what your AI did with the client documents, get in touch.

Canonical upstream: [`github.com/b1rdmania/legalise`](https://github.com/b1rdmania/legalise). Forks are independent deployments and are not operated, reviewed, or endorsed by the maintainer unless explicitly stated.
