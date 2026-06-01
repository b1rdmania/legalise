# Demo Loop Disposition — 2026-06-01

**Purpose:** decide how Kramer carry-over #1 (guided exhibit for Khan) relates to demo surfaces already on master. Output: **keep / replace / fold into Khan matter**. Discovery PR; no UI build attached.

Builder recommendation: **keep both existing surfaces; add a third, Khan-anchored guided surface**. Not an obvious call. Reviewer to ratify.

## Demo surfaces on master today

There are two distinct demo paths. They are not redundant — they serve different audiences and prove different things.

### Surface A — `/demo` (`frontend/src/demo/DemoMatter.tsx`, 403 lines)

- **Audience:** anonymous fresh visitor. No signup required.
- **Backend:** zero. Hard-coded snapshot at `frontend/src/demo/snapshot.ts`. Every action button flashes a *"Create a free account to run this on your own matter"* CTA.
- **Shape:** mirrors `MatterDetail`'s MatterHeader + MatterTabBar + main column over a synthetic Khan-shaped record.
- **Proves:** *"this is what the workspace looks like loaded"*. Marketing / landing legibility.
- **Limit:** nothing runs. No audit row is written. The visitor cannot see a real chain.

### Surface B — `/demo-loop` (`frontend/src/demo/DemoLoop.tsx`, 230 lines)

- **Audience:** authed user who has signed up. Dashboard CTA *"Try the governed loop"*.
- **Backend:** real. `POST /api/demo/guided-loop` idempotently provisions a **separate** matter (`guided-demo-loop` slug, not Khan) + one synthetic doc + the demo prompt module + matter-scoped grants. The run goes through the normal invocation endpoint → prompt runtime → posture gate → grants → advice-boundary → model gateway → `skill_response` artifact → audit chain.
- **Keyless:** `default_model_id = "stub-echo"`. No provider key needed. Genuinely keyless; not faked.
- **Shape:** linear 4-step page (run → artifact → request review → Activity Trail). Surfaces separation-of-duties honestly (author cannot self-approve; demo requests review and links to Approvals).
- **Proves:** *"the supervised-autonomy loop is real and runs end-to-end on the real substrate"*. Developer / sceptic legibility.
- **Limit:** synthetic matter, synthetic doc, toy model. Not Khan. The visitor sees the loop but not the canonical demo matter.

## What Kramer carry-over #1 actually asks for

From `docs/handovers/KRAMER_DEMO_COMPREHENSION.md` §1:

> Khan needs the same shape. The developer OKR ("time to first audit row in under five minutes") is the same problem. A `legalise demo seed --case khan` (or web endpoint equivalent) that writes Khan into a runnable state with one reference module already executed against it is the public-repo product surface.

Two important properties of that ask:

1. **Khan-anchored**, not synthetic. The point is Khan as canonical demo matter, not a sibling toy.
2. **One reference module already executed against it**. Past-tense — pre-populated audit history, generated outputs already present. Not "click here to run it now".

Neither A nor B delivers both properties. A is Khan-shaped but nothing has executed. B has executed but is not Khan.

## Three options

### Option 1 — Replace `/demo-loop` with a Khan-based guided loop

Re-point Surface B's ensure endpoint at Khan instead of `guided-demo-loop`. Run a reference module (Contract Review or Pre-Motion) against a Khan document on first visit.

**Costs:**
- Loses the keyless property unless Khan modules are wired through `stub-echo`. Khan's existing seed assumes real provider runs.
- Conflates "minimal governed-loop proof" with "canonical Khan demo". Different audiences; one page can't serve both well.
- Touches Phase 13 territory of the v2 plan (Khan as canonical demo matter with pre-populated audit history). Doing this now on master risks the *"half-rebuilding the runtime on master while keeping old tab/workflow assumptions underneath"* failure mode flagged in plan §0.

**Benefits:**
- One fewer demo surface to maintain.
- Khan becomes legibly runnable.

### Option 2 — Keep `/demo-loop` as-is; do nothing on Khan now

Defer Kramer carry-over #1 entirely to Phase 13 of the rewrite plan.

