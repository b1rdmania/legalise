# ADR-001 — BYO model keys only; no server-paid keys in production

**Status:** Accepted, enforced in code.

## Context

Legalise is an open-source governance layer for UK legal AI (evaluation
release). Two forces shape how model access works:

1. **Economics.** A solo-maintained open-source project cannot subsidise LLM
   inference. A server-paid key on a public deployment is an unbounded cost
   liability and an abuse magnet.
2. **Liability and positioning.** Legalise's public claim (docs/TRUST.md §2) is
   that it "does not bundle, resell, or intermediate model access". The firm
   using it is the data controller; the model contract (including no-training
   terms) is between the *user* and the provider. If Legalise supplied the key,
   it would sit in the data path as an intermediary — a different regulatory
   product entirely.

## Decision

- Every user brings their own Anthropic/OpenAI key, stored AES-256-GCM
  encrypted per user (`backend/app/core/user_keys.py`), decrypted only at call
  time, never logged.
- A server fallback key exists **only** for dev: it requires *both* a dev
  environment *and* `LEGALISE_ALLOW_SERVER_KEY_FALLBACK=true` (default `false`,
  `backend/app/core/config.py:77`).
- In production, a missing user key raises `ProviderKeyMissing`
  (`backend/app/core/model_gateway.py:446`), routers translate it to a 422
  with a UI nudge, and a `…model.key_missing` audit row is written.
- **Keyless behaviour is a designed product path, not a degraded error state.**
  Three deliberate keyless modes exist:
  - the deterministic `stub-echo` provider (demo, smoke tests, e2e);
  - the **keyless extractive fallback** in the assistant pipeline
    (`backend/app/modules/assistant/pipeline.py`,
    `_keyless_retrieval_answer`): a keyless turn answers from retrieved
    passages, labelled as an extract with `model_used="no-model"`, instead of
    dead-ending. A keyless no-hits turn still persists the message and returns
    an honest "no-model" reply (fixed in PR #248 — previously 422 + lost
    message);
  - keyless local embeddings for retrieval (see ADR-006).

  This is what makes a fresh fork demo itself with zero credentials, and it is
  what the golden-loop e2e deliberately tests (the sign leg runs on a
  stub-echo matter *because* key-missing IS the deterministic fallback under
  test).

## Consequences

- The first-run funnel has a real "BYO-key cliff": six gates to first keyed
  value. Mitigation is the keyless retrieval answer as the conversion moment —
  accepted trade-off, recorded in the launch punch list.
- Anthropic/OpenAI keys are user secrets in our DB → the encryption-secret
  discipline in ADR-007 is load-bearing.
- Hosted demo cost exposure is ~zero by construction.

## What not to change, and why

- **Do not add a production server key "to smooth onboarding".** It converts
  the maintainer into a model-access intermediary and an unbounded payer. This
  is a repo non-negotiable ("no server-paid model keys in prod").
- **Do not treat the keyless fallback as a bug or replace it with a hard
  error.** It is the demo path, the fork cold-start path, and part of the
  tested contract. Its outputs are honestly labelled ("extract, no model",
  echo labelled as echo) — keep the labelling; the honesty is the feature.
- **Do not flip `LEGALISE_ALLOW_SERVER_KEY_FALLBACK` default or widen it
  beyond dev.**
