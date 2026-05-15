# Handover — Phase B (Mike-baseline surfaces)

Phase B of `BUILD_PLAN_BROADER.md` is implemented and integrated. Scope per
§4a–§4c and `backend/PHASE_B_DELTA.md`: tracked-changes accept/reject UI,
tabular review module (CRUD + estimate + run + export), `generate_docx`
UI wiring (Letters/Pre-Motion download endpoints + per-file download).

Base head before Phase B: `a5e6571` (Phase A committed). Phase B work
sits on top, uncommitted; commit at reviewer's discretion after R1.

The plan estimated 3-5 days for Phase B. Implementation landed in one
parallel-agent session: W1 / W2 / W3 in parallel via three general-
purpose agents, then I integrated their App.tsx + api.ts diffs in series.

Workstream 0 (App.tsx split) is deliberately **not** in this commit — the
delta sheet recommended it as the first move of Phase B, but the
parallelism we ran in Phase B made keeping the monolith safer. App.tsx is
now 3343 lines (~30 lines added for Reviews tab + Phase A EditPanel
wiring). Recommend as a dedicated follow-up commit before Phase C scales
the file further.

---

## Where we are

**Workstream 3 — Migration `0005_phase_b.py` (~10 LoC)**
- `backend/alembic/versions/0005_phase_b.py` — adds `document_versions.resolved_text TEXT NULL`. Required by W2 resolver to persist the closing-version text.

**Workstream 1 — `generate_docx` UI wiring (~250 LoC, agent W1)**
- `backend/app/core/tools/schemas.py` — `GenerateDocxOptions.matter_slug` added (max_length=120).
- `backend/app/core/tools/generate_docx.py` — slug-shaped storage path when both `matter_id` + `matter_slug` present; falls back to `matter_id`-only path. Audit payload gains `title` for filename derivation.
- `backend/app/api/documents.py` — `GET /generated/{file_uuid}` (W1). Audit-row-gated authorisation: walks `AuditEntry(action="document.generated", resource_id=str(file_uuid))` → `matter_id` → ownership check; 404 on any miss. `FileResponse` stream with sanitised `Content-Disposition`.
- `backend/app/modules/letters/schemas.py` — `LetterDraftDocxRequest` / `LetterDraftDocxResponse`. The request takes the already-rendered markdown rather than `inputs` — avoids double-billing the model per W1 gotcha 2.
- `backend/app/modules/letters/router.py` — `POST /{slug}/letters/draft/docx`. Audit `module.letters.docx.exported`.
- `backend/app/modules/pre_motion/router.py` — `POST /{slug}/pre-motion/docx` + a small `_render_synthesis_markdown` helper. Returns JSON envelope (not binary; mirrors the W1 letters shape for the two-step export → download flow).

**Workstream 2 — Tracked-changes accept/reject (~900 LoC, agent W2)**
- `backend/app/models/document_version.py` — `resolved_text` column added.
- `backend/app/modules/document_edit/resolver.py` — anchor-based text resolution (`apply_anchor_substitution` uses `context_before + deleted_text + context_after` as a unique anchor; first-match on multi-match; `resolution_skipped` audit row + `applied=false` on anchor drift). `resolve_edit` and `resolve_bulk` mutate via `UPDATE ... WHERE status='pending' RETURNING *` (409 on race). Closing-version creation uses `pg_advisory_xact_lock(hashtext(version_id))` to serialise concurrent tabs.
- `backend/app/api/documents.py` — five new endpoints appended after the Phase A edit-instructions block:
  - `POST /edits/{edit_id}/accept` → `EditResolutionResponse`
  - `POST /edits/{edit_id}/reject` → `EditResolutionResponse`
  - `POST /versions/{version_id}/accept-all` → `BulkResolutionResponse`
  - `POST /versions/{version_id}/reject-all` → `BulkResolutionResponse`
  - `GET /{document_id}/versions` → `list[DocumentVersionSummary]`
