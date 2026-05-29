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

### 3. Supervised review affordance — gated honestly
`frontend/src/matter/ArtifactDetail.tsx` — the "Request review" section
was hardcoded to `kind === "findings_pack"`. Now gated on a shared
constant `REVIEW_ELIGIBLE_KINDS` in `frontend/src/lib/api.ts`, which
mirrors the backend `matter_review.py` set. Behaviour is unchanged today
(still only `findings_pack`) but the gate is now a single, documented,
one-line flip.

## The one assumption that failed → filed, not patched
The original ask included "supervised review of `skill_response`". Backend
`REVIEW_ELIGIBLE_KINDS = frozenset({"findings_pack"})` — `skill_response`
is **not** accepted; `POST .../reviews` returns 422 for it. Per the
directive ("file a narrow backend finding rather than faking it"), I did
**not** widen the governance surface unilaterally and did **not** ship a
dead button. The CTA correctly does not appear for `skill_response` yet.

Finding: `docs/handovers/FINDING_skill_response_review_eligibility.md`.
The fix is one line (`+ "skill_response"`) in `matter_review.py` + a test,
then one line in the frontend constant — both documented in the finding.
This is a deliberate supervised-autonomy scope call for the reviewer.

## Scope call: no inline review button in InvocationRunner
Considered adding "Request review" directly in the post-invocation result
(`InvocationRunner.tsx`). Skipped: invocation result shape varies per
module (Contract Review returns `findings_artifact_id`, Prompt Runtime
returns `artifact_id`), so a generic inline review/deep-link would be
fragile. The loop already stays continuous via the existing "See all
artifacts" link → artifact detail → Request review. Flagged for a future
pass if a uniform result shape is introduced.

## Tests (frontend)
- `LawveImport.test.tsx` (7): rewrapped in AuthProvider + memory router.
  New: valid draft shows install CTA for admin; install posts inline
  manifest (`source:"manifest"`, `runtime:"prompt"`) + navigates to
  ceremony; non-admin sees ask-an-admin note and no button.
- `ArtifactPreview.test.tsx` (+2): `skill_response` renders output +
  request + model; auto-detect from `output` string.
- Gate: `tsc -b` clean · full vitest **174/174** · `vite build` OK.
- Backend untouched (finding filed only) — no backend gate needed.

## Acceptance vs the ask
- Continuity (discovery→installed): ✓ one-click install from a valid draft
- State: ✓ ceremony + installed-status already surfaced in `/modules`;
  importer now links into the ceremony and shows the lifecycle breadcrumb
- Artifact rendering: ✓ `skill_response` first-class
- Supervised review of `skill_response`: **blocked on the filed finding**
  (one-line backend governance call); everything else for it is wired so
  it lights up the moment the kind is made eligible

## For reviewer
Diff-review `external-skills-loop-v1`. Two calls for you: (1) merge; (2)
the `skill_response` review-eligibility finding — a one-line backend
change if you want supervised review of imported-skill output in v1.
