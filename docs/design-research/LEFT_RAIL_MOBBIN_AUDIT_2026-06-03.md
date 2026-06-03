# Left-rail design audit — grounded in a live Mobbin pass

**Date:** 2026-06-03
**Surface:** matter-workspace left navigation (`frontend/src/matter/MatterNav.tsx`, `MatterBreadcrumb.tsx`, `tabs/types.ts`)
**Specs in scope:** `docs/DESIGN.md` P19 (compact left rail) + P20 (slim breadcrumb)
**Method:** live Mobbin MCP research via the `mobbin-claude-rodeo` skill
**Status:** research + recommendations. The two P19 decisions and the direction question are **for the team to decide** — this doc supplies the evidence, not the ruling.

---

## Why this exists (and how it differs from PR #61)

PR #61 reconciles P19/P20 with what the **code** does today (post the 2026-06-02 IA reset) — *internal* consistency, so spec and code stop disagreeing. This doc asks a different question: **does the rail match what the best real apps actually do for this archetype right now?** — *external* evidence, via a live Mobbin pass. The two are complementary: #61 makes the spec honest; this tells you whether the spec is *good*.

## Method

Three Mobbin passes (web platform, deep mode), 20 reference screens across two archetypes plus one flow set on the chat-direction question. All references are indexed with screen IDs at the bottom so any claim here is re-findable on Mobbin.

- **Pass A — record/workspace rails:** Pipedrive, Linear (×2), Todoist (×2), Fibery, Plane, Framer
- **Pass B — AI-assistant workspaces:** ChatGPT, Perplexity (×2), Sana AI, WRITER, NotebookLM
- **Pass C — chat-direction flows:** Claude, Microsoft Copilot, ElevenLabs

---

## 1. The convergent left-rail pattern (what real apps do)

| Rail element | Convergent behaviour | Seen in |
|---|---|---|
| **Width** | 220–260px labelled panel; often a thin icon-rail + expanded panel | Linear, Todoist, ChatGPT, Sana |
| **Top of rail** | Identity/workspace switcher **+ a prominent "New" CTA** — not a static info card | Todoist, Linear, ChatGPT, Sana, Plane |
| **Grouping** | Multi-area rails use **muted uppercase section headers** (Workspace / Your teams / Your content) | Linear, Fibery, Sana, WRITER |
| **Active state** | Subtle **wash/tint fill** on the active row; no heavy left-bar | Pipedrive, Todoist, Linear |
| **Bottom zone** | **Near-universal utility footer** — account / settings / help / "what's new" card | ChatGPT, Sana, Linear, Todoist, Plane, Framer |
| **Record context** | The record you are inside is shown **prominently** (title at top of pane or rail), never collapsed away | Pipedrive, NotebookLM |

## 2. Audit — MatterNav vs the evidence

### Aligns with the convergent pattern
- ✅ **220px width, single-level list, icon + label rows** — squarely on-pattern.
- ✅ **`bg-wash text-ink font-semibold` active state** — exactly the dominant convention; no change needed.
- ✅ **A record card at the top** (matter identity) — defensible. Pipedrive is the closest analog: you are *inside one record* and the rail lists its sections.

### Diverges from the evidence
| # | Finding | Severity | Evidence |
|---|---------|----------|----------|
| 1 | **Status footer dropped.** `NavBody` ends with no bottom zone; the spec's `mt-auto` status strip is gone. | **HIGH** | A bottom utility zone is the single most consistent element across *all 14* rail references. Removing it drops a near-universal convention, not a decorative extra. |
| 2 | **Posture hidden behind `<details>`.** `MatterNav.tsx:134` gates the privilege/posture chip behind `showPosture` (only caller passes `false`) and collapses it inside a "Project settings" disclosure, relabelled "Privilege". | **HIGH** | No reference buries a key record attribute behind an in-rail disclosure. Record context is *surfaced* (Pipedrive, NotebookLM). Posture gates every legal action — hiding it is the opposite of the pattern. |
| 3 | **Chat modelled as a nav item.** The rail treats "Chat" as one of four equal sections. | **DIRECTION** | The AI-assistant archetype does not do this — see §4. This is the highest-leverage finding. |

## 3. The two P19 open decisions — answered by evidence

PR #61 flagged these as "drift vs deliberate — Andy's call." The Mobbin pass turns them from open questions into evidence-backed recommendations:

- **Status footer** → **restore a bottom utility zone.** The pattern is near-universal; this reads as a regression, not a deliberate simplification. It need not be the literal "open" strip — repurpose to status, settings, or help, but the zone should exist.
- **Posture chip** → **surface it, don't hide it.** No reference collapses key record context. Lean **drift**. Put posture in the matter card (always-visible) or the P20 breadcrumb, not behind a disclosure.

Both remain Andy's to ratify — but the evidence points one way on each.

