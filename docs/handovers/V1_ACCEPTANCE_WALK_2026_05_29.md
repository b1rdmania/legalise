# V1 Acceptance Walk — 2026-05-29

Status: partial acceptance record against production head `b8aa500`, with one
credentialed production blocker found and patched on
`codex/fix-lawve-schema-packaging`.

This is not yet the full end-to-end v1 walk. It records the current verified
state from production HTTP checks, deployed bundle checks, CI status, repo
inspection, and the first credentialed Lawve import step.

## Production Head

- `master`: `b8aa500c7105e3a3b6e491950f86de18fb2815e7`
- `phase-17-crm-pass`: `b8aa500c7105e3a3b6e491950f86de18fb2815e7`
- GitHub Actions for `b8aa500`: CI, e2e, frontend deploy, backend deploy all
  completed successfully.

## Live Checks Performed

### Frontend

All three SPA entry points returned `200`:

- `https://legalise.dev/`
- `https://legalise.dev/modules`
- `https://legalise.dev/modules/lawve`

The deployed frontend bundle contains the new External Skills Product Loop
strings:

- `Install this draft`
- `Ready to sign`
- `Ask an administrator`
- `skill_response`
- `Request review`
- `Lawve`

This confirms the post-`b8aa500` bundle is the one Cloudflare is serving.

### Backend

`GET https://api.legalise.dev/api/system/bootstrap-state` returned:

```json
{"user_count":3,"has_superuser":true,"firm_role_gates_enabled":false}
```

This confirms:

- production has users;
- production has a bootstrapped superuser;
- firm-role gates are dormant in production, as intended for v1 evaluation.

Unauthenticated endpoint behaviour:

- `GET /api/modules/public` returns public skill catalogue data.
- `GET /api/modules/v2` returns `401`, as expected.
- `GET /api/modules/external/lawve/skills` returns `401`, as expected.

## Code-Level Acceptance For The New Loop

The live `b8aa500` code now supports:

1. Lawve skill browsing/import.
2. Prompt-only Lawve skills converting to valid `runtime: "prompt"` manifests.
3. Prompt manifests declaring `model_access: "required"` plus an internal
   provider capability.
4. One-click `Install this draft` from a valid Lawve draft into the existing
   trust ceremony.
5. Matter-scoped grant/run through the existing invocation endpoint.
6. Prompt runtime producing `skill_response` artifacts.
7. `skill_response` rendering as a first-class artifact view rather than raw
   JSON.
8. `skill_response` eligibility for Supervisor Review.
9. Typed `AdviceBoundaryDenied` handling for structured 403 translation.

This closes the main product loop:

> Lawve skill -> prompt module -> install -> grant -> run -> skill_response
> artifact -> request supervisor review -> decision -> audit chain.

## Not Fully Walked In This Pass

The credentialed browser path started and reached the Lawve import conversion
step. It cannot proceed to install/grant/run until the blocker below is
deployed and re-tested.

Still requiring a credentialed pass after the patch deploys:

1. Sign in as admin.
2. Open `/modules/lawve`.
3. Import a simple Lawve prompt skill.
4. Confirm `Install this draft` starts the trust ceremony.
5. Complete the ceremony.
6. Open a matter.
7. Grant the imported module on that matter.
8. Invoke it.
9. Open the resulting `skill_response` artifact.
10. Request supervisor review.
11. Decide the review.
12. Open audit reconstruction and confirm the chain is legible.
13. Export the matter and confirm the bundle includes the artifact, review,
    reconstruction, and README.

## Findings

### P1 — Lawve draft conversion 500s in production

Evidence:

- Signed in successfully and opened `/modules/lawve`.
- Selected `contract-review-anthropic`; the detail panel rendered provenance
  and the `Convert to module draft` action.
- Clicking `Convert to module draft` rendered a frontend `TypeError: Failed to
  fetch`.
- Direct authenticated API reproduction:
  `POST https://api.legalise.dev/api/modules/external/lawve/skills/contract-review-anthropic/draft`
  returned `500 Internal Server Error`.
- CORS preflight returned `200`; unauthenticated POST returned `401`. This is
  not a CORS/auth routing issue.

Root cause from Fly logs:

```text
FileNotFoundError: schemas/module.v2.json not found at /schemas/module.v2.json
```

The Fly image is built from `backend/`, so repo-root `schemas/module.v2.json`
is not packaged into the production container. Local development finds it via
the repo-root path; production resolves the old path to `/schemas/...`.

Patch on `codex/fix-lawve-schema-packaging`:

- package `backend/schemas/module.v2.json`;
- make the v2 validator check repo-root schema first, then backend-packaged
  schema;
- add a drift test proving the packaged schema matches the repo-root canonical
  schema.

The remaining v1 risk after this fix is UX, not substrate: the pieces now
connect in code, but the credentialed flow still needs a real operator pass to
catch copy, state, permission, and navigation friction.

## Recommended Next Work

1. **Credentialed V1 acceptance walk.** Use the checklist above and record any
   P1/P2 issues. This should happen before adding another feature.
2. **Docs/demo update.** Make the Lawve -> prompt module -> review loop a
   headline path in `README.md` and `docs/DEMO.md`.
3. **Audit/evidence polish.** Ensure audit reconstruction and export make
   external-skill provenance obvious: source repo, pinned SHA, licence, module
   id, invocation, artifact, and review decision.
4. **Module marketplace polish.** Make `/modules` explain available/imported/
   installed/disabled states and licence/script warnings calmly.
