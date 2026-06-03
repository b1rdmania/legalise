# Legalise - Design Contract (v0.4)

> **Two registers, not one.** The Warp Engine whitepaper aesthetic
> applies to the **Landing** only (it is genuinely a whitepaper). The
> **matter workspace** is a SaaS LLM workspace and uses a compact left
> rail + slim breadcrumb pattern lifted from Mike, Claude.ai, Sana AI,
> Mistral, and Fibery. Memo still provides the token base across both.

> **Design serves joy.** This document defines visual and interface
> rules. The product-feel doctrine lives in [`JOY.md`](./JOY.md): what
> "good" feels like when a solicitor uses Legalise, the core loop, the
> required patterns (Matter Pulse, Suggested Actions, Source Chips,
> Audit Confirmation, Module Cards), and the anti-patterns that break
> trust. When the two conflict, design serves joy.

**Theme:** light. Paper-and-ink, no shadows, no rounded corners.
Borders define structure. Mono accents on data and labels. No status
colour fills; status reads via mono bordered pills.

The Landing reads like a **printed brief**. The matter workspace reads
like a **legal LLM workspace**: compact navigation, conceptual density
over nav granularity, persistent surfaces, assistant as the front door.
Five primitives in the matter rail; installed legal modules nest behind
one of them (Workflows).

### What changed in v0.4

- **Compact left rail replaces the horizontal tab bar.** The v0.3.1 tab
  bar surfaced 10 numbered primitives across the top of every matter;
  the reviewer flagged this as conceptually noisy. v0.4 collapses to 5
  primitives in a 220px left rail: Assistant / Documents / Chronology /
  Workflows / Audit. Installed legal modules (Pre-Motion / Letters /
  Contract review / Tabular Review / Case law) nest behind the
  Workflows page instead of each owning a top-level slot.
  *(Superseded 2026-06-03: the IA reset further compressed this to the
  `Chat / Documents / Skills / Record` loop — Chronology left the rail. See
  the P19 reconciliation.)*
- **Slim breadcrumb replaces MatterHeader.** Matter title + tab label
  render as a single-line path at the top of the content column. The
  5-item metadata strip (slug / opened / retention / status / posture)
  is gone; posture moves to a chip inside the sidebar matter card. If a
  surface needs more metadata, it surfaces it inline.
- **Overview tab retired.** Bare `/matters/:slug` routes to `/assistant`.
  "What is this matter" context lives in the sidebar matter card and the
  breadcrumb; the assistant is the front door.
- **Workflows as a first-class concept.** Pre-Motion / Letters /
  Contract review / Tabular Review / Case law surface as a catalogue
  page rather than as individual top-level tabs. Each is an installed
  module the workspace knows about; the Workflows page shows what is
  installed.
- **No tab-header strips inside tab bodies.** The MatterBreadcrumb and
  MatterNav carry identity. Bare H2 + eyebrow + lede headers inside
  each tab body are removed; tabs land directly into the form, table,
  or chat surface.
- **Modules vs Workflows.** Two terms, two surfaces. **Modules** are
  what you install: the public catalogue at `#/modules` lists every
  installable skill across the workspace. **Workflows** are what you
  run on a matter once a module is installed: the matter-scoped
  `#/matters/{slug}/workflows` page lists the runnable surfaces for
  that matter (Pre-Motion, Letters, Contract review, Tabular Review,
  Case law). Modules are what you install. Workflows are what you run
  on a matter. The TopBar / Drawer use "Modules" for the catalogue
  hop; the MatterNav uses "Workflows" for the per-matter list.

### What changed in v0.3

- **Single register.** The previous v0.2 hybrid (Warp prose + HyperTrade
  Terminal density) was visually cluttered on workspace surfaces. v0.3
  collapses to one register: Warp document-as-product.
- **Sidebar TOC reserved for the Landing whitepaper.** Initial v0.3 also
  applied it to matter detail; that read as "thesis document wrapped
  around a backend" rather than a workspace. Matter detail now uses a
  slim MatterHeader (title + slug + posture dropdown + metadata strip)
  above a horizontal numbered MatterTabBar. Sidebar TOC stays on the
  Landing because the Landing genuinely IS a whitepaper.
- **Monochrome status pills only.** No green OPEN, no orange B_MIXED
  with coloured square. Status reads as a bordered mono pill (P15
  unchanged) or as an eyebrow + value stack.
- **HyperTrade Terminal lineage retired.** v0.2's panel headers,
  coloured semantics, dense overlay rows are out. Anything that needs
  density goes into a slim table inside the document column.

## Lineage and preservation

