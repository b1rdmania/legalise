# Evaluating Legalise

This document contains the hands-on walkthrough, release checks, and recorded
gate runs.

Legalise is an open-source evaluation release. `legalise.dev` is a static demo
and documentation site; its hosted backend is currently off. Run the walkthrough
on a local or self-hosted deployment. See [`TRUST.md`](./TRUST.md) for the
security posture and [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the system
design.

---

## Part 1 — The hands-on walkthrough (Khan v Acme)

This is the evaluator-facing walkthrough. It assumes you have followed
[`README.md` → Try it](../README.md#try-it), signed in, and run
`legalise doctor` successfully. If `khan.demo_present` is `ok`, the Khan
v Acme matter is ready.

The walkthrough exercises the main loop:

> open a project → inspect files → enable/run a skill → review output
> → sign → read Activity → export the working pack.

By the end you will have opened a sample matter,
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

Activity is the record for the current matter. The raw audit rows
remain inspectable, but they are not the primary user surface.

### 8 — Export the working pack

1. Open **Working pack**.
2. Start an export and wait for the job to complete.
3. Download the pack.

The pack contains the matter metadata, documents, outputs, sign-off
records, reviews, reconstruction data, and README/manifest copy that
states the limits.

### If something looks wrong

- Doctor first: `docker compose -f infra/docker-compose.yml exec backend python -m app.tools.doctor`.
- If a fresh fork won't come up, open an issue with the doctor output attached.
- Audit row names and the emission contract are summarised in [`ARCHITECTURE.md` §3](./ARCHITECTURE.md).

---

## Part 2 — The pre-evaluation gate

Run these checks before inviting legal evaluators into the
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

Before deploying a backend for evaluators, confirm:

- worker process group is running wherever the backend is running;
- migrations run as a release step and are current;
- object storage is the source of truth for uploaded originals and
  generated bytes;
- backups cover Postgres and object storage;
- restore has been rehearsed at least once in a disposable environment;
- audit-chain verification is green after restore;
- app-role audit WORM permissions are either enforced or explicitly
  listed as a deployment residual risk;
- error/job telemetry does not record prompts, responses, or document text;
- `LEGALISE_KEY_ENCRYPTION_SECRET` rotation has a rehearsed runbook;
- evaluation terms say the workspace is not for live client
  matters unless separately approved.

Track open operational risks before enabling evaluator access.

### Launch decision

- If the automated gate is red, do not invite evaluators.
- If the automated gate is green but the manual BYO-key gate has not been
  run, the site can remain a public demo only.
- If both gates pass but the operational gate has open residual risks,
  invite only friendly evaluators with written caveats.
- Live-client matters need a separate approval decision.
