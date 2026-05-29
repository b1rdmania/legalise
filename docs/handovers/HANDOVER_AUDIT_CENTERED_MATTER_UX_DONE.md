# Audit-Centred Matter UX Pass

Date: 2026-05-29
Branch: `codex/audit-centered-matter-ux`

## Goal

Correct the visible product drift: the matter workspace had started to expose too much substrate state across too many panels. The thesis is supervised autonomy on a matter, so the matter-level activity/audit record should be the main explanatory surface.

## Shipped

- Matter sidebar label changed from `Audit` to `Activity Trail`.
- Matter nav now puts `Activity Trail` immediately after `Documents`, ahead of chronology/workflows/approvals.
- Workspace/global audit label changed to `Workspace audit` so it does not compete with the matter trail.
- `/matters/{slug}/audit` now leads with `Activity Trail`, not `Reconstruction`.
- The page copy explains the user story: documents touched, actions run, models called, outputs written, reviews, and blocked attempts.
- Raw source filters and decision-type chips are collapsed under `Filters and raw sources`.
- Loaded activity classes render as simple story cards (`Action ran`, `Model used`, `Human review`, etc.) that still facet the loaded page.
- Matter action panel now says `Actions on this matter`.
- Technical grants and the grant form are collapsed under `Permissions and setup`, with copy that frames grants as setup/debug detail.

## Boundaries

- Frontend-only.
- No route changes.
- No endpoint/schema/substrate changes.
- No removal of raw audit detail; payloads/refs remain expandable.
- No hiding of governance facts, only progressive disclosure.

## Verification

- `npm test -- GrantsPanel ReconstructionView` -> 29 passed.
- `npm run typecheck` -> clean.
- `npm run build` -> clean.

## Product Direction

This is the intended UX principle going forward:

> The matter trail explains what happened. Module, grant, provider, and review machinery should be visible when needed, but not distributed as competing primary surfaces.