Two references. Each lift carries the
[variant-workflow](https://github.com/ziggythebot/variant-workflow)
strict-preservation rule: **when copying a specific component, change
only what the framework requires. Never values, never spacing, never
font properties.**

| Reference | What we lift | Where it lands |
|---|---|---|
| **Memo** (`memo-app-eta-tawny.vercel.app`) | Token system, custom utilities, header geometry, page max-widths, eyebrow + tight2 + prose-p patterns, mobile touch-target discipline | All surfaces. This is the base. |
| **Warp Engine whitepaper** (`design-24211ed9...html`) | Header bar with logo wordmark + nav + ink CTA. Sidebar TOC with scroll-spy (Landing only). Document hero (eyebrow / H1 / lede / metadata strip). Numbered section headers. Prose body with bordered code blocks. Inline blockquote with thick left border. Paragraph-as-em-dash list (use hyphens, never em dash). | Landing whitepaper; module catalogue prose. Matter detail uses the leaner MatterHeader + horizontal MatterTabBar (P9). |
| **Mobbin pass - Clover / ClickUp / Otter / Yahoo Finance** (May 2026) | Hamburger → left drawer skeleton (workspace pill at top, sectioned items, settings cog at bottom), dense-data top-bar exception (back ← + contextual label, no nav chrome) | P18 mobile nav across every surface |

If you are converting a component from one of these references, the
rule is: **paste exactly, change only framework syntax.** Do not round
spacing. Do not simplify gradients (there are none, that's the point).
Do not extract inline styles. Do not invent semantic HTML. If you
think something should be "cleaner," don't.

## Anti-patterns

These were live in v0.2 and are retired in v0.3. If a PR reintroduces
any of them, reject the PR or add it to this list with a reason.

- **Coloured status fills.** No green / orange / red boxes or pill
  fills for posture, status, verdict, or run state. Status reads as
  plain `text-sm font-semibold text-ink` text or, where a bordered
  pill is needed, the monochrome P15 pattern (ink border, ink text,
  paper fill). Colour as a semantic dimension is reserved for verdict
  text inside a result (P10), not for chrome.
- **Mixed font weights in a single value row.** A meta strip with
  some values in `font-semibold` and others in `font-mono` (no
  weight) reads as inconsistent design, not intentional contrast.
  Pick one. Match the Warp metadata strip: every value
  `text-sm font-semibold`.
- **Pull quotes with internal eyebrow labels.** The pull-quote pattern
  is the Warp whitepaper form: `bg-wash p-8 border-l-4 border-ink my-8`
  with `text-sm font-medium italic text-prose`. No internal eyebrow
  ("Pivot fact", "Theory") above the quoted text — the left rule + wash
  do the work. Eyebrows belong on hero metadata strips, not inside
  prose blocks.
- **Terminal density on workspace surfaces.** No HyperTrade-style
  panel header strips, no dense data rows with absolute background
  overlays, no `tracking-[0.2em]` uppercase mono columns at 9px in
  the matter chrome. Density goes into a document-shaped table
  inside the prose column.
- **Mono on values that sit next to sans-semibold values.** If a
  metadata strip needs technical identifiers (slugs, hashes), put
  them in `text-sm font-semibold` sans, not mono. Mono is reserved
  for code blocks (P6), eyebrow labels (uppercase + tracking-widest
  mono is fine because the size is 10-12px), and inline citation
  refs.
- **Sidebar TOCs on workspace surfaces.** The whitepaper sidebar TOC
  pattern (Landing P2) is for documents that scroll as one. Matter
  detail uses the P19 compact left rail (the compressed nav loop + matter
  card), not a scroll-spy TOC. Sidebar TOC stays on the Landing
  whitepaper because the Landing genuinely IS a single scrolling
  document.
- **Horizontal tab bars with more than ~6 items.** v0.3.1 surfaced 10
  numbered tabs across the top; this read as conceptually noisy. The
  P19 compact left rail handles 4-6 primitives; anything beyond that
  nests behind one of them (e.g. installed modules behind Workflows).
- **Matter headers with full metadata strips.** v0.3.1's MatterHeader
  repeated context (title + slug + opened + retention + status +
  posture) on every page. The P20 slim breadcrumb carries identity;
  posture lives in the P19 matter card. If a tab needs to surface
  specific metadata, it does so inline.
- **Tab-header strips inside tab bodies.** The eyebrow + numbered name
  + H2 + lede block at the top of every tab body in v0.3.1 was
  redundant once the breadcrumb shipped. Tab bodies land directly
  into the form, table, or chat surface.
- **"Open demo" CTAs that route to signup.** Demo is the static
  `#/demo` snapshot. Signup is a separate flow. Conflating them
  cost us a real bug.
- **Marketing voice in chrome strings.** No "in action", no
  "powerful", no commas-as-conjunctions in CTAs ("Sign up, free,
  BYO key"). Plain English imperative or short claim.

---

## Tokens — Colors

Lifted verbatim from the Memo production bundle. Six named tokens.
That is enough. Status colours from HyperTrade are added as utility
hex values when they appear in a domain that needs them (Pre-Motion
verdicts, posture badges).

| Name | Value | Tailwind class | Role |
|---|---|---|---|
| **Ink** | `#181818` | `text-ink`, `bg-ink`, `border-ink` | Body text, button background, header logo, primary headings |
| **Paper** | `#FFFFFF` | `text-paper`, `bg-paper` | Primary page background, panel background, ink button text |
| **Wash** | `#F4F4F4` | `bg-wash`, `hover:bg-wash` | Secondary background (hover, surfaces, code block bg, nav-link active fill) |
| **Rule** | `#E5E5E5` | `border-rule`, `decoration-rule` | All borders, hr, table dividers, code block border |
| **Muted** | `#9CA3AF` | `text-muted` | Eyebrow labels, breadcrumb separators, inactive nav, helper text |
| **Prose** | `#4B5563` | `text-prose` | Long-form body copy (`p` inside prose blocks), description text |

**Semantic state colours** (used only where domain requires them — do
not apply decoratively):

| Role | Hex | Tailwind class | Where it appears |
|---|---|---|---|
| Status / success | `#00A35C` | `text-[#00A35C]` | Pre-Motion verdict `steelman`, posture `A_cleared`, peer-reviewed badge |
| Status / danger | `#D9304F` | `text-[#D9304F]` | Pre-Motion verdict `strawman`, posture `C_paused`, error states |
| Status / warning | `#E67E22` | `text-[#E67E22]` | Pre-Motion verdict `borderline`, posture `B_mixed`, funding countdown |
| Info / link | `#0066CC` | `text-[#0066CC]` | External links to source documents, document IDs |
| Red-50 surface | `#FEF2F2` | `bg-red-50` | Error callout background |
| Yellow-100 surface | `#FEF9C3` | `bg-yellow-100` | CPR 31.22 gate pending warning surface |
| Red-700 text | `#B91C1C` | `text-red-700` | Error callout text |

**Hard rules:**
- No gradients anywhere. The Orbital Glow gradient from v0.1 is gone.
- No shadows. Depth comes from borders and surface stacking.
- No rounded corners. Every box is `radius: 0`. The `rounded-*`
  utility is forbidden.
- Hover states change `bg-color` only, never add shadow or transform.

---

## Tokens - Typography

| Family | Stack | Tailwind |
|---|---|---|
| Sans | `"Hanken Grotesk", ui-sans-serif, system-ui, -apple-system, sans-serif` | `font-sans` (default) |
| Mono | `"JetBrains Mono", ui-monospace, SFMono-Regular, monospace` | `font-mono` |

Google Fonts load:
```html
<link href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
```

Weights available: Hanken Grotesk `400 / 500 / 600 / 700`; JetBrains Mono `400 / 500`.

Hanken Grotesk is the open-source HK Grotesk family used by the live
Warp Engine site. Geometric humanist sans, lifts cleanly into the
document-as-product idiom. Inter is the closest substitute if Hanken
Grotesk fails to load - keep both in the fallback chain.

### Type scale (Tailwind tokens, verbatim from Memo bundle)

| Class | Size | Line height | Where |
|---|---|---|---|
| `text-[10px]` | 10px | 1.0 | Eyebrow labels (uppercase + tracking-track2) |
| `text-xs` | 12px / 0.75rem | 1rem | Mono data labels, breadcrumbs, footer text |
| `text-sm` | 14px / 0.875rem | 1.25rem | TOC items, nav, helper text, dense rows |
| `text-base` | 16px / 1rem | 1.5rem | Body text default |
| `text-[16px]` | 16px | inherited | Inputs (prevents iOS zoom) |
| `text-[17px]` | 17px | inherited | Body at sm+ breakpoint |
| `text-lg` | 18px / 1.125rem | 1.75rem | Sub-headlines |
| `text-xl` | 20px / 1.25rem | 1.75rem | Section intros at sm+ |
| `text-2xl` | 24px / 1.5rem | 2rem | Section H2 |
| `text-3xl` | 30px / 1.875rem | 2.25rem | Page H1 (mobile) |
| `text-4xl` | 36px / 2.25rem | 2.5rem | Marketing H1 (mobile), section page H1 (sm+) |
| `text-5xl` | 48px / 3rem | 1.0 | Marketing H1 (sm+), hero |
| `text-6xl` | 60px / 3.75rem | 1.0 | Marketing hero (md+) |

### Letter-spacing utilities (custom, verbatim from Memo)

| Class | Value | Where |
|---|---|---|
| `tracking-tight2` | -0.02em | All large headlines (`text-2xl` and up) |
| `tracking-track1` | 0.1em | `.eyebrow-sm` labels |
| `tracking-track2` | 0.2em | `.eyebrow` labels |

### Line-height utilities (custom, verbatim from Memo)

| Class | Value | Where |
|---|---|---|
| `leading-[1.05]` | 1.05 | Marketing hero H1 |
| `leading-[1.1]` | 1.1 | Page H1 |
| `leading-[1.7]` | 1.7 | Prose paragraphs |

### Custom utilities (already in Memo CSS — port verbatim)

```css
.eyebrow {
  text-transform: uppercase;
  letter-spacing: 0.2em;
  color: #9CA3AF;
  font-size: 10px;
  font-weight: 700;
}

.eyebrow-sm {
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: #9CA3AF;
  font-size: 10px;
  font-weight: 700;
}

.prose-p {
  color: #4B5563;
  margin-bottom: 1.5rem;
  line-height: 1.7;
}

.prose-p:last-child { margin-bottom: 0; }
```

These three utilities cover ~80% of typographic decisions on the site.
**Use them; do not re-invent.**

---

## Tokens — Layout

| Token | Value | Tailwind | Where |
|---|---|---|---|
| Header height (mobile) | 64px | `h-[64px]`, `pt-[64px]` | TopBar, body offset |
| Header height (sm+) | 80px | `sm:h-[80px]`, `sm:pt-[80px]` | TopBar, body offset |
| Page max-width | 1440px | `max-w-page` (custom: `max-w-[1440px]`) | All page containers |
| Prose max-width | 56rem | `max-w-4xl` | Marketing content, prose pages |
| Narrow prose | 42rem | `max-w-2xl` | Hero intro, lede paragraphs |
| Sidebar width | 320px | `lg:w-80` | Whitepaper TOC, Settings nav, Matter Detail tabs |
| Touch target min | 44px | `min-h-[44px]` | Every button |
| Section margin (large) | 6rem | `mb-24`, `mt-24` | Between marketing sections |
| Section margin (huge) | 8rem | `mt-32` | Footer divider |

### Tailwind config — required additions

```javascript
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        ink: '#181818',
        paper: '#FFFFFF',
        wash: '#F4F4F4',
        rule: '#E5E5E5',
        muted: '#9CA3AF',
        prose: '#4B5563',
      },
      maxWidth: {
        page: '1440px',
      },
      letterSpacing: {
        tight2: '-0.02em',
        track1: '0.1em',
        track2: '0.2em',
      },
      borderRadius: {
        none: '0',
        DEFAULT: '0',
      },
      boxShadow: {
        none: 'none',
        DEFAULT: 'none',
      },
    },
  },
};
```

### Global CSS — required additions

```css
/* index.css */
html { scroll-behavior: smooth; -webkit-text-size-adjust: 100%; }
body {
  background: #FFFFFF;
  color: #181818;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
  overflow-x: clip; /* iOS Safari fix — never `hidden` */
}
button, a, input[type=checkbox], label {
  -webkit-tap-highlight-color: transparent;
}
button, a { touch-action: manipulation; }
@supports (-webkit-touch-callout: none) {
  body { overscroll-behavior-y: none; }
}
```

The `overflow-x: clip` rule on body is a load-bearing iOS Safari fix
documented in personal memory; never replace with `hidden`.

---

## Icons

**Inline SVG only.** No icon library import. Lift exact SVG path data
from Lucide / Phosphor when needed. Reasons:

1. Bundle size — three icons is ~600 bytes inline; @phosphor-icons/web is 600KB.
2. Variant preservation — inline SVG paths cannot be "improved" by AI cleanup.
3. Stroke-based icons (Lucide style) match the editorial aesthetic;
   filled icons (Phosphor) match the terminal aesthetic. We need both.

**Patterns:**

```jsx
// Stroke icon (Lucide style) — editorial surfaces
<svg width="16" height="16" viewBox="0 0 24 24" fill="none"
     stroke="currentColor" strokeWidth="2"
     strokeLinecap="round" strokeLinejoin="round">
  <path d="..." />
</svg>

// Filled icon (Phosphor style) — terminal surfaces
<svg width="20" height="20" viewBox="0 0 256 256" fill="currentColor">
  <path d="..." />
</svg>
```

Size convention: `w-4 h-4` for inline, `w-5 h-5` for primary nav,
`w-6 h-6` for hero. Always `currentColor` — never hard-coded fill,
the icon takes its colour from the surrounding text.

---

# Component patterns

Every pattern below is a **strict-preservation lift** from the
reference HTMLs. The Variant rule applies: copy values exactly, do
not round, do not extract, do not abstract.

When a new surface needs a pattern that isn't here, **add it to this
doc first** with the same lift-from-reference discipline, then build.
Do not synthesise patterns from imagination.

## P1 — TopBar (Header)

Source: Memo + Warp Engine (identical pattern).

```jsx
<header className="fixed inset-x-0 top-0 z-50 bg-paper border-b border-rule">
  <div className="max-w-page mx-auto px-4 sm:px-6 h-[64px] sm:h-[80px]
                  flex items-center justify-between">
    <a href="#/" className="flex items-center gap-3 group outline-none">
      {/* Logo SVG inline, 24x24, currentColor on text-ink */}
      <Logo />
      <span className="font-bold text-lg tracking-tight2 text-ink mt-0.5">
        LEGALISE
      </span>
    </a>
    <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-ink">
      <a href="#" className="hover:text-muted transition-colors">Modules</a>
      <a href="#" className="hover:text-muted transition-colors">Docs</a>
      {/* Primary CTA — ink fill, paper text, no rounded */}
      <a href="#" className="bg-ink text-paper px-4 py-2 hover:bg-black transition-colors">
        Sign in
      </a>
    </nav>
  </div>
</header>
```

Body offset: `<body className="pt-[64px] sm:pt-[80px]">` — required, or
content slides under the fixed header.

## P2 — Sidebar TOC with scroll-spy (Landing only)

Source: Warp Engine whitepaper. Used on the **Landing whitepaper only**.
Matter detail and module catalogue are workspaces with discrete tools,
not chapters of one scroll, so they use P9 (horizontal numbered tab
bar) instead. See the Anti-patterns section for why.

```jsx
<aside className="w-80 hidden lg:block sticky top-[80px]
                  h-[calc(100vh-80px)] border-r border-rule p-10 overflow-y-auto">
  <div className="eyebrow-sm mb-8">Documentation</div>
  <nav className="flex flex-col gap-1">
    {items.map(item => (
      <a key={item.id} href={`#${item.id}`}
         className={`py-2 border-l-2 pl-4 text-sm transition-all
           ${item.isSub ? 'pl-8 text-xs' : ''}
           ${item.active
             ? 'border-ink text-ink font-semibold'
             : 'border-transparent text-muted hover:text-ink'}`}>
        {item.label}
      </a>
    ))}
  </nav>
  <div className="mt-12 pt-8 border-t border-rule">
    <div className="eyebrow-sm mb-4">Resources</div>
    <ul className="flex flex-col gap-3 text-sm">
      <li><a className="flex items-center gap-2 hover:text-muted">
        <GithubIcon /> GitHub Repository
      </a></li>
    </ul>
  </div>
