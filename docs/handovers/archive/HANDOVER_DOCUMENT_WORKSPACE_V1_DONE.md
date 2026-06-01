# Document Workspace v1 — Handover (DONE)

**Status:** built on `phase-17-crm-pass`, green, awaiting review/merge. Frontend-only — no backend, migrations, API, auth, audit substrate, or deploy config touched.
**Date:** 2026-05-28
**Plan:** `DOCUMENT_WORKSPACE_V1_PLAN.md`. **Brief:** `DOCUMENT_WORKSPACE_V1_AUTONOMY_BRIEF.md`.

## Shipped routes / components

- **New routed page `/matters/{slug}/documents/{document_id}`** → `frontend/src/matter/DocumentDetail.tsx`. First-class document detail: provenance metadata (type/size/sha256/tag/disclosure/uploaded), extracted-text viewer, version history, anonymisation (status + interactive `AnonymiseButton`), model edits (interactive `EditPanel` behind a toggle), audit-trail link, and an honest original-file-gap note.
- **`DocumentsTab`** (`frontend/src/matter/tabs/DocumentsTab.tsx`) — rows are now `Link`s to the detail page (the document name + "Open"); the inline row-expansion (metadata + EditPanel + AnonymiseButton) was removed and **moved to the detail page** (de-duplicated). Upload + list unchanged. Now takes a `slug` prop.
- **Routing:** `lib/route.ts` gained `matterDocumentDetail` (regex before the detail fallback); `router/index.tsx` registered `matterDocumentDetailRoute`; `ui/Sidebar.tsx` keeps the matter sub-nav visible on the detail route and highlights "Documents".

## Backend endpoints used (all pre-existing — no new endpoints)

- `GET /api/matters/{slug}/documents` (`listDocuments`) — metadata (no single-document GET exists; find-by-id from the list).
- `GET /api/documents/{id}/body` (`getDocumentBody`) — extracted text.
- `GET /api/documents/{id}/versions` (`getDocumentVersions`).
- `GET/POST /api/documents/{id}/anonymise` (`getAnonymisation` / `AnonymiseButton`).
- Edit-instruction + accept/reject (via `EditPanel`).

## Research patterns applied (Mobbin)

List = name(linked)+provenance+status+updated; detail = body large + metadata side; status as inline pill+date; version history as newest-first attributed timeline; header breadcrumb of containing context. (Full bullets + sources in the plan doc.)

## Gaps found

- **G1 (load-bearing) — original uploaded-file open/download does NOT exist end-to-end.** `Document.storage_uri` is never exposed; no endpoint streams/redirects original bytes (only `generated/{file_uuid}` for generated docx). The detail page renders **no** download/open-original button — just an honest note. Building real original-file retrieval needs a storage-access + security decision (presigned URL vs streamed proxy + auth scoping) — **out of scope, filed for review.** This was the brief's only stop-condition; handled by building around it, not stopping.
- **G2 — document reads are not audited** (by design). The detail page links to the matter reconstruction generally; no per-document audit deep-link (documents carry no invocation_id, reads emit no row). Unchanged.

## Tests run

- Focused: `DocumentDetail.test.tsx` (3 — metadata+body render with **no download button**, honest body-missing empty state, not-found). All green.
- Gate: `tsc -b` clean; **full frontend vitest 161 passed / 22 files**; `npm run build` succeeds.
- **Not run:** backend pytest (no backend change); e2e (a new leaf route + a row-link — low navigation risk; covered by focused tests + the route shim). The existing reconstruction/sidebar tests still pass.

## Risks / residual limitations

- No original-file download (G1) — the most likely user expectation gap; surfaced honestly.
- Anonymisation/edit are interactive on the detail page now; the matter Documents tab is a clean list (no inline editing) — a deliberate de-duplication.
- The Documents *list* stays an in-shell tab (not a standalone routed page) — see the plan's routed-list deferral rationale (avoids changing the 17-IA-B matter-shell default landing).

## Next recommended phase

- **Decide G1**: original-file retrieval (presigned R2/S3 URL vs streamed proxy) — a real storage/security call, blocked pending review.
- Optional: promote the Documents list to a routed page (needs the matter-shell default-landing decision).
- Then the broader v1 plan: module standalone / create-module, object storage / jobs / export.
