# Demo Loop Disposition — 2026-06-01

**Purpose:** decide how Kramer carry-over #1 (guided exhibit for Khan) relates to demo surfaces already on master. Output: **keep / replace / fold into Khan matter**. Discovery PR; no UI build attached.

**Recommendation (Reviewer redline applied 2026-06-01):** keep `/demo` as anonymous marketing; evolve `/demo-loop` into the single guided exhibit. Do not add a third surface. The product needs fewer explanatory paths, not more — that was the explicit thrust of the V1 KISS compression pass and the Matter Desk UX compression. A third demo surface cuts directly against that work.

Khan anchoring on `/demo-loop` either happens now if the keyless `stub-echo` property can be preserved cleanly, or is explicitly deferred to v2 plan Phase 13. Reviewer to ratify which.

## Demo surfaces on master today

Two distinct demo paths. Not redundant — different audiences, different proofs.

### Surface A — `/demo` (`frontend/src/demo/DemoMatter.tsx`, 403 lines)

- **Audience:** anonymous fresh visitor. No signup required.
- **Backend:** zero. Hard-coded snapshot at `frontend/src/demo/snapshot.ts`. Every action button flashes a *"Create a free account to run this on your own matter"* CTA.
- **Shape:** mirrors `MatterDetail`'s MatterHeader + MatterTabBar + main column over a synthetic Khan-shaped record.
- **Proves:** *"this is what the workspace looks like loaded"*. Marketing / landing legibility.
- **Limit:** nothing runs. No audit row is written.

### Surface B — `/demo-loop` (`frontend/src/demo/DemoLoop.tsx`, 230 lines)

- **Audience:** authed user. Dashboard CTA *"Try the governed loop"*.
- **Backend:** real. `POST /api/demo/guided-loop` idempotently provisions a **separate** matter (`guided-demo-loop` slug, **not Khan**) + one synthetic doc + the demo prompt module + matter-scoped grants. Run goes through the normal invocation endpoint → prompt runtime → posture gate → grants → advice-boundary → model gateway → `skill_response` artifact → audit chain.
- **Keyless:** `default_model_id = "stub-echo"`. Real keyless provider, not faked.
- **Shape:** linear 4-step page (run → artifact → request review → Activity Trail). Surfaces separation-of-duties honestly (author cannot self-approve).
- **Proves:** *"the supervised-autonomy loop is real and runs end-to-end on the real substrate"*.
- **Limit:** synthetic matter, synthetic doc. Not Khan.

## What Kramer carry-over #1 asks for

From `docs/handovers/KRAMER_DEMO_COMPREHENSION.md` §1:

> Khan needs the same shape. A `legalise demo seed --case khan` (or web endpoint equivalent) that writes Khan into a runnable state with one reference module already executed against it is the public-repo product surface.

Two properties of that ask:

1. **Khan-anchored**, not a sibling synthetic matter.
2. **One reference module already executed against it** — past-tense, pre-populated audit history.

Surface B is the right shape but on the wrong matter. Surface A is on the right matter but executes nothing.

## Options

### Option 1 — Replace `/demo-loop` with a Khan-based guided loop

Re-point `ensure_guided_demo` at Khan. Run a reference module against a Khan document.

**Costs:**
- Loses the keyless property unless Khan modules can be wired through `stub-echo`. Khan's seed assumes real provider runs.
- Touches Phase 13 territory of the v2 plan.

**Benefits:**
- One demo-loop surface, Khan-anchored, matches Kramer ask directly.

### Option 1.5 — Evolve `/demo-loop` into the guided exhibit (recommended)

Same direction as Option 1, framed as evolution not replacement. Keep `/demo-loop` as the canonical guided-governed-loop surface. Decide as part of PR3 design whether the matter underneath is:

- **(a) Khan now**, preserving keyless by routing Khan's reference-module invocations through `stub-echo` on this surface; or
- **(b) Khan-like stub-backed clone now, Khan deferred to Phase 13**, keeping the keyless property cleanly and accepting the deferral.

Reviewer makes the (a) vs (b) call when PR3 lands. Either way: one demo-loop surface, not two.

