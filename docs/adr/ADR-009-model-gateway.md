# ADR-009 — One model gateway: passthrough + audit-stamping contract

**Status:** Accepted. The passthrough contract was violated once (bug fixed in
PR #248) — that incident is why this is written down.

## Context

All LLM traffic leaves through exactly one chokepoint,
`backend/app/core/model_gateway.py`. No module calls a provider SDK directly.
This is the single egress in docs/THREAT_MODEL.md: the only place matter
content crosses to a third party, therefore the only place posture, keys, and
audit stamping need to be *provably* correct.

The bug that makes the contract explicit: until PR #248 the gateway never
passed the requested `model` to providers — every call silently ran the
provider's config default while **the audit trail stamped the model the user
requested**. On a product whose entire claim is "the record is true", audit
rows asserting a model that didn't serve the call is the worst class of bug:
not a malfunction, a false record. (Pre-fix rows in the prod chain still show
it: `model_used=anthropic`, requested `opus-4-7`.)

## Decision

- **Single chokepoint.** Providers: Anthropic, OpenAI (keyed, BYO — ADR-001),
  Ollama (local), `stub-echo` (deterministic). Posture is read from the DB at
  call time (not caller-passed); `C_paused` raises `PrivilegePaused` before
  any network traffic; on `B_mixed` a registered local Ollama is preferred
  when a frontier model was requested.
- **Passthrough contract:** the requested model id is passed to keyed
  providers (`model_gateway.py`) so the model the user picked is the model
  that runs; `max_tokens` is plumbed (assistant turns 8192); truncation
  raises `provider_truncated` instead of silently returning a cut-off
  answer — Anthropic via `stop_reason=max_tokens`, OpenAI via
  `finish_reason=length` (the OpenAI side added in PR #257).
- **Audit-stamping contract:** the audit row records what actually happened —
  `model_used` = the model that *served* the call, `requested_model` kept
  separately, plus `provider`, prompt/response SHA-256 hashes (never the
  prompt/response bodies themselves), tokens, latency, posture. Token counts
  are recorded as a real split since PR #257: providers return
  `(text, tokens_in, tokens_out)` and both land in the audit row
  (`token_count` stays the summed total, so the chain's canonical
  serialisation is untouched — see ADR-002 on why that matters). Failures
  emit `model.call.error` via `audit_failure` (independent transaction,
  survives rollback).

## Consequences

- Adding a provider = one gateway provider class + catalog entry; the
  governance seam comes for free.
- The gateway is the right (only) place for future spend guards, streaming,
  and model-policy routing.

## What not to change, and why

- **Never let any code path call a provider SDK outside the gateway** —
  including "quick" features like title generation, summarisation of UI
  strings, or embeddings (ADR-006 keeps those local for the same reason).
  One egress is the threat model.
- **Never write an audit row describing a model call before/without the call
  resolving to an actual provider+model** — stamp what ran, not what was
  asked for. Keep `requested_model` and `model_used` as separate fields.
- **Do not store prompt/response bodies in audit rows.** Hash-only is the
  privacy contract (TRUST.md §8).
- **Do not bypass posture-read-at-call-time** by threading posture through
  caller arguments — the DB read closes a real race (stale `B_mixed` after a
  flip to `C_paused`).
