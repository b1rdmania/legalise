# Original File Retrieval v1 — Build Plan

Status: ready for Builder.
Branch: `phase-17-crm-pass`.
Date: 2026-05-28.

## Why This Is Next

Document Workspace v1 made uploaded documents first-class objects, but it surfaced one real product gap: users cannot open or download the original uploaded file.

That gap matters for v1. A legal workspace where uploaded files can be inspected only as extracted text still feels incomplete. The product should let a user open the exact original file that produced the extracted text, artifacts, review decision, and audit trail.

This is a small backend/security phase, not a redesign.

## Decision Calls

These are settled for this build so the Builder can proceed without another planning loop.

1. **Delivery model: streamed backend proxy.**
   - Do not use presigned URLs for v1.
   - Rationale: Legalise is a governed legal workspace. Keeping file access behind the backend preserves auth, audit, failure envelopes, and future posture/retention hooks inside the product boundary.

2. **Endpoint shape: one endpoint, query-controlled disposition.**
   - `GET /api/documents/{document_id}/original`
   - Default: inline/open where browser supports it.
   - `?download=1`: attachment/download.
   - Same bytes, same auth, same audit action.

3. **Auth scope: existing owner/superuser matter access shape.**
   - Owner can access.
   - Superuser can access.
   - Cross-user/non-owner returns uniform 404.
   - Archived matter returns 404.
   - No role hierarchy, no qualified-solicitor gate, no posture gate in v1.

4. **Audit: yes.**
   - Emit `document.original.accessed`.
   - This is a new audit action because "who opened the original file" is part of the governance story.
   - It should appear in reconstruction through the existing audit source. No new reconstruction source.

5. **Failure semantics.**
   - Missing `Document.storage_uri` or missing storage object: 404.
   - Storage read backend failure: 502 with structured detail.
   - Storage read failure should emit storage failure audit using the existing failure pattern where appropriate.

## Existing Seams Verified

- `Document.storage_uri` exists in `backend/app/models/document.py`.
- Upload sets `doc.storage_uri` to the canonical object key in `backend/app/api/matters.py`.
- Canonical upload keys are produced by `uploaded_key(...)` in `backend/app/core/storage.py`.
- Storage abstraction already exposes `get_bytes(key)` and structured `StorageReadError`.
- Existing generated/export download paths show response patterns:
  - `backend/app/api/documents.py` has generated document streaming.
  - `backend/app/api/exports.py` has local streaming / S3 presigned logic, but v1 original retrieval should stream through backend for both storage backends.
- Document body/versions endpoints already implement owner/archived 404 checks in `backend/app/api/documents.py`.

## Implementation Scope

### Backend

Add to `backend/app/api/documents.py`:

- `GET /{document_id}/original`
- Resolve `Document` joined to `Matter`.
- Authorise with owner-or-superuser access:
  - owner: `matter.created_by_id == user.id`
  - superuser: `user.is_superuser is True`
  - archived: 404 for everyone
  - missing/cross-user: 404
- Validate `doc.storage_uri` exists.
- Fetch bytes via `get_storage_backend().get_bytes(doc.storage_uri)`.
- Return `Response` or `StreamingResponse` with:
  - `media_type=doc.mime_type or "application/octet-stream"`
  - `Content-Length`
  - `Content-Disposition`
    - inline by default: `inline; filename="<safe filename>"`
    - download query: `attachment; filename="<safe filename>"`
  - Avoid raw unsafe filename injection; use a small filename sanitiser or quote/escape safely.
- Emit audit row:
  - action: `document.original.accessed`
  - matter_id: document's matter
  - actor_id: user
  - resource_type: `document`
  - resource_id: document id
  - payload:
    - `filename`
    - `sha256`
    - `mime_type`
    - `size_bytes`
    - `download` boolean
    - `storage_backend` if cheaply available, otherwise omit

Backend tests:

- owner opens original: 200, bytes match, content type correct, inline disposition, audit row exists.
- owner downloads original with `?download=1`: 200, attachment disposition, audit payload has `download: true`.
- cross-user: 404.
- archived matter: 404.
- missing document: 404.
- document with `storage_uri=None`: 404.
- storage object missing: 404.
- storage `get_bytes` failure: 502 structured error.

Use focused backend tests, not the whole suite during iteration.

### Frontend

Update `frontend/src/lib/api.ts`:

- Add helper for original URL construction if useful:
  - `documentOriginalUrl(documentId: string, opts?: { download?: boolean })`
  - This can return the API URL directly rather than `fetch`, because browser navigation/download handles the response.

Update `frontend/src/matter/DocumentDetail.tsx`:

- Replace the G1 honest note with real actions:
  - `Open original`
  - `Download original`
- Keep a small provenance note if useful:
  - "Original file access is audited."
- Do not fetch bytes through React state unless required; link/button hrefs are enough.
- Keep the extracted-text, versions, anonymisation, edit sections unchanged.

Frontend tests:

- Original actions render with correct hrefs.
- The old "original file isn't available" note is gone.
- Links include `download=1` only for download.

Docs:

- Update `docs/handovers/HANDOVER_DOCUMENT_WORKSPACE_V1_DONE.md` or add a short follow-up handover noting G1 closed.
- Update any v1 roadmap/KISS doc that lists original-file retrieval as open.

## Non-Goals

- No presigned URL implementation.
- No provider/module/settings work.
- No document editing substrate changes.
- No new document version semantics.
- No document preview renderer beyond browser-native open/download.
- No new reconstruction source.
- No posture/role gating.
- No full audit export work.

## Autonomy

The Builder has autonomy to implement this end-to-end.

Stop only if:

- `storage_uri` cannot be trusted as a storage key in production.
- Existing storage backends cannot support `get_bytes` for uploaded objects.
- The owner/superuser predicate conflicts with an existing documented document-access policy.

Otherwise proceed through backend, frontend, focused tests, and handover.

## Testing Cadence

During build:

- Focused backend tests for the new endpoint.
- Focused frontend tests for the new document actions.
- Typecheck/build for the frontend before final.

At merge gate:

- Backend CI can run the full suite.
- E2E only if the Reviewer wants a browser confirmation; this is a leaf route enhancement and should not require local e2e during iteration.

## Acceptance Criteria

This phase is complete when:

- A user can open an uploaded document's original bytes from the document detail page.
- A user can download the same original bytes.
- Cross-user and archived access are uniformly denied.
- Every successful original access writes `document.original.accessed`.
- Missing storage is honest and structured.
- Document Workspace no longer carries the G1 "not available" note.
- Handover records endpoint, auth, audit payload, tests, and residual limitations.

## Suggested Handover

Write:

`docs/handovers/HANDOVER_ORIGINAL_FILE_RETRIEVAL_V1_DONE.md`

Include:

- Endpoint shipped.
- Auth decision.
- Audit action and payload.
- UI changes.
- Tests run.
- Any residual limitations.

## Copy-Paste Starter For Builder

Read `docs/handovers/ORIGINAL_FILE_RETRIEVAL_V1_BUILD_PLAN.md`. Implement Original File Retrieval v1 end-to-end with a streamed backend proxy, owner/superuser auth, `document.original.accessed` audit, and DocumentDetail open/download actions. Use focused backend/frontend tests while building; full suites can wait for merge/CI unless a cross-boundary failure appears. Stop only if the existing `storage_uri`/storage backend assumptions are false.
