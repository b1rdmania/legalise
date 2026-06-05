# DESIGN.md drop-in — P22–P24 (chat-led shell)

Paste these three blocks into `docs/DESIGN.md` directly after **P21**, on `codex/chat-led-matter-shell`, so the spec lands with the code (mobbin-rodeo rule: never let the spec and build diverge). Values are as-built at `f7713e0` plus the two corrections noted under *Deliberate divergences*.

---

## P22 — Chat-led matter shell (v0.5)

Source: ChatGPT, Elicit, WRITER, Perplexity via Mobbin (web, 2026-06-05) — convergent chat-led workspace. As built on `codex/chat-led-matter-shell`.
Reference screen IDs: `73833b79-1dd5-4354-8fc4-a2e99c33a75e`, `6b7e1d2e-50e7-4414-b2b6-b542449be72f`, `ef04331d-cde0-4946-bb61-6c3aa00ddce6`, `29a9bc09-1bcf-4913-9432-0e47ddb3fc2b`.

What we lift:
- Chat is the primary, persistent surface. `/matters/{slug}` lands on Chat.
- The matter rail collapses to three items; everything else is summoned contextually.
- The thread is capped and centred; the work pane is summoned, not standing (P24).

Exact values (copy, do not approximate):
| Property | Value | Notes |
|---|---|---|
| Matter rail | **Chat / Files / Skills** (3 items, order load-bearing) | URL keys stay `assistant` / `documents` / `workflows` for route compat this slice |
| Demoted surfaces | Activity (was Record), chronology, approvals, workflow pages | routable for deep-link, never rail items |
| Chat column | `mx-auto w-full max-w-[760px]` | centred, capped |
| Canvas / panel | inherits the v0.5 shell (`bg-canvas` / `bg-panel`, P21) | unchanged |
| Naming | "Files" (not Documents), "Activity" (not Record) | productive register, not compliance |
| Message meta line | `text-[11px]` (compact `text-[10px]`) | |
| Message prose | `text-[15px]` (compact `text-xs`) | |
| Empty state | 3 matter-type-aware prompts (`SUGGESTED_BY_TYPE`) + default set, as plain rows | no marketing copy |

Where it lands: `matter/tabs/AssistantTab.tsx`, `matter/tabs/types.ts`, `ui/Sidebar.tsx`.
Deliberate divergences: rail labels intentionally differ from URL keys (route compat this slice; keys rewired in a later slice).

---

## P23 — Assistant output row

Source: ChatGPT artifact rows + Elicit status trail via Mobbin (web, 2026-06-05). As built in `MessageBubble.tsx` (`AssistantOutputRow`).
Reference screen IDs: `73833b79-1dd5-4354-8fc4-a2e99c33a75e`, `6b7e1d2e-50e7-4414-b2b6-b542449be72f`.

What we lift:
- A genuine **output** (something you can reopen) renders as a compact row under the answer — not a heavy card, never dumped into the transcript.
- A plain answer that only cites sources keeps **inline source chips only** — no row.

Exact values:
| Property | Value | Notes |
|---|---|---|
| Appears when | the turn produced an **artifact** — summary / draft letter / redline / review / issue list / version | NOT on `sourceCount > 0` alone (see divergence) |
| Row container | `mt-2 flex flex-wrap items-center gap-2 rounded-md border border-rule bg-paper px-3 py-2` | |
| Kind glyph | `h-6 w-6 rounded-sm border border-rule bg-paper-sunken font-mono text-[10px] uppercase text-muted` | first letter of the kind |
| Title | `text-sm font-semibold text-ink truncate` | |
| Status chip | `rounded-full border border-rule bg-paper-sunken px-2 py-0.5 text-[10px] uppercase tracking-track2 text-muted` | provenance now; becomes the sign-off seal (`Draft → Approved by [name]`) when sign-off is wired — `text-seal` only on Approved |
| Actions | **Open · Sources · Versions · Activity** | `text-xs text-muted underline underline-offset-4 hover:text-ink`; show only what applies; never duplicate Open when a file and a `view_document` action coexist |

Where it lands: `matter/MessageBubble.tsx`.
Deliberate divergences: the as-shipped trigger is `hasOutputRow = sourceCount > 0 || hasActions`; **spec gates it to artifact-producing turns** — fix pending so cited answers don't spawn rows.

---

## P24 — Summoned work pane (slide-over)

Source: WRITER (Source | Preview), Elicit (status), ChatGPT (Activity / Sources), Fabric (dock-and-hide) via Mobbin (web, 2026-06-05). As built in `AssistantTab.tsx` + `ui/Drawer.tsx`.
Reference screen IDs: `ef04331d-cde0-4946-bb61-6c3aa00ddce6`, `6b7e1d2e-50e7-4414-b2b6-b542449be72f`, `73833b79-1dd5-4354-8fc4-a2e99c33a75e`.

What we lift:
- The work pane is **hidden by default** and **summoned** by a row action — never a permanent column. Chat stays full-width and centred when it's closed; the pane closes back to chat.
- It opens to exactly one purpose at a time: sources / versions / activity (and document preview).

Exact values:
| Property | Value | Notes |
|---|---|---|
| Default state | hidden | no standing pane |
| Trigger | row action → `setWorkPane({ kind, message })` | kinds: `sources` / `versions` / `activity` (+ preview) |
| Surface | slide-over (`ui/Drawer`), overlays from the right | not a column that shoves chat |
| Document handoff | inline file chip → **Preview** in pane → "Open in editor" → full-screen `DocumentRichEditor` | inspect-before-edit; label is "Preview", not "Open file" |
| Pin (future) | if ever pinned open, default content = Files | not in this slice |

Where it lands: `matter/tabs/AssistantTab.tsx` (workPane state), `ui/Drawer.tsx`, `matter/DocumentDetail.tsx` (editor route).
Deliberate divergences: none. Caveat before ratifying: confirm the pane *contents* (sources / versions / activity views) are rendered, not stubbed.
