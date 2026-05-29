# Source Anchors v1 Build Plan

Status: plan only.
Branch: `codex/source-anchors-v1-plan`.
Date: 2026-05-29.

## Why This Exists

Professional Sign-Off made the core product moment real: AI prepares an output, the solicitor reviews it, signs it, and Legalise preserves the record. Source Anchors are the next trust layer. They make the review legible by showing what the AI used, without pretending that a citation proves the claim.

This is not a legal-research connector phase. It is the first source-grounded slice through the existing governed loop:

```text
document -> module invocation -> artifact -> source chips -> sign-off -> export
```

The target feeling is from `docs/JOY.md`: a solicitor gets a useful answer with real sources, fast, with an audit trail they can hand to a regulator.

## Repo Reality Checked

The current substrate supports the phase, but anchors do not exist yet:

- `backend/app/core/prompt_runtime.py` writes `skill_response` artifacts with only `{output, model_id, input}`.
- `prompt_runtime._load_documents()` loads filename + extracted text, but discards `document_id`, `sha256`, and any stable source handle before prompting.
- `frontend/src/matter/ArtifactPreview.tsx` renders `skill_response`, `findings_pack`, `motion_draft`, and `evidence_list`, but only `evidence_list` / `findings_pack` have citation-ish fields today, and they are not structured source refs.
- `backend/app/core/signoff.py` hashes canonical JSON `{artifact_id, kind, payload}`. If anchors live in the artifact payload before sign-off, the signature pins them automatically.
- `backend/app/core/exports.py` already exports artifact JSON, signoffs, and hash-match status. Anchors inside payloads flow into exports without a new table.
- `docs/architecture/MATTER_CONTEXT_STORE.md` already names source-backed items as a substrate principle, but the matter context store is not the thing to build here.

Conclusion: Source Anchors v1 is a payload contract + prompt-runtime + rendering + sign-off integration. It does not need a migration unless the build uncovers a hard reason.

## Product Principle

Source Anchors v1 must not manufacture false confidence.

Legalise should say:

- "This output cited these sources."
- "These claims are uncited."
- "This exact cited output was signed."

Legalise should not say:

- "These sources prove the output."
- "The solicitor verified every source because they clicked it."
- "This is SRA-approved / certified legal advice."

Clicking a source is a review aid, not proof of verification. Signing remains the professional act.

## Scope

Build one narrow vertical slice:

1. Document-source anchors for `skill_response`.
2. Conservative source display for existing `findings_pack` citations.
3. Source coverage on the Professional Sign-Off screen.
4. Export preservation through the existing artifact JSON and sign-off hash.

Everything else is deferred unless it is trivial once the slice is in place.

## Non-Goals

- No role hierarchy or qualified-solicitor gate.
- No external legal research connector.
- No claim that citations are legally correct.
- No click-to-unlock signing.
- No retroactive mutation of old artifacts.
- No hard block on signing uncited output in v1.
- No full visual citation editor.
- No new audit source.
- No new matter-context store implementation.

## Data Contract

Use a shared artifact payload convention. Keep it additive so old artifacts continue to render.

Recommended shape:

```json
{
  "output": "The model's answer...",
  "model_id": "stub-echo",
  "input": "Review this clause",
  "claims": [
    {
      "id": "claim_1",
      "text": "The dismissal date was 12 March 2026.",
      "anchor_ids": ["src_1"]
    }
  ],
  "source_anchors": [
    {
      "id": "src_1",
      "source_type": "document",
      "document_id": "uuid",
      "filename": "khan-dismissal-letter.pdf",
      "sha256": "optional-document-sha",
      "label": "Document · khan-dismissal-letter.pdf",
      "quote": "Acme dismissed Ms Khan on 12 March 2026...",
      "page": null
    }
  ]
}
```

Rules:

- `source_type` v1 supports `document` only.
- `label` is human-facing and must not be a raw UUID.
- `quote` is helpful but optional. If present, display it as a cited excerpt, not as verified proof.
- `claims` are optional. If absent but `source_anchors` exist, render a source list for the whole output.
- Old payloads with no anchors render "No sources cited for this output."

Do not add a "verified" boolean. A boolean like that would imply a level of proof the runtime does not have.

## Build Steps

### SA-1 — Shared Source Anchor Contract

Add a small backend helper module, likely `backend/app/core/source_anchors.py`.

Responsibilities:

- Pydantic models or typed helpers for `SourceAnchor` and `AnchoredClaim`.
- Normalise document anchors into the payload shape above.
- Produce human labels such as `Document · synthetic-mutual-nda.docx`.
- Reject unsupported source types if a module tries to emit them in v1.

Tests:

- document anchor serialises with id, label, document_id, filename.
- unsupported source type fails closed.
- empty anchors remain valid; absence is not an error.

### SA-2 — Prompt Runtime Document Handles

Update `backend/app/core/prompt_runtime.py`.

Current problem: `_load_documents()` returns only `(filename, text)`. The model prompt cannot cite a stable document handle, and the artifact cannot preserve the source identity.

Change:

- Return document context blocks with `document_id`, `filename`, `sha256`, and extracted text.
- Build prompt sections with stable handles:

```text
--- document D1 ---
id: <uuid>
filename: khan-dismissal-letter.pdf
sha256: <sha>
...
```

- Ask prompt-runtime models to return structured JSON when possible:

```json
{
  "output": "...",
  "claims": [{"text": "...", "source_handles": ["D1"]}]
}
```