</aside>
```

The active state uses `border-l-2 border-ink` and `font-semibold`.
Sub-items get `pl-8 text-xs`. Scroll-spy is a 30-line useEffect; lift
from the Warp React file verbatim.

## P3 — Hero / Page H1 block

Source: Warp whitepaper + Memo landing.

```jsx
<div className="mb-16">
  <div className="eyebrow font-mono text-muted mb-4">VERSION 0.1 — MAY 2026</div>
  <h1 className="text-4xl md:text-5xl font-bold tracking-tight2 text-ink mb-6
                 leading-[1.05]">
    Legalise is an open-source UK legal AI workspace for supervised autonomy.
  </h1>
  <p className="text-xl text-muted leading-relaxed max-w-2xl">
    Open-source UK legal AI workspace. SKILL.md files, matter context,
    audit log per LLM call, CPR 31.22 gate on disclosed material.
  </p>
  <div className="flex flex-wrap gap-x-10 gap-y-4 mt-10 pb-10 border-b border-rule">
    <div>
      <div className="eyebrow mb-1.5">Author</div>
      <div className="text-sm font-semibold">Andy Bird</div>
    </div>
    <div>
      <div className="eyebrow mb-1.5">License</div>
      <div className="text-sm font-semibold">Apache 2.0</div>
    </div>
    <div>
      <div className="eyebrow mb-1.5">Status</div>
      <div className="text-sm font-semibold text-[#00A35C]">v0.1 demo</div>
    </div>
  </div>
