# Handover — Phase A (broader v0.1 build)

> **R1 patches landed + R2 doc cleanup applied.** Codex R1 returned four
> code findings; all four addressed. Codex R2 flagged two P3 issues —
> stale pre-R1 contradictions in this handover and a commit-hygiene note.
> Both addressed: stale yes/no-4 text and judgment-call #8 removed; the
> R1 section at the end is the authoritative audit posture. See "R1 —
> Codex findings addressed" and "R2 closure" at the end of this document.

Phase A of `BUILD_PLAN_BROADER.md` is implemented in code. Scope per
§4-pre-A and §5 of the plan: document body / text extraction layer,
edit-instruction surface (structured input, not chat), six new tables
on a single Alembic migration, three model-callable tools wired into
the gateway, audit `module` column, frontend EditPanel and pending-edits
list inlined into DocumentsTab.

Base head before Phase A: `dc01ad9` (Day E shipped; Day E itself still
awaiting Codex signoff — separate from this round). Phase A work sits
on top of `dc01ad9` unpushed; commit at reviewer's discretion after
signoff.

App.tsx split (§4-pre-A workstream 5) is **not** in this commit. It's
documented in "What's NOT in this commit" — recommendation stands to do
it before Phase B, scoped as a follow-up commit on this branch.

The plan estimated 3-4 days for Phase A. Implementation landed in one
condensed agent session via parallel-agent execution (W3 / W1 / W4 in
parallel, then W2 in series). Reviewer cadence per `HANDOVER_DAY_E.md`.

---

## Where we are

New / modified surface (24 files):

**Workstream 3 — Migration + models (signed off by execution agent, ~554 LoC)**
- `backend/alembic/versions/0004_phase_a.py` (NEW) — single migration, seven new tables + `audit_entries.module` column + data backfill (v1 `upload` version row for every existing document).
- `backend/app/models/document_body.py` (NEW)
- `backend/app/models/document_version.py` (NEW)
- `backend/app/models/document_edit.py` (NEW)
- `backend/app/models/tabular_review.py` (NEW — `TabularReview` + `TabularReviewRow`)
- `backend/app/models/workspace_skill.py` (NEW — `WorkspaceDisabledSkill`; **renamed** from `workspace_enabled_skills` per resolved design call G3.1: absence = enabled, presence = disabled)
- `backend/app/models/matter_citation.py` (NEW)
- `backend/app/models/audit.py` (MOD — added nullable `module: String(64)` column + index)
- `backend/app/models/__init__.py` (MOD — exports)

**Workstream 1 — Extraction layer (~400 LoC)**
- `backend/app/core/text_extraction.py` (NEW) — `extract(file_bytes, mime_type, filename) -> ExtractResult`. Magic-byte mime sniff; pypdf default, pdfplumber fallback for low-yield large PDFs; python-docx for DOCX; passthrough for TXT/MD; encrypted-PDF and unsupported-mime classified as `failed`.
- `backend/app/api/documents.py` (NEW) — router under `/api/documents`. Hosts `GET /{id}/body` (W1) and `POST /{id}/edit-instructions` (W2).
- `backend/app/api/matters.py` (MOD) — upload path runs extraction synchronously, inserts `DocumentBody`, writes `document.text_extracted` / `document.text_extraction_failed` audit row. **Failure no longer 422s** (deviation from delta sheet — see Judgment Calls).
- `backend/app/core/seed.py` (MOD) — Khan body fixtures from §4-pre-A pasted verbatim. Bodies seeded both at boot (`seed_demo_matter`) and on user verify (`seed_demo_matter_for_user`); idempotent via `_ensure_body`.
- `backend/pyproject.toml` (MOD) — `pdfplumber>=0.11` added.

**Workstream 4 — Gateway tools (~525 LoC)**
- `backend/app/core/model_gateway.py` (MOD) — `GatewayTool` dataclass, tool registry (`register_tool` / `get_tool` / `clear_tools` / `list_tools`), `invoke_tool()` with posture gating + Pydantic input/output validation. Existing `call()` untouched.
- `backend/app/core/tools/__init__.py` (NEW) — `register_phase_a_tools(gateway)` helper.
- `backend/app/core/tools/schemas.py` (NEW) — Pydantic input/output models per tool.
- `backend/app/core/tools/generate_docx.py` (NEW) — python-docx renderer, writes under `matter_files/generated/{matter_id}/{uuid}.docx`.
- `backend/app/core/tools/edit_document.py` (NEW) — persist pending `DocumentEdit` rows from a `changes[]` envelope.
- `backend/app/core/tools/replicate_document.py` (NEW) — clone latest version into a new `replicated` version row.

