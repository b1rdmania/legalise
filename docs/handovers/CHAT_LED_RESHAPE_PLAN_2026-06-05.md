# Chat-led matter workspace — build-to spec + implementation plan

**Status:** in progress. Drafted 2026-06-05; first shell slice built 2026-06-05.
**Goal:** convert the matter workspace from tabbed (Pre-Motion / Chronology / Documents / Record as competing tabs) to **chat-led** (a matter-scoped conversation as the primary surface that invokes the 8 skills as tools), matching the Stella/Mike/Harvey shape — *while keeping the governance (audit, privilege posture, sign-off) as the differentiator.*

This is the "Model B chat-dock" deferred in the v0.5 design system.

---

## 1. The decision

**Chat is the product. Documents are attachable context, not a permanent pane. The right pane is summoned, not standing.**

The flow is **Ask → Inspect → Edit → Save/Export** — not *Matter tab → Documents tab → select file → run gate → review record*. The work starts in conversation; documents and structure get pulled in only when they matter. This is how Claude / ChatGPT / Elicit behave, and it stops the product leading with its least-loved part (the tabbed record/gate workflow).

```
┌──────────┬─────────────────────────────────┬ ─ ─ ─ ─ ─ ─ ─ ─ ┐
│  RAIL    │   CHAT  (the product)           │  RIGHT PANE       │
│ matters  │                                 │  (hidden by       │
│ chat     │  matter-scoped thread           │   default)        │
│ files    │  ┌───────────────────────────┐  │                   │
│ skills   │  │ action card: redline       │  │  opens only for:  │
│          │  │ proposal [Open][Sources]   │  │  · sources        │
│          │  │          [Versions]        │  │  · doc preview    │
│          │  └───────────────────────────┘  │  · redlines       │
│          │  context bar (attached docs)    │  · versions       │
│          │  composer + tools               │  · record         │
└──────────┴─────────────────────────────────┴ ─ ─ ─ ─ ─ ─ ─ ─ ┘
        full-screen editor opens when the user wants to *work in* the doc
```

- **Left rail:** matters/projects plus the thin matter loop: Chat / Files / Skills. Record, signed outputs, and working pack remain routable from cards and contextual links, but are not primary destinations.
- **Centre:** full-height chat as the default surface.
- **Chat messages produce durable action cards** — `summary`, `redline proposal`, `draft letter`, `issue list`, `version saved`. Each card opens the full editor, its sources, version history, or the record.
- **Right pane:** hidden by default; opens lightweight only for sources / document preview / redlines / versions / record.
- **Full-screen editor** (the `DocumentRichEditor` we just tested): opens when the user actually wants to work in the document.

## 1b. The backend becomes invisible infrastructure

Everything built stays load-bearing, but none of it is a *destination* any more:

| Backend capability | Becomes |
|---|---|
| document text extraction | powers chat |
| versions | power "save this as v2" |
| audit | powers "what happened?" (the Record card/pane) |
| privilege posture | powers "can this leave local?" |
| sign-off | becomes "finalise this output" — surfaced only when needed |

The differentiator is unchanged — audit, posture, sign-off — it just stops being tabs and becomes properties of cards and one-line answers. **Citations are the floor every incumbent has; sign-off + posture on an output is the lane none of them occupy** (see §2 for where incumbents put the provenance pane).

---

## 2. Mobbin references (the precedent)

Searched Mobbin (web, deep) for the chat-led workspace archetype. The pattern recurs across serious apps — this is a real convention, not a guess.