## 4. Direction — is Chat a *canvas*, a *docked assistant*, or a *nav item*?

This is the finding the internal spec could never surface, because it is a product-shape question, not a fidelity one. The references show **three distinct, coherent models**:

| Model | Shape | Who does it | Fits a product that… |
|-------|-------|-------------|----------------------|
| **A · Chat-as-canvas** | Chat fills the centre; left rail = nav + chat history | Claude, Microsoft Copilot, ChatGPT, Perplexity | …*is* the assistant. Conversation is the product. |
| **B · Chat-as-docked-assistant** | Work (documents/record) in the centre; chat in a persistent side panel beside it | ElevenLabs (right-docked chat), NotebookLM (Sources · Chat · Output), Sana | …is a *tool with substance* that an assistant helps you work through. |
| **C · Chat-as-nav-item** | Chat is one tab among several in a left rail | Only the CRM/record rails (Pipedrive) — which have **no** AI-primary surface at all | …is a record/CRM tool where chat is incidental. |

**Where Legalise sits, and the tension.** Legalise is in **Model C** — yet its IA reset named Chat the **default landing** of every matter, which signals chat-primary *intent*. Model C is the one model in the reference set that **no AI-assistant product uses**; it belongs to the CRM archetype. So the current rail under-commits: it neither makes chat the canvas (A) nor docks it as an ever-present collaborator (B) — it makes the assistant a tab you navigate away to.

**The argument for Model B specifically.** For a *legal matter* workspace, the matter's documents and record are the substance, and "supervised autonomy" means a human works *through* the matter while an assistant proposes and is reviewed. That is precisely Model B: substance in the centre, assistant docked alongside. **NotebookLM (`ef2840fb`: Sources · Chat · Output) is almost exactly a matter workspace.** Model B also lets the assistant stay present while the user reads a document or the chronology — which the current "navigate to the Chat tab" model prevents.

This is **not** a recommendation to rebuild — it's a direction question worth deciding deliberately rather than inheriting. If the answer is "Chat is primary," Models A or B are the evidenced ways to express that, and B is the strongest fit for the supervised-autonomy thesis. If the answer is "Legalise is a matter-management tool with an assistant feature," Model C is internally consistent — but then Chat probably should not be the default landing.

**What changes under each:**
- **Stay C:** fix findings 1–2; reconsider whether Chat or Documents is the default landing.
- **Move to B:** the matter shell becomes a 2–3 pane layout (record/documents · chat · output), the left rail shrinks to matter-switching + section jumps, and the breadcrumb carries record context. Larger change; highest thesis-alignment.
- **Move to A:** chat-centre with documents/record as openable panels. Strong for an assistant-first product; weaker fit for a documents-of-record legal tool.

---

## 5. Reference index (re-findable on Mobbin)

**Pass A — record/workspace rails (web):**
Pipedrive `c274c097-94fe-496a-98f7-19e83f3c46ae` · Linear `21868ab4-8721-4702-a824-ac4844e87dda`, `bbbfd972-0581-4b69-a920-38cc771ec428` · Todoist `3f80988f-fce8-4883-bd69-726f88146835`, `af8c6a67-d043-4b1a-87a9-4be810698244` · Fibery `f44149e7-70a8-41a0-ada8-17284b37b646` · Plane `b514ef79-8fda-4cdb-9b42-09eb407cdcce` · Framer `3a9b32c2-6ee2-4b68-a7c5-305b0baf86e6`

**Pass B — AI-assistant workspaces (web):**
ChatGPT `73833b79-1dd5-4354-8fc4-a2e99c33a75e` · Perplexity `29a9bc09-1bcf-4913-9432-0e47ddb3fc2b`, `31322dd4-b101-44d4-bca4-3fe8dc7449a5` · Sana AI `84bf8721-c640-4705-b6d0-412bcb1ddb6a` · WRITER `ef04331d-cde0-4946-bb61-6c3aa00ddce6` · NotebookLM `ef2840fb-864a-4f4c-8d46-c8a82838d183`

**Pass C — chat-direction flows (web):**
Claude `c1d21059-42b3-40fa-838e-b8925964a648` · Microsoft Copilot `9e3419a5-4b3d-4df1-8053-8f5173756d31` · ElevenLabs `5338d9ab-ff48-42ef-808e-a9c6e7ef22fd`

---

## 6. How this was produced (for the next reviewer)

Generated with the **`mobbin-claude-rodeo`** skill (`github.com/b1rdmania/mobbin-claude-rodeo`) driving the Mobbin MCP (`search_screens` / `search_flows`). To extend or re-run: query by *job + archetype* (not aesthetic), pull the screens, and compare to the live component. The screen IDs above can be re-opened on Mobbin to re-verify any claim. If the IA changes, re-run Pass A/B and diff — don't let this audit silently go stale (the failure mode that prompted it).
