# Journey 09 — Invoke Pre-Motion

Multi-document + multi-artifact path. Same shape as Journey 08 with the differences pinned.

## Preconditions

- Same as Journey 08.
- Pre-Motion installed + granted on the matter (Journeys 05 + 07 with `examples.pre-motion`).

## Goal

The capability produces two artifacts — `motion_draft` + `evidence_list` — sharing one `invocation_id`. UI surfaces both.

## Trigger

User selects two or more documents in the matter workspace's documents panel → clicks "Draft pre-motion".

## Steps

1. **Pick documents + claim type.**
   - User selects documents (checkbox multi-select).
   - UI shows a modal: claim type dropdown (`breach_of_contract` / `misrepresentation` / `unfair_dismissal`) + selected document list.
2. **Click "Draft".**
   - System: `POST /api/matters/{slug}/invocations` body `{module_id: "examples.pre-motion", capability_id: "draft_motion", args: {claim_type, document_ids: [...]}}`.
3. **Invocation in flight.**
   - Same loading shape as Journey 08.
4. **Result.**
   - 200 response body `{invocation_id, ..., result: {motion_artifact_id, evidence_artifact_id, evidence_count}}`.
   - UI renders a success card with TWO artifact CTAs ("View motion draft", "View evidence list") + a reconstruction link.
5. **Error paths.**
   - Same set as Journey 08 plus:
     - 422 `invalid_args` for unknown `claim_type` or empty `document_ids` (validated by Pre-Motion's capability body)
     - 422 `invalid_args` for a `document_id` belonging to a different matter

## Audit emissions

Same chain as Journey 08. Reconstruction view picks up two `artifact.created`-shaped rows in the audit table — except as Phase 9 confirmed, `write_artifact` doesn't emit an audit row, so the artifacts are visible via the artifacts endpoint + `module.capability.completed` payload (which carries `motion_artifact_id` + `evidence_artifact_id`).

This is a real gap the spec records: **artifacts have no dedicated audit row**. Reconstruction's "what was produced" answer relies on parsing `module.capability.completed.payload`. Phase 14+ UI may surface that; Phase 13 acknowledges it.

## Acceptance criteria

- [ ] Multi-select UI lets the user pick ≥1 documents.
- [ ] Claim type dropdown locked to the three Phase 9 tokens.
- [ ] Success state shows both artifact CTAs and the reconstruction link.
- [ ] Reconstruction shows the `module.capability.completed` row with both artifact ids in its payload.
- [ ] Document-from-different-matter returns 422 with a clear message.

## Not covered

- Multi-step workflow ("identify claim then draft") — Pre-Motion is single-capability; Phase 9 decision held.
- In-line motion-draft editor — Phase 15+ if a real user asks.
- Per-jurisdiction templates — out.
