# Finding — `skill_response` is not supervisor-review-eligible

**Type:** narrow backend governance finding (not patched — needs a deliberate call)
**Surfaced by:** External Skills Product Loop v1
**Date:** 2026-05-29

## What

The supervisor-review API only accepts a bounded set of artifact kinds:

```python
# backend/app/models/matter_review.py:54
REVIEW_ELIGIBLE_KINDS = frozenset({"findings_pack"})
```

Prompt Runtime v1 writes its output as `kind: "skill_response"`. That kind
is **not** in the set, so `POST /api/matters/{slug}/reviews` returns
`422 artifact_not_review_eligible` for any imported-skill output.

The original External Skills Loop ask included "supervised review of
`skill_response`". The backend currently rejects it.

## Why it was not patched here

Per the build directive: *"If the backend review API accepts it, enable
'Request review' for `skill_response`. If it does not, file a narrow
backend finding rather than faking it."* The eligible set is a deliberate
governance boundary (the model comment reads "Exactly one bounded output
type") — widening the supervised-review surface is a call for the
reviewer, not an autonomy decision. No dead button was shipped: the
frontend gates the "Request review" CTA on the eligible set, so it
correctly does **not** appear for `skill_response` today.

## Recommended fix (one line + a test)

```python
REVIEW_ELIGIBLE_KINDS = frozenset({"findings_pack", "skill_response"})
```

Then add a `skill_response` case to `backend/tests/test_supervisor_review_api.py`
asserting request-review succeeds and the review enters the queue.

## Frontend flip (after the backend change)

Add `"skill_response"` to `REVIEW_ELIGIBLE_KINDS` in
`frontend/src/lib/api.ts` (the constant mirrors the backend set and is the
single gate the UI reads). The artifact-detail "Request review" CTA and
the supervised-review rendering (already wired via the new
`skill_response` ArtifactPreview branch) light up automatically.

## Scope of the decision

`skill_response` is generic prompt-runtime output — arbitrary imported
skills produce it. Making it review-eligible means any imported skill's
output can enter the human-review queue, which is arguably the right
supervised-autonomy posture, but it broadens what reviewers must triage.
That trade-off is the reason this is a finding, not a silent patch.
