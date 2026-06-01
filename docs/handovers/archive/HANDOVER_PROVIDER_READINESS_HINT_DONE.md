# Handover — Provider-Readiness Hint (DONE, awaiting review)

Closes the FE/BE drift logged in
`FINDING_provider_readiness_hint.md`: the frontend no longer re-derives
model→provider families (`providerForModel`); the backend supplies the
truth and the UI reads it.

**Not merged.** On branch `provider-readiness-hint` (off `master` @ `67bf70f`).

## What changed

### Backend — single source of truth
- `app/models/matter.py`: new `Matter.required_provider` **property** —
  the keyed provider the matter's default model needs (`"anthropic"` /
  `"openai"`), or `None` for keyless models (stub-echo / ollama). Computed
  by the **same `provider_for_model`** the runtime gateway uses (deferred
  import avoids the model_gateway↔models cycle).
- `app/api/matters.py`: `MatterRead` gains `required_provider: str | None`.
  Flows through every matter endpoint via `from_attributes` (the property
  is read automatically) — create, get, patch, close.

### Frontend — stop guessing
- `lib/api.ts`: `Matter.required_provider` added.
- `GrantsPanel.tsx`: **deleted `providerForModel`** (the drifting
  re-implementation). `readinessFor` now takes `requiredProvider` from the
  matter. Readiness states match the agreed vocabulary:
  - **Ready** — capability needs no model, or the required key is on file
    ("configured — not verified until the run starts").
  - **Keyless demo model** — model needs no provider key.
  - **Requires Anthropic key** / **Requires OpenAI key** — Run disabled,
    links to `/settings/keys`.
- `MatterDetail.tsx` passes `requiredProvider={matter.required_provider}`.

## Boundaries (per brief)
- **No fake validation** — "configured" still does not mean "tested"; the
  Ready copy says so.
- The existing `ProviderKeyMissing → 422` stays the hard runtime boundary;
  readiness is advisory UX in front of it.
- No new endpoint, no migration — `required_provider` is a computed
  property on the existing matter payload.

## Tests
- `backend/tests/test_matter_required_provider.py` (new): the property
  matches the gateway (`claude-*`→anthropic, `gpt-*`→openai,
  `stub-echo`/`ollama`→null); the matter payload exposes `required_provider`
  on create + get.
- Frontend `GrantsPanel.test.tsx` updated: claude + missing key → Run
  disabled + "Requires Anthropic key"; stub-echo → "Keyless demo model".
  Matter fixtures updated for the new required field.
- Gate: frontend `tsc` clean · full vitest **186/186** · `vite build` OK.
  Backend full suite **805 passed** (only the 4 known pre-existing env
  failures — 3 macOS sandbox + dev-autoverify demo-seed count).

## For reviewer
Diff-review `provider-readiness-hint`. Merge call yours. No schema change.
After this, the remaining thread is **Source Anchors v1** — the bigger
phase (claim-level refs, source chips, side-panel open, audit/export
preservation, "sources cited, not guaranteed correct" copy).