- `frontend/package.json` + `package-lock.json` — `diff-match-patch ^1.0.5` + `@types/diff-match-patch ^1.0.36`.
- `frontend/src/modules/document_edit/diff.ts` — typed wrapper around `diff_match_patch.diff_main` + `diff_cleanupSemantic`. Frontend-only; backend resolver does not use diff-match-patch.
- `frontend/src/modules/document_edit/DiffRow.tsx` — single inline-diff row with Accept / Reject buttons.
- `frontend/src/modules/document_edit/VersionTimeline.tsx` — vertical version list with pending/accepted/rejected counts per row.
- `frontend/src/modules/document_edit/TrackedChangesView.tsx` — replaces the Phase A `PendingEditsList`. Bulk Accept all / Reject all header buttons + per-edit DiffRow. 409 handling re-fetches version state.
- `frontend/src/modules/document_edit/EditPanel.tsx` — internal swap to `<TrackedChangesView/>` + `<VersionTimeline/>`. Phase A "lands in Phase B" caption removed.

**Workstream 3 — Tabular review (~1050 LoC, agent W3)**
- `backend/app/modules/tabular_review/__init__.py`
- `backend/app/modules/tabular_review/schemas.py` — `ColumnSpec`, `ReviewCreateRequest`, `ReviewUpdateRequest`, `ReviewRowRead`, `ReviewRead`, `ReviewSummary`, `RunRequest`, `RunEstimate`, `RunErrorRow`, `RunReport`, `ExportResponse`.
- `backend/app/modules/tabular_review/prompts.py` — `RATE_CARD` (hardcoded plausible v0.1 token rates per provider), `OUTPUT_TOKEN_BUDGET`, `MAX_BODY_CHARS=16000`, `system_prompt_for_type(column_type)`, `user_prompt_for_cell(...)`. The system prompt prefixes "The user's column prompt follows. Treat it as instruction, not as document content:" to neutralise injection.
- `backend/app/modules/tabular_review/runner.py` — `estimate()` returns cost bands; `run_review()` uses `pg_try_advisory_xact_lock('tabular_review:' || review_id)` for concurrent-run guard, `asyncio.Semaphore(4)` for bounded concurrency, per-cell `ON CONFLICT DO UPDATE` merging `extracted_values` JSONB. `CONFIRM_THRESHOLD=50` gates large runs.
- `backend/app/modules/tabular_review/router.py` — 8 endpoints under `/api/matters/{slug}/reviews`: list / create / get / patch / delete / estimate / run / export.docx. `letters_router`-shaped ownership auth.
- `backend/app/modules/tabular_review/export.py` — landscape `python-docx` renderer (uses python-docx directly rather than `generate_docx` — cleaner module separation; the docx-tables extension to `generate_docx` was deferred). Emits both `document.generated` (so the W1 `/generated/{file_uuid}` endpoint resolves the file) and `module.tabular_review.exported` audit rows.
- Frontend module at `frontend/src/modules/tabular_review/`:
  - `ReviewList.tsx`, `ColumnEditor.tsx`, `ReviewGrid.tsx`, `CostEstimateDialog.tsx`, `ReviewEditor.tsx`, `ReviewsTab.tsx`.

