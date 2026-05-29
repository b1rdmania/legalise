# Finding: Provider Readiness Hint Should Come From Backend

Date: 2026-05-29
Status: Open, non-blocking

## Context

The Run Readiness + Matter Action Loop pass added a frontend readiness hint so users can see a missing Anthropic/OpenAI key before clicking `Run`.

That pass is intentionally advisory: the backend remains the real execution boundary and still returns the canonical `provider_key_missing` response if the frontend guess is wrong.

## Finding

`frontend/src/matter/GrantsPanel.tsx` now infers a provider from `matter.default_model_id` to decide whether a key is needed. This duplicates backend routing logic in `backend/app/core/model_gateway.py::provider_for_model`.

The duplication is safe for v1 because it degrades closed or advisory-only:

- Frontend says ready, backend needs a key -> backend returns `provider_key_missing`.
- Frontend says key needed, backend would route keylessly -> user sees an over-conservative disabled button.

But it is still drift-prone. Adding a provider or changing model routing backend-side could silently stale the frontend hint.

## Recommended Fix

Expose backend-derived readiness metadata instead of re-deriving it in the UI. Candidate shapes:

- Add `provider_key_required: boolean` and `provider: string | null` to `MatterRead`.
- Or add a small read endpoint such as `GET /api/matters/{slug}/run-readiness` keyed by matter model and current user keys.

The value should be sourced from the same backend provider selection logic used by invocation, not copied into the frontend.

## Non-Goal

Do not add a provider test-call here. A configured key can remain labelled "configured, not tested" until a separate provider-test endpoint exists.

