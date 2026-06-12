# Evals

Runnable scripts that prove the auth and seed surfaces behave as
documented. Not gating in CI — by design. They exist so a reviewer (and
anyone reading the repo) can verify the tenancy and signup-seed
invariants end-to-end against a live backend.

Deterministic regression evals for the substrate itself (posture
refusal, keyless document matching, audit-chain verification) live in
[`agent-kit/`](agent-kit/) and run through the adapter at
`POST /api/evals/agent` — see that directory's README.

## What the smoke scripts cover

| Script | Surface | Asserts |
|---|---|---|
| `smoke_cross_user.py` | Auth — access control | Slug tenancy Option A: B can hold A's slug. B hitting A's URL → 404 on 8 endpoints (matter detail, audit, audit chain, chronology, documents GET/POST, privilege PATCH, export POST). Anonymous GET → 401. |
| `smoke_signup_auto_seed.py` | Auth — signup auto-seed | Register → autoverify → Khan exists with 3 docs + 7 events + pending CPR 31.22 gate. Two users hold the shared slug independently; A's posture flip does not touch B's row. |

Earlier scripts (`smoke_sample_matter.py`, `smoke_letter_routing.py`)
targeted the native Pre-Motion and Letters modules. Those modules were
removed from the app — skills now arrive by import through the trust
ceremony, and Pre-Motion lives on as a standalone skill at
`b1rdmania/pre-motion` — so the scripts were deleted rather than left
pointing at dead routes.

## What the evals don't cover

- Model output quality. Nothing here asserts what an LLM says — the
  agent-kit cases are deterministic by construction.
- PDF / export visual fidelity. The export smoke in
  `infra/deploy/cloudflare.md` §7a asserts the job reaches a terminal
  state; opening the artefact is a manual step.
- Provider routing under different privilege postures. C_paused refusal
  is covered by `agent-kit`'s `posture_refusal` case; B_mixed → local
  routing is a self-host-only validation (Ollama).

## How to run

Both scripts run against a live backend and require `ENVIRONMENT` in
`{development, dev, local}` so the dev autoverify path fires — they
can't drive a real email loop. They register throwaway users, so run
them on a non-prod environment.

```bash
# Against local compose (backend on :8000; use :3000 if fronted by the proxy)
EVAL_API_BASE=http://localhost:8000/api python evals/smoke_cross_user.py
EVAL_API_BASE=http://localhost:8000/api python evals/smoke_signup_auto_seed.py
```

Both scripts exit non-zero on the first failed assertion. Re-running is
safe — each run registers fresh users and touches only their own rows.
