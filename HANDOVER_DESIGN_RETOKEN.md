# Handover — design retoken (Paper Ink Workspace, P18 mobile nav)

Reviewer pass on a two-commit design block that lands the new
**Paper Ink Workspace** language across the frontend and completes
the open P18 mobile nav reservation that was left dangling at the
end of the `ed837bd` DESIGN.md v0.2 commit.

This is the first round of review on the new design — there has
been no prior reviewer signoff on either commit. The build is green
(`tsc -b && vite build` clean, 31 modules, 249 kB JS gzipped 74 kB),
but no functional smoke pass yet beyond a dev-server spin-up. The
auth-build review (`HANDOVER_AUTH_REVIEW.md`, R7-rereview signed off
at `4747388`) is the prior context.

---

## Where we are

Two commits on `master`, in order:

- `c34a715` — DESIGN.md: add P18 mobile nav, patch P10 overlay-bar
  bounded-value domain rule, add Mobbin row to lineage table, add
  mobile-inheritance note to surface map.
- `7fe75f4` — Frontend retoken end-to-end: `tailwind.config.js`,
  `index.css`, `index.html`, `App.tsx` (1590 → 2241 lines).
  Backend and `lib/api.ts` / `lib/route.ts` untouched.

Diff since `6196020` (last reviewer-signed commit): 4 files modified
on the retoken, plus the DESIGN.md commit. ~1700 insertions,
~1000 deletions.

---

## How to orient yourself in 20 minutes

Read in this order:

1. `docs/DESIGN.md` §P18 (new) — the mobile nav pattern with three
   render states (marketing / workspace+matter / workspace-no-matter)
   and the dense-data exception.
2. `docs/DESIGN.md` §P10 — read just the new "Domain rule for the
   overlay bar" paragraph; it's the one P10 patch.
3. `docs/DESIGN.md` §"Surface map" — note the new
   **Mobile inheritance** paragraph; this is the load-bearing claim
   that every surface inherits P18 at `< md`.
4. `frontend/tailwind.config.js`, `frontend/src/index.css`,
   `frontend/index.html` — the three foundation files. Confirm they
   match DESIGN.md §"Tokens — Layout" verbatim. The Tailwind config
   should carry six colour tokens, the JetBrains Mono mono stack, the
   three letter-spacing utilities, and zeroed `borderRadius` +
   `boxShadow`. The index.css should carry `overflow-x: clip` (not
   `hidden` — iOS Safari fix) and the `.eyebrow`, `.eyebrow-sm`,
   `.prose-p` utilities.
5. `frontend/src/App.tsx` — read in this structural order:
   - `App()` outer (lines ~50–125) — `navOpen` state,
     body-scroll-lock effect, Esc-to-close, `drawerMatter` fetch,
     `pt-[64px] sm:pt-[80px]` body offset.
   - `TopBar` + `BrandMark` + `Drawer` (~128–404) — P1 + P18 + dense-data
     variant. The dense-data variant fires on
     `route.name === "detail"` at `< md` and reuses the back-arrow
     as a drawer-open trigger (judgment call by the executing
     agent; flagged in §"Judgment calls").
   - `Landing` (~406–586) — P3 hero, P7 em-dash list of the five
     surfaces (SurfaceCard component is gone), P5 trust callout,
     P17 footer.
   - `Modules` + `SkillBlock` (~587–810) — P2 sidebar TOC + P3 hero
     + P4 prose + P6 code block.
   - `MatterDetail` shell (~1007–1276), `PanelHeader` (P8),
     `TabBar` (P9). Six tabs: Overview / Documents / Chronology /
     Pre-Motion / Letters / Audit. Tab is in URL hash via
     `Route.tab`, which `lib/route.ts` already supported.
   - `OverviewTab` ... `AuditTab` — each tab in turn.
6. Stop and click through the dev server. `cd frontend && npm run dev`.

---

## What the retoken does

**Foundation tokens (locked, verbatim from Memo bundle).** Six named
colour tokens — `ink #181818`, `paper #FFFFFF`, `wash #F4F4F4`,
`rule #E5E5E5`, `muted #9CA3AF`, `prose #4B5563`. Three letter-spacing
utilities — `tight2 / track1 / track2`. Three custom CSS utilities —
`.eyebrow`, `.eyebrow-sm`, `.prose-p`. JetBrains Mono replaces Fira
Code. Zero radius, zero shadow.

**P18 mobile nav.** Hamburger → left drawer (Clover / ClickUp / Otter
lineage from the Mobbin May 2026 pass). Width `min(320px, 86vw)`,
backdrop `bg-ink/40` no blur. Three item sets:

