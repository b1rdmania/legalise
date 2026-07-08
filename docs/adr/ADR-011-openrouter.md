# ADR-011 - OpenRouter as a BYO-key provider

**Status:** Accepted (2026-07).

## Context

Legalise is BYO-key (ADR-001) and single-egress (ADR-009). Users asked
for model choice without holding one key per vendor. OpenRouter gives
one key that unlocks many models over the OpenAI wire format, so it
slots in as a thin parameterisation of the existing OpenAI provider
rather than a new integration surface.

## Decision

- **OpenRouter is a supported keyed provider** (`openrouter`), BYO-key
  only. There is no server-side OpenRouter key, not even the dev-only
  env fallback the other keyed providers have.
- **Routing:** slash-form model ids ("anthropic/claude-sonnet-5",
  "openai/gpt-5") route to OpenRouter; bare `claude-*`/`gpt-*` ids keep
  routing direct to Anthropic/OpenAI. The catalog carries the provider
  explicitly and a test pins catalog-vs-gateway agreement.
- **Privacy pin (not user-configurable in v1):** every request body
  carries `"provider": {"data_collection": "deny"}`, restricting
  OpenRouter's routing to upstream endpoints that neither train on nor
  retain prompts. Matter content must never reach a training/retention
  endpoint; this is the governance default, so there is no code path
  that omits it.
- **Reference-model policy:** Legalise is built and tested against
  Claude Sonnet 5 (the recommended catalog entry). Other models -
  including everything reachable through OpenRouter - run but are
  available, not endorsed. The picker carries one caveat line:
  citation behaviour is verified on the reference model only.
- **Audit:** the audit row's `model_used` records the served model as
  reported by OpenRouter's response body; the payload keeps
  `requested_model`, `provider: "openrouter"`, and - when the response
  reports one - `upstream_provider` (the vendor endpoint that actually
  served the call). No audit schema change; the upstream provider lives
  in the existing payload JSON.
- **Posture:** on `B_mixed` matters a registered local provider is
  preferred for OpenRouter ids exactly as for bare frontier ids.
- **Key verification:** saving an OpenRouter key probes
  `GET https://openrouter.ai/api/v1/key` (token-free auth check); auth
  failure rejects the save, transient failure saves unverified - the
  same contract as the other keyed providers.

## Consequences

- One key unlocks curated models (Sonnet 5, GPT-5, one open-weights
  entry) without widening the egress surface: the gateway chokepoint,
  posture gates, and audit stamping are unchanged.
- The `data_collection: deny` pin can narrow OpenRouter's routing pool
  and may occasionally make a model unavailable; that is the accepted
  cost of the privacy default.
- The catalog stays curated (no free-text model field in v1), so every
  selectable id is one we have named and can reason about.