**Costs:**
- Khan stays static in the workspace. The Kramer comprehension lesson (*demo that tells a complete story in 60 seconds*) does not land for Khan.
- The "guided exhibit" demand becomes another item the rewrite plan must absorb, increasing Phase 13 scope.

**Benefits:**
- Zero new surface. Zero risk of duplicating Phase 13 work.
- Forces the rewrite branch to start before Khan demo legibility improves.

### Option 3 — Keep both existing surfaces; add a Khan-anchored guided surface (recommended)

Keep A (`/demo`) and B (`/demo-loop`) unchanged. Add a third surface — a guided-first-run experience anchored on the seeded Khan matter itself.

Shape (sketch only; PR3 would design properly):
- New route or hook on `/matters/khan-v-acme-trading-2026` that surfaces a 3-step guided overlay on first visit: *Open document → Run reference module → Read the trail*.
- The reference module run is either (a) pre-seeded (Phase 13 shape — audit history already present), or (b) one click that produces it. Builder leans pre-seeded so it matches Kramer's "one reference module already executed against it".
- Surface A remains the anonymous marketing demo.
- Surface B remains the keyless minimal-loop proof.

**Costs:**
- One more surface to maintain.
- Pre-seeded audit history on Khan partially anticipates Phase 13 of the v2 plan. Need to choose a shape that Phase 13 can later replace cleanly, not one Phase 13 has to wrestle with.

**Benefits:**
- Each surface serves one audience: anonymous visitor (A), sceptic developer (B), authed user wanting to see Khan tell a story (C).
- Khan stays the canonical demo without disturbing the minimal-loop proof.
- The recommended PR3 stays demo-layer only — no new substrate, just pre-seeded data + a guided overlay component.

## Why this is not an obvious call

Three reasons it goes to Reviewer:

1. **Phase 13 collision risk.** v2 plan §Phase 13 already specifies Khan as canonical demo matter with pre-populated audit history. Building Option 3 on master without the `runtime-rewrite` branch underneath either (a) pre-empts Phase 13 scope, (b) creates work Phase 13 has to redo, or (c) shifts Phase 13 acceptance bars. Reviewer decides which.
2. **Audience boundary.** Option 1 (consolidate) and Option 3 (add) make different bets about whether "minimal loop proof" and "canonical Khan demo" should share a page. Builder leans separate; Reviewer may not.
3. **Keyless property.** The `stub-echo` keyless path is a real product virtue (a fresh visitor sees a real run without a key). Any Khan-anchored guided surface either preserves that (more wiring) or sacrifices it (simpler, but loses the property). Reviewer decides which.

## What this PR is

- Discovery and disposition only.
- No code touched in `DemoLoop.tsx`, `DemoMatter.tsx`, `api/demo.py`, or `core/demo_loop.py`.
- One doc on disk.

## What PR3 would be if Reviewer chooses Option 3

- New `frontend/src/matter/KhanGuidedOverlay.tsx` (or similar) shown only when current matter is Khan and a flag-state indicates first-visit.
- Backend: extend Khan seed in `backend/app/core/seed.py` to pre-execute one reference module against one Khan document, writing the audit chain at seed time. Use stub-echo by default; allow real provider override.
- No new substrate. No new primitives. Demo-layer only.

If Reviewer chooses Option 1, PR3 is the re-pointing of `ensure_guided_demo` to Khan. If Option 2, no PR3.

## References

- Existing surfaces: `frontend/src/demo/DemoLoop.tsx`, `frontend/src/demo/DemoMatter.tsx`, `backend/app/api/demo.py`, `backend/app/core/demo_loop.py`
- Existing handover: `docs/handovers/HANDOVER_GUIDED_DEMO_LOOP_V1_DONE.md`
- Kramer carry-over brief: `docs/handovers/KRAMER_DEMO_COMPREHENSION.md` §1
- v2 plan Phase 13: `docs/IMPLEMENTATION_PLAN_REWRITE.md` §"Phase 13 — Khan canonical demo matter"
- Rewrite plan addendum: `docs/IMPLEMENTATION_PLAN_REWRITE_ADDENDUM_2026_06_01.md`
