# Handover — chat-led rebuild

**For:** the builder agent picking up the matter-workspace reshape.
**From:** the 2026-06-05 planning session.
**Full spec:** `docs/handovers/CHAT_LED_RESHAPE_PLAN_2026-06-05.md` (read it — this is just the orientation).

---

## The decision (Andy's product call — do not relitigate)

Reshape the matter workspace from **tabbed** (Pre-Motion / Documents / Record as competing tabs) to **chat-led: chat IS the product.**

- Flow: **Ask → Inspect → Edit → Save/Export.**
- Left rail: matters / recent docs / outputs. Centre: full-height chat (the default surface). Right pane: **hidden by default**, summoned only for sources / doc preview / redlines / versions / record. Full-screen editor (`DocumentRichEditor`) opens when the user actually works in a doc.
- Outputs are **durable action cards in the chat stream** (`summary`, `redline proposal`, `draft letter`, `issue list`, `version saved`, `skill run`). Each card → Open / Sources / Versions / Record. The **sign-off seal rides on the card**, not a tab.
- The governance backend (audit, posture, sign-off) becomes **invisible infrastructure** — properties of cards and one-line answers, not destinations.

## START HERE — build the v1 prototype first

The smallest thing that proves the shape, on Khan v Acme (plan §5b):

1. `/matters/:slug` lands on chat (not a tab index).
2. Chat has an attachment/context bar for docs.
3. User says "summarise the dismissal letter" **or** clicks a doc chip → doc pulled into context.
4. Assistant response includes **source chips + action cards**.
5. "Open document" on a card → full-screen `DocumentRichEditor`.
6. Right pane appears **only** on Sources / Versions / Record.

If this feels natural, the deeper phasing (plan §6) follows. If not, we learn it cheap.

## Decisions — RESOLVED by Andy 2026-06-05 (you are unblocked)

1. **Tool-use format: provider-agnostic JSON.** Keep the multi-provider promise (Anthropic / OpenAI / Ollama). Do NOT use Anthropic-native `tool_use`.
2. **Streaming: SSE progress** (turn/stage events, like Pre-Motion's existing stream). NOT token streaming.
3. **Work-pane default: moot — the pane is hidden by default.** It's summoned by a card action and opens to whatever was requested (sources / preview / versions / record); there is no standing default state. If a persistent/pinned pane is ever added, default it to Files/context.

Backend tool loop is cleared to build.

## Backend reality (you are NOT starting from zero)

- A matter-scoped chat already exists: `backend/app/modules/assistant/` (router + pipeline — loads context, returns `suggested_actions`). Build on it.
- Build: a **skill-as-tool registry** (map the 8 skills → `GatewayTool` specs) + a **tool-calling turn loop** (today the pipeline lists modules in the prompt but doesn't invoke them).
- Gateway is **non-streaming** → use SSE progress (Pre-Motion already streams stage events; reuse that pattern, it matches the Elicit status-trail UX). Don't add token streaming for v1.
- Reuse: posture gate + audit-on-call (gateway), `plugin_bridge.invoke`, capabilities, artifacts, sign-off, matter context store, jobs/worker.

## Frontend reality

- Reshape `frontend/src/matter/MatterDetail.tsx` (drop the tab switch). Promote `AssistantTab.tsx` to the permanent centre; rewire its suggested actions to invoke skills, not `setTabAndHash`.
- New: `ActionCard` components in the thread; a lightweight **summoned** `RightPane.tsx` (sources / preview / versions / record).
- Reuse as-is: `SidebarView`/`Sidebar` rail, all v0.5 tokens, `MessageBubble`, `DocumentDetail`/`DocumentRichEditor` (full-screen editor stays), `ReconstructionView` (wrapped in the pane).

## Build contract & discipline

- The **P22–P24 spec blocks** in the plan are the build-to contract (Mobbin-referenced; exact px marked `TODO(measure)` — pull from the live apps before building, don't invent). If you deliberately diverge, **update the spec the same day** (mobbin-rodeo reconcile rule) so it never goes stale.
- **Verify cadence** (house rule): focused tests + typecheck per sub-step; run vitest from `frontend/`; full suite at phase checkpoints.
- **The caution:** do NOT get into a chat-UX arms race with Stella/Mike/Harvey. Build the shell thin and faithful. The value is what the chat invokes (governed UK skills) + the governance-on-the-card. If it feels like a worse Harvey, it failed.

## Repo state

- `split-prep-base` carries the strategy scrub + manifest sync; being rebased onto `origin/master` so the public repo is clean. Master auto-deploys to prod — coordinate with Andy before pushing app code.
- The 8 `claude-for-uk-legal` skills are shipped + audited (separate repo) — they are the tools the chat will invoke.