**Costs:**
- (a) requires wiring stub-echo into Khan's invocation path on this surface only — non-trivial but bounded.
- (b) is the explicit KISS-correct deferral and keeps the keyless property untouched, at the cost of Khan still not being the runnable demo until Phase 13.

**Benefits:**
- No new demo surface. The product has *one* anonymous demo (Surface A) and *one* authed governed-loop demo (Surface B-evolved). The KISS-compression direction is preserved.
- Kramer carry-over #1 lands without inventing a third path.
- Phase 13 either happens or doesn't, but is not partially pre-empted by a parallel Khan-guided overlay sitting on master.

### Option 2 — Defer Kramer carry-over #1 to Phase 13 entirely

Do nothing on demo surfaces now. Khan stays static until the rewrite branch lands its Phase 13 work.

**Costs:**
- Khan stays static in the workspace until rewrite ships.
- Kramer comprehension lesson does not land for Khan until then.

**Benefits:**
- Zero new surface work. Forces the rewrite branch to start before Khan legibility improves.

### Option 3 — Add a third Khan-anchored surface (rejected)

Keep A unchanged. Keep B unchanged. Add a new guided-first-run overlay on the Khan matter itself.

**Rejected** because:
- The V1 KISS compression pass and Matter Desk UX compression spent days reducing explanatory surfaces. Adding a third demo path runs against that direction.
- Three audiences / three surfaces reads clean in a doc but produces cognitive debt at launch — a visitor sees Demo, Demo Loop, Khan matter, Activity Trail, Modules, Actions and has to learn which is which.
- The two existing surfaces can serve the two audiences (anonymous / authed) without a third. Sceptic + Khan-curious can both be served by an evolved Surface B.

Reviewer can still call Option 3 knowingly if there is a reason builder is missing, but it should not be the default.

## The Reviewer call

Pick one:

- **Option 1.5(a)** — evolve `/demo-loop` to Khan now, preserving keyless via stub-echo routing on this surface.
- **Option 1.5(b)** — evolve `/demo-loop` to a Khan-like stub clone now, defer Khan anchoring to Phase 13.
- **Option 2** — defer Kramer #1 entirely to Phase 13.
- **Option 3** — add a third surface (rejected by default, requires explicit Reviewer override with rationale).

Builder leans 1.5(b) on KISS grounds: keep the keyless property untouched, let Phase 13 own Khan-as-runnable when it lands.

## What this PR is

- Discovery and disposition only.
- No code touched in `DemoLoop.tsx`, `DemoMatter.tsx`, `api/demo.py`, or `core/demo_loop.py`.
- One doc on disk.

## What PR3 would be

- **If Option 1.5(a):** wire stub-echo into Khan invocation path on `/demo-loop` only; re-point `ensure_guided_demo` at Khan with a pre-executed reference module on first ensure.
- **If Option 1.5(b):** rename the synthetic matter and beef it up to feel Khan-shaped without being Khan; add the pre-executed reference module on first ensure.
- **If Option 2:** no PR3. Move to Kramer carry-over #2 (Trust & Review card).
- **If Option 3:** Reviewer specifies scope.

## References

- Existing surfaces: `frontend/src/demo/DemoLoop.tsx`, `frontend/src/demo/DemoMatter.tsx`, `backend/app/api/demo.py`, `backend/app/core/demo_loop.py`
- Existing handover: `docs/handovers/HANDOVER_GUIDED_DEMO_LOOP_V1_DONE.md`
- Kramer carry-over brief: `docs/handovers/KRAMER_DEMO_COMPREHENSION.md` §1
- v2 plan Phase 13: `docs/IMPLEMENTATION_PLAN_REWRITE.md` §"Phase 13 — Khan canonical demo matter"
- KISS compression context: `docs/handovers/HANDOVER_V1_KISS_COMPRESSION_PASS_DONE.md`, `docs/handovers/KISS_REPO_REVIEW_2026_05_30.md`
- Rewrite plan addendum: `docs/IMPLEMENTATION_PLAN_REWRITE_ADDENDUM_2026_06_01.md`