</div>
```

The metadata strip is the Warp `Author / Topic / Status` pattern;
status text picks up a semantic colour when relevant.

## P4 — Prose section (body copy)

Source: Warp whitepaper. Used for landing copy, Modules detail (rendered SKILL.md), about pages.

```jsx
<section id="abstract" className="prose mb-24">
  <h2 className="text-2xl font-bold tracking-tight2 mb-6">01. Abstract</h2>
  <p className="prose-p">
    Legalise is an open-source UK legal AI workspace for supervised autonomy.
  </p>
  <p className="prose-p">
    Every model call writes an audit row. Every matter has a privilege posture.
    Disclosure-tainted chronology entries are gated server-side until the user
    acknowledges CPR 31.22.
  </p>
</section>
```

H2 numbered (`01. Abstract`) is the Warp convention — use it on
multi-section pages. Single-section pages drop the number.

## P5 — Blockquote pull (thick left border)

Source: Warp whitepaper. Used to surface a load-bearing quote inside prose.

```jsx
<div className="bg-wash p-8 border-l-4 border-ink my-8">
  <p className="text-sm font-medium italic m-0">
    "If a matter has disclosure-tainted entries, the user must acknowledge
    the implied undertaking before those entries become readable. This is
    enforced server-side, not in the UI."
  </p>
</div>
```

The `border-l-4 border-ink` on `bg-wash` is the signature treatment.
Never replace with a quotemark-only style.

## P6 — Code block

Source: Warp whitepaper (with Memo token swap).

```jsx
<pre className="bg-wash border border-rule font-mono text-[13px] p-6 my-8
                overflow-x-auto whitespace-pre">
  <code>{`# Run Pre-Motion
curl -X POST https://api.legalise.dev/api/matters/khan-v-acme-2026/pre-motion/run \\
  -H "Content-Type: application/json" \\
  --cookie "legalise_session=..."`}</code>
</pre>
```

Hard rules: `bg-wash` not `bg-ink`; `text-[13px]` not 14px; no syntax
highlighting in v0.1 (added when worth a dependency).

## P7 — Em-dash list (no bullets)

Source: Warp whitepaper Security section.

```jsx
<ul className="list-none space-y-4 text-prose text-sm pl-0">
  <li className="flex items-start gap-4">
    <span className="font-bold text-ink">—</span>
    <span>
      <strong>Audit trail.</strong> Every LLM call, every privilege change,
      every disclosure gate confirmation writes one row.
    </span>
  </li>
  <li className="flex items-start gap-4">
    <span className="font-bold text-ink">—</span>
    <span>
      <strong>Per-user keys.</strong> Bring your own Anthropic / OpenAI key;
      encrypted at rest with AES-256-GCM; never logged.
    </span>
  </li>
</ul>
```

Em-dash bullet is the Warp signature. Don't substitute `•` or `→`.

## P8 - Document hero block

Source: Warp Engine whitepaper, opening block. Used on **single-document
surfaces** that scroll as one — the Landing whitepaper, module detail
prose, settings prose. Matter detail uses the leaner MatterHeader
variant (see Workspace exception below). Replaces the v0.2 panel
header strip.

```jsx
<div className="mb-16">
  <div className="text-xs font-mono text-muted mb-4">
    MATTER · EMPLOYMENT TRIBUNAL
  </div>
  <h1 className="text-4xl md:text-5xl font-bold tracking-tight2 text-ink mb-6 leading-[1.05]">
    Khan v Acme Trading Ltd
  </h1>
  <p className="text-xl text-muted leading-relaxed max-w-2xl">
    s.94 ERA 1996, unfair dismissal. Three concurrent claim routes,
    documented grievance, audience-of-47 social-media post.
  </p>

  <div className="flex flex-wrap gap-x-10 gap-y-4 mt-10 pb-10 border-b border-rule">
    <div>
      <div className="eyebrow mb-1.5">Slug</div>
      <div className="text-sm font-mono">khan-v-acme-trading-2026</div>
    </div>
    <div>
      <div className="eyebrow mb-1.5">Opened</div>
      <div className="text-sm font-semibold">2026-05-12</div>
    </div>
    <div>
      <div className="eyebrow mb-1.5">Posture</div>
      <div className="text-sm font-semibold">B_mixed</div>
    </div>
    <div>
      <div className="eyebrow mb-1.5">Status</div>
      <div className="text-sm font-semibold">open</div>
    </div>
  </div>
</div>
```

Eyebrow on top in mono. H1 reads as the document title. Subhead is the
lede in muted prose. Meta strip sits below the rule. No coloured pills.
Matches the Warp hero geometry verbatim.

**Workspace exception.** Matter shell uses a leaner `MatterHeader` -
eyebrow + h1 + 5-item metadata strip (Slug, Opened, Retention, Status,
Posture) - not a full document hero. Document heroes are for the
Landing whitepaper and for single-document surfaces, not for
workspaces with horizontal tab navigation (P9).

## P9 - Horizontal numbered tab bar (RETIRED in v0.4)

Retired. Used in v0.3.1 for matter detail (10 numbered primitives
across the top of every matter). Replaced by P19 compact left rail
+ P20 slim breadcrumb. Kept here as a historical reference; do not
reintroduce on workspace surfaces. The reference HTML below stays so
the lineage is auditable.

Source: Mobbin pull on legal/workspace SaaS (Bonsai project detail,
Asana product demo, Square invoice detail). Used on every matter
detail surface and every workspace catalogue that exposes discrete
tools rather than chapters of one scroll. Sidebar TOC is reserved
for the Landing whitepaper.

```jsx
<div className="border-b border-rule overflow-x-auto sticky top-[64px] sm:top-[80px] bg-paper z-30">
  <div className="max-w-page mx-auto px-4 sm:px-6 lg:px-10 flex gap-8">
    <button className="pt-4 pb-3 -mb-px text-sm border-b-2 border-ink text-ink font-semibold whitespace-nowrap">
      01 Overview
    </button>
    <button className="pt-4 pb-3 -mb-px text-sm border-b-2 border-transparent text-muted hover:text-ink whitespace-nowrap">
      02 Assistant
    </button>
    <button className="pt-4 pb-3 -mb-px text-sm border-b-2 border-transparent text-muted hover:text-ink whitespace-nowrap">
      03 Documents
    </button>
    {/* etc */}
  </div>