| App | Screen ID | What it contributes |
|---|---|---|
| **Elicit** | `6b7e1d2e-50e7-4414-b2b6-b542449be72f` | **The reference.** Left rail + centre artifact + right pane = a **Status step-trail** (Gather → Screen → Extract → Generate report, each "Details") **+ docked Chat below**. This is the audit/provenance idiom already designed. |
| **ChatGPT** | `73833b79-1dd5-4354-8fc4-a2e99c33a75e`, `b045e2cd-4f54-424a-97f6-4c5954f0c1e1` | Centre chat, right **"Activity / 23 Sources"** panel — a live provenance feed. Artifacts render as a card in-thread that opens the pane. |
| **WRITER** | `ef04331d-cde0-4946-bb61-6c3aa00ddce6`, `55146914-0c3b-4b07-bb1f-93b175d7df43` | Left session rail, centre chat, right artifact pane with **"Computer | Deliverables"** and **"Source | Preview"** tabs. |
| **Perplexity** | `29a9bc09-1bcf-4913-9432-0e47ddb3fc2b`, `008933f4-bbde-4951-bfd6-16c07cdde1b4` | Chat left, **generated document opens in right pane**; "Answer | Links | Images" + "Sources" count; inline citation chips. |
| **Google Gemini** | `0d89e455-ec2f-492f-9b9f-07d7dfda1dd0` | Chat left, report right with "Contents | Share & Export" + `[1]` citations. |
| **Fabric** | `c6048777-510b-4293-8bc7-7ca53f75a515`, `61d7d915-b6d3-4f7b-8544-ed2701fdce96` | Doc centre, **docked AI panel right** ("Comments | Info | Ask"), model selector, **"Current file" context indicator** above composer, Summarize/List-points chips. |
| **Fibery** | `e1f475cd-9340-4b6d-98c3-9ad852993175` | Left nav tree, centre doc, right "Ask AI" panel. |
| **ClickUp Brain** | `eee7da65-c3d6-49a3-8b32-0cf3d64e5730` | Empty-state **"Suggested / Featured"** prompt cards + "All Sources" + connected-apps chips on the composer. |

**Convergent facts (≥3 serious apps each — these are load-bearing):**
1. Persistent **left nav rail**.
2. **Chat is one column**, never tabbed away.
3. A **right pane** holds the artifact AND a sources/activity/status trail, with **tabs** to switch (Source|Preview, Answer|Links|Images, Computer|Deliverables).
4. **Context indicator above the composer** ("Current file", "All Sources", tagged docs) — the user always sees what the model can read this turn.
5. **Composer at bottom** with attach / sources / model / send.
6. **Suggested prompts on empty state**.

---

## 3. Build-to spec blocks (fold into DESIGN.md as P22–P24 when the build starts)

> Note: these thumbnails give **structure, order, and presence** (which the mobbin-rodeo method treats as load-bearing values). Exact px/spacing are marked `TODO(measure)` — pull from the live apps (my.stll.app, chatgpt.com, elicit.com) before building; do not invent them.

### P22 — Chat-led matter shell (workspace)

Source: Elicit + ChatGPT + WRITER + Perplexity via Mobbin (web, 2026-06-05). Convergent three-pane chat workspace.
Reference screen IDs: `6b7e1d2e-…`, `73833b79-…`, `ef04331d-…`, `29a9bc09-…`

What we lift:
- Three columns: nav rail (left, fixed) · chat (centre, flex) · work pane (right, collapsible).
- Chat is never a tab; it is the persistent centre.
- The work pane collapses to a thin strip when not in use (Fabric/WRITER both do this).

Exact values:
| Property | Value | Notes |
|---|---|---|
| Rail width | `w-64` (existing SidebarView) | reuse as-is, do not restyle |
| Chat column | `flex-1 min-w-0`, max content width ~`820px` centred | TODO(measure) — Elicit/ChatGPT cap the thread width |
| Work pane width | ~`360–420px` open; ~`48px` collapsed rail | TODO(measure) |
| Canvas / panels | `bg-canvas #E8E8E8`; each pane `bg-panel #F5F5F5 rounded-panel shadow-panel` | existing v0.5 tokens, unchanged |
| Gap between panes | `gap-4` (existing shell) | matches v0.5 floating-panel language |

Where it lands: `frontend/src/matter/MatterDetail.tsx` (layout container — remove tab switch).
Deliberate divergences: none yet.

### P23 — Chat column + composer

Source: ChatGPT + Fabric + ClickUp Brain via Mobbin (web, 2026-06-05).
Reference screen IDs: `73833b79-…`, `c6048777-…`, `eee7da65-…`

What we lift:
- Message thread (user right-aligned bubble, assistant left, full-width text).
- **Context chips ABOVE the composer** showing the documents in context this turn, each removable (Fabric "Current file"; Harvey `@`-tagging).
- Composer: textarea + a row of tools — attach documents, invoke skill (menu/slash), model+posture indicator, send.
- **Empty state = suggested prompts** ("Stress-test this case", "Draft a CPR letter", "Build a chronology") as cards (ClickUp Brain pattern).

Exact values:
| Property | Value | Notes |
|---|---|---|
| Message source chips | inline under assistant msg, clickable → opens source in work pane | already in `MessageBubble.tsx` |
| Context chips | row above composer, `[doc name ×]` removable | promote from existing "attached documents" in AssistantTab |
| Composer tools order | attach · skills · model/posture · send | order load-bearing |
| Posture indicator | reuse the rail posture dot (green/amber/red) in the composer | ties governance into the chat itself |
| Suggested prompts | 3–5 cards, matter-aware | maps to existing `suggested_actions` |

