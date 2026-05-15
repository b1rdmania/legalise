# Legalise — Design Contract (v0.2)

> **Paper Ink Workspace.** White-paper editorial aesthetic for marketing
> and prose surfaces; terminal-panel density for workspace surfaces.
> Inspired by the Warp Engine whitepaper, the HyperTrade trading
> terminal, and lifted directly from the Memo legal-AI workspace token
> system. Single coherent design system across both registers.

**Theme:** light. Paper-and-ink, no shadows, no rounded corners,
borders define structure, mono accents on data and labels.

The visual register is a **law clerk's workbench**, not a SaaS
dashboard. Prose where the work is reading, panels where the work is
inspecting structured data. A solicitor should be able to print any
surface and have it look like a working document.

## Lineage and preservation

This design lifts directly from three references. Each lift carries
the [variant-workflow](https://github.com/ziggythebot/variant-workflow)
strict-preservation rule: **when copying a specific component, change
only what the framework requires — never values, never spacing, never
gradients, never font properties.**

| Reference | What we lift | Where it lands |
|---|---|---|
| **Memo** (`memo-app-eta-tawny.vercel.app`) | Token system, custom utilities, header geometry, page max-widths, eyebrow + tight2 + prose-p patterns, mobile touch-target discipline | All surfaces — this is the base |
| **Warp Engine whitepaper** (`design-24211ed9...html`) | Sidebar TOC with scroll-spy, prose body with bordered code blocks, metadata strip (Author / Topic / Status), inline blockquote with thick left border, paragraph-as-em-dash list pattern | Landing, Modules catalogue, About, docs surfaces |
| **HyperTrade Terminal** (`design-81588719...html`) | Panel header strip (instrument + price + 24h change + funding), tab-bar with `border-b-2` active state, dense data rows with absolute background overlays, mono uppercase column headers at 9-10px, status colour semantics, sidebar order-entry form | Matter Detail header, Audit log, Chronology, Pre-Motion stage strip, Settings tabs |
| **Mobbin pass — Clover / ClickUp / Otter / Yahoo Finance** (May 2026) | Hamburger → left drawer skeleton (workspace pill at top, sectioned items, settings cog at bottom), dense-data top-bar exception (back ← + contextual label, no nav chrome) | P18 mobile nav across every surface |

If you are converting a component from one of these references, the
rule is: **paste exactly, change only framework syntax**. Do not round
spacing, do not simplify gradients (there are none, that's the point),
do not extract inline styles, do not invent semantic HTML. If you
think something should be "cleaner," don't.

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

## Tokens — Typography

| Family | Stack | Tailwind |
|---|---|---|
| Sans | `Inter, ui-sans-serif, system-ui, -apple-system, sans-serif` | `font-sans` (default) |
| Mono | `JetBrains Mono, ui-monospace, SFMono-Regular, monospace` | `font-mono` |

Google Fonts load:
```html
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
```

Weights available: Inter `400 / 500 / 600 / 700`; JetBrains Mono `400 / 500`.

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

## P2 — Sidebar TOC with scroll-spy

Source: Warp Engine whitepaper. Used on Modules catalogue, docs surfaces, optionally Matter Detail.

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
    Legalise turns reviewable legal skills into audited matter workflows.
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
    Legalise is the audited execution layer between a Git-distributed catalogue
    of SKILL.md files and a matter-first workspace.
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

## P8 — Panel header strip (data dashboard)

Source: HyperTrade Terminal — the BTC-PERP / price / 24h-change strip. Used for Matter Detail top, Pre-Motion run header, Audit log filter strip.

```jsx
<div className="h-16 border-b border-rule flex items-center px-4 gap-8
                shrink-0 bg-paper">
  <button className="flex items-center gap-2 hover:bg-wash px-2 py-1 group">
    <ListIcon className="text-muted group-hover:text-ink" />
    <span className="text-xl font-mono font-bold tracking-tight text-ink">
      KHAN-V-ACME-TRADING-2026
    </span>
    <CaretDown className="text-muted group-hover:text-ink text-xs" />
  </button>

  {/* Stat column — repeat for each metric */}
  <div className="flex flex-col justify-center">
    <span className="eyebrow tracking-track2 mb-0.5">Posture</span>
    <span className="text-[#00A35C] font-mono text-xs font-bold">A_cleared</span>
  </div>
  <div className="flex flex-col justify-center">
    <span className="eyebrow tracking-track2 mb-0.5">Status</span>
    <span className="text-ink font-mono text-xs font-bold">open</span>
  </div>
  <div className="flex flex-col justify-center">
    <span className="eyebrow tracking-track2 mb-0.5">Model</span>
    <span className="text-ink font-mono text-xs font-bold">claude-opus-4-7</span>
  </div>
  <div className="flex flex-col justify-center">
    <span className="eyebrow tracking-track2 mb-0.5">Matter type</span>
    <span className="text-ink font-mono text-xs font-bold">employment_tribunal</span>
  </div>
</div>
```

Eyebrow + mono bold value, columns separated by `gap-8`. Status
colours follow the semantic palette.

## P9 — Tab bar with border-b-2 active state

Source: HyperTrade Terminal. Used for Settings tabs (Profile / Keys / Preferences), Matter Detail tabs (Overview / Documents / Chronology / Pre-Motion / Audit), Pre-Motion stage strip.

```jsx
<div className="flex gap-4 border-b border-rule px-6 bg-paper h-10 items-center">
  <button className="text-ink font-mono uppercase text-[11px] tracking-track2
                     font-bold border-b-2 border-ink h-full pt-1 -mb-px">
    Overview
  </button>
  <button className="text-muted hover:text-ink transition-colors font-mono uppercase
                     text-[11px] tracking-track2 font-bold border-b-2 border-transparent
                     h-full pt-1 -mb-px">
    Documents
  </button>
  <button className="text-muted hover:text-ink transition-colors font-mono uppercase
                     text-[11px] tracking-track2 font-bold border-b-2 border-transparent
                     h-full pt-1 -mb-px">
    Chronology
  </button>
</div>
```

The `-mb-px` overlaps the container `border-b border-rule` so the
active `border-b-2 border-ink` reads continuous, not stacked.

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
| **Modules catalogue** (`#/modules`) | P1 TopBar · P2 Sidebar TOC (skill list) · P3 Hero (catalogue intro) · P4 Prose body (selected skill SKILL.md rendered) · P17 Footer |
| **Matters list** (`#/matters`) | P1 TopBar · P3 Hero (small variant — just title + meta strip) · P16 Data table |
| **New matter** (`#/matters/new`) | P1 TopBar · centered narrow form (max-w-2xl) · P13 Inputs · P12 Primary button |
| **Matter detail** (`#/matters/{slug}`) | P1 TopBar · P8 Panel header strip (slug + posture + status + model + type) · P9 Tab bar (Overview / Documents / Chronology / Pre-Motion / Audit) · main panel `flex-1` · contents vary by tab |
| **Matter · Overview tab** | P11 Eyebrow stacks (case theory, pivot fact, ACAS dates) · P5 Blockquote pull (the case theory itself, if present) |
| **Matter · Documents tab** | P16 Data table (filename / SHA / size / tag / from_disclosure) · upload P13 form at top |
| **Matter · Chronology tab** | P10 Dense data row with overlay bar (variable weight = significance) · P14 Yellow warning callout when CPR 31.22 gate pending · P13 Input for acknowledgement |
| **Matter · Pre-Motion tab** | P9 Tab bar (stages 0–3 + Result + Export) · streaming stage strip uses P10 dense rows · synthesis output uses P4 Prose + P15 Status pill for verdict colour |
| **Matter · Audit tab** | P16 Data table (timestamp / action / model / tokens / latency / payload preview) |
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

- `docs/design-refs/warp-whitepaper.html` — Warp whitepaper HTML (patterns P2, P3, P4, P5, P6, P7, P17)
- `docs/design-refs/hypertrade-terminal.html` — HyperTrade Terminal HTML (patterns P8, P9, P10, P15, P16)
- `docs/design-refs/warp-whitepaper.react.js` — Warp whitepaper as React (conversion template; scroll-spy implementation)
- `docs/design-refs/memo-production.css` — Memo production CSS (token definitions, utility classes)
- `https://memo-app-eta-tawny.vercel.app/` — Memo live (interaction patterns, motion)
- `~/.claude/skills/variant-workflow/SKILL.md` — strict preservation rules

Don't synthesise. If a pattern isn't lifted from one of the above,
it doesn't belong in this design system.
