# Handover — Professional Sign-Off v1 (DONE, awaiting review)

The hero gate. The product's core promise: AI prepares, the solicitor
exercises judgement and **signs**, Legalise preserves the record. This is
**author sign-off** — the signer may be the author of the output. Distinct
from supervisor review (which stays the firm-mode path under Approvals).

**Not merged.** On branch `professional-signoff-v1` (off `master` @ `d6c532c`).

## Strategy (ratified)
- Author sign-off is the hero, not supervisor review. A sole practitioner
  signs their own AI-assisted output — no reviewer≠author rule here.
- Presume every signed-in user is professionally accountable. **No
  qualified-solicitor role wall**; firm role gates stay dormant. Copy is
  "Signed in Legalise by <email>", never "SRA approved" / "certified".
- Product-binding, not legally overclaimed: the signature is the matter's
  key event; the output hash pins what was signed.

## Backend (new substrate)
- `app/models/matter_signoff.py` — `MatterSignoff`, **append-only**. No
  `state` column; each row is a terminal decision. Decisions: `signed` /
  `signed_with_observations` / `rejected`. Migration `0022`.
- `app/core/signoff.py`:
  - `compute_signoff_hash(artifact)` — sha256 of **canonical JSON
    `{artifact_id, kind, payload}`** (the output payload, not rendered
    HTML / mutable display metadata): "this exact output payload was
    signed."
  - `create_signoff(...)` — any signed-in user may sign (author included);
    reasoning **required** for `signed_with_observations` / `rejected`,
    optional for `signed`. Emits `output.signed` /
    `output.signed_with_observations` / `output.sign_rejected` audit rows
    (rides the existing `audit` reconstruction source — no new source).
  - `list_signoffs` + `current_signoff_ids` (latest-per-artifact).
- `app/api/signoffs.py` — `POST /api/matters/{slug}/signoffs`,
  `GET …/signoffs` (each row flagged `is_current`), **`GET …/signoffs/{id}`**
  (stable confirmation/deep-link reload). Owner-only matter predicate:
  there is no workspace-admin/superuser signing shortcut, because
  sign-off is personal professional ownership. `signer_email` returned
  for the copy.

## Frontend
- **Hero screen** `/matters/{slug}/artifacts/{id}/sign` (`SignOff.tsx`):
  full-surface — output (`ArtifactPreview`) on one side; decision
  (Sign / Sign with observations / Reject draft) + first-class reasoning
  field + an explicit **"I have reviewed this" affirmation** (not a
  scroll-lock) on the other. Submit posts the sign-off and navigates to
  the record.
- **Confirmation/record** `/matters/{slug}/signoffs/{id}`
  (`SignOffConfirmation.tsx`): decision, signer email, timestamp,
  reasoning, **pinned output hash**, "permanent, part of the audit trail"
  (loads by id → stable reload). Link into the Activity Trail.
- **Status on artifact detail** (`ArtifactDetail.tsx`): "Draft — prepared
  by AI, not yet signed" vs "Signed in Legalise by <email>" /
  "Signed with observations" / "Rejected", plus the **Review & sign** CTA
  (the hero entry point). Re-signing is allowed (append-only history).
- **Activity Trail promotion** (`auditClassify.ts` + `ReconstructionView`):
  new `signed` row class for `output.*`, in the **foreground decision
  lane** with a "Sign-off" story-card + chip. The solicitor taking
  ownership reads as the matter's key event, not a background row.
- Copy boundary enforced throughout; "records professional ownership", not
  regulatory approval.

## Deliberate v1 boundaries (per build brief)
- **"Sign with observations" = annotate, not edit.** No in-app artifact
  editing; the solicitor records what they'd change / why they sign
  despite it. Edited-output versioning is a later artifact-versioning
  project.
- **Export gating = fast-follow (v1.1).** Sign-off is visible, auditable,
  status-bearing now; "export prefers/requires signed" comes next.
- **Source coverage = honest summary only** (module/capability, model,
  pinned hash). No sentence-level source claim — claim-level anchors stay
  a later project.
- **Append-only:** re-signing inserts a new row; latest is `is_current`;
  prior rows are never mutated. The `output.*` audit rows are the trail.

## Tests
- `backend/tests/test_signoff_api.py` (7): author signs own output;
  reasoning required for observations/rejected; invalid decision → 422;
  append-only history marks only latest current + `GET /{id}` reload;
  hash pins canonical payload; `output.signed` audit emitted; non-owner
  superuser gets 404 and cannot sign someone else's output.
- Frontend `SignOff.test.tsx` (2): affirmation gates submit + posts +
  navigates; observations requires reasoning. `ArtifactDetail.test.tsx`
  (+2): unsigned shows Draft + Review&sign CTA; current sign-off shows
  signed status.
- Gate: frontend `tsc` clean · full vitest **185/185** · `vite build` OK.
  Backend full suite **802 passed** (only the 4 known pre-existing env
  failures — 3 macOS sandbox + dev-autoverify demo-seed count). Migration
  `0022` applied to the test DB.

## For reviewer
Diff-review `professional-signoff-v1`. Merge call yours. New migration
`0022` — prod deploy runs `alembic upgrade head` in the backend release
command, so the deploy applies it.
