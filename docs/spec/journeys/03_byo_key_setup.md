# Journey 03 — BYO key setup

The user configures their own provider API key so module invocations can call the model.

## Preconditions

- User authenticated; on `/app` or `/settings`.
- No provider key yet OR an existing key needs rotation.

## Goal

The user has a working Anthropic (or OpenAI) key stored, encrypted, attributed to their account; module invocations on this user's behalf no longer fail with `provider_key_missing`.

## Trigger

User clicks a "Set up your provider API key" banner on `/app`, or navigates directly to `/settings/keys`.

## Steps

1. **Land on `/settings/keys`.**
   - System: `GET /api/settings/keys` → list of `{provider, masked_key_suffix, configured_at}`.
   - Empty: shows a per-provider form (anthropic, openai). Each with an unmasked-while-typing input.
   - With existing keys: shows masked entries + "Rotate" + "Remove" buttons.
2. **Add a key.**
   - User selects provider, pastes the key, submits.
   - System: `POST /api/settings/keys` body `{provider, key}` → 201.
   - Result: key encrypted via per-user envelope; the list refreshes.
3. **(Optional) rotate.**
   - User clicks "Rotate" → in-line input replaces the masked entry.
   - System: `POST /api/settings/keys` with the same provider (server treats as upsert) → 200.
4. **(Optional) remove.**
   - User clicks "Remove" → confirms.
   - System: `DELETE /api/settings/keys/{provider}` → 204.

## Audit emissions

| Step | Action | Audit row | Notes |
| --- | --- | --- | --- |
| 1 | List keys | none | read-only |
| 2 | Add key | (substrate likely emits `user.key.configured` or similar) | verify in `AUDIT_EMISSION_MAP.md` |
| 3 | Rotate | same as add | verify shape |
| 4 | Remove | (substrate emits `user.key.revoked`?) | verify shape |

The substrate already has the endpoints (`app/api/settings.py:50-77`). The audit-emission map (Step 3) verifies what actually lands and flags any unstamped action.

## Acceptance criteria

- [ ] User can add an Anthropic key via the UI; subsequent invocations work without `provider_key_missing`.
- [ ] Key value never round-trips back to the client after store (only the masked suffix).
- [ ] Removing a key cleanly breaks subsequent invocations with a clear `provider_key_missing` error (Phase 10 422 path).
- [ ] Reconstruction view shows key add/remove events (or flags as a gap).

## Not covered

- Workspace-level shared keys — keys are per-user only.
- Org-level vault integration (1Password, Vault) — out.
- Cost dashboards per key — Phase 5 trimmed `/audit/cost`; visible to admins via raw audit only.