- Parse leniently. If the model returns plain text, keep today's behaviour and set no anchors.
- Map known source handles (`D1`) back to document anchors. Ignore unknown handles and record them as uncited/invalid in payload metadata if useful.

Important: do not fail the invocation just because the model did not return anchors. This phase improves reviewability; it must not make normal prompt modules brittle.

Tests:

- prompt invocation with a document can produce a `skill_response` payload containing `source_anchors`.
- unknown source handle does not crash or create a fake anchor.
- plain-text provider response still writes a valid `skill_response`.
- normal audit chain still emits `module.capability.invoked`, `model.invoked`, `module.capability.completed`.

### SA-3 — ArtifactPreview Source Chips

Update `frontend/src/matter/ArtifactPreview.tsx`.

Add a reusable rendering block:

- source coverage summary: `3 claims · 2 cited · 1 uncited`.
- source chips: `Document · khan-dismissal-letter.pdf`.
- optional quote preview.
- explicit uncited state.

The source chip should link to the document detail route when `matterSlug` is available:

```text
/matters/{slug}/documents/{document_id}
```

Implementation note: `ArtifactPreview` currently receives only `payload` and `kindHint`. Add optional props such as:

```ts
matterSlug?: string
```

Pass that prop from `ArtifactDetail` and `SignOff`. Where no slug is available, render chips as inert labels rather than fake links.

Tests:

- `skill_response` with anchors renders source chips.
- `skill_response` with claims but no anchors renders uncited state.
- old `skill_response` payload renders "No sources cited for this output."
- chip href points to the document detail route when slug is supplied.

### SA-4 — Professional Sign-Off Source Coverage

Update `frontend/src/matter/SignOff.tsx`.

Add a quiet source-coverage section near the affirmation:

- cited/uncited counts.
- "Sources cited for review; Legalise does not certify they prove the claim."
- warning copy when zero sources are cited.

Do not disable signing when sources are absent. The solicitor can still reject, sign with observations, or sign after independent review. A hard block would be dishonest for legacy artifacts and non-document outputs.

Tests:

- anchored output shows source coverage before signing.
- unanchored output shows warning copy.
- signing remains possible with the existing affirmation.

### SA-5 — Findings Pack Conservative Pass

Existing `findings_pack` items have `citation` strings, not structured source refs.

Do:

- Render those citations as "Citation" text where they already render.
- If a `findings_pack` payload later includes `source_anchors`, use the same source-chip block.

Do not:

- Guess document IDs from citation strings.
- Treat arbitrary citation text as a verified source anchor.

This keeps Contract Review honest until its pipeline can emit structured anchors.

Tests:

- existing findings_pack rendering remains unchanged except source section when anchors are present.
- no fake source chip appears from a plain citation string.

### SA-6 — Export and Sign-Off Preservation

No new export structure is required for v1 because artifact JSON already exports and sign-off hashes already pin the payload.

Add checks only:

- export artifact JSON includes `source_anchors` when present.
- `signoff_hash_matches` remains true when an anchored artifact is signed and exported.

Optionally add README copy:

```text
Some outputs include source anchors. These are cited sources for review, not proof that the cited material supports the output.
```

Do not block export on anchor coverage.

## UI Copy

Use these phrases:

- "Sources cited"
- "No sources cited"
- "Uncited claim"
- "Sources are cited for review; Legalise does not certify they prove the claim."
- "This exact output, including its cited sources, is pinned by the sign-off hash."

Avoid:

- "Verified"
- "Proven"
- "Sources reviewed"
- "Certified"
- "SRA-approved"

## Acceptance

Source Anchors v1 is done when:

- A prompt-runtime module run against a matter document can produce a `skill_response` artifact with document source anchors.
- The artifact detail page shows source chips and uncited states.
- The sign-off page shows source coverage and keeps the professional-ownership boundary.
- Signing an anchored artifact pins the anchors in the existing output hash.
- Export preserves anchored artifact JSON and sign-off integrity.
- Old artifacts render honestly with "No sources cited" rather than breaking or hiding the absence.
- No role hierarchy, client-user concept, or qualified-solicitor wall is introduced.

## Open Questions for Reviewer

1. Link vs side panel: should v1 source chips navigate to the document detail page, or open a side panel in the sign-off screen? Recommendation: link in v1; side panel is a polish pass unless the implementation is small.
2. Signing with zero sources: warning only or hard block? Recommendation: warning only. Hard-blocking legacy and non-document outputs would be false precision.
3. First anchored module: prompt-runtime `skill_response` only, or also retrofit Contract Review in the same pass? Recommendation: prompt-runtime first; Contract Review only if structured anchors fall out cleanly.
4. External legal sources: document-only v1 or statute/case-law anchors too? Recommendation: document-only v1. External legal sources need their own trust model.
5. Export README copy: add source-anchor limitation copy now? Recommendation: yes, one paragraph.

## Risks

- False confidence: a model may cite the wrong document. Mitigation: never use verified/proven copy; show cited/uncited only.
- JSON brittleness: prompt models may not return structured JSON. Mitigation: lenient parser and plain-text fallback.
- UI clutter: source chips can make outputs noisy. Mitigation: compact coverage summary first, expandable details if needed.
- Contract Review mismatch: existing `citation` fields are not source refs. Mitigation: do not fake anchors from strings.

## Suggested Build Cadence

- SA-1/SA-2 backend slice with focused tests.
- SA-3 frontend artifact rendering with focused tests.
- SA-4 sign-off integration with focused tests.
- SA-5/SA-6 preservation checks and handover.
- Full backend/frontend gates at close-out; e2e only if route/link behaviour changes enough to justify it.