**Workstream 2 — Edit-instruction surface (~600 LoC)**
- `backend/app/modules/document_edit/__init__.py` (NEW)
- `backend/app/modules/document_edit/prompts.py` (NEW) — five mode-specific system prompts (`tighten`, `rewrite`, `summarise`, `free-text`, `uk-jurisdiction-sweep`). The wedge mode has real UK content (UCTA, CPR 36, governing-law, GDPR/UK-GDPR).
- `backend/app/modules/document_edit/pipeline.py` (NEW) — `propose_edits()` orchestrator: load doc + body + matter, build prompt, call `gateway.call()`, tolerant JSON-parse, persist `DocumentVersion(kind=assistant_edit)` + pending `DocumentEdit` rows, write `module=document_edit` audit row alongside the gateway's `model.call` row.
- `backend/app/api/documents.py` (MOD) — `POST /{id}/edit-instructions` endpoint with full request/response Pydantic schemas. 404 / 422 / 409 / 422 error envelopes match the rest of the API.
- `frontend/src/lib/api.ts` (MOD) — `getDocumentBody`, `postEditInstruction`, plus the `DocumentBody` / `DocumentVersionRead` / `DocumentEditRead` / `EditInstructionResponse` / `EditMode` types.
- `frontend/src/modules/document_edit/EditPanel.tsx` (NEW) — textarea + mode dropdown + four preset buttons + submit. `PendingEditsList` + `PendingEditRow` render the read-only diff state. Accept/reject deferred to Phase B per delta sheet.
- `frontend/src/App.tsx` (MOD) — DocumentsTab gains a 6th column ("Action"), per-row click expands EditPanel inline. ~30-line diff; everything else in App.tsx unchanged.

**main.py wiring**
- New router mounted: `app.include_router(documents_router, prefix="/api/documents", tags=["documents"])`
- Phase A tools registered at lifespan startup: `register_phase_a_tools(model_gateway)` after provider registration, before plugin-bridge wiring.

**Working scratch (delete-after-Phase-A)**
- `backend/app/migrations/PHASE_A_DELTA.md` — the Plan-agent delta sheet that drove execution. Safe to remove at any point; not imported by code.

Total: ~2,080 LoC net new (within the 2,500 LoC delta-sheet budget).