| State | Items |
|---|---|
| Marketing (`#/`) | Modules · Matters · GitHub · — · Open demo matter |
| Workspace+matter (`#/matters/{slug}`) | Matter pill · Overview · Documents · Chronology · Pre-Motion · Letters · Audit · — · Modules · Matters · — · GitHub |
| Workspace-no-matter (`#/modules`, `#/matters`, `#/matters/new`) | Matters · Modules · — · GitHub |

**Dense-data P18 exception.** On `route.name === "detail"` at `< md`,
the standard P1 header is replaced with a contextual chrome:
`← matter.slug` + eyebrow surface label. The back-arrow opens the
drawer rather than navigating back (judgment call below).

**Tabbed MatterDetail.** Six tabs replacing the previous single-page
scroll. Each tab is a separate sub-component. Tab is in URL hash
(`#/matters/khan-v-acme/chronology`), back/forward works via
`useRoute`. The `Route.tab` field was already present in `lib/route.ts`
from the auth build; no schema change needed.

**P2 sidebar Modules.** Desktop (`lg+`) shows a left rail of every
installed skill grouped by plugin, with `border-l-2` active state.
Main column shows the selected skill: P3 hero, P4 prose for description
and `argument_hint`, P6 code block of the prompt body. Mobile fallback
stacks all skills inline (`SkillBlock` is the unit), since a sticky
sidebar on a 375px viewport would eat the screen.

**P7 em-dash list on Landing.** The "five parts" SurfaceCard grid is
replaced with a P7 em-dash list — each part is `<li><span>—</span><span><strong>{name}.</strong> {body}</span></li>`. Converts a
synthesised pattern into a lifted one.

**Letters as sixth MatterDetail tab.** Resolves the inconsistency
between the P18 drawer (which lists Letters) and the old Surface map
(which omitted it). The drawer drives the surface map now; surface
map updated accordingly.

**Helpers retokened.** `ErrorCallout` is P14 (`bg-red-50 border
border-red-700 p-4 text-red-700`). `Field` is P13 (label-then-input
stacked, eyebrow-sm label, 16/17px input min). `StatusBadge`,
`Badge`, `PrivilegeControl` are P15 pills with square `w-1.5 h-1.5`
dots and state-colour borders. `LoadingLine` swaps the
`animate-pulse bg-emerald-shadow` cursor for an inline SVG spinner.
`SectionLabel` keeps callsites identical, drops the `§` glyph and the
green prefix.

**Dead chrome.** Every Oxide tic stripped: `legalise $ workspace
--help` mono prompts, `oxide-legal $ matter inspect ...` block
quotes, `-rw-r--r--` ls-style document rows, blinking
`animate-pulse` cursors, `▌` glyphs, `→` arrows on CTAs,
`text-terminal-green` prefixes on `SectionLabel`, `BadgeViolet`
(callsites collapsed to `Badge`), `NavLink` (subsumed by P1 inline
`<a>`), `SurfaceCard` (replaced by P7 em-dash list).

---

## What I want you to look at

Three yes/no signoffs.

### Yes/no 1 — Does the foundation match DESIGN.md verbatim?

Open `frontend/tailwind.config.js` and `frontend/src/index.css`.
Cross-check against DESIGN.md §"Tokens — Colors", §"Tokens —
Typography", §"Tokens — Layout" §"Tailwind config — required
additions", §"Global CSS — required additions". The DESIGN.md spec
is the contract. The lift should be byte-equivalent except for the
top-of-file comment in `tailwind.config.js`.

Look for: any colour token name drift, any radius / shadow that
isn't zeroed, any font stack with `Fira Code` left in (the previous
mono), missing `overflow-x: clip` on body, missing
`-webkit-tap-highlight-color: transparent`, missing
`overscroll-behavior-y: none` inside the iOS `@supports` block.

This is mechanical; a hex-value drift here cascades into every
component.

### Yes/no 2 — Does P18 in DESIGN.md and the implementation in App.tsx agree?

Read DESIGN.md §P18 and `App.tsx` lines ~128–404 side by side.
Specifically:

- Drawer width: `w-[min(320px,86vw)]`?
- Backdrop: `bg-ink/40`, no blur?
- Body-scroll-lock: applied on `navOpen`, restored on cleanup?
- Esc-to-close: keydown listener attached + removed correctly?
- Three item sets: does the JSX render them correctly per route?
- Active state on a drawer item: `bg-wash text-ink font-semibold
  border-l-2 border-ink -ml-[2px] pl-[18px]`?
- Hamburger / close button: `min-h-[44px] min-w-[44px]` (HIG touch
  target)?
- Em-dash separator between primary and secondary blocks: literal
  `<div className="my-2 border-t border-rule" />`?
- Dense-data variant: present on `route.name === "detail"` at
  `< md`? Standard P1 header hidden on the same condition (otherwise
  both render and stack)?

### Yes/no 3 — Does the tabbed MatterDetail leave no regressed functionality?

