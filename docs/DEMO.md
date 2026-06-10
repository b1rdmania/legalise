# Demo runbook — Khan v Acme walkthrough

This is the evaluator-facing walkthrough. It assumes you have followed
[`README.md` → Try it](../README.md#try-it), signed in, and run
`legalise doctor` successfully. If `khan.demo_present` is `ok`, the Khan
v Acme matter is ready.

The goal is to prove the Legalise loop without explaining every internal
row name:

> open a project → inspect files → enable/run a skill → review output
> → sign → read Activity → export the working pack.

## What this proves

By the end of the walkthrough you will have:

- opened a real matter folder;
- inspected the files the skill can use;
- added and enabled a governed skill;
- run the skill through the durable job path;
- reviewed and signed the output;
- read matter Activity; and
- exported the working pack.

That sequence is the smallest end-to-end demonstration of
[supervised autonomy](./SUPERVISED_AUTONOMY.md): a skill declares what it
needs, the matter grants it, runtime checks enforce it, output is signed,
and the record preserves what happened.

## 1 — Open the Khan matter

1. Navigate to <http://localhost:3000/matters>.
2. Open **Khan v Acme Trading Ltd**.
3. Confirm the left rail shows the matter section and the main surface
   lands on **Chat**.

## 2 — Inspect files

1. Open **Files**.
2. Open a seeded document.
3. Confirm the extracted text is readable and the metadata is secondary.
4. Use the back link to return to the matter.

## 3 — Add a skill to the workspace

1. Navigate to <http://localhost:3000/skills>.
2. Pick a skill from the catalogue (the example modules **Contract Review** and **Pre-Motion** under `examples/modules/`, or a `claude-for-uk-legal` plugin skill such as **LBA Drafter**).
3. Walk the add-skill trust ceremony.

Adding a skill is workspace-level trust. It does **not** make the skill
runnable in every matter.

## 4 — Enable the skill on Khan

1. Return to the Khan matter.
2. Open **Skills**.
3. Enable the added skill for this matter.
4. Confirm the card reads as ready in this project.

Matter-level enablement is where the skill receives permission to read
documents and write outputs for this matter.

## 5 — Run the skill

1. Open **Chat**.
2. Use the Skills picker, or open **Skills** and run from the skill card.
3. For Contract Review, the frontend creates a durable job and polls the
   job result. It no longer uses the retired contract-review stream route.
4. Wait for the typed output to render.

The demo may use the keyless `stub-echo` provider where configured. Real
provider-backed runs require the user to add their own model key.

## 6 — Review and sign

1. Open the produced output.
2. Review its source references and any quote-location cautions.
3. Use **Review & sign**.
4. Choose `signed`, `signed_with_observations`, or `rejected`.

The signature records professional ownership of the output and pins the
signed payload by hash. It is not a claim that Legalise certifies the
legal position.

## 7 — Read Activity

1. Open **Activity** for the matter.
2. Confirm it shows the story of the run: skill run, model call, output,
   sign-off, and any gates or denials.
3. Use advanced details only if you need raw row filters.

Activity is the proof layer for the current matter. The raw audit rows
remain inspectable, but they are not the primary user surface.

## 8 — Export the working pack

1. Open **Working pack**.
2. Start an export and wait for the job to complete.
3. Download the pack.

The pack contains the matter metadata, documents, outputs, sign-off
records, reviews, reconstruction data, and README/manifest copy that
states the honesty boundaries.

## If something looks wrong

- Doctor first: `docker compose -f infra/docker-compose.yml exec backend python -m app.tools.doctor`.
- Common setup errors and their fixes:
  [`docs/TROUBLESHOOTING.md`](./TROUBLESHOOTING.md).
- Audit row names and emission sites:
  [`docs/spec/AUDIT_EMISSION_MAP.md`](./spec/AUDIT_EMISSION_MAP.md).
