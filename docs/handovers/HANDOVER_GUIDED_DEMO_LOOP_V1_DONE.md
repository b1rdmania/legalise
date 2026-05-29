# Handover — Guided Demo Loop v1 (DONE, awaiting review)

Goal (per the build brief): let a fresh visitor see the full
supervised-autonomy loop run **without a provider key**. It packages what
we already built into a first-run proof — no new substrate, just composing
existing seed/grant/invoke/review/audit primitives.

**Not merged.** On branch `guided-demo-loop-v1` (off `master` @ `3ee3814`).

## The experience (`/demo-loop`)
1. Dashboard CTA **"Try the governed loop"** → `/demo-loop`.
2. Page calls the ensure endpoint → lands on a seeded `stub-echo` demo matter.
3. **Run sample skill** → invokes the demo prompt module.
4. A `skill_response` artifact appears (rendered via `ArtifactPreview`).
5. **Request supervisor review** → review goes pending.
6. **Open Activity Trail** → deep-link showing the real chain.

## Why it's keyless and honest
`stub-echo` is a genuine keyless provider (`model_gateway.StubProvider`
returns deterministic output, no API key). The demo matter's
`default_model_id = "stub-echo"`, so the run goes through the **real**
invocation endpoint → prompt runtime → posture gate → matter-scoped grants
→ advice-boundary → model gateway → `skill_response` artifact → audit
chain. Nothing faked:
- No fake provider key (stub-echo is real + keyless).
- No fake audit rows (the run emits the real chain).
- No grant/review/invocation bypass — grants created via the real
  `create_grants_for_capability`; the run goes through `POST
  /api/matters/{slug}/invocations`.
- Demo matter, document, and module are clearly labelled (title "Guided
  Demo — Governed Loop (stub model)", doc tagged `demo`, module
  `visibility: example`). The UI says it's a toy model and to bring a key
  for real providers.

## Substrate-honest deviation from the brief (step 8 "Approve")
The visitor **runs** the skill, so they are the artifact **author** — and
the review substrate correctly forbids self-approval
(`reviewer_is_author`, 403). Rather than bypass that (the brief's "no
review bypass" constraint), the demo **requests** review, shows it pending,
and surfaces the separation-of-duties guarantee ("an author cannot approve
their own output — a separate reviewer decides; that's the guarantee, not
a limitation") with a link to Approvals. This is arguably a stronger
supervised-autonomy demonstration than a self-approval would be. The
Activity Trail shows `review.requested`; a decision appears when a
different reviewer acts.

## What changed
### Backend (new, additive)
- `backend/app/core/demo_loop.py` — `ensure_guided_demo(session, user)`:
  idempotent seed of the `stub-echo` demo matter (A_cleared) + one
  synthetic document + the demo prompt module (installed workspace-wide,
  validated via `assert_manifest_v2`) + matter-scoped grants. Returns
  handles.
- `backend/app/api/demo.py` — `POST /api/demo/guided-loop` (authed) →
  `GuidedDemoHandles`. Registered in `main.py`.
- The demo module is a valid v2 prompt manifest: skill capability
  (`model_access: required`, reads `document.body.read`, writes
  `matter.artifact.write`, gate `privilege_posture`, `draft_advice`) +
  internal provider capability (same honest pattern as imported Lawve
  skills).

### Frontend (new, additive)
- `frontend/src/demo/DemoLoop.tsx` + route `/demo-loop` (authed) +
  `route.ts` `demoLoop` + `ensureGuidedLoop()` client.
- `frontend/src/app/AppHome.tsx` — "Try the governed loop" dashboard CTA.
- Reuses existing `invokeCapability` / `readArtifact` / `requestReview` /
  `ArtifactPreview` (incl. the `skill_response` renderer) — no duplication.

## Tests
- `backend/tests/test_demo_loop.py` (3): ensure idempotent; **keyless**
  end-to-end run (no gateway stub) → `skill_response` artifact + real audit
  chain (`module.capability.invoked` / `model.invoked` /
  `module.capability.completed`); review requestable but author
  self-approval → 403 `reviewer_is_author`.
- `frontend/src/demo/DemoLoop.test.tsx` (2): full walkthrough
  (ensure→run→artifact→request-review→trail link); run-failure surfaces an
  error and stays on the run step.
- Gate: frontend `tsc` clean · full vitest **181/181** · `vite build` OK.
  Backend full suite **795 passed** (only the 4 known pre-existing env
  failures — 3 macOS sandbox + dev-autoverify demo-seed count).

## Notes / limits
- Requires auth: a "fresh visitor" must be signed up (hosted has open
  signup). The CTA lives on the authed dashboard. Anonymous landing→demo
  would route through signup first; not in v1.
- The demo module is installed workspace-wide on first ensure; subsequent
  users' ensure reuses it and just provisions their matter + grants.
- No reset/cleanup endpoint (brief said optional for v1); ensure is
  idempotent so re-runs are safe.

## For reviewer
Diff-review `guided-demo-loop-v1`. Merge call yours. The one judgment to
sanity-check is the separation-of-duties framing of the review step (we do
not self-approve).
