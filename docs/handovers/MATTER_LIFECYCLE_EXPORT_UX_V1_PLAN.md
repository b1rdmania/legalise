# Matter Lifecycle + Export UX v1 — Build Plan

**Status:** plan + build (autonomous overnight). Endpoint surface is stable (LMF v1 just shipped + tested); no new substrate decisions needed → building. Frontend-first.
**Branch:** `phase-17-crm-pass`
**Date:** 2026-05-29

## Goal
Make the matter lifecycle visible + safe: open → **export** → **close** (non-destructive) → understand **delete/purge** (destructive) → verify via the **audit trail**.

## Inventory (real LMF endpoints + audit actions — verified)
- **Export create:** `POST /api/matters/{slug}/export` → returns a `Job` row (kind `export`, status `queued`). Durable arq job.
- **Job poll:** `GET /api/matters/{slug}/jobs/{job_id}` → job state (status queued/running/succeeded/failed, stage, error). (SSE exists at `/events` but **constraint: poll only, no SSE UI**.)
- **Export download:** `GET /api/matters/{slug}/export/{job_id}` → 302 presigned (S3) or 200 stream (local) once `succeeded`; 409 if not ready. Emits `matter.export.downloaded`.
- **Close (non-destructive):** `POST /api/matters/{slug}/close` → `status=closed`, storage+audit+access retained, `matter.closed`, idempotent, owner-only, one-way in v1.
- **Delete (destructive):** `DELETE /api/matters/{slug}` → tombstone `status=archived` + `delete_prefix` storage purge (fail-closed: 502 + matter stays live on cleanup failure), refuses if active jobs, warns if no prior export, audits `matter.deleted` (+ `matter.deleted_without_export`), revokes grants.
- **Real audit actions** (for the audit-link filters; **no new audit source**): `module.export.job.{queued,started,completed,failed}`, `matter.export.downloaded`, `matter.closed`, `matter.deleted`, `matter.deleted_without_export`. *(Andy's scope listed `matter.export.requested/completed/failed` — those don't exist; we filter on the real `module.export.job.*` names.)*
- **No frontend helpers yet** for export/job/close/delete — add to `lib/api.ts`.

## Reference patterns (Mobbin — Slack, Basecamp, Clay, GitHub/Resend/Dub/Webflow, Maze/ClickUp/Todoist)
- **Export: an "included / not included" explainer directly above Start** (Slack Export Data) — name what the ZIP contains (matter metadata, documents+bytes, artefacts+bytes, reviews, reconstruction, audit, jobs, README) and what it omits.
- **Export job status as a chip that resolves into a Download in the same place** (Slack/Clay) — one stable location across queued→running→succeeded→failed; re-export = a new run.
- **"You can leave the page" copy, no blocking modal spinner** (Basecamp/Customer.io) — exports can take a moment; poll, don't block.
- **Archive/Close = neutral (not red) button + reversibility/retention stated in the body** (Maze/Claude/ClickUp) — "stays viewable; storage + audit retained" (but **one-way in v1** — no unarchive promise).
- **Delete = type-to-confirm gated on a real string** (Resend/Dub/Webflow) — type the matter slug; destructive button stays disabled until it matches.
- **Delete = a consequence checklist before the type field** (Webflow) — enumerate: storage purged, matter removed from lists, access revoked, irreversible.
- **Order Export → Archive → Delete top-to-bottom, delete walled in a red "danger zone"** (mymind/Medium) with an inline **"export first"** recommendation.

## Routes / surface
- **NEW routed `/matters/{slug}/lifecycle`** → `MatterLifecycle` (mirrors the Artifacts list→detail routing precedent; first-class). Sidebar matter sub-nav gains a **"Lifecycle"** entry; persists on the route like Artifacts.
- Owner-only (the endpoints enforce it; the page is reachable but actions 404/403 for non-owners — consistent with the rest).

## UI shape (`MatterLifecycle`)
`PageHeader` + three stacked panels (Export → Close → Delete), each using `DescItem`/primitives/tokens:
1. **Export panel** — included/not-included explainer; **Start export** (POST create → store job id in state + localStorage so a same-session reload resumes polling); poll `GET /jobs/{id}` every few seconds while queued/running; on `succeeded` show a **Download** link (`GET …/export/{id}`); on `failed` show the error. "You can leave this page" copy. A "View export activity" link → reconstruction filtered to `action=module.export.job.completed` (and the export rows).
2. **Close panel** — neutral confirm, retention copy ("stays viewable; storage + audit kept; one-way in v1"); `POST /close`; reflects `status=closed`. Hidden/disabled if already archived (tombstoned).
3. **Delete (danger zone)** — red-bordered, separated; consequence checklist + type-the-slug-to-confirm; `DELETE`; surfaces the fail-closed 502 and the no-prior-export warning honestly; inline "export first" pointer to the Export panel.
- **States:** loading (matter), error (failed action), empty (no export yet), job-polling (queued/running), terminal (succeeded/failed).

## Backend gap (filed, not built without approval)
- **G — no list-export-jobs endpoint.** Only single-job poll + download exist; there's no `GET /api/matters/{slug}/export` to list a matter's export history. So v1 tracks the **active/just-started** export in-session (job id in state + localStorage resume); durable history is the **audit trail** (the reconstruction export-action rows). A "past exports" table would need a small read endpoint (`GET …/export`) — **filed; build only if approved.** No faked history.

## Constraints honoured
Owner-only, no admin/superuser shortcut; no role hierarchy; **no new audit source**; no new storage semantics; **poll-only (no SSE)**; no marketing redesign; existing PageHeader/DescItem/primitives/tokens.

## Testing
- Focused frontend tests: export start→poll→download flow (mock create + job poll + download URL), close confirm, delete type-to-confirm gating + destructive copy, audit-link hrefs. Typecheck + full vitest + build at the gate.
- No backend tests (no backend change) unless the list-export gap is approved + built. e2e only if the main demo path changes materially (a new leaf route — low risk).

## Stop conditions
- If the lifecycle page needs the list-export endpoint to be coherent, **stop and request** the small read endpoint rather than fake history.
- If "closed = read-only" needs mutation-blocking enforced server-side, **stop** — v1 surfaces closed state in the UI but does not add server-side write-locks (that's a substrate decision).
