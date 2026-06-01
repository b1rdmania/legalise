# Contract Review Source Anchors v1 — Done

Branch: `master` working tree, pending push at time of writing.

## What Changed

The governed `examples.contract-review` module now emits structured
`source_anchors` on its `findings_pack` artifacts.

This closes the deferred gap from Source Anchors v1: prompt-runtime skills were
source-aware, but the flagship first-party Contract Review module still emitted
plain `citation` strings only.

## Behaviour

- Every Contract Review run emits a server-known document anchor for the
  reviewed document (`src_d1`).
- The prompt now names the reviewed document handle as `D1` and asks the model
  to return optional `source_handles` plus a verbatim `quote` per finding.
- If the model cites `D1`, the artifact payload includes a claim mapping for
  that finding.
- If the model supplies a quote, the module emits a quote anchor with
  `quote_found_in_source`.
- `quote_found_in_source` remains the same honest check as prompt-runtime:
  literal normalised substring match against the extracted body Legalise read,
  not proof that the legal conclusion is correct.
- Model-supplied document identity is never trusted. The server fills
  `document_id`, `filename`, `sha256`, and `body_sha256`.

## Integrity Fix

The reference Contract Review module was still loading `DocumentBody` by
`document_id` only. That meant a document with extracted + redacted bodies could
anchor against whichever row SQL returned first.

Fixed:

- Contract Review now filters `DocumentBody.kind == BODY_KIND_EXTRACTED`.
- Regression covers extracted + redacted body rows and proves quote matching is
  performed against the extracted source body.

This mirrors the Source Anchors P1 fix already applied to prompt-runtime.

## UI / Export / Sign-Off

No new frontend code was needed.

`ArtifactPreview` already renders `source_anchors` for `findings_pack`, and the
existing sign-off/export paths already hash and preserve the artifact payload.
So Contract Review source anchors automatically flow through:

- artifact detail
- sign-off hash
- Activity Trail output chain
- export bundle artifact JSON

## Tests / Verification

Added:

- `backend/tests/test_contract_review_source_anchors.py`
  - source anchors + quote flags are written to the `findings_pack`
  - extracted body is used when redacted body also exists
  - document anchor still emits when the model provides no structured claim

Local checks run:

- `python3 -m compileall examples/modules/contract_review/capability.py backend/tests/test_contract_review_source_anchors.py`
- backend container import smoke:
  `from examples.modules.contract_review.capability import _parse_findings, _build_source_payload`

Not run locally:

- backend pytest. The running backend container is the production image and
  does not include pytest/dev dependencies. CI should run the full backend gate
  after push.

## Boundaries

- No migration.
- No new endpoint.
- No new audit source.
- No claim that citations are verified/proven.
- No source anchors for the legacy direct `/contract-review/run` transient
  envelope; this pass targets the governed module artifact path, because that
  is what users sign and export.