The pre-retoken `App.tsx` rendered every section of a matter
(case theory, documents, chronology, pre-motion, letters,
contract-review-v0.2, audit, footer cell) on one long scroll. The
new shape splits these across six tabs.

Confirm:

- Every data fetch that previously fired on `MatterDetail` mount
  still fires (matter / documents / chronology / audit).
- Pre-Motion SSE streaming + PDF export still works (the
  `runPreMotionStream` + `exportPreMotionPdf` call sites moved into
  `PremotionTab`; same signatures).
- Letters catalogue + draft flow works (`getLetterCatalogue` +
  `draftLetter` moved into `LettersTab`).
- Chronology CPR 31.22 gate works — `CprGateBanner` renders when
  `count > 0` and `confirmGate` resolves the pending state.
- `PrivilegeControl` still calls `setPrivilege` on change; the
  pill colour state-map is correct (A_cleared green / B_mixed
  amber / C_paused red).
- Contract Review v0.2 still appears somewhere (now a single P5
  callout inside OverviewTab — visible, not hidden).
- Audit row format unchanged (P16 grid, prompt_hash truncated to 8).

If any data path is now unreachable from the UI, flag.

---

## Judgment calls — explicit, please push back on any

These were made during execution rather than re-asking the user. Push
back on any you disagree with.

1. **Dense-data back-arrow opens the drawer.** The DESIGN.md text says
   the dense-data variant is `← back to matter` + label. In a
   single-page matter route, there is no further "back" — back-to-
   matter is back-to-current. The executing agent wired the arrow to
   open the drawer instead. Pragmatic, but the arrow icon then reads
   as "back" but behaves as "menu" — possible confusion. Alternative:
   make it a real `<` icon next to a hamburger.
2. **Modules mobile fallback stacks all skills inline.** No sidebar
   on `< lg`. Could grow long (15 skills today, more later). Could
   instead build a mobile-only `<select>` of skills + main column
   below.
3. **BadgeViolet collapsed to Badge.** Model id is no longer
   colour-coded; it reads as default ink in `[PRIV]` flags on
   chronology too. Recommendation in the plan, accepted by the user
   pre-execution.
4. **Contract Review v0.2 demoted to a single P5 callout in
   OverviewTab.** Previously a full section. Alternative: dedicated
   "Roadmap" tab (would be a seventh). Accepted by the user
   pre-execution.
5. **`text-ink` on both active and inactive desktop nav links in
   TopBar.** Active state is not visually distinct. Cosmetic, not
   functional; reviewable.
6. **Brand mark.** A square + stylised M outline. Functional
   placeholder; brand identity may want something purpose-drawn.
7. **MatterList stays grid-of-anchors, retokened to P16 chrome.**
   Real `<table>` per P16 is a polish pass.
8. **Significance overlay bar uses `(significance / 5) * 100%`.** The
   model field is integer; the executing agent assumed 0–5 from the
   existing UI. If the domain says 0–10, the bar will saturate at 5.

---

## Smoke-test fragility — flagged by the executing agent

- Tab hash sync — back/forward across Overview → Documents
- Drawer body-scroll-lock — verify no stuck lock if navigated mid-open
- Pre-Motion stage strip on 2-column mobile layout
- Chronology overlay-bar widths colliding with wrapped source filenames
- Native `<select>` overlay on PrivilegeControl (iOS tap reliability)
- First-paint flash: P1 header → dense-data swap on matter detail load

None blocking signoff.

---

## What I'm not asking you to review

- The DESIGN.md text itself for prose quality. The lineage and the
  P-pattern catalogue are already signed off across R3–R7. P18 and
  P10 are additions on top of that, and those two changes are
  reviewer-fresh — read them — but the rest of DESIGN.md is locked.
- The Mobbin selection process. The screens were shortlisted from
  three deep searches; the decision rationale is in P18 §"Why this
  resolves the open reservation".
- The auth build below this layer. `HANDOVER_AUTH_REVIEW.md` is
  signed off; auth pages and the `useAuth` hook are still pending
  Day C (not in this commit pair).

---

## What I'd do next

After signoff:

1. Visual pass on the dev server, every surface, mobile + desktop.
   Capture the rough edges (likely Modules mobile, Pre-Motion strip
   density, Chronology row wrap).
2. Day C frontend work — auth pages (`#/auth/signin`, `signup`,
   `forgot`, `reset`, `verify`, `verify-pending`), Settings tabs
   (Profile / Keys / Preferences), `useAuth` hook. The retoken
   leaves these surfaces ready to receive — patterns P13, P12, P14
   are all in place; the surface map already enumerates them.
3. Push the matching change to the dev backend if anything needs to
   move (likely nothing — `lib/api.ts` is untouched).

Approval pattern same as prior rounds — three yes/nos above, push
back on the eight judgment calls, propose any P1/P2 fixes inline.
