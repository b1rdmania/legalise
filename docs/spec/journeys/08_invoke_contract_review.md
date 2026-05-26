# Journey 08 — Invoke Contract Review

User runs the seeded reference module against a matter document. The Phase 6 + Phase 10 vertical-slice path turned into a real UI.

## Preconditions

- Matter open (Journey 04).
- Contract Review installed (Journey 05).
- Grants in place (Journey 07).
- BYO key configured for the matter's `default_model_id` provider (Journey 03).
- User's role satisfies the matter's posture (`qualified_solicitor` for `B_mixed`).

## Goal

The capability produces a `findings_pack` artifact, stamped with the canonical audit chain. The user sees the result and the deep-link to its provenance.

## Trigger

User selects a document in the matter workspace → clicks "Review with Contract Review".

## Steps

1. **Pick document.**
   - User clicks an item in the documents panel; document selection persists.
2. **Click "Review".**
   - UI shows a confirmation modal with the document name + capability name + cost-attribution note ("Will use your configured Anthropic key").
   - User clicks confirm.
3. **Invocation in flight.**
   - System: `POST /api/matters/{slug}/invocations` body `{module_id: "examples.contract-review", capability_id: "review", args: {document_id}}`.
   - UI shows an in-line loading state (sync HTTP per Phase 10; async is parked).
4. **Result.**
   - 200 response body `{invocation_id, module_id, capability_id, matter_id, result: {findings_artifact_id, findings_count}}`.
   - UI renders a success card with: findings count, "View artifact" CTA, "See audit trail" CTA.
   - The matter workspace's artifacts panel re-fetches and now shows the new `findings_pack`.
5. **Error paths** (translated by Phase 10):
   - 403 `posture_gate_blocked` → posture banner (see `POSTURE_GATE_UX.md`)
   - 403 `capability_denied` → "missing grant" banner + back to Journey 07
   - 422 `provider_key_missing` → "configure your key" banner + back to Journey 03
   - 422 `invalid_args` → form validation re-shown
   - 502 `provider_upstream_error` → "model upstream had a problem; retry" banner
   - 500 → generic error + reconstruction link

## Audit emissions

| Step | Action | Audit row |
| --- | --- | --- |
| 3 | Capability invoked (entry audit) | `module.capability.invoked` |
| 3 | Provider call (canonical Phase 10 dual emission) | `model.call` (gateway) + `model.invoked` (module via `audit_emit_model_invoked`) |
| 3 | Advice-boundary check | `advice_boundary.check.completed` |
| 3 | Artifact written | (no audit — Phase 9 follow-up confirmed `write_artifact` emits none) |
| 3 | Capability completed | `module.capability.completed` |
| 5 (any error) | Per Phase 10 Decision #5 | varies; see `AUDIT_EMISSION_MAP.md` |

## Acceptance criteria

- [ ] Sync HTTP — response returns within the request timeout for the seeded NDA + the configured stub provider in test mode.
- [ ] Success state shows findings count + both deep-links (artifact, reconstruction).
- [ ] Every error path produces a structured banner with the canonical error code.
- [ ] Reconstruction view shows the full audit chain after the invocation.

## Not covered

- Streaming / partial-result rendering — async is parked, sync only.
- Multi-document review per invocation — Contract Review takes one doc (Pre-Motion handles the multi-doc case).
- In-line model output rendering before the artifact lands — out.
- Cancellation mid-invocation — out.
