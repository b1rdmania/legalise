# Handover — Source Anchors v1 (DONE, awaiting review)

Built per `docs/handovers/SOURCE_ANCHORS_V1_BUILD_PLAN.md` (incl. the
folded redlines). The first source-grounded slice through the governed
loop: `document → invocation → artifact → source chips → sign-off →
export`. Makes the review legible — *what the AI used* — without
pretending a citation proves the claim. **No migration, no new endpoint,
no new audit source** (anchors live in the artifact payload).

**Not merged.** On branch `source-anchors-v1` (off `master` @ `916dffa`).

## The honesty design (what keeps this from manufacturing false confidence)
- **Always-on, server-known document anchors.** Every document loaded into
  an invocation's context produces a `source_anchors` entry — server truth,
  independent of the model. So a doc-backed run *always* shows real sources,
  including the keyless stub/demo path.
- **Server-authoritative identity.** A model may cite a handle (`D1`); only
  the server fills `document_id`/`filename`/`sha256`/`body_sha256` from the
  documents it actually loaded. Model-supplied identity is ignored.
- **`quote_found_in_source`** — the one factual check v1 makes: a normalised
  substring match of a model-supplied quote against the extracted body the
  runtime read. `false` = "the quoted text was not located in the source
  body Legalise holds", **not** "the claim is false". No `verified`/`proven`
  flag anywhere.
- **Lenient parsing never loses the answer** — a failed/partial JSON
  envelope falls back to the raw text as `output`.

## Backend
- `app/core/source_anchors.py` (SA-1) — anchor contract + helpers:
  `build_document_anchor`, `quote_found_in_source`, `body_sha256`,
  `document_label`, `require_supported_source_type` (document only; fails
  closed otherwise).
- `app/core/prompt_runtime.py` (SA-2) — `_load_documents` now returns
  handle/id/filename/sha/body; prompt carries stable handles + an *opt-in*
  citation-JSON hint; `_parse_model_output` (lenient); `_build_source_anchors`
  always emits doc anchors and enriches with claim→handle mapping + quote
  anchors when the model cooperates. Payload gains `source_anchors` (+
  `claims` when present), additively. Invocation result gains
  `source_anchor_count`.
- `app/core/exports.py` (SA-6) — README gains a "Source anchors" section
  (cited-for-review, not proof; explains `quote_found_in_source`). Anchors
  already flow through artifact JSON; the sign-off hash already pins them.

## Frontend
- `ArtifactPreview.tsx` (SA-3) — `SourceAnchorsBlock`: coverage summary,
  document chips (link to `/matters/{slug}/documents/{id}` when `matterSlug`
  supplied, inert label otherwise), quote located / not-found caution,
  uncited + "No sources cited" states. `matterSlug` prop threaded from
  `ArtifactDetail` + `SignOff`.
- `SignOff.tsx` (SA-4) — quiet `SignoffCoverage` near the affirmation:
  cited/uncited counts, zero-sources warning, quote-not-found caution.
  **Does not block signing** (advisory; a hard block would be false
  precision for legacy/non-document outputs).
- `findings_pack` (SA-5) — renders the shared source block *only* if a
  payload carries structured `source_anchors`; plain `citation` strings are
  never turned into fake chips.
- Copy boundary: "Sources cited" / "cited for review; Legalise does not
  certify they prove the claim". Never verified/proven/certified.

## Tests
- Backend: `test_source_anchors.py` (4, pure); `test_prompt_runtime_anchors.py`
  (7, pure — parsing, always-on anchors, unknown-handle drop, quote
  found/not-found, model-can't-assert-identity); `test_prompt_runtime.py`
  (+1 DB: doc-backed run emits document anchors on the stub path);
  `test_export_source_anchors.py` (1: anchors survive export +
  `signoff_hash_matches` true + README copy).
- Frontend: `ArtifactPreview.test.tsx` (+5: chips/link, quote-not-found
  caution, empty/legacy states); `SignOff.test.tsx` (+2: coverage shown,
  no-sources warning, signing not blocked).
- Gate: frontend `tsc` clean · full vitest **195/195** · `vite build` OK.
  Backend full suite **819 passed** (only the 4 known pre-existing env
  failures — 3 macOS sandbox + dev-autoverify demo-seed count).

## Deferred (per plan non-goals)
- No external legal-research connectors (document_type only).
- No claim that citations are legally correct; no click-to-unlock signing.
- No retroactive mutation of old artifacts (render "No sources cited").
- Contract Review still emits plain `citation` strings — structured anchors
  for it are a later pass; v1 does not fake them.

## For reviewer
Diff-review `source-anchors-v1`. Merge call yours. No schema change. The
highest-leverage thing to sanity-check is SA-2's `_build_source_anchors` —
that anchors are server-built and `quote_found_in_source` never overclaims.