Build status:
- `cd backend && python -c "import ast" sweep of all `app/*.py` + `alembic/versions/*.py` → **0 syntax errors**
- `cd frontend && npm run build` → **green, 32 modules, 276 kB JS / 80 kB gzipped** (+6 kB from EditPanel + types)
- Real Python import check could not run end-to-end locally (no venv with `fastapi-users-db-sqlalchemy` installed). Reviewer should run `alembic upgrade head` + boot the app once before merging.

---

## How to orient yourself in 20 minutes

1. **`backend/app/migrations/PHASE_A_DELTA.md`** — the full scope sheet. Skim §"Workstream 3" for table shapes and §"Cross-cutting gotchas" for the load-bearing ones.
2. **`backend/alembic/versions/0004_phase_a.py`** — the single migration. Verify table column lists match the delta sheet and the model files. Check the data backfill at the end (seeds v1 `upload` rows for existing documents).
3. **`backend/app/models/audit.py`** — confirms `module` column is nullable + indexed, doesn't break existing audit rows.
4. **`backend/app/core/text_extraction.py`** — read end to end. The magic-byte sniffer, pypdf→pdfplumber fallback heuristic, and the encrypted-PDF / unsupported-mime classification rules are the key behaviour.
5. **`backend/app/api/documents.py`** — both endpoints. Note the 404-on-missing-body vs 200-with-failed-method distinction.
6. **`backend/app/modules/document_edit/pipeline.py`** — the orchestrator. The tolerant JSON parse + stub-provider survival path is the bit that lets smoke tests run without an API key.
7. **`backend/app/modules/document_edit/prompts.py`** — the five mode prompts. The wedge (`uk-jurisdiction-sweep`) is the one to sanity-check for UK-shape accuracy.
8. **`backend/app/core/model_gateway.py`** — read the new `GatewayTool` block and `invoke_tool()` only; the existing `call()` is unchanged.
9. **`backend/app/core/tools/generate_docx.py`** + `edit_document.py` + `replicate_document.py` — three handlers, ~80 LoC each.
10. **`frontend/src/modules/document_edit/EditPanel.tsx`** — 220 LoC including PendingEditsList + PendingEditRow. Tokens match Paper-Ink (no new design tokens).
11. **`frontend/src/App.tsx`** diff in `DocumentsTab` (line ~1644) — six-column grid + per-row expandable panel.
12. **Dev-server click-through** — register a fresh user → land on Khan → Documents tab → click a row → preset "Tighten this clause" → submit. With stub-echo provider you'll see a single audit row, zero pending edits, and a `model_notes` describing the unparseable stub response. That's the smoke path Phase A targets.

---

## Yes/no signoffs

### Yes/no 1 — Migration 0004 matches the models and the delta sheet

For each new table, confirm the migration's column list, types, FKs, indexes, and check constraints match the SQLAlchemy model AND the delta sheet's per-table SQL section. Specifically:

- `document_bodies`: composite PK `(document_id, kind)`; `extraction_method` CHECK in `{pypdf, pdfplumber, python-docx, passthrough, failed}`; `error_reason` NULL-able.
- `document_versions`: unique `(document_id, version_number)`; `kind` CHECK includes `replicated`.
- `document_edits`: unique `(document_version_id, change_id)`; `change_id` is `String(64)` (server-side UUID); `correlation_id` is `String(32)` NULL (model's transient `c1`/`c2`).
- `tabular_review_rows`: composite PK `(review_id, document_id)`, no `id` column.
- `workspace_disabled_skills`: composite PK `(user_id, plugin, skill)`; column is `disabled_at` (renamed from delta-sheet's `enabled_at` per resolved design call).
- `audit_entries.module`: nullable `String(64)`, indexed.
- Data backfill at the end of `upgrade()` inserts v1 `upload` rows for existing documents via a join through `matters.created_by_id`.

If any of these drift between migration / model / delta sheet, flag.

### Yes/no 2 — Extraction pipeline matches §4-pre-A spec

Spot-check `text_extraction.py` against §4-pre-A:

- Magic-byte sniff before trusting `mime_type` (handles browser misreports).
- PDF: `pypdf` default; fallback to `pdfplumber` only if `<100 chars AND size>50KB`.
- DOCX → `python-docx`; TXT/MD → utf-8 passthrough.
- Encrypted PDFs caught and classified as `failed/encrypted` (delta sheet G1.2 — not in original plan).
- Scanned PDFs / unsupported mimes return a `failed` body row, **not** a 422 on the upload itself (deviation — see Judgment Call 1).
- Khan seed bodies match the §4-pre-A fixtures verbatim.

### Yes/no 3 — Edit-instruction surface is structured-input, not chat

§4-pre-A is explicit: structured edit-instruction input, not a chat loop. Confirm:

- One textarea + one mode dropdown + four preset buttons. No message history, no streaming.
- Submitting calls a single endpoint, returns a single response with pending edits.
- Pending edits are read-only in this commit (accept/reject UI deferred to Phase B per §4a).
- The `uk-jurisdiction-sweep` mode is plumbed end-to-end with real UK-shape content in the system prompt.

If the surface drifts toward chat-shape (history, streaming, multi-turn state), push back.

### Yes/no 4 — Audit posture stays coherent with the new `module` column

Six new audit actions land in this commit, all namespaced via the new
`module` column:
- `document.text_extracted` (module=`document_ingestion`)
- `document.text_extraction_failed` (module=`document_ingestion`)
- `document.edit_instruction.invoked` (module=`document_edit`)
- `document.generated` (module=`document_generation`, written by `generate_docx` tool)
- `document.edits.persisted` (module=`document_edit`, written by `edit_document` tool)
- `document.replicated` (module=`document_edit`, written by `replicate_document` tool)

Plus the gateway's `model.call` row gets `payload.module="document_edit"`
on edit-instruction invocations.

`AuditEntryRead` (backend) and the `AuditEntry` TypeScript type (frontend)
both expose `module` so the Audit tab can group/filter on it in a future
UI pass.

---

## Judgment calls — push back on any

1. **Upload extraction failures return 200, not 422.** Delta sheet line 63 said "Caller raises HTTPException(422, ...)" for scanned PDFs. We diverged: the document is still committed and the `DocumentBody` row stores `extraction_method="failed"` + `error_reason`. Rationale: the doc has independent value as metadata (chronology references, audit trail), and re-extraction isn't possible without binary storage (G1.4). Same call applies to encrypted PDFs and unsupported mimes. UI surfaces the failure via the body endpoint. Reviewer can flip this back if 422 is the preferred contract.

2. **`workspace_enabled_skills` → `workspace_disabled_skills`.** Resolved design call G3.1: absence = enabled (default), presence = disabled. Avoids enumerating the filesystem-discovered plugin catalogue at signup. If reviewer prefers presence-=-enabled, the migration + model + (future) UI all need to flip.

3. **`document_edits.change_id` is server-side UUID + separate `correlation_id`.** Resolved design call G2.3. The model's `c1`/`c2` tag goes into `correlation_id` (String(32) NULL). Persistence-stable across re-runs. Alternative considered: `version_id + "/" + c1` namespace.

4. **Pydantic models per tool, JSON Schema derived on demand.** Resolved design call G4.1. No `jsonschema` dep added. Wire format (when sent to Anthropic's tools API) is still JSON Schema via `model.model_json_schema()`. Plan wording was "JSON Schema declaration"; we honour the wire shape via Pydantic.

5. **Edit panel inlined into DocumentsTab as per-row expandable, not a routed `DocumentDetail` view.** Delta sheet flagged that no Document detail view exists today. Inlined version ships in this commit; routed promotion can land with the App.tsx split (which is NOT in this commit — see below).

6. **Stub provider returns echo text, not JSON.** Pipeline survives this: `parse_envelope` returns an empty changes list and a `model_notes` describing the unparseable response, the new `DocumentVersion` row is still written, `parse_ok=false` is surfaced in the response. Smoke tests stay green without an API key. Real providers (Anthropic, OpenAI) will return valid JSON when prompted properly. If reviewer prefers the stub to return a synthetic edit so the UI shows non-empty pending list in dev, easy to add.

7. **`generate_docx` storage path** uses `matter_files/generated/{matter_id}/{uuid}.docx` rather than `{user_id}/{matter_slug}/`. Delta sheet preferred the slug path but the handler signature takes `matter_id` directly — slug lookup would force an extra DB hit per call. Phase B can plumb slug through if the UI needs human-readable paths.

---

## Smoke-test fragility — flagged

- **`alembic upgrade head` hasn't been run end-to-end locally.** Migration is syntactically valid Python and structurally matches the model definitions, but I couldn't verify the SQL execution against a Postgres instance from this session. Reviewer should run it once before merging.
- **`pdfplumber` adds a new pure-Python dep.** No system deps, but the lockfile (if any) needs regeneration. `backend/pyproject.toml` is updated; whatever uv / pip-tools workflow Andy uses needs a sync pass.
- **Stub-provider end-to-end test not written.** The pipeline survives stub responses (parse_ok=false, empty edits) but no `evals/smoke_edit_instruction.py` exists. Phase B / E will need it; not a Phase A blocker per delta-sheet "no tests in this workstream."
- **Real provider testing requires keys.** With a real Anthropic key the model will return JSON-shaped responses per the system prompt, but exact change-count and content are non-deterministic — reviewer should expect tolerant assertions in any future eval.
- **The UK-jurisdiction-sweep prompt is opinionated.** It instructs the model to flag UCTA, Consumer Rights Act 2015, CPR Part 36, UK GDPR / DPA 2018. Reviewer with E&W legal eye should sanity-check the list before launch; if too narrow / too broad, easy to tune in `prompts.py`.
- **EditPanel is inlined per-row.** It doesn't share state across rows; if you expand row A, type an instruction, expand row B, then re-expand row A, the typed instruction is gone. That's deliberate for v0.1 (no persistent draft state); flag if reviewer wants drafts saved.

---

## What's NOT in this commit

- **App.tsx split (W5 of delta sheet).** The 3309-line single-file React module remains. Recommendation stands: split before Phase B per the delta sheet's W5 rationale. Estimated +1 day. Target structure documented in `backend/app/migrations/PHASE_A_DELTA.md` §"Workstream 5".
- **Accept/reject UI for pending edits.** Deferred to Phase B per delta sheet (Phase A §4a acceptance bar paraphrased: "endpoint exists; UI shows pending state only"). Backend already supports the data shape (`status: pending|accepted|rejected`, `resolved_at`, `resolved_by_id`); only the endpoint + UI are missing.
- **Real tool wiring into the edit-instruction pipeline.** Pipeline currently calls `gateway.call()` and parses JSON from the response. The cleaner path is to wire it through `gateway.invoke_tool("propose_document_edits", ...)` once the structured-output tool is registered as a model-callable. v0.1 ships with prompt-level instruction; v0.2 can promote.
- **Download route for `generate_docx` output.** Tool writes to `matter_fs`; no UI button or `GET /api/documents/generated/{id}` endpoint exists yet. Phase B §4c wires the Letters tab "Download .docx" button.
- **Eval files.** `smoke_tracked_changes`, `smoke_tabular_review`, etc. land in Phase E per §4j of the build plan. No tests in any Phase A workstream per delta sheet.
- **Anonymisation, tabular review UI, case-law lookup, contract review** — all Phases C/B/C/C respectively.

---

## What I'd do next after signoff

1. **Run the migration locally**, boot the app, register a fresh user, walk through the Khan flow: open Documents, click a row, hit "Tighten this clause", confirm the round-trip writes audit rows + a new version + (with stub-echo) zero pending edits + a parse-fail `model_notes`.
2. **Plug a real Anthropic key into Settings → API Keys**, repeat the same flow on the Khan dismissal letter, confirm the model returns JSON, edits land in pending, and the matter Audit tab shows the `module=document_edit` row.
3. **If yes/nos clear**, commit + push, then decide on App.tsx split as the immediate follow-up (separate commit on this branch, no scope change).
4. **Phase B planning** — spawn the Plan agent for Phase B (§10b of `BUILD_PLAN_BROADER.md`) targeting `PHASE_B_DELTA.md`. Phase B = tracked-changes accept/reject UI + tabular review backend/UI + `generate_docx` UI wiring.

Approval pattern same as prior rounds: four yes/nos above, push back on the eight judgment calls, propose any P1/P2 fixes inline.

---

**Repo head when this handover was written:** `dc01ad9` on `master`
(Phase A work uncommitted; reviewer-signoff-gated commit).

---

## R1 — Codex findings addressed

All four findings from the Codex R1 review are fixed on top of the
original Phase A drop. No additional design calls required.

### F1 [P1] — v1 upload version row on fresh seed + upload docs

Was: migration backfilled `DocumentVersion(version_number=1, kind=upload)`
for existing documents at migration time, but new seed docs and future
uploads did not get one — so the first `assistant_edit` would land as
version 1 instead of version 2, violating the invariant that every
Document has a v1 upload row.

Now:
- `backend/app/core/seed.py` has a new `_ensure_initial_version()` helper
  alongside `_ensure_body()`. Called from both the fresh-seed path (after
  the two Khan documents are added) and the backfill path (per existing
  doc on re-entry). Idempotent.
- `backend/app/api/matters.py::upload_document` now adds a `DocumentVersion(
  version_number=1, kind="upload", created_by_id=user.id)` row
  immediately after the Document is flushed, before the audit row. Every
  uploaded document carries its v1 from the moment it lands.

Invariant restored: any Document the API has seen has at least one
DocumentVersion. The Alembic backfill is now belt-and-braces for the
pre-migration tail rather than the only guarantee.

### F2 [P2] — Tool posture gate bypassable when `matter_id=None`

Was: `invoke_tool` only enforced the C_paused gate if the caller passed a
`matter_id`. Tools like `edit_document` and `replicate_document` could be
called without one and skip the gate entirely. `generate_docx` could
write orphan output.

Now: `model_gateway.py::invoke_tool` raises `PrivilegePaused` if
`tool.posture_gated=True` and `matter_id is None`. Tools that legitimately
operate without a matter must be registered with `posture_gated=False`
explicitly. Docstring updated to reflect the requirement.

All three Phase A tools register with `posture_gated=True` (default), so
this hardens them all. Phase B tool authors get a loud error if they
forget the matter_id rather than a silent bypass.

### F3 [P2] — `audit_entries.module` not exposed via the audit API

Was: column added, written on new actions, but absent from `AuditEntryRead`
(backend) and `AuditEntry` (frontend type), so the Audit tab couldn't
surface it.

Now:
- `backend/app/api/matters.py::AuditEntryRead` includes `module: str | None`.
- `frontend/src/lib/api.ts::AuditEntry` includes `module: string | null`.

No UI change yet — the existing Audit tab renders fields it knows about;
adding a `module` column to that table is a Phase B UI tweak. The column
is now plumbed through the API so any reader (or eval) can see it.

### F4 [P3] — Extraction audit rows lack `module="document_ingestion"`

Was: `document.text_extracted` and `document.text_extraction_failed`
audit rows omitted the module namespace, leaving the first Phase A
caller as the inconsistent one and weakening the convention.

Now:
- `_write_audit()` helper accepts a `module=` kwarg.
- Both extraction audit calls pass `module="document_ingestion"`.

All Phase A audit rows that should be namespaced are namespaced:
- `document.text_extracted` → `document_ingestion`
- `document.text_extraction_failed` → `document_ingestion`
- `document.edit_instruction.invoked` → `document_edit`
- `document.generated` → `document_generation`
- `document.edits.persisted` → `document_edit`
- `document.replicated` → `document_edit`

The existing pre-Phase-A audit rows (`document.upload`, `model.call`,
`http.post`, etc.) remain module-NULL by design — that's the "no
module" baseline.

### Yes/no posture after R1

1. **Migration + v1 upload invariant** — now Yes. Migration backfills
   the pre-existing tail; runtime paths create v1 immediately for every
   new document.
2. **Extraction pipeline** — unchanged, still Yes (200-with-failed-body
   is the accepted divergence).
3. **Edit-instruction surface** — unchanged, still Yes.
4. **Audit posture** — now Yes. `module` is exposed end-to-end and the
   two extraction rows carry `document_ingestion`.

### Build status after R1

- `python3 -m compileall -q backend/app backend/alembic/versions` → clean.
- `npm run build` → green, 32 modules, 276 kB JS / 80 kB gzipped (no
  size change from R0 — the `module` field is one extra optional key).
- `alembic upgrade head` still not run locally; same Postgres-environment
  caveat as R0.

### Process note from Codex

> "Most Phase A files are currently untracked, so make sure the commit
> stages the new backend/frontend files as well as the modified ones."

Untracked file list at the time of this handover (24 code + 3 pre-existing
local-only docs):

```
backend/alembic/versions/0004_phase_a.py
backend/app/api/documents.py
backend/app/core/text_extraction.py
backend/app/core/tools/__init__.py
backend/app/core/tools/edit_document.py
backend/app/core/tools/generate_docx.py
backend/app/core/tools/replicate_document.py
backend/app/core/tools/schemas.py
backend/app/migrations/PHASE_A_DELTA.md      # working scratch — delete on commit
backend/app/models/document_body.py
backend/app/models/document_edit.py
backend/app/models/document_version.py
backend/app/models/matter_citation.py
backend/app/models/tabular_review.py
backend/app/models/workspace_skill.py
backend/app/modules/document_edit/__init__.py
backend/app/modules/document_edit/pipeline.py
backend/app/modules/document_edit/prompts.py
frontend/src/modules/document_edit/EditPanel.tsx
HANDOVER_BROADER_A.md
# plus pre-existing local-only:
docs/PEERS.md
docs/outreach/                                # Andy-owned drafts
```

`PHASE_A_DELTA.md` is working scratch — drop it (or `.gitignore` it)
when committing.

---

## R2 closure

Codex R2 raised two P3 issues, both non-code:

1. **Stale pre-R1 text in this handover** contradicted the R1 section.
   The yes/no-4 paragraph still listed extraction rows as missing the
   `module` namespace, and judgment-call #8 still flagged them as a
   reviewer-callable gap. Both removed; yes/no-4 now reflects the
   six namespaced actions and the API-exposure status.

2. **Commit hygiene.** When staging Phase A, exclude:
   - `backend/app/migrations/PHASE_A_DELTA.md` — working scratch.
   - `docs/PEERS.md` and `docs/outreach/` — Phase-E-shaped drafts that
     happen to be locally present; they belong with the launch
     positioning workstream, not this backend/frontend foundation.

   The actual Phase A commit list is the staged + untracked files
   under `backend/`, `frontend/src/lib/api.ts`, `frontend/src/App.tsx`,
   `frontend/src/modules/document_edit/`, and `HANDOVER_BROADER_A.md`.

No code changes in R2 — closure is documentation hygiene only. R1's
four code fixes remain the substantive delta.