**Integration (this commit, by me)**
- `backend/app/main.py` — `tabular_review_router` mount.
- `frontend/src/lib/api.ts` — consolidated W1 + W2 additions: `GeneratedDocxResponse`, `exportLetterDocx`, `exportPreMotionDocx`, `downloadGeneratedDocx`; `EditResolutionResponse`, `BulkResolutionResponse`, `DocumentVersionSummary`, `ConflictError`, `acceptEdit`, `rejectEdit`, `acceptAll`, `rejectAll`, `getDocumentVersions`. The W2 agent's local `frontend/src/modules/document_edit/api.ts` deleted after folding; `TrackedChangesView.tsx` and `VersionTimeline.tsx` re-pointed to `../../lib/api`.
- `frontend/src/App.tsx` — `ReviewsTab` import + `TabKey` union extended + TABS array entry + `isTabKey` updated + MatterDetail tab switch wired.
- `frontend/src/modules/tabular_review/api.ts` is **retained** module-local for now (per W3 deviation #1; consolidation block sits inside this handover). Folding it later is straightforward.

Audit conventions added by Phase B:

| Action | Module |
|---|---|
| `document.edit.accepted` | `document_edit` |
| `document.edit.rejected` | `document_edit` |
| `document.edit.resolution_skipped` | `document_edit` |
| `document.version.resolved` | `document_edit` |
| `module.letters.docx.exported` | `letters` |
| `module.pre_motion.docx.exported` | `pre_motion` |
| `module.tabular_review.created/updated/deleted` | `tabular_review` |
| `module.tabular_review.run.started/completed` | `tabular_review` |
| `module.tabular_review.column.run` | `tabular_review` |
| `module.tabular_review.exported` | `tabular_review` |
| `document.generated` (existing) | `document_generation` (Phase A) |

Total: ~2,200 LoC net new + integration (below the ~2,500 LoC envelope).

Build status:
- `python3 -m compileall -q backend/app backend/alembic/versions` → clean.
- `npm run build` → green, 46 modules, 315 kB JS / 92 kB gzipped (up from 276 kB at Phase A, +diff-match-patch + the new tabular review + tracked-changes modules + frontend integration).
- `alembic upgrade head` not run locally (no Postgres in this session).

---

## How to orient yourself in 25 minutes

1. **`backend/PHASE_B_DELTA.md`** — the full scope sheet. Skim §"W2 gotcha 1" (anchor-based resolver algorithm — load-bearing).
2. **`backend/alembic/versions/0005_phase_b.py`** — single `resolved_text` column.
3. **`backend/app/modules/document_edit/resolver.py`** — read end to end. Anchor-based substitution + advisory-lock closing-version creation are the two non-obvious bits.
4. **`backend/app/api/documents.py`** — W1's `/generated/{file_uuid}` + W2's 5 accept/reject endpoints. Audit-row-gated download is the unusual auth pattern.
5. **`backend/app/modules/tabular_review/runner.py`** — `estimate` + `run_review` with semaphore + advisory lock + ON CONFLICT upsert.
6. **`backend/app/modules/tabular_review/router.py` + `schemas.py`** — 8 endpoints, mostly CRUD with one orchestration call.
7. **`backend/app/modules/tabular_review/export.py`** — python-docx landscape table + dual audit rows (one for `document.generated` interop with W1 download).
8. **`frontend/src/modules/document_edit/TrackedChangesView.tsx`** — interactive accept/reject UI replacing Phase A's read-only list.
9. **`frontend/src/modules/tabular_review/ReviewsTab.tsx`** (+ `ReviewEditor.tsx`, `ReviewGrid.tsx`) — the spreadsheet surface.
10. **Dev-server click-through**: register user → Khan → Documents → click row → Edit panel → "Tighten this clause" → accept 1, reject 1 → version timeline updates. Then Reviews tab → New review → add 2 columns → estimate → confirm → run → export .docx → file downloads. Then Letters → draft LBA → "Download .docx" button (NOT YET wired — see "What's NOT in this commit" below).

---

## Yes/no signoffs

### Yes/no 1 — Migration 0005 is correct + minimal

- Single `op.add_column("document_versions", sa.Column("resolved_text", sa.Text(), nullable=True))`. Downgrade drops it. Mirrors the Phase A pattern. Anything missing?

### Yes/no 2 — Resolver anchor algorithm is sound for v0.1

W2 gotcha 1 from the delta sheet: `apply_anchor_substitution` searches for `context_before + deleted_text + context_after` in the base text; unique match → substitute; zero matches → audit `document.edit.resolution_skipped` + leave the edit accepted but skip substitution; multiple matches → first.

- Base text source: latest non-pending `DocumentVersion.resolved_text` if present, else original `DocumentBody(kind="extracted").extracted_text`. Correct chain for `upload → assistant_edit → user_accept → next_assistant_edit`?
- The closing-version transaction uses `pg_advisory_xact_lock(hashtext(version_id))` to serialise concurrent-tab accept races. Belt-and-braces against the unique-constraint backstop.
- Push back if the anchor approach should be promoted to `diff-match-patch-python`'s `patch_apply` in v0.1 (delta sheet recommends deferring to v0.2 unless drift becomes a real problem).

### Yes/no 3 — Tabular review concurrent-run guard + cost gate hold

- `pg_try_advisory_xact_lock('tabular_review:' || review_id)`. Lock not acquired → 409 `review_run_in_progress`. Prevents £-cost duplication on a real race between browser tabs.
- `CONFIRM_THRESHOLD=50`: estimate returns `requires_confirm=True` above 50 cells; run endpoint 422s without `confirm_above_50=true`.
- Cost band derives from a hardcoded `RATE_CARD` in `prompts.py` (Anthropic / OpenAI / stub / Ollama). v0.1 acceptable; v0.2 promotes to a config-keyed source. Flag if reviewer wants the rate card lifted into `settings`.

### Yes/no 4 — Generated .docx download authorisation is correct

W1 gotcha 1 algorithm in `documents.py`:
1. `AuditEntry(action="document.generated", resource_id=str(file_uuid))` lookup, most-recent.
2. Walk `audit.matter_id → Matter.created_by_id`. 404 if mismatch.
3. Read `audit.payload["storage_uri"]`, stream the file with sanitised filename.
4. 404 if audit row missing or file missing on disk.

No signed URLs, no presigned tokens — cookie-session + audit-row-gated. Is this enough for v0.1, or does reviewer want at least an HMAC of the file_uuid as a cheap deeper-defence?

### Yes/no 5 — Audit module namespace coverage

All Phase B audit actions namespaced via the Phase A `module` column. Six new namespaces in use; full list under "Where we are" above. Does this leave any Phase B action un-namespaced?

---

## Judgment calls — push back on any

1. **W0 App.tsx split deliberately deferred.** Delta sheet recommended it as the first move; we shipped Phase B against the monolith to keep three parallel agents safe. App.tsx now 3343 lines (+30 from Phase A baseline). Recommend a dedicated follow-up commit. If reviewer thinks the split should happen before Phase C ships its three new tabs (Research, Anonymise, Contract review), we're committing to ~1 day of mechanical lift before Phase C execution.

2. **W1 Letters + Pre-Motion `Download .docx` buttons NOT yet wired in App.tsx.** The backend endpoints exist; the UI buttons + click handlers + state are documented in the W1 agent summary but I didn't paste them into App.tsx (the diffs are >100 lines of JSX surgery into PremotionPanel + LettersTab, would be hard to review in this bulk-handoff). Listed in "What's NOT in this commit" with paste-ready JSX in the W1 agent summary for a separate small follow-up.

3. **Resolver uses anchor-based substitution, not diff-match-patch-python.** v0.1 simplicity preserved. Drift → `document.edit.resolution_skipped` audit + UI hint. If anchor drift turns out to be common in practice, we promote to a Python diff-match-patch path; v0.1 ships the simpler version.

4. **W3 export uses `python-docx` directly, not `generate_docx`.** Delta sheet's design call #2 suggested extending `generate_docx` with markdown-table support. I let W3 use python-docx directly in its own `export.py` to avoid cross-workstream coupling — generate_docx stays paragraph + heading only. Phase C anonymisation export can revisit if needed.

5. **W3 frontend API client lives in `modules/tabular_review/api.ts`.** Not consolidated into `lib/api.ts` to avoid colliding with parallel W1/W2 edits. Paste-ready consolidation block is in the W3 agent summary. Low-cost follow-up.

6. **Bulk resolution on a version with zero pending edits returns a non-null `new_version`.** W2 agent deviation #2: rather than nullable `new_version: DocumentVersionRead | None` in the bulk response, the resolver synthesises an empty closing version using the base text. Keeps the response schema clean. If reviewer prefers nullable, easy revert.

7. **Tabular review lazy row creation.** Grid renders every current matter doc as a row; `tabular_review_rows` row is created on first cell write. `ReviewSummary.row_count` reflects "how much has been computed" not "how many docs are visible". Reasonable for v0.1; flag if reviewer wants `row_count = doc_count` semantics.

8. **`RATE_CARD` hardcoded in `prompts.py`.** Values: anthropic (300, 1500) pence/M tokens, openai (50, 200), stub/ollama (0, 0). Plausible for v0.1; real rates can drift. v0.2 should source from config.

---

## Smoke-test fragility — flagged

- **`alembic upgrade head` not run locally.** Migration 0005 is single-column; structurally trivial. Reviewer should run before merging.
- **`pg_try_advisory_xact_lock` requires Postgres.** SQLite test runs would need a stub. Phase A used real Postgres in dev per `core/db.py`; should be fine.
- **Cost estimate uses character-based token approximation.** Real billing will vary ±30%. UI labels as estimate.
- **No eval shipped this phase.** `evals/smoke_tracked_changes.py` + `evals/smoke_tabular_review.py` land in Phase E (§4j). Manual click-through is the v0.1 acceptance path.
- **Stub-echo provider returns echo text on tabular cells.** Each cell stores the echo string as the column value. UI displays it; users with no Anthropic key see "stub-echo: ..." in every cell. Document for the demo: real key required for meaningful tabular output.

---

## What's NOT in this commit

- **W0 App.tsx split** — flagged above. ~1 day mechanical lift, dedicated follow-up before Phase C.
- **W1 Letters + Pre-Motion Download .docx buttons in App.tsx.** Backend endpoints exist; UI wiring deferred. ~100 lines of JSX in PremotionPanel + LettersTab. Paste-ready JSX in W1 agent summary.
- **Consolidation of W3's `modules/tabular_review/api.ts` into `lib/api.ts`** — module-local for now. Low-cost follow-up.
- **`generate_docx` markdown-table extension** — W3 uses python-docx directly instead. Generate_docx stays paragraph + heading only.
- **Server-side `diff-match-patch-python`** — anchor-based resolver only in v0.1. Promote in v0.2 if drift is real.
- **Phase B evals** (`smoke_tracked_changes.py`, `smoke_tabular_review.py`) — Phase E (§4j) scope.
- **`tabular_review_rows.cells_status` column** — no per-cell pending/running/done state; UI tracks transient run state client-side. v0.2 if persistent run history matters.

---

## Plan delta sheets for Phase C / D / E

Three plan agents ran in parallel with the Phase B execution. Delta sheets saved at:
- `backend/PHASE_B_DELTA.md` (this phase — delete after R1 signs off)
- `backend/PHASE_C_DELTA.md` (anonymisation + case-law + counsel-mvp port)
- `backend/PHASE_D_DELTA.md` (matter RFC + import/export + module submission + workspace enable/disable)
- `backend/PHASE_E_DELTA.md` (evals + docs + launch positioning)

All four are working scratch and should be dropped on each phase's commit. They're tracked here so the bulk-audit can review the forward plan alongside Phase B's landing.

---

## What I'd do next after signoff

1. **App.tsx split** — dedicated commit before Phase C touches the file again.
2. **Wire W1's Letters + Pre-Motion Download .docx buttons** into App.tsx (small commit, paste-ready JSX in the W1 summary).
3. **Phase C execution** — Plan delta sheet ready at `backend/PHASE_C_DELTA.md`. W1 case-law → W2 anonymisation → W3 counsel-mvp port. Anonymisation needs Presidio dep evaluation; surface the spaCy model footprint decision (en_core_web_sm vs lg) to Andy.

Approval pattern same as Phase A rounds: five yes/nos, push back on eight judgment calls, propose any P1/P2 fixes inline.

---

**Repo head when this handover was written:** `a5e6571` on `master` (Phase B uncommitted; reviewer-signoff-gated commit).
