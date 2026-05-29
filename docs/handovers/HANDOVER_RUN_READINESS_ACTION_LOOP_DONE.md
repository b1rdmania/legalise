# Run Readiness + Matter Action Loop Pass

Date: 2026-05-29
Branch: `codex/run-readiness-action-loop`

## Goal

Make the matter action surface explain whether a granted module is actually ready to run before the user clicks `Run`.

This follows the production acceptance finding from the Lawve/imported-skill loop: Khan correctly blocks on a missing Anthropic key, but the old UI only revealed that after the invocation attempt.

## Shipped

- `MatterDetail` now passes `matter.default_model_id` into `GrantsPanel`.
- `GrantsPanel` loads configured provider-key state via `GET /api/settings/keys`.
- Runnable actions now render as `Available actions`, with an explicit readiness line per action.
- Model-backed actions infer the required provider from the matter model:
  - Claude/Anthropic models -> Anthropic key.
  - GPT/OpenAI/o-series models -> OpenAI key.
  - `stub-echo`, local/Ollama, or no keyed provider -> keyless/local ready.
- Missing provider keys disable the `Run` button up front and link to `/settings/keys`.
- Configured provider keys show `Key configured, not tested`; the UI does not claim provider validity because no provider test-call endpoint exists.
- The existing invocation error banners remain in place as backend defence-in-depth.

## Files

- `frontend/src/matter/MatterDetail.tsx`
- `frontend/src/matter/GrantsPanel.tsx`
- `frontend/src/matter/InvocationRunner.tsx`
- `frontend/src/matter/GrantsPanel.test.tsx`

## Verification

- `npm test -- GrantsPanel InvocationRunner` -> 23 passed.
- `npm run typecheck` -> clean.
- `npm run build` -> clean.

## Deliberate Boundaries

- Frontend-only. No substrate change.
- No provider test-call invented.
- No claim that a configured key is valid before first real provider use.
- No change to grant/runnable-pair semantics: installed + enabled + strict per-string grants still gate the action list.

