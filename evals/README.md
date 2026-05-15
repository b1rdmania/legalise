# Evals

Runnable scripts that prove v0.1 surfaces behave as documented. Not gating
in CI — by design, per BUILD_PLAN Day 16. They exist so the reviewer (and
anyone reading the repo) can verify the audit-row contract and the
sample-matter narrative end-to-end.

## What the evals cover

| Script | Surface | Asserts |
|---|---|---|
| `smoke_sample_matter.py` | Full demo path | Khan loads, 4 module surfaces respond, audit shape matches the per-action contract |
| `smoke_letter_routing.py` | Letters catalogue | ET matter → 6 types incl. lba default; civil matter → 2 types incl. lbc default; cross-rejection 400s |
| `smoke_cross_user.py` | Auth — access control (Day A.5) | Slug tenancy Option A: B can hold A's slug. B GETs A's URL → 404 on 11 endpoints. Anonymous GET → 401. |
| `smoke_signup_auto_seed.py` | Auth — signup auto-seed (Day D) | Register → autoverify → Khan exists with 2 docs + 7 events + pending CPR 31.22 gate. Two users hold the shared slug independently; A's posture flip does not touch B's row. |

Unit tests for the catalogue resolver logic (pure Python, no backend) live
in `backend/tests/test_letter_catalog.py`. Run with `pytest backend/tests/`.

## What the evals don't cover

- Pre-Motion JSON synthesis quality. Stage 4 output is model-dependent
  and unstable across runs; we assert the envelope *shape*, not the
  verdict.
- PDF visual fidelity. We assert the Gotenberg call succeeds and the
  audit row carries `envelope_hash`; opening the PDF is a manual step.
- Provider routing under different privilege postures. C_paused is
  asserted via the 409 contract; B_mixed → local routing is a
  self-host-only validation (Ollama).
- Multi-user, settings, module install/uninstall — none of those exist
  in v0.1.

## Provider posture

Both scripts run against a live backend. If `ANTHROPIC_API_KEY` is unset,
the gateway falls through to the always-available `stub-echo` provider:
the calls succeed, audit rows land, but the response text is canned. The
audit-row counts hold either way — that's what the evals assert.

To see real model output, set `ANTHROPIC_API_KEY` on the backend
container (compose) or as a Fly secret (live demo) before running.

## How to run

```bash
# Against local compose
EVAL_API_BASE=http://localhost:3000/api python evals/smoke_sample_matter.py
EVAL_API_BASE=http://localhost:3000/api python evals/smoke_letter_routing.py
EVAL_API_BASE=http://localhost:3000/api python evals/smoke_cross_user.py
EVAL_API_BASE=http://localhost:3000/api python evals/smoke_signup_auto_seed.py

# Against live demo (cross_user + signup_auto_seed write real rows — run on a non-prod env or accept that)
EVAL_API_BASE=https://api.legalise.dev/api python evals/smoke_sample_matter.py
EVAL_API_BASE=https://api.legalise.dev/api python evals/smoke_letter_routing.py

# Catalogue unit tests (no backend needed)
cd backend && pytest tests/test_letter_catalog.py -v
```

The auth-shaped evals (`smoke_cross_user.py`, `smoke_signup_auto_seed.py`)
require `ENVIRONMENT` in `{development, dev, local}` so the dev autoverify
path fires — they can't drive a real email loop.

Both scripts exit non-zero on the first failed assertion and print the
audit row counts they observed alongside the expected counts. Re-running
is safe — every call is idempotent or scoped to the current matter.

## Audit-row contract reference

The shape evals assert, copied from the R5 handover for ease of reading:

| Endpoint | Rows on success | Rows on C_paused |
|---|---|---|
| `POST /letters/draft` | 3 (`http.post` + `plugin.invoked` + `model.call`) | 1 (`http.post 409`) |
| `POST /pre-motion/run` | 12 (`http.post` + `start` + 9 × `model.call` + `complete`) | 1 (`http.post 409`) |
| `POST /pre-motion/run-stream` | same 12 as `/run` | 1 (`http.post 409`, R5 P1 fix) |
| `POST /pre-motion/pdf` | 2 (`http.post` + `pdf.exported` carrying `envelope_hash`) | n/a (no LLM call) |