Where it lands: `frontend/src/matter/tabs/AssistantTab.tsx` (promote to permanent centre; rewire suggested actions to invoke skills, not `setTabAndHash`).
Deliberate divergences: none yet.

### P24 — Action cards (in-thread) + on-demand right pane — *the differentiator*

Source: ChatGPT (in-thread artifact cards + Activity/Sources pane) + Elicit (status trail) + WRITER (Source|Preview) via Mobbin (web, 2026-06-05).
Reference screen IDs: `73833b79-…`, `6b7e1d2e-…`, `ef04331d-…`

What we lift:
- **Outputs are durable cards in the chat stream, not a standing pane.** Card kinds: `summary`, `redline proposal`, `draft letter`, `issue list`, `version saved`, and `skill run` (with a live stage trail while running — Elicit "Status → Details" idiom). Each card carries actions: **Open** (full-screen editor), **Sources**, **Versions**, **Record**.
- **The right pane is summoned by a card action, not standing.** Closed by default; opens lightweight for sources / document preview / redlines / versions / record. (Fabric & WRITER both dock-and-hide this way.)
- **The status seal rides on the card**, not a separate surface: `Draft → Awaiting review → Signed off by [solicitor]`, click to expand to the four-question proof (what / on what sources / which model / signed by whom). Governance = a property of the output card, surfaced only when it matters.
- **Full-screen editor** for real document work — "Open" on a redline/draft card routes to the existing `DocumentDetail` / `DocumentRichEditor`.

Exact values:
| Property | Value | Notes |
|---|---|---|
| Card kinds | summary · redline · draft letter · issue list · version saved · skill run | each a distinct card component |
| Card actions | Open · Sources · Versions · Record | order load-bearing; only show what applies |
| Right pane | hidden by default; slides over on a card action | not a permanent column |
| Pane contents | sources · doc preview · redlines · versions · record | one purpose per open |
| Status seal | chip on card: state + signer; click → expand proof | oxblood `#8B0000` only on "Signed" (existing token) |
| Skill-run stage trail | step + state dot + "Details", inline in the card | reuse Pre-Motion stage events |
| Record | wrap `ReconstructionView` in the pane | keep deep-link query params |

Where it lands: new `ActionCard` components in the chat thread; a new lightweight `RightPane.tsx` (summoned, not standing) wrapping `ReconstructionView` / document preview / versions; full editor stays the existing route.
Deliberate divergences from the earlier draft: the permanent three-pane "work pane" is dropped in favour of in-thread cards + an on-demand pane. The chat is the product; the pane is a detail view.

---

## 4. What's reused vs built (frontend)

**Reused as-is:** `SidebarView`/`Sidebar` (rail), all v0.5 design tokens, `MessageBubble`, `DocumentDetail`/`DocumentRichEditor` (full-screen reader stays), `ReconstructionView` (wrapped), every module's internal logic.

**Restructured:** `MatterDetail.tsx` — drop the tab switch, render rail + chat + work pane. `AssistantTab.tsx` — promote to permanent centre; suggested actions invoke skills instead of switching tabs. `DocumentsTab` — collapses into the work pane's Context tab.

**New:** `WorkPane.tsx` (the right pane shell + tabs), a stage-trail component, the status-seal chip. Module surfaces (PreMotion/Letters/etc.) become artifacts rendered in the work pane rather than full tabs.

The frontend agent's estimate: **~3–5 focused days** for the shell + work pane + wiring, more with polish.

---

## 5. Backend — orchestration plan

Good news: the substrate is mostly there.

**Already exists (reuse):**
- A **matter-scoped chat endpoint + pipeline** already exists: `app/modules/assistant/` (`router.py` + `pipeline.py`). It loads context (documents, chronology, installed modules), calls the gateway, returns messages, and already emits `suggested_actions`. This is the spine to build on — we are *not* starting from zero.
- Model gateway with **posture gate + audit-on-call** (`model_gateway.py`), and an `invoke_tool(...)` path + a tool registry (3 tools registered today).
- Skill invocation via `plugin_bridge.invoke(plugin, skill, inputs)`; capability enforcement; matter context store; artifacts + sign-off; jobs/worker for long-running runs.

