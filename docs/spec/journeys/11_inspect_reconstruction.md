# Journey 11 — Inspect audit reconstruction (the load-bearing journey)

The page that makes "supervised autonomy" visible. Every other journey deep-links here.

## Preconditions

- Matter has at least one event (any invocation, install, grant, posture decision, etc.).

## Goal

User can read the full audit trail of what happened on this matter, in chronological order, with enough detail to reconstruct the sequence + verify the canonical audit chain.

## Trigger

- "See audit trail" link from the matter workspace, OR
- Deep-link from any error banner / artifact / module page.
- Filter params (when supplied) preserved across navigation.

## Steps

1. **Land on `/matters/{slug}/audit`.**
   - System: `GET /api/matters/{slug}/audit/reconstruction?limit=200` → page-1 entries + next_cursor.
   - UI renders a table: `occurred_at | source | actor | action | summary | refs`.
2. **Filter.**
   - Filter sidebar with controls:
     - **Sources** — `audit` / `state_machine` / `advice_boundary` (Phase 5 v3 three sources)
     - **Time window** — `since` / `until` ISO inputs
     - **Action** — substring match (client-side initially; server-side filter is a `BACKEND_GAP_AUDIT.md` finding)
     - **Invocation id** — derived from deep-links; pinned in the URL query string
   - Re-issues `GET .../reconstruction` with the new query.
3. **Paginate.**
   - "Load more" button uses the `next_cursor` (Phase 5 R2 cursor shape `{source, occurred_at, source_row_id}`).
   - Cursor is opaque base64 JSON; the UI never inspects it.
4. **Drill into a row.**
   - Click expands the row to show the full `payload` and `gate_state` dicts as syntax-highlighted JSON.
   - Refs (e.g. `audit_entry_id`, `transition_id`, `advice_boundary_decision_id`) are clickable; for now they just highlight the matching row.

## Audit emissions

| Step | Action | Audit row |
| --- | --- | --- |
| 1 | View reconstruction | `audit.reconstruction.viewed` (Phase 5 substrate emits this on every successful page load) |
| 2 | Apply filter | none (re-fetch only) |
| 3 | Paginate | none |
| 4 | Expand row | none (UI-only) |

The view itself audits the inspector — that's the substrate's "audit the auditor" property. Subsequent reconstruction pages show the inspector's earlier views; this is intentional ("who looked at the trail when" is itself provenance).

## Acceptance criteria

- [ ] Page loads in under 1 second cold against the seeded Khan matter (assuming <500 audit rows).
- [ ] Filter controls update the URL query string so views are bookmark-able.
- [ ] "Load more" works at least three pages deep against a busy matter.
- [ ] Row expansion shows the full canonical payload of every supported audit action.
- [ ] Posture / grant / invalid-ceremony denials are visible alongside successes — the trail is honest.
- [ ] The "view reconstruction" audit row appears in subsequent loads.

## Not covered

- CSV / PDF export of the reconstruction — Phase 15+ if a regulator asks.
- Cross-matter reconstruction (workspace-wide audit) — out, single-tenant + Phase 5 decision.
- Real-time audit stream (server-sent events) — async parked.
- Audit log immutability proofs (hash chain) — substrate has WORM triggers; UI proof is Phase 15+ if real.

## Why this is load-bearing

Every other journey deep-links here on a denial, a success, or an "explain what happened" CTA. If reconstruction renders cleanly, the substrate's claim of "supervised autonomy" stops being a JSON-only assertion and becomes a visible product property. If reconstruction doesn't render, every other journey's audit-emission discipline is silent in pixels.

Phase 14's foundation should make this page work first — even if rough — before any feature-surface polish.
