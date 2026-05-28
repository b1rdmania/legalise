# Document Workspace v1 — Build Plan

**Status:** plan + build (autonomous, per `DOCUMENT_WORKSPACE_V1_AUTONOMY_BRIEF.md`). Frontend-first; no storage/security decision required (see gaps), so building proceeds.
**Branch:** `phase-17-crm-pass`
**Date:** 2026-05-28

## Substrate inventory (verified, file/route refs)

- **List today:** `DocumentsTab.tsx` — upload form (tag + "from disclosure" + file) → table (Document / Type / Size / Disclosure / Updated / Action), rows expand inline to show sha256/size/uploaded + `EditPanel` + `AnonymiseButton`. It's a matter tab (`SIDEBAR_NAV` key `documents`), rendered inside the matter shell.
- **No routed document detail page exists** — detail is only the inline row expansion.
- **Frontend API** (`frontend/src/lib/api.ts`): `listDocuments(slug)`, `uploadDocument(...)`, `getDocumentBody(documentId)` → `DocumentBody {extracted_text, extraction_method, char_count, page_count, error_reason}`, `getDocumentVersions(documentId)` → `DocumentVersionSummary[]`, `getAnonymisation(documentId)`/`anonymiseDocument(...)`/`getAnonymisationMapping(...)`, edit-instruction + accept/reject helpers, `downloadGeneratedDocx(fileUuid)`.
- **Backend** (`backend/app/api/documents.py` + `matters.py`): `GET /documents/{id}/body`, `/versions`, `POST /edit-instructions`, edit accept/reject, `POST|GET|DELETE /{id}/anonymise` (+ `/mapping`), `GET /documents/generated/{file_uuid}` (generated docx stream), `POST|GET /matters/{slug}/documents`.
- **Models:** `Document` (filename, mime_type, size_bytes, sha256, **storage_uri**, tag, from_disclosure, uploaded_at, uploaded_by_id), `DocumentBody` (extracted/redacted/summary kinds), `DocumentVersion`, `DocumentEdit`.
- **Audit:** `document.upload`, `document.text_extracted`, `document.text_extraction_failed` (on upload); `module.anonymisation.viewed/deleted`. Reads are not audited (by design).

## Reference Patterns (research pass — source: Mobbin screens: HubSpot, Remote, PandaDoc, Gusto, Origin, monday.com, Dropbox, Linear, ClickUp)

- **Dense list row = name (linked, file-type) + provenance + status + last-updated.** Fits a matter: provenance ("uploaded vs AI-generated") is the "who put this in the matter" question.
- **Detail = preview/body large, metadata + actions in a side panel.** Fits: read the document while chain-of-custody metadata stays visible.
- **Status as inline pill + date, not a separate screen.** Fits: extraction/anonymisation availability is glanceable per row.
- **Version history = newest-first timeline (actor + timestamp) beside the body.** Fits: an attributed, time-stamped lineage is the evidentiary trail; actor labels map to human-vs-AI revisions.
- **Header carries breadcrumb of containing context + action cluster.** Fits: `Matter → document` so case scope is always clear.
- **Empty state grouped/structured, not one blank bucket.** Fits: a thin early matter still reads as a workspace.

## Proposed routes

- **NEW `/matters/{slug}/documents/{document_id}`** → `DocumentDetail` (routed, first-class). Mirrors the existing Artifacts list→detail pattern.
- **Keep `/matters/{slug}/documents`** as the existing `DocumentsTab` list (in-shell). **Decision (escape-hatch in the brief): do not promote the list to a standalone route in v1.** Reason: the list is already a coherent tab, and `MatterDetail` deliberately *leads with documents* (17-IA-B); converting it to a routed page forces a matter-shell default-landing change that's out of scope for "add a document workspace." The first-class gap is the **detail page**, which this delivers. Routed-list promotion is a clean follow-up.

## UI shape (DocumentDetail)

- `PageHeader` (eyebrow "Document", title = filename, mono sub-id) — existing primitive.
- Metadata via `DescItem` grid: type, size, sha256, tag, from-disclosure, uploaded.
- **Extracted text** viewer from `getDocumentBody` (+ method / char / page count); honest empty/error state when the body is missing or extraction failed.
- **Versions** list from `getDocumentVersions` (version #, kind, created, pending/accepted/rejected edit counts).
- **Anonymisation** read status via `getAnonymisation` (404 = none) + the existing `AnonymiseButton` for the interactive run.
- **Edits** via the existing `EditPanel` (behind a toggle).
- **Audit:** link to the matter reconstruction.
- `DocumentsTab` rows: filename becomes a link to the detail page; interactive edit/anonymise move to the detail page (de-duplicated).

## Backend gaps found (logged, not built)

- **G1 — original uploaded-file open/download does NOT exist end-to-end.** `Document.storage_uri` is captured but never exposed in any API response, and there is no endpoint that streams/redirects the original bytes (the only file-stream is `generated/{file_uuid}` for *generated* docx, keyed off an audit payload). **The detail page will NOT render a download/open-original button** (no disabled-fiction). A short honest note will state the original file isn't retrievable in-app. Building a real original-file download requires a storage-access + security decision (presigned URL vs streamed proxy, auth scoping) — **out of scope; filed for review.** This is the brief's stop-condition *only if we needed to build it*; we don't, so the rest proceeds around it.
- **G2 — document read is not audited** (by design). The detail page's audit link points at the matter reconstruction generally; there is no per-document audit deep-link because documents don't carry an invocation_id and reads emit no row. Noted, not changed.

## What will NOT be built

- No original-file download/open (G1). No new storage model or file-access policy. No new audit source/vocabulary. No routed-list promotion (kept as tab). No role-hierarchy / module-marketplace / provider work. No new editing/anonymisation substrate (reuse existing flows).

## Testing plan

- Focused frontend tests: `DocumentDetail` (renders metadata + extracted body + versions; body-missing honest state; **no original-download button present**) and the `DocumentsTab` filename→detail link.
- Typecheck + full frontend vitest + build at the gate.
- No backend tests (no backend change). No e2e unless navigation risk warrants (a new leaf route + a row link — low risk; rely on focused tests + the route shim).

## Stop conditions

- The only stop-condition (original-file retrieval needing a storage/security decision) is **handled by building around it** (G1 logged, no fake button). No other blocker. Proceeding to build.
