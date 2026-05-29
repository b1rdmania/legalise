# Handover — External Skills Product Loop v1 (DONE, awaiting review)

Goal: make Lawve prompt-skill imports feel like a finished marketplace
flow — discovery → import → draft → install (trust ceremony) → grant →
invoke → render output → supervised review — instead of a chain of
islands the user bridges by hand. Frontend-continuity work using Prompt
Runtime. **No new substrate** (the one assumption that failed is filed,
not patched — see below).

**Not merged.** On branch `external-skills-loop-v1` (off `master` @ `5fa647a`).

## Key finding from investigation
The loop was ~90% built. The "missing" Lawve-draft→install step is **not a
backend gap**: `POST /api/modules/install` already accepts
`source="manifest"` with an inline manifest. So the headline fix is pure
frontend wiring. Every other step (grants, invoke, artifacts list/read,
reviews, audit reconstruction) already has endpoints.

## What changed (frontend only)

### 1. Lawve draft → one-click install (continuity — the headline)
`frontend/src/modules-v2/LawveImport.tsx` — `DraftReview` now has an
**"Install this draft"** button. On a valid draft it calls
`startInstall({source:"manifest", manifest})` and navigates to
`/modules/install/{ceremony_id}` (the existing trust-ceremony stepper).
- Removed the old dead-end ("copy JSON → go to /modules/create manually").
- **Admin-gated** (install's grant step is `require_admin`): admins get
  the button; non-admins get "Ask an administrator to install this
  module" + the copy/download manifest fallback — never a dead button.
- Invalid drafts show "resolve validation errors first", no button.
- Added a continuity breadcrumb line: *imported skill → module draft →
  trust ceremony → installed module → grant per matter*.

### 2. `skill_response` artifact rendering
`frontend/src/matter/ArtifactPreview.tsx` — new first-class
`skill_response` branch (was raw JSON fallback). Renders the model output
text + a header with the original request (`input`) and `model_id`. Shape
matches `prompt_runtime.py` artifact payload `{output, model_id, input}`.
Auto-detected from an `output` string when no kind hint. This is what an
imported prompt skill produces, so it's now legible everywhere
ArtifactPreview is used (invocation result, artifact detail, approvals).

### 3. Supervised review of `skill_response` — folded in (Skill Response Review Eligibility v1)
The "Request review" section in `frontend/src/matter/ArtifactDetail.tsx`
was hardcoded to `kind === "findings_pack"`. Now gated on a shared
constant `REVIEW_ELIGIBLE_KINDS` in `frontend/src/lib/api.ts` mirroring the
backend `matter_review.py` set.

The original investigation found `skill_response` was NOT backend
review-eligible, so it was first filed as a finding (not faked). The
reviewer approved widening the set, so it's now **folded into this branch
before merge**:
- `backend/app/models/matter_review.py`: `REVIEW_ELIGIBLE_KINDS =
  frozenset({"findings_pack", "skill_response"})`.
- `backend/tests/test_supervisor_review_api.py`:
  `test_request_review_skill_response_eligible` (request-review → 201).
- `frontend/src/lib/api.ts`: constant adds `skill_response`.
- `frontend/src/matter/ArtifactDetail.test.tsx`: asserts the Request
  Review CTA renders for a `skill_response` artifact.

Finding `docs/handovers/FINDING_skill_response_review_eligibility.md` is
marked CLOSED. The loop is now reviewable end-to-end for imported skills,
not just first-party modules.

## Scope call: no inline review button in InvocationRunner
Considered adding "Request review" directly in the post-invocation result
(`InvocationRunner.tsx`). Skipped: invocation result shape varies per
module (Contract Review returns `findings_artifact_id`, Prompt Runtime
returns `artifact_id`), so a generic inline review/deep-link would be
fragile. The loop already stays continuous via the existing "See all
artifacts" link → artifact detail → Request review. Flagged for a future
pass if a uniform result shape is introduced.

## Tests
- Frontend `LawveImport.test.tsx` (7): rewrapped in AuthProvider + memory
  router. Valid draft shows install CTA for admin; install posts inline
  manifest (`source:"manifest"`, `runtime:"prompt"`) + navigates to
  ceremony; non-admin sees ask-an-admin note and no button.
- Frontend `ArtifactPreview.test.tsx` (+2): `skill_response` renders output
  + request + model; auto-detect from `output` string.
- Frontend `ArtifactDetail.test.tsx` (+1): Request Review CTA renders for a
  `skill_response` artifact.
- Backend `test_supervisor_review_api.py` (+1): request-review → 201 for
  `skill_response`.
- Gate: frontend `tsc -b` clean · full vitest **175/175** · `vite build`
  OK. Backend full suite **789 passed** (only the 4 known pre-existing env
  failures — 3 macOS sandbox + demo-seed count).

## Acceptance vs the ask
- Continuity (discovery→installed): ✓ one-click install from a valid draft
- State: ✓ ceremony + installed-status surfaced in `/modules`; importer
  links into the ceremony and shows the lifecycle breadcrumb
- Artifact rendering: ✓ `skill_response` first-class
- Supervised review of `skill_response`: ✓ folded in — reviewable
  end-to-end (Skill Response Review Eligibility v1)

The full loop now closes: Lawve skill → prompt module → install → grant →
run → `skill_response` artifact → request supervisor review → decision →
audit chain.

## For reviewer
Diff-review `external-skills-loop-v1`, then merge. Both the loop and the
review-eligibility close are folded into this one branch.
