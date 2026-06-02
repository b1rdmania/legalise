# Generic Skill Runner v1 — handover

Date: 2026-06-02  
Branch: `codex/gsr2-generic-runner`

## What shipped

This implements the first real Generic Skill Runner slice after `GSR-1`.

The runner is deliberately narrow:

- It runs V2 manifest capabilities through the existing invocation endpoint.
- It does not call legacy first-party endpoints.
- It renders the artifact returned by the invocation and links directly to:
  - the artifact detail page,
  - Professional Sign-Off,
  - the matter Record filtered to that invocation.
- It hides permission plumbing from the primary surface. The first-read states are:
  - `Ready in this project`
  - `Needs setup`
  - `Available to enable`

## Files changed

- `frontend/src/matter/skillRunnerModel.ts`
  - Parses V2 manifest capabilities into a normalized runner model.
  - Filters to installed, enabled, matter-scoped, invokable capabilities.
  - Requires all declared read/write permission rows to be present before a skill is treated as runnable.

- `frontend/src/matter/GenericSkillRunner.tsx`
  - Shared runner component for V2 capabilities.
  - Builds invocation args from the user request plus selected document ids.
  - Reads `ui.default_request` from the manifest when present, so starter copy lives with the skill rather than in a runner-side skill opinion.
  - Calls `invokeCapability` only.
  - Reads the produced artifact when `artifact_id` is returned.
  - Renders `ArtifactPreview`, `Open output`, `Review & sign`, and `View Record for this run`.
  - Provides `Close run` after a successful inline run, so Chat can dismiss the runner without leaving the page.

- `frontend/src/matter/MatterSkillsTab.tsx`
  - Shows runnable V2 skills with the generic runner.
  - Leaves legacy built-in workflows as openable legacy rows.
  - Keeps setup-only V2 modules as `Needs setup`, with no fake `Run` link.
  - Removes primary-surface raw permission vocabulary where touched.

- `frontend/src/matter/tabs/AssistantTab.tsx`
  - Chat Skills picker now counts runnable V2 skills plus runnable legacy workflows.
  - Picking a V2 skill mounts `GenericSkillRunner` in Chat instead of routing to a bespoke tab.
  - Picking a legacy workflow still routes to its legacy tab.

- `backend/app/core/demo_loop.py`
  - Extracts `ensure_demo_skill_on_matter()` so the existing demo V2 skill can be installed and granted on any seeded matter.
  - Adds a manifest-owned `ui.default_request` to the demo skill: `Summarise {filename}.`.

- `schemas/module.v2.json` and `backend/schemas/module.v2.json`
  - Add optional `capabilities[].ui.default_request`.
  - This is intentionally UI metadata only; it does not change invocation semantics, trust ceremony semantics, or runtime enforcement.

- `backend/app/core/seed.py`
  - Khan v Acme seed now idempotently installs and grants `demo.guided-skill / summarise`.
  - This satisfies the GSR demo precondition: the first V2 proof skill is enabled on the canonical Khan workspace matter.

- `backend/tests/test_matters_routes.py`
  - Adds a public-route regression that a fresh user's Khan matter includes the two required demo skill grants.

- `frontend/src/matter/GenericSkillRunner.test.tsx`
  - Pins manifest-owned starter request rendering.
  - Pins neutral fallback copy when a manifest does not provide `ui.default_request`.
  - Pins closing a completed inline run.

- `backend/tests/test_phase2_schema.py`
  - Pins `ui.default_request` as accepted v2 manifest metadata.

## What this proves

The clean proof target is an existing V2 module such as `demo.guided-skill`:

`select skill -> run generic invocation -> artifact exists -> typed preview renders -> sign-off link -> Record deep-link`

That path is now represented in both:

- Matter Skills
- Chat
- Khan v Acme seed grants

## What this deliberately does not do

- Does not wrap Letters, Contract Review, Pre-Motion, Research, or Reviews as V2 skills.
- Does not delete legacy first-party routes.
- Does not introduce a bespoke Letters adapter.
- Does not add `if (skill === ...)` branching.
- Does not call `/letters/draft` or any other legacy workflow endpoint from the generic runner.
- Does not change backend schema or API.
- Does not change backend API or persistence schema.
- Does extend the manifest schema with optional `ui.default_request`, scoped to runner UI copy.
- Does not change Khan's default model. Khan still uses its configured real-model path, so running the seeded skill may still require the relevant provider key. The keyless fully-green path remains `/demo-loop`.

## GSR status

- `GSR-2`: mostly complete for the first V2 proof target.
- `GSR-2.1`: complete for runner contract polish: manifest starter request, neutral fallback copy, and close affordance.
- `GSR-3`: partially satisfied via existing `ArtifactPreview` support, including `skill_response`. More output kinds can be added later through typed artifact viewers, not through bespoke skill pages.
- `GSR-4`: complete for V2 skills in Chat. Chat mounts the same runner component.
- `GSR-5`: not complete. Legacy routes remain. The next step is a deprecation/retirement plan once first-party workflows are either wrapped as V2 skills or intentionally left legacy.

## Reviewer checks

Run these checks against the diff:

1. Search the new runner path for bespoke adapters:
   - `/letters/draft`
   - `draft_markdown`
   - `if (skill ===`
   - `skill ===`

2. Open a matter with `demo.guided-skill` installed and granted:
   - Matter Skills should show a generic runner.
   - Chat Skills should show the same skill.
   - Running should produce an artifact and expose Sign-Off + Record links.

3. Confirm the primary UI does not lead with raw permission states:
   - `partial`
   - `blocked`
   - raw capability ids
   - manifest/setup internals

## Verification

Local frontend verification:

- `npm run typecheck` — clean
- `npm run test -- AssistantTab MatterSkillsTab --run` — 10/10
- `npm run test -- GenericSkillRunner AssistantTab MatterSkillsTab --run` — 13/13
- `npm run test -- --run` — 208/208
- `npm run build` — clean, with the existing Vite chunk-size warning

Local backend verification:

- `python3 -m py_compile backend/app/core/demo_loop.py backend/app/core/seed.py backend/tests/test_matters_routes.py backend/tests/test_phase2_schema.py backend/tests/test_seed_audit.py` — clean

Backend pytest could not be run locally because this shell has neither `pytest` nor `uv` on PATH. GitHub CI runs the backend test suite in the proper container and is the merge gate for the seed regression.
