# Handover — soften all edges (no hard rectangles)

**Decision (Andy, 2026-06-05):** no hard rectangle edges anywhere — round buttons, inputs, chips, document boxes, cards. Reverses the old "sharp controls" rule.

**Radius scale (now in DESIGN.md + tailwind tokens):**
| Element | Radius | Class |
|---|---|---|
| Floating panels | 18px | `rounded-panel` (existing) |
| Content cards / boxes (info cards, output rows, document boxes) | 12px | `rounded-card` (added) |
| Buttons / inputs / chips / rows | 8px | `rounded-item` (existing) |
| Small status pills | full | `rounded-full` |
| Wordmark / brand mark | sharp | leave — the one editorial anchor |

## DONE (on `codex/chat-led-matter-shell`, this commit)
- **Tokens:** added `rounded-card: 12px`; `rounded-item` repurposed to controls.
- **Shared primitives rounded → propagates app-wide:** `primaryBtn`, `inputCls`, `Badge` in `ui/primitives.tsx` now carry `rounded-item`. Every button/input/badge that uses these is now soft, on every page.
- **DESIGN.md** radius rule reversed to the scale above.
- Verified: `tsc --noEmit` clean; `AssistantTab.test.tsx` 11/11.

## NOT DONE — the raw-box sweep (do this with a browser open)
~228 **raw** bordered elements across the app don't use the shared primitives — they're still sharp: secondary bordered buttons (e.g. "View documents"), the side info cards (DOCUMENTS / SKILLS / RECORD), document chips, output boxes, module surfaces, settings/admin.

**Why I didn't auto-sweep it:** a blind `perl`/`sed` pass flaked and no-op'd, because the className patterns vary (some boxes use `border border-rule`, some don't; some already have a radius elsewhere on the line; `border-b`/`border-t` dividers must NOT round). Without a browser to verify, a blind sweep risks rounding dividers / over-applying. This wants eyes.

**The rule for the sweep:**
- A full-bordered **box / card** (`border border-rule` around content) → `rounded-card` (12px).
- A **button / input / chip / row** → `rounded-item` (8px).
- A **divider** (`border-b` / `border-t` / `border-l` / `border-r` only) → leave sharp.
- The **wordmark** → leave sharp.

**Find candidates:**
```
grep -rhoE 'className="[^"]*border border-rule[^"]*"' frontend/src | grep -v rounded | sort | uniq -c | sort -rn
```
Work file-by-file (matter/, matter/tabs/, demo/, modules/, settings, admin), classify each hit as box vs control vs divider, apply the right token. Don't batch-replace blind.

**Verify:** `npm run typecheck`, `npm run test -- --run`, and **open `/demo` + a matter in the browser** — that's the screenshot surface; confirm no sharp corners on buttons / info cards / document boxes, and that dividers/wordmark are untouched.

Branch is `codex/chat-led-matter-shell`.
