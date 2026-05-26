# Journey 10 — Inspect artifacts

User opens a saved artifact (motion draft, evidence list, findings pack) and reads it.

## Preconditions

- At least one artifact exists for the matter (produced via Journey 08 / 09).

## Goal

User can list, open, and read an artifact's payload — with the matching audit/reconstruction context one click away.

## Trigger

- Matter workspace's artifacts panel → click an item, OR
- Invocation success state's "View artifact" CTA, OR
- Direct URL to `/matters/{slug}/artifacts/{id}`.

## Steps

1. **List.**
   - System: `GET /api/matters/{slug}/artifacts` ★ → array of `{id, module_id, capability_id, invocation_id, kind, created_at, size_bytes}`.
   - Grouped by `kind` then sorted by `created_at` descending.
2. **Open detail.**
   - System: `GET /api/matters/{slug}/artifacts/{id}` ★ → `{...metadata, payload: <parsed json>}`.
   - UI renders by `kind`:
     - `findings_pack` → table of findings (clause_id, severity, comment, citation)
     - `motion_draft` → rendered markdown + claim_summary + claim_type
     - `evidence_list` → table (document_id, relevance, citation_hint) with hyperlinks to the document view
3. **Deep-link to reconstruction.**
   - Every artifact detail page has a "See audit trail for this invocation" link → `/matters/{slug}/audit?invocation_id={artifact.invocation_id}` (filter param TBD in `BACKEND_GAP_AUDIT.md`).

★ **Gap:** Both `GET /api/matters/{slug}/artifacts` and `GET /api/matters/{slug}/artifacts/{id}` do not exist. Logged in `BACKEND_GAP_AUDIT.md` as a Phase 13b candidate.

## Audit emissions

| Step | Action | Audit row |
| --- | --- | --- |
| 1 | List artifacts | none (read; could optionally emit `matter.artifact.listed` — Phase 15+ decision) |
| 2 | Read artifact | none (read; could optionally emit `matter.artifact.read` for sensitive-doc tracking) |
| 3 | Reconstruction deep-link click | emits `audit.reconstruction.viewed` once the user lands on the reconstruction page (Phase 5 substrate) |

The "read" audit-row question is a real product decision: surfacing who read a privileged finding is part of supervised autonomy. Phase 13 records it as an open question for Reviewer; Phase 15+ either ships it or explicitly defers.

## Acceptance criteria

- [ ] Artifact list groups by kind, sorted by recency.
- [ ] Each kind renders with a `kind`-specific component (findings table, motion markdown, evidence table).
- [ ] Reconstruction deep-link preserves the `invocation_id` filter (or, if the filter doesn't exist server-side, the page UI filters client-side).
- [ ] Non-owner gets 404 on the artifact endpoint (assumes the gap-fill respects the matter-access predicate).

## Not covered

- Artifact download (.json / .md) — Phase 15+.
- Edit / re-export an artifact — out; artifacts are append-only.
- Cross-matter artifact search — out.
- Artifact diffing between invocations — out.
