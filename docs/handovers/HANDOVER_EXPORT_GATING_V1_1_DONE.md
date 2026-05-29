# Handover — Export Gating v1.1 (DONE, awaiting review)

Makes the sign-off **operationally** load-bearing, not just visually
present: the matter export now respects sign-off status downstream.

**Not merged.** On branch `export-gating-v1.1` (off `master` @ `b7ae211`).

## What changed

### Backend — matter export (`app/core/exports.py`)
- Every artefact in the bundle is **labelled by sign-off status**. Each
  `artefacts/{id}/metadata.json` (and the `artefacts.json` index) now
  carries `signoff_status` (`signed` / `signed_with_observations` /
  `rejected` / `unsigned`), `signed_by_id`, `signed_at`, `signoff_hash`.
- **`signoffs.json`** added (all Professional Sign-Off records, each
  flagged `is_current`) — mirrors `reviews.json`.
- **Integrity check:** where the artefact bytes are present, each labelled
  artefact gets `signoff_hash_matches` — `false` means the output drifted
  after it was signed (recomputed canonical hash ≠ the signed hash).
- **README** gains a "Sign-off status of outputs" section: counts of
  signed (final material) / rejected / unsigned (draft, prepared by AI),
  and the statement that signed outputs are the preferred final material
  and unsigned AI outputs are drafts. Copy stays inside the boundary
  ("not a certified legal record").

### Frontend — `ArtifactsList.tsx`
- New **Sign-off** column: a per-row badge — **Signed** / **Signed (obs.)**
  / **Rejected** / **Draft** — derived from the current sign-off per
  artefact (`listSignoffs`). Draft vs Signed is now visible at a glance in
  the list, not just on the detail page.

## Deliberate v1.1 boundaries (per brief)
- **Not** requiring everything signed before any export — too heavy.
  Signed outputs are the *preferred/default final material*; unsigned AI
  outputs are included but clearly **marked as draft** (in metadata + the
  README), per "exclude-or-mark → we mark".
- No separate "final pack" export mode introduced; the single matter
  export now labels honestly. A signed-only/final-pack mode can come later
  if needed.
- Layout unchanged (`artefacts/{id}/…`) so existing bundle consumers don't
  break — labelling is additive.

## Tests
- `backend/tests/test_export_signoff_gating.py` (new): export includes
  `signoffs.json` (current flag); `artefacts.json` and per-artefact
  `metadata.json` label a signed artefact `signed` with
  `signoff_hash_matches: true` and an unsigned one `unsigned` with
  `signoff_hash_matches: null`; README shows "Signed (final material): 1"
  + "Unsigned (draft…): 1". `test_export_completeness.py` still green
  (additive change).
- Frontend `ArtifactsList.test.tsx` (+1): rows show Signed vs Draft badges
  from current sign-offs.
- Gate: frontend `tsc` clean · full vitest **186/186** · `vite build` OK.
  Backend full suite **803 passed** (only the 4 known pre-existing env
  failures — 3 macOS sandbox + dev-autoverify demo-seed count). No
  migration in this step.

## For reviewer
Diff-review `export-gating-v1.1`. Merge call yours. No schema change — the
export reads existing `matter_signoffs`. Next fast-follows remain:
provider-readiness hint, then source anchors (bigger phase).