</div>
```

Eyebrow numbering uses a single space, not a period: `01 Overview`,
not `01. Overview`. The period form is reserved for in-prose section
headings (P4 numbered H2).

Active state: `border-ink text-ink font-semibold`. Inactive:
`border-transparent text-muted hover:text-ink`. Sticky under the
fixed top bar (`top-[64px]` mobile, `top-[80px]` sm+) so the tabs
stay in reach as the tab content scrolls.

On mobile the row scrolls horizontally inside `overflow-x-auto`. No
collapse to a select; horizontal scroll is the pattern.

The `-mb-px` overlaps the container `border-b border-rule` so the
active `border-b-2 border-ink` reads as one continuous rule, not
stacked.

## P10 — Dense data row with overlay bar

Source: HyperTrade Terminal order book. Used for Audit log rows, Chronology entries, document list, document upload progress.

```jsx
<div className="relative h-[22px] flex items-center justify-between px-4
                hover:bg-wash cursor-pointer text-[11px] font-mono group">
  {/* Optional progress / weight overlay — absolute, bg-color/15 */}
  <div className="absolute right-0 top-0 bottom-0 bg-[#00A35C]/15 transition-colors"
       style={{ width: '65%' }} />
  <span className="text-ink z-10 w-1/3 text-left font-bold">
    2026-03-12
  </span>
  <span className="text-ink z-10 w-1/3 text-right">
    EDT (dismissal)
  </span>
  <span className="text-muted z-10 w-1/3 text-right">
    high significance
  </span>
</div>
```

The 22px row height is dense — five rows fit in 110px. The optional
absolute bar is for variable-weight rows (token count proportional,
significance, audit row latency).

**Domain rule for the overlay bar.** Only render the bar when the
value being shown is a percentage or naturally bounded against a
known maximum (e.g. significance 0–100, latency vs. a p99 ceiling,
token count vs. the model's context limit). For unbounded values
(absolute counts, dates, raw IDs), the row is plain text — no bar.
Otherwise the bar drifts from "weight" to decoration and the order-
book lineage breaks.

## P11 — Eyebrow + value stack

Source: Warp metadata + HyperTrade stat columns.

```jsx
<div>
  <div className="eyebrow mb-1.5">Author</div>
  <div className="text-sm font-semibold text-ink">Andy Bird</div>
</div>
```

Two heights: `mb-1` for dense (table cells), `mb-1.5` for hero meta strip.
The eyebrow class is opinionated — `text-[10px]` + `uppercase` +
`tracking-track2` + `text-muted` + `font-bold`. Don't override.

## P12 — Ink-fill primary button

Source: Memo + Warp.

```jsx
<button className="bg-ink text-paper px-4 py-2 hover:bg-black
                   transition-colors text-sm font-medium min-h-[44px]">
  Continue
</button>
```

Secondary button:

```jsx
<button className="border border-rule hover:border-ink text-ink
                   px-4 py-2 hover:bg-wash transition-colors text-sm
                   font-medium min-h-[44px]">
  Cancel
</button>
```

Mono-button (for terminal surfaces):

```jsx
<button className="border border-rule bg-paper hover:bg-wash text-ink
                   px-3 py-1.5 transition-colors font-mono uppercase
                   text-[10px] tracking-track2 font-bold min-h-[44px]">
  Run Pre-Motion
</button>
```

**Never** apply rounded corners. **Never** apply shadows. Hover is
background only.

## P13 — Input + label pair

Source: Memo (synthesised — Memo's input pattern is its strongest interaction).

```jsx
<label className="flex flex-col gap-2">
  <span className="eyebrow-sm">Email</span>
  <input
    type="email"
    className="bg-paper border border-rule px-4 py-3 text-[16px] sm:text-[17px]
               focus:border-ink focus:outline-none transition-colors
               min-h-[44px] font-sans text-ink"
    placeholder="jasmine@example.com"
  />
</label>
```

Why `text-[16px]` on inputs: stops iOS Safari auto-zooming on focus.
Sole reason. Don't substitute.

## P14 — Error callout

Source: Memo (red-50 / red-700 / red-700 border).

```jsx
<div className="bg-red-50 border border-red-700 p-4 text-red-700 text-sm">
  <div className="font-semibold mb-1">Provider key missing</div>
  Add an Anthropic API key in Settings → API Keys to run Pre-Motion.
</div>
```

For warnings (CPR 31.22 gate pending) use `bg-yellow-100` with
`text-ink` text and `border border-rule`.

## P15 — Status pill (mono, bordered)

Source: HyperTrade (Long / Short pill) + Warp (Peer Reviewed badge).

```jsx
<span className="inline-flex items-center gap-1.5 border border-rule
                 px-2 py-0.5 font-mono uppercase text-[10px]
                 tracking-track2 font-bold text-ink">
  <div className="w-1.5 h-1.5 bg-ink" />
  PEER REVIEWED
