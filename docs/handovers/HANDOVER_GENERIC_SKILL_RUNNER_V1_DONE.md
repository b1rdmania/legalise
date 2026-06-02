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
  - Calls `invokeCapability` only.
  - Reads the produced artifact when `artifact_id` is returned.
  - Renders `ArtifactPreview`, `Open output`, `Review & sign`, and `View Record for this run`.

- `frontend/src/matter/MatterSkillsTab.tsx`
  - Shows runnable V2 skills with the generic runner.
  - Leaves legacy built-in workflows as openable legacy rows.
  - Keeps setup-only V2 modules as `Needs setup`, with no fake `Run` link.
  - Removes primary-surface raw permission vocabulary where touched.

- `frontend/src/matter/tabs/AssistantTab.tsx`
  - Chat Skills picker now counts runnable V2 skills plus runnable legacy workflows.
  - Picking a V2 skill mounts `GenericSkillRunner` in Chat instead of routing to a bespoke tab.
  - Picking a legacy workflow still routes to its legacy tab.

## What this proves

The clean proof target is an existing V2 module such as `demo.guided-skill`:

`select skill -> run generic invocation -> artifact exists -> typed preview renders -> sign-off link -> Record deep-link`

That path is now represented in both:

- Matter Skills
- Chat

## What this deliberately does not do

- Does not wrap Letters, Contract Review, Pre-Motion, Research, or Reviews as V2 skills.
- Does not delete legacy first-party routes.
- Does not introduce a bespoke Letters adapter.
- Does not add `if (skill === ...)` branching.
- Does not call `/letters/draft` or any other legacy workflow endpoint from the generic runner.
- Does not change backend schema or API.
- Does not change the manifest schema.

## GSR status

- `GSR-2`: mostly complete for the first V2 proof target.
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
- `npm run test -- --run` — 205/205
- `npm run build` — clean, with the existing Vite chunk-size warning

Backend was not run because this is a frontend-only slice over existing endpoints.