**Needs building:**
1. **Skill-as-tool registry.** Map each of the 8 installed skills → a `GatewayTool` (name, JSON-schema input, handler that calls `plugin_bridge.invoke`). Populate it from the module registry at startup.
2. **Tool-calling turn loop.** Extend `run_assistant_turn` so the model can *select and call* a skill (today it only lists modules in the prompt and returns suggestion chips). Loop: model → tool call → `invoke_tool` → append result → model → … until done.
3. **Streaming.** ⚠️ The current gateway is **non-streaming** (providers return completed text). Two options: (a) SSE that streams *stage/turn progress* (Pre-Motion already does this — reuse the pattern; good enough for v1, and it matches the Elicit "Status trail" UX), or (b) extend providers with token streaming (bigger, locks toward Anthropic SDK for native tool-use). **Recommend (a) for v1.**
4. **Tool-use format decision:** embed tool defs in the prompt and parse JSON tool calls (provider-agnostic, keeps Anthropic/OpenAI/Ollama) vs Anthropic-native `tool_use` blocks (cleaner, less portable). Recommend provider-agnostic JSON for v1 to keep the multi-provider promise.

---

## 5b. Next build — the chat-led prototype (v1 target)

The smallest thing that proves the shape. Build this first, before any of the deeper phasing:

1. `/matters/:slug` **lands on chat** (not a tab index).
2. Chat has an **attachment / context bar** for documents.
3. The user can say *"summarise the dismissal letter"* **or click a doc chip** to pull it into context.
4. The assistant response includes **source chips and action cards** (`summary`, `redline proposal`, etc.).
5. **"Open document"** on a card goes **full-screen to the editor we just tested** (`DocumentRichEditor`).
6. The **right pane appears only** when the user clicks **Sources / Versions / Record**.

This is `Ask → Inspect → Edit → Save/Export` end to end on one matter (Khan v Acme), with the governance summoned, never leading. If this feels natural, the rest of the phasing follows. If it doesn't, we learn it cheaply before building the deeper machinery.

## 6. Phased plan

**Phase 0 — spec sign-off.** Reviewer signs §3 (P22–P24) and the §5 tool-use decision. Pull exact px from the live apps to fill the `TODO(measure)` rows.

**Phase 1 — backend tool loop (no UI change).** Skill-as-tool registry + tool-calling turn loop in the existing `assistant` pipeline. The existing chat starts actually *running* skills. Ships behind the current UI. Verify with the existing endpoint.

**Phase 2 — frontend shell.** `MatterDetail` → three-pane; promote `AssistantTab` to centre; build `WorkPane` (Context tab first = collapsed documents). Skill outputs render as artifacts in the work pane.

**Phase 3 — governance in the pane.** Status seal on artifacts; Record tab (wrap `ReconstructionView`); posture indicator in the composer; stage trail for Pre-Motion (reuse its SSE).

**Phase 4 — streaming + polish.** SSE turn/stage streaming (Elicit idiom); empty-state suggested prompts; context `@`-tagging; collapse/expand animations.

Each phase ships independently. Phase 1 is the one with real risk (the tool loop); Phases 2–3 are the visible reshape.

---

## 7. The caution (carry it into the build)

This is the option-A trap restated: **do not get into a chat-UX arms race with Stella/Mike/Harvey.** The chat shell is commodity — build it thin, faithful to P22–P24, no ego. The entire value is what the chat *invokes* (governed, audited, signed, UK-specific skills) and the §P24 governance pane. If a solicitor opens it and it feels like Harvey *but every output carries a posture, a record, and a sign-off*, that's the demo. If it just feels like a worse Harvey, it failed. Build the shell to show the substrate.

---

## 8. Open decisions for the reviewer
1. P22–P24 structure — approve, or adjust the pane model.
2. Tool-use format: provider-agnostic JSON (recommended) vs Anthropic-native tool_use.
3. Streaming: SSE progress (recommended v1) vs token streaming.
4. Does the work pane default to **Context** (documents) or to a blank "outputs will appear here" state?
5. Where exact px come from before build (assign someone to measure the live apps).

## 9. Repo note
The chat-led reshape sits on top of the strategy-scrub + manifest cleanup, which are on `split-prep-base` (pushed). **`origin/master` has diverged** (it moved to `49336ea` while our branch is based on `e302b17`), so the scrub is NOT yet on master and the fast-forward was rejected — master needs a rebase/merge of `split-prep-base` before the public repo reflects the scrub. Left for Andy (master auto-deploys to prod).