</span>
```

Coloured variant for state (posture A_cleared):

```jsx
<span className="inline-flex items-center gap-1.5 border border-[#00A35C]
                 px-2 py-0.5 font-mono uppercase text-[10px]
                 tracking-track2 font-bold text-[#00A35C]">
  <div className="w-1.5 h-1.5 bg-[#00A35C]" />
  A_CLEARED
</span>
```

Square inner dot is load-bearing — don't `rounded-full` it.

## P16 — Data table

Source: HyperTrade positions table. Used for matter list, document list, audit log full-screen view.

```jsx
<table className="w-full text-left text-xs whitespace-nowrap">
  <thead className="text-muted sticky top-0 bg-paper z-10 border-b border-rule">
    <tr>
      <th className="px-6 py-3 font-mono uppercase tracking-track2 text-[9px]">Slug</th>
      <th className="px-6 py-3 font-mono uppercase tracking-track2 text-[9px]">Type</th>
      <th className="px-6 py-3 font-mono uppercase tracking-track2 text-[9px] text-right">Opened</th>
      <th className="px-6 py-3 font-mono uppercase tracking-track2 text-[9px] text-right">Posture</th>
    </tr>
  </thead>
  <tbody>
    <tr className="border-b border-rule hover:bg-wash transition-colors font-mono text-[11px]">
      <td className="px-6 py-4 font-bold">khan-v-acme-trading-2026</td>
      <td className="px-6 py-4 text-prose">employment_tribunal</td>
      <td className="px-6 py-4 text-right text-ink">2026-05-12</td>
      <td className="px-6 py-4 text-right text-[#00A35C] font-bold">A_cleared</td>
    </tr>
  </tbody>
</table>
```

9px headers are deliberate — they recede into structural framing.
11px rows are the smallest legible mono size.

## P17 — Footer

Source: Warp whitepaper.

```jsx
<footer className="mt-32 pt-12 border-t border-rule flex justify-between
                   items-center text-xs text-muted uppercase tracking-track2">
  <span>© 2026 Legalise — Apache 2.0</span>
  <div className="flex gap-6">
    <a href="#" className="hover:text-ink">Privacy</a>
    <a href="#" className="hover:text-ink">Terms</a>
    <a href="#" className="hover:text-ink">GitHub</a>
  </div>
</footer>
```

## P18 — Mobile nav (hamburger → left drawer)

Source: Clover, ClickUp, Otter (Mobbin, May 2026 pass). Clover is the
closest token-coherent match — light bg, sectioned, borders not
shadows, chevron expand. Lifted skeleton; values, spacing, and
chrome stay paper-ink.

**Trigger.** P1 TopBar at `< md` swaps the right-side nav for a
hamburger button. The brand wordmark on the left stays. No bottom
tab bar anywhere — workspace/doc tools in the reference set
uniformly use a drawer, and bottom tab fights the "law clerk's
workbench" register.

```jsx
{/* P1 TopBar additions for mobile */}
<button
  type="button"
  onClick={() => setNavOpen(true)}
  aria-label="Open menu"
  aria-expanded={navOpen}
  className="md:hidden min-h-[44px] min-w-[44px] -mr-2 flex items-center
             justify-center text-ink"
>
  {/* Inline SVG hamburger, 20×20, currentColor */}
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <path d="M3 6h14M3 10h14M3 14h14" stroke="currentColor" strokeWidth="1.5" />
  </svg>
</button>
```

**Drawer.** Full-height, slides in from the left, `bg-paper` with a
`border-r border-rule`. Width `min(320px, 86vw)`. Backdrop is
`bg-ink/40` (no blur). Body-scroll-lock when open. `Esc` and
backdrop tap close it.

```jsx
{navOpen && (
  <>
    <div
      onClick={() => setNavOpen(false)}
      className="md:hidden fixed inset-0 z-40 bg-ink/40"
      aria-hidden="true"
    />
    <aside
      role="dialog"
      aria-modal="true"
      aria-label="Navigation"
      className="md:hidden fixed inset-y-0 left-0 z-50 w-[min(320px,86vw)]
                 bg-paper border-r border-rule flex flex-col overflow-y-auto"
    >
      {/* Header strip — mirrors TopBar height so brand sits steady */}
      <div className="h-[64px] px-4 flex items-center justify-between border-b border-rule">
        <span className="font-bold text-lg tracking-tight2 text-ink">LEGALISE</span>
        <button
          type="button"
          onClick={() => setNavOpen(false)}
          aria-label="Close menu"
          className="min-h-[44px] min-w-[44px] -mr-2 flex items-center justify-center text-muted"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>
      </div>

      {/* Optional context pill — matter slug + posture (workspace state only) */}
      {matter && (
        <div className="px-4 py-3 border-b border-rule">
          <div className="eyebrow-sm mb-1">Matter</div>
          <div className="text-[16px] font-semibold text-ink truncate">{matter.slug}</div>
          <div className="text-xs text-muted mt-1">posture {matter.posture}</div>
        </div>
      )}

      {/* Primary nav */}
      <nav className="flex flex-col py-2">
        {items.map(item => (
          <a key={item.href} href={item.href}
             onClick={() => setNavOpen(false)}
             className={`px-4 py-3 text-[16px] flex items-center gap-3
               ${item.active
                 ? 'bg-wash text-ink font-semibold border-l-2 border-ink -ml-[2px] pl-[18px]'
                 : 'text-ink hover:bg-wash'}`}>
            {item.icon}
            <span>{item.label}</span>
          </a>
        ))}
      </nav>

      {/* Section break + secondary items */}
      <div className="mt-auto border-t border-rule py-2">
        <a href="#/settings" className="px-4 py-3 text-[16px] text-muted hover:text-ink block">
          Settings
        </a>
        <a href="#/auth/signout" className="px-4 py-3 text-[16px] text-muted hover:text-ink block">
          Sign out
        </a>
      </div>
    </aside>
  </>
)}
```

**Drawer items by state.** Same chrome, different items:

| State | Items |
|---|---|
| **Marketing** (`#/`, unauthenticated) | Modules · Docs · GitHub · — · Open demo matter · Sign in |
| **Workspace** (authenticated, matter in scope) | Matter context pill · Overview · Documents · Chronology · Pre-Motion · Letters · Audit · — · Modules · Settings · Sign out |
| **Workspace** (authenticated, no matter) | Matters · Modules · — · Settings · Sign out |

The em-dash row is a literal `<div className="my-2 border-t border-rule" />` between primary and secondary blocks. Active item gets the `border-l-2 border-ink` treatment from the JSX above — same active-state language as P9.

**v0.1 routing note.** "Open demo matter" in the marketing state routes to `#/auth/signup`, not directly to the demo matter slug, because `/api/matters/{slug}` and friends are auth-gated. Day D copies the Khan demo into the new user's workspace on signup; from that point the link in workspace drawers resolves to the user's own copy. The visible label stays "Open demo matter" — the route is the only implementation detail that shifts. "Sign out" is a button (not an anchor) that calls `signout()` then navigates to `#/`.

**Dense-data exception.** On Pre-Motion run streaming, Audit log, Module body, and Chronology table routes, replace the hamburger with `← back to matter` and one or two contextual actions. Drawer is one tap away via that back link. Reference: Yahoo Finance, Binance, Attio data screens drop the nav chrome entirely on data surfaces to maximise content. Apply this only on routes where content density would lose more from chrome than the user would gain from immediate nav.

```jsx
{/* Dense-data variant of P1 — used inside matter sub-routes */}
<header className="fixed inset-x-0 top-0 z-50 bg-paper border-b border-rule md:hidden">
  <div className="px-4 h-[64px] flex items-center justify-between">
    <a href={`#/matters/${matter.slug}`} className="flex items-center gap-2 text-ink min-h-[44px]">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M10 4l-4 4 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
      </svg>
      <span className="text-[16px] font-medium truncate max-w-[180px]">{matter.slug}</span>
    </a>
    <span className="eyebrow-sm">{surfaceLabel /* "Audit", "Pre-Motion" */}</span>
  </div>
</header>
```

**Hard rules.**
- No `rounded-*` on the drawer, the backdrop, the items, or the close button. Square corners hold.
- No `shadow-*`. The `border-r` carries depth.
- No transition longer than 150ms on the slide-in. Workspace tools are quick; this is not a marketing animation.
- Drawer is the only mobile nav surface — no bottom tab, no secondary sheet, no swipe-from-edge gesture (gesture-only nav fails accessibility).
- All primary items are `min-h-[44px]` and `text-[16px]` to satisfy HIG touch targets + iOS-no-zoom.
- The drawer never contains form inputs. If a setting needs a form, the drawer link routes to `#/settings` and the form lives there.

**Why this resolves the open reservation.** `legalise-design.md` listed three candidates (hamburger drawer, bottom tab, profile-only top bar). The Mobbin pass surfaced one dominant precedent across workspace/doc tools and a sharp split for dense-data screens. Net pattern is one drawer + one contextual exception, not three patterns. Marketing and workspace share the same chrome to keep the design language from forking.

## P19 - Compact left rail (matter workspace)

> **Reconciliation — 2026-06-03 (post IA reset).** This pattern was specced
> 2026-05-15, before the IA reset (2026-06-02) deliberately compressed the
> matter shell. The structural reference below (220px rail, matter card,
> active-state, mobile sheet) still holds and the build honours it exactly.
> What changed by decision — now recorded here so spec and code agree:
>
> - **Nav vocabulary is `Chat / Documents / Skills / Record`**, not the
>   original `Assistant / Documents / Chronology / Workflows / Audit`. Labels
>   live in `MATTER_TAB_LABELS` (`frontend/src/matter/tabs/types.ts`); URL keys
>   stay `assistant / documents / workflows / audit` for route stability.
>   "Workflows" → **Skills**, "Audit" → **Record**.
> - **Chronology and Approvals left the rail** — now secondary/legacy surfaces,
>   routable for deep links but off the main *documents → skills → record* loop.
> - **The rail is mid-migration.** `SIDEBAR_NAV` currently renders only `Chat`;
>   the full four-item loop is rewired "in a later slice" per the code comment.
>   Treat four items (Chat / Documents / Skills / Record) as the target, not a
>   shipped fact.
>
> **Two divergences need a decision — now with live-Mobbin evidence** (full
> research: `docs/design-research/LEFT_RAIL_MOBBIN_AUDIT_2026-06-03.md`, a pass
> over 14 real rail references):
> 1. **Posture chip.** Spec: always-visible "Posture" eyebrow + chip in the
>    matter card. Code (`MatterNav.tsx:134`): gated behind `showPosture` (only
>    caller passes `false`) *and* collapsed inside a `<details>` "Project
>    settings", relabelled "Privilege". **Evidence → surface it, don't hide it.**
>    No reference buries a key record attribute behind an in-rail disclosure;
>    posture gates every legal action. Leans **drift**, not deliberate.
> 2. **Status footer.** Spec: `mt-auto` bottom strip showing matter status
>    ("open"). Code: `NavBody` has no footer. **Evidence → restore a bottom
>    utility zone.** A bottom zone (status / settings / help) is the single most
>    consistent element across all 14 references; dropping it reads as a
>    regression. Repurpose the content if "open" is wrong, but keep the zone.
>
> Both still need Andy's ratification, but the evidence points one way on each.
> A **third, higher-leverage** finding is in the research doc: the rail models
> Chat as one nav item (the CRM archetype), whereas every AI-assistant product
> uses chat-as-canvas or chat-as-docked-assistant — a product-direction call,
> not a fidelity fix. Until these are decided, the reference JSX below keeps the
> original (always-visible posture + footer) so the intended pattern isn't lost.

Source: Mobbin pass on legal-AI and adjacent LLM workspaces (Mike,
Claude.ai, Sana AI, Mistral, Fibery, ClickUp, Cycle, OpenAI Platform).
The shared pattern is a 220px single-level rail with 4-6 primitives,
a matter/project card at the top, and a thin status footer at the
bottom. v0.4 lands this for matter detail.

```jsx
<aside
  className="w-[220px] shrink-0 border-r border-rule bg-paper hidden md:flex md:flex-col sticky top-[64px] sm:top-[80px] h-[calc(100vh-64px)] sm:h-[calc(100vh-80px)] overflow-y-auto"
  aria-label="Matter navigation"
>
  {/* Matter card */}
  <div className="px-4 py-5 border-b border-rule">
    <div className="eyebrow mb-2">Matter</div>
    <div className="text-sm font-semibold text-ink">Khan v Acme Trading Ltd</div>
    <div className="text-xs text-muted font-mono mt-1">khan-v-acme-trading-2026</div>
    <div className="mt-3 flex items-center gap-2">
      <span className="eyebrow">Posture</span>
      <span className="inline-flex items-center border border-rule px-1.5 py-0.5">
        {/* PrivilegeControl - mono select, no fill */}
      </span>
    </div>
  </div>
  {/* Nav list */}
  <nav className="px-2 py-3 flex flex-col gap-0.5">
    <button className="w-full text-left px-3 py-2 flex items-center gap-3 text-sm bg-wash text-ink font-semibold">
      <svg width="16" height="16">{/* icon */}</svg>
      <span>Assistant</span>
    </button>
    <button className="w-full text-left px-3 py-2 flex items-center gap-3 text-sm text-prose hover:text-ink hover:bg-wash">
      <svg width="16" height="16">{/* icon */}</svg>
      <span>Documents</span>
    </button>
    {/* etc */}
  </nav>
  <div className="mt-auto border-t border-rule px-4 py-3">
    <div className="text-[10px] font-mono uppercase tracking-track2 text-muted">open</div>
  </div>
</aside>
```

**Active state.** `bg-wash text-ink font-semibold`. No left bar, no
indicator chip. The wash fill plus the semibold ink reads as the
active surface against the rest of the rail at `text-prose`.

**Workflow nesting.** When the user is on a workflow surface (Pre-Motion,
Letters, Contract review, Tabular Review, Case law), the sidebar
highlights the **Skills** item (URL key `workflows`) via
`sidebarActiveFor(tab)` — see the 2026-06-03 reconciliation above for the
Workflows → Skills rename. The deep route keeps working
(`#/matters/{slug}/premotion`) so links stay stable.

**Item count rule.** 4-6 items. If a sixth nav slot is needed, ask
first whether it should nest under an existing one (Workflows is the
canonical example: 5 module surfaces compress to 1 nav slot).

**Mobile.** At `< md` the static rail is hidden. A hamburger button
sits at the left of the MatterBreadcrumb (P20) and toggles the rail
as a left-anchored slide-out sheet: `fixed inset-y-0 left-0 w-[280px]
bg-paper border-r border-rule z-50`, with a `bg-ink/40` backdrop
(`fixed inset-0 z-40 md:hidden`). The sheet renders the same matter
card + nav list + footer as the desktop rail. Selecting a nav item
closes the sheet; tapping the backdrop closes it; an inline close
button next to the matter card eyebrow closes it. Coexists with P18:
P18 is the global app drawer (hamburger in the TopBar, app-level
nav); P19's mobile sheet is matter-scoped and lives behind the
breadcrumb hamburger.

## P20 - Slim breadcrumb (matter workspace content header)

Source: Mobbin pass on legal-AI and adjacent workspaces (same
references as P19). Replaces the v0.3.1 MatterHeader full metadata
block. Single line. Path-shaped: workspace / matter / surface, plus
an optional intermediate hop for workflow surfaces.

```jsx
<div className="px-4 sm:px-6 lg:px-10 py-4 border-b border-rule flex items-center justify-between gap-4">
  <div className="flex items-center min-w-0 text-sm">
    <a href="#/matters" className="text-muted hover:text-ink transition-colors shrink-0">
      Matters
    </a>
    <span className="text-muted mx-2 shrink-0">/</span>
    <span className="font-semibold text-ink truncate">Khan v Acme Trading Ltd</span>
    <span className="text-muted mx-2 shrink-0">/</span>
    <span className="text-prose truncate shrink-0">Assistant</span>
  </div>
</div>
```

For workflow surfaces, render the Skills hop:
`Matters / {title} / Skills / Pre-Motion` (post 2026-06-03 reconciliation —
was "Workflows"; `MatterBreadcrumb.tsx` renders the **Skills** label).
Posture, slug, opened,
retention, and status do not appear here. Posture lives in the P19
matter card, the rest live in the breadcrumb only if the surface
genuinely needs them, in which case the surface renders an inline
strip below this breadcrumb.

---

# Surface map

Which patterns compose which surface.

**Mobile inheritance.** At `< md`, every surface below inherits P18: the hamburger replaces the P1 right-side nav, and the drawer renders in marketing or workspace state per the table in P18. Matter sub-routes (Pre-Motion run streaming, Audit, Chronology, Module body) use the P18 dense-data exception instead of the hamburger.

| Surface | Patterns |
|---|---|
| **Landing** (public `#/`) | P1 TopBar · P3 Hero · P4 Prose (manifesto excerpt) · P7 Em-dash list (load-bearing claims) · P5 Blockquote pull (CPR 31.22 callout) · P12 CTA buttons · P17 Footer |
| **Signin** (`#/auth/signin`) | P1 TopBar · centered card (max-w-md) · P13 Inputs · P12 Primary button · text-sm links to signup + forgot |
| **Signup** (`#/auth/signup`) | Same as Signin plus a P14-shaped note about BYO API keys after registration |
| **Forgot / Reset / Verify pending / Verify** | P1 TopBar · centered card · P13 Inputs · P12 Buttons · P14 Error callouts where needed |
| **Modules catalogue** (`#/modules`) | P1 TopBar · sidebar **skill picker** (master-detail list grouped by plugin — not a P2 scroll-spy TOC) · P4 Prose body (selected skill SKILL.md rendered) · P17 Footer. Unauth visitors see a designed banner (Sign in CTA + Open the demo CTA), no raw 401. |
| **Matters list** (`#/matters`) | P1 TopBar · P3 Hero (small variant: just title + meta strip) · P16 Data table |
| **New matter** (`#/matters/new`) | P1 TopBar · centered narrow form (max-w-2xl) · P13 Inputs · P12 Primary button |
| **Matter detail** (`#/matters/{slug}`) | P1 TopBar · **P19 MatterNav** (compact left rail, 220px — matter card + the *documents → skills → record* loop: **Chat / Documents / Skills / Record**; rail mid-migration, see P19 reconciliation 2026-06-03) · **P20 MatterBreadcrumb** (slim path strip) · main content full-width per tab. Bare `/matters/:slug` lands on Chat. |
| **Matter · Assistant tab** | Default landing for the matter. Chat surface with matter context · inline citation chips (P15-shape, mono, uppercase) · suggested-actions footer below each assistant reply |
| **Matter · Documents tab** | P16 Data table (Document / Type / Source / Extracted / Last action / Action) · upload P13 form at top · per-row expand drawer surfaces SHA + Size + Uploaded-at before EditPanel + AnonymiseButton |
| **Matter · Chronology tab** | P10 Dense data row with overlay bar (variable weight = significance) · P14 Yellow warning callout when CPR 31.22 gate pending · P13 Input for acknowledgement |
| **Matter · Workflows tab** | Catalogue page (`WorkflowsTab`) listing installed modules as 2-col cards: Pre-Motion / Letters / Contract review / Tabular Review / Case law. Each card links to its workflow surface hash route. Sidebar highlights Workflows when any workflow surface is open. |
| **Matter · Reviews tab (workflow)** | List view of saved reviews (P16-shape) → editor view (ColumnEditor form + ReviewGrid spreadsheet with monochrome bordered Yes/No pills) · CostEstimateDialog modal before run. Reached via Workflows. |
| **Matter · Research tab** | P13 form (query + court + year) · result cards (case_name + citation_ref + summary + Cite-into-matter button) · CitationsSidebar pinned right (280px) |
| **Matter · Pre-Motion tab** | Stage strip showing live stream of 4 stages (Optimistic Analyst / Evidence Inspector / Premortem Adversary / Synthesiser) · synthesis output uses P4 Prose + P15 Status pill for verdict colour · P5 Blockquote pull for "If we lose, this will be why" |
| **Matter · Letters tab** | LetterSelector with P18-style active row (`bg-wash text-ink border-l-2 border-ink`) · LetterDraftView in bordered panel with P8-style eyebrow header strip · P12 ink-fill button for draft / re-draft |
| **Matter · Contract review tab** | P13 form (Document / Posture / Contract type / Counterparty / Deal value) · StageStrip (parse / analyse / redline / summarise) · ResultPanel with three accordions (Summary / Analysis / Redlines) · severity + redline-priority use bordered semantic-text pills (no fills) |
| **Matter · Audit tab** | Filter pill (module dropdown) · P16 Data table (Timestamp / Module / Action / Model / Tokens / Latency / Hash) |
| **Settings** (`#/settings/{tab}`) | P1 TopBar · P2 Sidebar (Profile / Keys / Preferences) · main `flex-1 max-w-2xl p-10` · P13 Inputs per tab |
| **Settings · Keys tab** | List of P10 dense rows (provider · last_used · created) · P13 form to add new |

---

# How to build a new surface

1. **Pick patterns from the list above.** Do not invent.
2. **If you need a pattern not in the list**, lift it from one of:
   - `/Users/andy/Downloads/design-24211ed9-3ab0-4570-8227-05bf9d486608.html` (Warp whitepaper)
   - `/Users/andy/Downloads/design-81588719-1fac-4df3-9078-447190af0a53.html` (HyperTrade Terminal)
   - The Memo CSS at `/tmp/memo.css` (Memo production tokens)
   - The Memo site itself: `https://memo-app-eta-tawny.vercel.app/`
3. **Add it to this doc** with the Variant preservation rules called
   out, before writing the React for it.
4. **Strict preservation** — when you lift, you change framework
   syntax (class→className, style="..."→style={{...}}, kebab→camel)
   and **nothing else**. Not values, not spacing, not gradients, not
   font properties. If something looks like it could be cleaner, it
   shouldn't. Trust the reference.

---

# Anti-patterns — never do these

- ❌ `rounded-*` on anything. Zero radius is load-bearing.
- ❌ `shadow-*` on anything. Borders define depth.
- ❌ Gradient backgrounds. The Orbital Glow gradient is gone.
- ❌ Coloured backgrounds outside the named tokens (paper, wash, semantic-state surfaces).
- ❌ Icon libraries imported as packages. Inline SVG only.
- ❌ Decorative state colour. `text-[#00A35C]` is for A_cleared / steelman / peer-reviewed only; never as a body accent.
- ❌ Substituting `•` or `→` for the `—` em-dash bullet.
- ❌ `rounded-full` on status-pill inner dots. Square dots are signature.
- ❌ Synthesised patterns. If it isn't lifted, it doesn't belong.
- ❌ Inputs at `text-sm` (14px). iOS auto-zooms below 16px. Always `text-[16px]` or `text-[17px]`.
- ❌ `overflow: hidden` on body. Use `overflow-x: clip` — iOS Safari fix.

---

# Production discipline (carried from Memo)

These ship in the global CSS and are not optional:

- `-webkit-font-smoothing: antialiased` and `text-rendering: optimizeLegibility` on body.
- `-webkit-tap-highlight-color: transparent` on `button, a, input[type=checkbox], label`.
- `touch-action: manipulation` on `button, a` (suppresses iOS double-tap zoom).
- `min-h-[44px]` on every button (Apple HIG touch target).
- `overflow-x: clip` on body.
- `@supports (-webkit-touch-callout: none) { body { overscroll-behavior-y: none } }` (iOS Safari overscroll fix).
- Inter loaded with `font-display: swap` — never `display=block`.

---

# Reference files (read these before touching design)

Committed verbatim into the repo at `docs/design-refs/` so they
survive a Downloads-folder cleanup. Source-of-truth, never edit.

- `docs/design-refs/warp-whitepaper.html` — Warp whitepaper HTML (patterns P2, P3, P4, P5, P6, P7, P8, P17 — Landing only)
- `docs/design-refs/hypertrade-terminal.html` — HyperTrade Terminal HTML (RETIRED in v0.3; kept for historical lineage of P10 dense rows + P15 status pill only; not authoritative)
- `docs/design-refs/warp-whitepaper.react.js` — Warp whitepaper as React (Landing conversion template; scroll-spy implementation lives here, copied verbatim into `src/landing/Landing.tsx`)
- `docs/design-refs/memo-production.css` — Memo production CSS (token definitions, utility classes)
- `https://memo-app-eta-tawny.vercel.app/` — Memo live (interaction patterns, motion)
- `~/.claude/skills/variant-workflow/SKILL.md` — strict preservation rules

Don't synthesise. If a pattern isn't lifted from one of the above,
it doesn't belong in this design system.
