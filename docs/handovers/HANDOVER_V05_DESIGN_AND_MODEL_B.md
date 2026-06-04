# Handover — v0.5 design system + the Model B question

**Date:** 2026-06-04
**From:** design pass (Claude, branch `design/v0.5-system`)
**To:** the reviewer / doc-engine agent
**Two asks:** (1) integrate the v0.5 design language into the document
surfaces you're building; (2) give us a read on **Model B** — the
chat-shape question, which is the one genuinely confusing call here.

---

## Part A — what landed in v0.5 (apply it to your document surfaces)

The matter **workspace register** changed skin. The IA did **not** change —
this is a re-dress, ratified by Andy 2026-06-04 after a variant exploration
and a preserve/amend/integration pass against the live app. Canonical
contract: `docs/DESIGN.md` v0.5 (P19 rail spec + P21 panel shell).

**The shift:** flat paper-ink (no-shadow / no-radius / white) → **inset
floating panels on a neutral-grey canvas**, set in **Redaction**.

| Token | Value | Use |
|---|---|---|
| `bg-canvas` | `#E8E8E8` | the page; panels float on it |
| `bg-panel` | `#F5F5F5` | rail + main content panel fill |
| `bg-panel-hover` / `-sel` | `#EBEBEB` / `#E2E2E2` | row/nav hover + active fill |
| `bg-panel-2` | `#F7F7F7` | secondary inset (detail pane, banner) |
| `rounded-panel` / `rounded-item` | 18px / 8px | panel shell / nav-item·row·card |
| `shadow-panel` / `-hover` | soft two-layer | panel shell + P21 cards ONLY |
| `seal` | `#8B0000` | verdicts + seal ONLY — never chrome |
| `font-serif` (default) | Redaction | body + UI; grit grades 20/35 for stamp/wordmark only |

**Rules you must hold when building document surfaces (the scope fence):**
- Your surface renders **inside the main panel** (`bg-panel`). Don't paint
  your own page background — the shell owns it.
- **Radius + shadow only on the panel shell + P21 cards.** A document
  "card"/record group = `bg-paper rounded-item border border-rule p-5`
  (+ `shadow-panel hover:shadow-panel-hover` if it's an elevated/clickable
  surface). Everything else — pills, inputs, buttons, table rows, the
  breadcrumb — stays **square + flat**. Table rows may take the 8px hover
  fill (`hover:bg-panel-hover rounded-item`) but the table itself stays
  borderless-on-panel.
- **No colour in chrome.** Oxblood/seal and the semantic status hexes are
  for verdicts and posture indicators only. Active states = **fill +
  semibold**, no accent bar (we explicitly killed the oxblood left-bar).
- **Redaction clean base** everywhere; grit grades are texture moments
  (wordmark 35, stamp buttons 20, large display) — never body or chrome.

**The rail is now one component.** `ui/SidebarView.tsx` (presentational) is
fed by `ui/Sidebar.tsx` (real route/auth adapter) and the demo. `MatterNav`
+ `MatterBreadcrumb` are **retired** — don't reintroduce them. `SIDEBAR_NAV`
is the full `Chat / Documents / Skills / Record` loop. Your document
surfaces nest under the matter section of this one rail; route keys stay
`assistant/documents/workflows/audit`.

**Branch / state:** `design/v0.5-system` (off `design/wordmark-header`),
head `bccbd27`. tsc clean, ~190 vitest pass, live in `/demo` (no backend).
Key files: `docs/DESIGN.md` (P19 v0.5 + P21), `frontend/tailwind.config.js`,
`frontend/src/ui/SidebarView.tsx` + `Sidebar.tsx`, `app/AppShell.tsx`,
`demo/DemoMatter.tsx`.

---

## Part B — the Model B question (please give us a read)

This is the part that's confusing, so here it is in plain terms. The
left-rail Mobbin audit (`docs/design-research/LEFT_RAIL_MOBBIN_AUDIT_2026-06-03.md`
§4) found that "where does chat live?" has **three coherent answers**, and
Legalise is currently sitting in an incoherent spot.

| Model | Shape | Who does it |
|---|---|---|
| **A · chat-as-canvas** | Chat fills the centre; rail = history | Claude, ChatGPT, Perplexity — *the assistant IS the product* |
| **B · chat-as-docked-assistant** | Work (documents/record) in the centre; chat **docked alongside** in a persistent panel | NotebookLM (Sources·Chat·Output), ElevenLabs, Sana — *a tool with substance an assistant helps you work through* |
| **C · chat-as-nav-item** | Chat is one tab among several | Pipedrive / CRM rails — *chat is incidental* |

**The incoherence:** Legalise is structurally **Model C** (Chat is one of
Chat/Documents/Skills/Record) — yet the IA reset named Chat the **default
landing** of every matter, which is a chat-*primary* claim. So the app
argues with itself: to consult the assistant about a document, you navigate
*away* from the document to a Chat tab. For a product whose thesis is
**supervised autonomy** (a human works *through* a matter while the AI
proposes and gets reviewed), that's backwards — supervision needs the
artifact and the assistant co-visible.

**The design pass's recommendation (for you to pressure-test, not adopt):**
- **B is the destination.** It's the only model that fits supervised
  autonomy: documents/record in the centre, chat docked alongside, both on
  screen during the review ceremony ("the AI drafted this clause, here's the
  source, sign off"). NotebookLM is almost literally a matter workspace. It
  also reads as a purpose-built legal instrument, not "ChatGPT with legal
  prompts." Reject **A** (buries the documents-of-record substance); **C** is
  internally consistent only if you drop the chat-primary default landing.
- **NOT in v0.5.** B is an IA/layout rebuild, not a skin pass. The v0.5
  panel shell, rail, and tokens all **survive** B unchanged — B only changes
  what fills the *main panel* (one tab body → record/document + docked chat
  + output). So v0.5-then-B is clean, non-destructive sequencing.
- **Bridge = B-lite.** Don't jump to the full NotebookLM 3-pane. A
  **collapsible docked chat** present alongside Documents/Record (not just
  on its own tab) delivers the co-visibility win at a fraction of the cost,
  and lets the dock earn its way to centre stage.

**Why this lands on your desk specifically:** Model B *centres the
documents*. The document surfaces you're building in the doc-engine work
**are the centre of Model B** — the doc reader and the docked chat are the
same screen. So the doc-engine work and the chat-shape decision are not
separable; how you structure a document surface should anticipate a chat
dock living beside it (layout that can give up ~360–420px on the right
without re-architecting).

**What we need from your read:**
1. Do you agree B is the destination — or is there a case for staying C
   (and dropping the chat-primary default landing) given the doc-engine
   direction you're building toward?
2. If B: full 3-pane (record · chat · output) vs the B-lite collapsible
   dock as the first step?
3. Sequencing vs your doc-engine branches — does Model B want to land
   before, after, or interleaved with the document surfaces?
4. Anything in the doc-engine architecture that constrains or favours one
   model (e.g. how outputs/artifacts surface — Model B's "Output" pane).

Related queued decision: the "chat surface redesign" note. Treat this as
the canonical framing of that question.
