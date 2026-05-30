# V1 KISS Compression Pass — Done

Date: 2026-05-29
Branch: `master`

## Purpose

Keep the V1 product loop intact while removing the page-level clutter that made the demo feel like substrate exposed through UI.

No backend, schema, route, or audit contract changed. This is a frontend copy/navigation/composition pass.

## What changed

### 1. Matter navigation compressed

Primary matter nav now shows the V1 loop only:

1. Matter desk
2. Documents
3. Actions
4. Activity Trail

`Chronology` and `Approvals` remain routable for deep links and product surfaces that need them, but they no longer compete in the main matter rail.

The persistent app sidebar also labels:

- `/matters/{slug}/artifacts` as **Outputs**
- `/matters/{slug}/lifecycle` as **Export**

This keeps the record loop visible without asking users to parse substrate terms.

### 2. Outputs replace artifact language in the product surface

The artifact list/detail pages now present as **Outputs**:

- list title: `Outputs`
- list columns compressed to `Output / Sign-off / Produced by / Created / Open`
- detail title uses human labels such as `Draft motion`, `Findings pack`, `Skill response`
- raw kind/module/capability/invocation metadata moved into a collapsed `Technical record`

The route remains `/artifacts` for compatibility.

### 3. Professional sign-off stays the hero

On an output detail page, the main sequence is now:

1. sign-off status
2. output preview and sources
3. optional separate review
4. technical record
5. activity link

Supervisor review remains available for eligible outputs, but it is now behind `Optional separate review` so it does not compete with the author-sign-off path.

### 4. Export wording tightened

`Lifecycle` visible copy now reads as **Export matter**:

- export is the normal final step
- close/delete stay present, but lower in the hierarchy
- Activity Trail wording replaces “audit trail” in the visible export link

### 5. Fake controls removed

Removed the non-functional `Claude Sonnet 4.6` model-picker stub from:

- Matter desk composer
- right-rail assistant composer

This aligns with `JOY.md`: do not show fake controls or dead affordances.

### 6. Activity Trail copy softened

Changed “documents touched” to “documents referenced” so the page does not overclaim document-read auditing.

## Deliberate non-changes

- No substrate changes.
- No route removals.
- No role hierarchy / qualified solicitor UX.
- No new design system.
- No new legal workflow concepts.
- No removal of supervisor review, chronology, or technical metadata — they are just less prominent.

## Verification

Frontend:

- `npm run typecheck`
- `npm test -- --run` — 195 passed / 28 files
- `npm run build`

Backend not run: frontend-only pass.

## Next sensible pass

If further simplification is needed, inspect the live matter desk and Actions page in-browser and remove any remaining per-card module/grant jargon that does not directly help a user run, sign, or trace an output.
