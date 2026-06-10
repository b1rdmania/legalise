# Handover — chat-led continuation (2026-06-10)

Branch: `codex/chat-led-matter-shell`.
PR: `#172` — Chat-led matter shell.

## What landed this session

- Chat-led loop cleanup and copy alignment:
  - Suggested actions stay in chat instead of old tab-switch behaviour.
  - Add-skill wording is consistent across catalogue, matter skills, demo, and docs.
  - Audit/Record user-facing labels moved toward the chat-led `Activity` wording while preserving legacy `/audit` routes.
- First-run/local fork path:
  - Local compose still auto-promotes first dev user by default.
  - E2E explicitly disables auto-admin so it continues to cover the documented `bootstrap_admin` CLI path.
  - `/app` first-run copy now explains both behaviours.
- CI/demo plumbing:
  - Prebuilt demo images workflow and quickstart docs are aligned.
  - E2E auto-admin drift was fixed by passing `LEGALISE_DEV_AUTO_ADMIN_FIRST_USER=false`.
- Docs:
  - Added Lavern peer scan and review-panel architecture note.
  - Updated README, demo, roadmap, and supervised-autonomy docs to match the current chat-led front door and the current audit trigger/hash-chain state.

## Last local verification

- `npm test -- AppHome.test.tsx` passed.
- Earlier in this session:
  - `npm test -- DocumentDetail.test.tsx InvocationRunner.test.tsx GenericSkillRunner.test.tsx` passed.
  - `npm run typecheck` passed.
  - `git diff --check` passed.

## Current CI note

The latest e2e failure on current head was only the first-run spec expecting the phrase `bootstrap CLI` in `/app` fresh-workspace copy. The final unpushed fix in this handover commit changes the text to `host-side bootstrap CLI command` and updates the unit test. Re-run/monitor e2e after this commit lands.

## Good next move

Let GitHub checks finish on the latest pushed head. If e2e is green, stop; the branch is in a clean handoff state. If e2e still fails, inspect `gh run view <run_id> --log-failed`; do not revisit the earlier superseded auto-admin failures unless they recur.
