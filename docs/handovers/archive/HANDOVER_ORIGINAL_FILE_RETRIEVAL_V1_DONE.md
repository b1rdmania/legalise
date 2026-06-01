# Original File Retrieval v1 — Handover (DONE)

**Status:** built on `phase-17-crm-pass`, green, awaiting review/merge. Closes the Document Workspace G1 gap.
**Date:** 2026-05-28
**Plan:** `ORIGINAL_FILE_RETRIEVAL_V1_BUILD_PLAN.md` (incl. the owner-only correction at `151dad0`).

## Endpoint shipped

`GET /api/documents/{document_id}/original` (`backend/app/api/documents.py`) — a **streamed backend proxy** (not a presigned URL): reads the original bytes via `get_storage_backend().get_bytes(doc.storage_uri)` and returns a `StreamingResponse`.

- `?download=1` → `Content-Disposition: attachment`; default → `inline`. Same bytes, same auth, same audit.
- `media_type = doc.mime_type or "application/octet-stream"`; `Content-Length` set; filename sanitised via the existing `_safe_filename`.

## Auth decision (owner-only — per the `151dad0` correction)

- Owner (`matter.created_by_id == user.id`) only. **No superuser/admin shortcut** — matches the existing body/versions endpoints. A non-owner superuser gets a uniform 404 (test-asserted). Admin document inspection, if ever needed, must be a separate explicit policy, not smuggled into this path.
- Archived matter → 404. Cross-user / missing document / `storage_uri = None` / missing storage object → uniform 404.
- No role hierarchy, no qualified-solicitor gate, no posture gate.

## Audit action + payload

- Every successful access writes `document.original.accessed` (new audit action, rides the existing reconstruction `audit` source — no new source) via `audit.log` on the request session.
- Payload: `filename`, `sha256`, `mime_type`, `size_bytes`, `download` (bool).
- Storage backend read failure → `502` structured (`{error: storage_read_failed, backend, storage_key}`) + a `storage.get_bytes.failed` failure-audit via the existing `audit_failure` helper.

## UI changes

- `frontend/src/lib/api.ts`: `documentOriginalUrl(documentId, { download? })` — browser-navigable URL (used as an `<a href>`; the browser handles the response, no React-state fetch).
- `frontend/src/matter/DocumentDetail.tsx`: the G1 "not available" note is **replaced** with real **Open original** (new tab, inline) + **Download original** (`?download=1`) actions, with an "Original file access is audited." line. Extracted-text / versions / anonymisation / edit sections unchanged.

## Tests run

- **Backend (focused):** `tests/test_original_file_retrieval.py` — 9 tests, all green: owner inline (200, bytes match, content-type, inline disposition, audit row), owner download (attachment, `download:true` payload), **non-owner superuser 404**, cross-user 404, archived 404, missing doc 404, `storage_uri=None` 404, missing storage object 404, storage-read-error 502. (Run locally against the docker pg + MinIO via host IP; the 502 test no-ops `audit_failure` to dodge the SAVEPOINT cross-session FK trap — harness limitation, not a product issue.)
- **Frontend:** `DocumentDetail.test.tsx` updated — asserts Open/Download hrefs (download=1 only on download) and that the old note is gone. Full frontend vitest **161 passed / 22 files**; `tsc -b` clean; `npm run build` succeeds.
- **Not run during build:** full backend pytest (deferred to CI per the plan's cadence — CI runs it in-container); e2e (leaf-route enhancement, low nav risk).

## Residual limitations

- Reads stream the whole object into memory (`iter([data])`) — fine for legal docs at current sizes; true chunked streaming is a future optimisation if very large files appear.
- No range requests / partial content (browser-native open only).
- The streamed proxy puts original-file bandwidth through the backend (the deliberate governance trade-off vs presigned URLs).

## Next recommended phase

G1 is closed. Back to the v1 plan: module standalone / create-module, or the live-matter foundations (object storage source-of-truth / durable jobs / matter export). Admin document inspection remains explicitly out of scope unless a separate policy is decided.
