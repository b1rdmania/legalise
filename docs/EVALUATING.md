# Evaluating Legalise

This is the doc for anyone evaluating Legalise: the hands-on walkthrough,
the bar we hold before inviting serious legal evaluators, and the record of
the gate runs we have actually walked.

Legalise is an open-source evaluation release candidate. The hosted site at
legalise.dev is a limited evaluation environment, not a live-client legal
service. See [`TRUST.md`](./TRUST.md) for the security and regulatory posture
and [`ARCHITECTURE.md`](./ARCHITECTURE.md) for how the system works.

---

## Part 1 — The hands-on walkthrough (Khan v Acme)

This is the evaluator-facing walkthrough. It assumes you have followed
[`README.md` → Try it](../README.md#try-it), signed in, and run
`legalise doctor` successfully. If `khan.demo_present` is `ok`, the Khan
v Acme matter is ready.

The goal is to prove the Legalise loop without explaining every internal
row name:

> open a project → inspect files → enable/run a skill → review output
> → sign → read Activity → export the working pack.

**What it proves.** By the end you will have opened a real matter folder,
inspected the files the skill can use, added and enabled a governed skill,
run it through the durable job path, reviewed and signed the output, read
matter Activity, and exported the working pack. That sequence is the
smallest end-to-end demonstration of supervised autonomy: a skill declares
what it needs, the matter grants it, runtime checks enforce it, output is
signed, and the record preserves what happened.

### 1 — Open the Khan matter

1. Navigate to <http://localhost:3000/matters>.
2. Open **Khan v Acme Trading Ltd**.
3. Confirm the left rail shows the matter section and the main surface
   lands on **Chat**.

### 2 — Inspect files

1. Open **Files**.
2. Open a seeded document.
3. Confirm the extracted text is readable and the metadata is secondary.
4. Use the back link to return to the matter.

### 3 — Add a skill to the workspace

1. Navigate to <http://localhost:3000/skills>.
2. Pick a skill from the catalogue (the example modules **Contract Review**
   and **Pre-Motion** under `examples/modules/`, a Lawve catalogue skill, or
   any public GitHub repo with a `SKILL.md` — e.g. `b1rdmania/pre-motion`).
3. Walk the add-skill trust ceremony.

Adding a skill is workspace-level trust. It does **not** make the skill
runnable in every matter.

### 4 — Enable the skill on Khan

1. Return to the Khan matter.
2. Open **Skills**.
3. Enable the added skill for this matter.
4. Confirm the card reads as ready in this project.

Matter-level enablement is where the skill receives permission to read
documents and write outputs for this matter.

### 5 — Run the skill

1. Open **Chat**.
2. Use the Skills picker, or open **Skills** and run from the skill card.
3. For Contract Review, the frontend creates a durable job and polls the
   job result.
4. Wait for the typed output to render.

The demo may use the keyless `stub-echo` provider where configured. Real
provider-backed runs require the user to add their own model key.

### 6 — Review and sign

1. Open the produced output.
2. Review its source references and any quote-location cautions.
3. Use **Review & sign**.
4. Choose `signed`, `signed_with_observations`, or `rejected`.

The signature records professional ownership of the output and pins the
signed payload by hash. It is not a claim that Legalise certifies the
legal position.

### 7 — Read Activity

1. Open **Activity** for the matter.
2. Confirm it shows the story of the run: skill run, model call, output,
   sign-off, and any gates or denials.
3. Use advanced details only if you need raw row filters.

Activity is the proof layer for the current matter. The raw audit rows
remain inspectable, but they are not the primary user surface.

### 8 — Export the working pack

1. Open **Working pack**.
2. Start an export and wait for the job to complete.
3. Download the pack.

The pack contains the matter metadata, documents, outputs, sign-off
records, reviews, reconstruction data, and README/manifest copy that
states the honesty boundaries.

### If something looks wrong

- Doctor first: `docker compose -f infra/docker-compose.yml exec backend python -m app.tools.doctor`.
- If a fresh fork won't come up, open an issue with the doctor output attached.
- Audit row names and the emission contract are summarised in [`ARCHITECTURE.md` §3](./ARCHITECTURE.md).

---

## Part 2 — The pre-evaluation gate

This is the bar before inviting serious legal evaluators into the
workspace. It is narrower than live-client readiness, but stricter than
the public demo. The aim is simple: an evaluator should be able to run one
matter from start to finish without us explaining stitched demo paths,
missing workers, or operational caveats that obscure the product thesis.

### Automated gate

CI must keep the golden loop green:

1. register/sign in;
2. create one fresh evaluator matter;
3. upload a document through the real multipart endpoint;
4. grant a governed prompt-runtime skill on that same matter;
5. run the skill from Chat;
6. produce an output artifact;
7. review and sign the output;
8. show `output.signed` in Activity;
9. complete a worker-backed working-pack export on the same matter.

This is pinned in `frontend/e2e/golden-loop.spec.ts`. The test uses the
real keyless `stub-echo` provider because CI cannot hold external model
keys. It is still a real backend path: matter rows, document storage,
grants, invocation, artifacts, sign-off, Activity, jobs, worker, and
export all have to work together.

### Manual BYO-key gate

Before evaluator access, run the same path manually with a real provider
key: create a new account; add an Anthropic or OpenAI key in Settings;
create a matter with a keyed default model; upload a realistic non-client
test pack; run one governed skill from Chat; review source anchors; sign or
reject; inspect Activity for the model call, invocation, artifact write and
sign-off rows; export the working pack and verify the zip contains the
document, artifact metadata, sign-off, review/audit reconstruction, and the
human-verification checklist. The manual run should not use the public demo
matter or seeded Khan shortcuts.

### Operational gate

Before legal evaluators get backend access, confirm:

- worker process group is running wherever the backend is running;
- migrations run as a release step and are current;
- object storage is the source of truth for uploaded originals and
  generated bytes;
- backups cover Postgres and object storage;
- restore has been rehearsed at least once in a disposable environment;
- audit-chain verification is green after restore;
- app-role audit WORM permissions are either enforced or explicitly
  listed as a hosted-eval residual risk;
- error/job telemetry does not record prompts, responses, or document text;
- `LEGALISE_KEY_ENCRYPTION_SECRET` rotation has a rehearsed runbook;
- private-beta terms say the hosted workspace is not for live client
  matters unless separately approved.

Open hosted residuals are tracked as a live issue (pre-promotion
operational gate).

### Launch decision

- If the automated gate is red, do not invite evaluators.
- If the automated gate is green but the manual BYO-key gate has not been
  run, the site can remain a public demo only.
- If both gates pass but the operational gate has open residual risks,
  invite only friendly evaluators with written caveats.
- Live-client matters need a separate approval decision.

---

## Part 3 — Run records

### Manual BYO-key gate — 2026-06-24 · PASSED

**provider: Anthropic · model: claude-opus-4-7**

Full path walked end to end on a local stack (env=development, infra
compose) with a real Anthropic key entered in Settings → Provider keys.
Non-client synthetic pack (Okafor v Pennine Freight Ltd — invented facts);
the public demo matter and the seeded Khan shortcuts were not used.

All nine steps passed:

1. account created via the register endpoint;
2. Anthropic key added in Settings → Provider keys;
3. fresh matter created with the intended model selected;
4. two synthetic `.txt` documents uploaded to object storage;
5. governed skill `github.b1rdmania.pre-motion` run from Chat — **real keyed
   model call** (`model.invoked`: model `claude-opus-4-7`, provider
   `anthropic`, 5,898 tokens in), not the keyless `stub-echo`;
6. source anchors present — both documents cited, with the "Legalise does
   not certify they prove the claim" framing;
7. signed with observations;
8. Activity shows advice-boundary, skill-run, `model.call`, completion,
   output-decision and sign-off rows; **audit chain verified (21 links)**;
9. worker-backed export produced a working-pack zip containing matter
   metadata, original document bytes (content-addressed), signed-output
   bytes, sign-off, audit + reconstruction (29-entry timeline), and a
   human-verification checklist.

Positives confirmed beyond the checklist: the rubber-stamp detector fired
("signed in 32s — faster than a plausible read of this output") and the
author≠signer self-sign was flagged; `model.call` telemetry records
metadata only (model, provider, token counts, ids) — no prompt, response,
or document text.

**Findings (non-blocking; none stopped the loop):**

- **F1 [FIXED]** Registration rejected reserved-TLD emails (`.test`/`.local`)
  with the raw email-validator message. Friendly validator added in
  `backend/app/api/auth_schemas.py`.
- **F2 [FIXED — new matters]** The new-matter form sent no model, so every
  matter silently took the backend `MatterCreate` default and the profile
  "Default model" never flowed. The form now exposes a Default model field
  pre-filled from the account default (`NewMatter.tsx`); `create_matter`
  resolves the model `body -> account default -> settings default`. Residual
  by design: a matter's model is fixed after creation, with no in-chat model
  indicator.
- **F3 [WITHDRAWN — false positive]** The provider-key field is already
  `type="password"` with `autoComplete="off"`; the gate walk read the value
  from the automation accessibility tree, not the masked screen.
- **F4 [DEFERRED — scoped follow-up]** `model.invoked` records the combined
  token total as `tokens_in` with `tokens_out: 0` and cost null — a
  deliberate, documented simplification, not a regression. Tracked as a live
  issue (provider-interface change to `ProviderCallResult`/`ModelUsage`).
- **F5 [FIXED]** After a successful export, reloading showed "Start export"
  again rather than a download link. The succeeded export's id is now
  persisted so a reload rehydrates the download (`MatterLifecycle`
  ExportPanel); only failed/cancelled jobs are cleared.
- **F6 [FIXED #237]** `worker.run_job` returned silently when the job row was
  not visible to its session, leaving the export wedged with no error. Caused
  here by the worker pointing at a different database than the app after a
  container recreate (an environment artifact), but the silent-drop meant any
  worker/DB split surfaced as an eternal spinner. Fixed to surface stuck jobs.

### Restore rehearsal — 2026-06-24 · PASSED

**scope: local self-host restore drill**

Rehearsed the self-host Postgres restore path in a disposable scratch
database using the populated local stack from the manual BYO-key gate:
dumped the running app database (`pg_dump -Fc`), restored into a scratch DB
(`pg_restore --clean --if-exists`), and confirmed restored schema head and
audit counts (`alembic_version=0035`, `audit_entries=423`,
`audit_chain=423`). Both WORM triggers survived the restore
(`enforce_audit_worm`, `enforce_audit_chain_worm`), and the application
verifier passed against the restored database
(`ok audit_chain scope=all ... audit_entries=423 chain_entries=423`).
Doctor passed the restore-critical checks (`db.reachable`,
`db.migrations_current`, `db.audit_table_present`, `audit.chain_verifies`).

This closes the operational-gate rehearsal item for local/self-host restore
evidence. **Hosted restore still needs a Neon PITR branch rehearsal before
live-client use** — tracked as a live issue.
