# Legalise — Style Reference
> ink, paper, restraint

**Theme:** light (default). Dark mode planned for v0.2 as an opt-in toggle.

Legalise's visual register is *calm, concentrated legal work*. Inspired by Tana's literary serif-on-canvas approach, but applied at app-interior density on warm cream surfaces with a legal-vocabulary accent and a monospace third for technical content (audit log, citations, document hashes). The lineage is Stripe Dashboard's rigour, GOV.UK's gravitas, The Modern House's warmth — never AI-SaaS dashboard, never marketing-deck pill buttons.

A solicitor with 20 years in practice should look at the screen and recognise it as a serious instrument for serious work — closer to chambers letterhead than to a venture-backed productivity app.

## Tokens — Colors

| Name | Value | Token | Role |
|------|-------|-------|------|
| Canvas | `#faf8f3` | `--color-canvas` | Page background; the cream of the workspace. Warm off-white, the visual foundation. |
| Surface | `#ffffff` | `--color-surface` | Card, panel, and primary content-container backgrounds. Visually lifted from Canvas. |
| Subtle Surface | `#f5f1e8` | `--color-surface-subtle` | Secondary panels (sidebars, audit-trail backgrounds, footers within cards). Sits between Canvas and Surface. |
| Accent Surface | `#fbeae2` | `--color-surface-accent` | Backdrop for accent-coloured callouts, hover state on accent badges. Used sparingly. |
| Ink Primary | `#171717` | `--color-ink` | Headings, primary body text, matter titles. Warm near-black — not pure black. |
| Ink Secondary | `#5a5a5a` | `--color-ink-secondary` | Body copy, secondary text, navigation, descriptions. |
| Ink Tertiary | `#999999` | `--color-ink-tertiary` | Captions, metadata, timestamps, helper text, less-prominent labels. |
| Ink Quaternary | `#c8c4ba` | `--color-ink-disabled` | Placeholder text, disabled state, deepest visual recession. |
| Hairline | `#e8e3d8` | `--color-hairline` | Borders, dividers, table grid lines, input outlines. Warm grey that holds against Canvas. |
| Oxblood | `#a3331f` | `--color-accent` | The singular accent. Primary CTA fill, active states, key indicators. Legal vocabulary (court robes, leather bindings). Never used for decoration. |
| Oxblood Deep | `#7a2415` | `--color-accent-deep` | Hover and pressed state for Oxblood. |
| Forest | `#3a7d44` | `--color-status-success` | "Cleared", "verified", "in force" status. Muted, never neon. |
| Vermillion | `#a13d3d` | `--color-status-error` | "Refused", "expired", "blocked" status. Same family as Oxblood — palette stays coherent. |
| Amber | `#9c6f1a` | `--color-status-warn` | "Pending", "borderline", "review needed" status. Warm ochre. |

## Tokens — Typography

### Source Serif 4 — Display, headings, matter titles, the literary voice. Negative tracking at larger sizes gives the headline its considered, newspaper-review register. · `--font-serif`
- **Substitute:** Source Serif Pro, Newsreader, Charter, Georgia
- **Weights:** 400, 600
- **Sizes:** 18px, 20px, 24px, 28px, 36px, 48px
- **Line height:** 1.15, 1.25, 1.35
- **Letter spacing:** -0.02em at 36px+, -0.01em at 24-28px, normal at 18-20px
- **OpenType features:** `"liga", "kern", "onum"` (old-style figures for in-line text)
- **Role:** Matter titles, page section headings, hero copy on landing. The carrier of literary weight.

### Inter — Body text, UI labels, navigation, form inputs. The workhorse. Optimised for screen at small-to-medium sizes. · `--font-sans`
- **Substitute:** system-ui, ui-sans-serif
- **Weights:** 400, 500, 600
- **Sizes:** 12px, 13px, 14px, 15px, 16px, 18px, 20px
- **Line height:** 1.4, 1.5, 1.6
- **Letter spacing:** normal; -0.01em at 18-20px subheadings
- **OpenType features:** `"liga", "kern", "tnum"` (tabular numerals — load-bearing for numbers in tables, dates, document IDs)
- **Role:** All UI text, body copy, navigation, captions, labels, status badges.

### JetBrains Mono — Audit log entries, neutral citations, document hashes, code blocks, prompt/response fingerprints. The technical register. · `--font-mono`
- **Substitute:** ui-monospace, SF Mono, Menlo, Berkeley Mono
- **Weights:** 400, 500
- **Sizes:** 11px, 12px, 13px
- **Line height:** 1.4, 1.5
- **Letter spacing:** +0.02em at 11-12px (open tracking for small mono legibility)
- **Role:** Every piece of identifier/reference content — anything code-shaped, hash-shaped, citation-shaped.

### Type Scale

| Role | Family | Size | Weight | Line Height | Letter Spacing | Token |
|------|--------|------|--------|-------------|----------------|-------|
| caption-mono | mono | 11px | 400 | 1.4 | +0.02em | `--text-caption-mono` |
| caption | sans | 12px | 400 | 1.4 | normal | `--text-caption` |
| body-sm | sans | 14px | 400 | 1.5 | normal | `--text-body-sm` |
| body | sans | 15px | 400 | 1.6 | normal | `--text-body` |
| ui | sans | 14px | 500 | 1.5 | normal | `--text-ui` |
| label | sans | 13px | 500 | 1.4 | normal | `--text-label` |
| subheading | sans | 18px | 600 | 1.4 | -0.01em | `--text-subheading` |
| heading-sm | serif | 20px | 600 | 1.35 | -0.01em | `--text-heading-sm` |
| heading | serif | 28px | 600 | 1.25 | -0.02em | `--text-heading` |
| heading-lg | serif | 36px | 400 | 1.2 | -0.02em | `--text-heading-lg` |
| display | serif | 48px | 400 | 1.15 | -0.025em | `--text-display` |

## Tokens — Spacing & Shapes

**Base unit:** 4px

**Density:** comfortable — denser than Tana's marketing pages, more generous than Stripe Dashboard's data tables. Calibrated for app interior reading.

### Spacing Scale

| Name | Value | Token |
|------|-------|-------|
| 1 | 4px | `--space-1` |
| 2 | 8px | `--space-2` |
| 3 | 12px | `--space-3` |
| 4 | 16px | `--space-4` |
| 5 | 20px | `--space-5` |
| 6 | 24px | `--space-6` |
| 8 | 32px | `--space-8` |
| 10 | 40px | `--space-10` |
| 12 | 48px | `--space-12` |
| 16 | 64px | `--space-16` |
| 20 | 80px | `--space-20` |

### Border Radius

| Element | Value | Token |
|---------|-------|-------|
| tables | 0px | `--radius-0` |
| badges | 2px | `--radius-1` |
| buttons | 4px | `--radius-2` |
| inputs | 4px | `--radius-2` |
| cards | 6px | `--radius-3` |
| modals | 8px | `--radius-4` |

Never pill-shaped. Never `9999px`. The visual register is precision-instrument, not approachable-consumer-app.

### Shadows

No drop shadows on standard UI. Depth comes from background colour shifts and hairline borders. The single exception:

| Name | Value | Token |
|------|-------|-------|
| modal | `0 16px 48px rgba(23, 23, 23, 0.12)` | `--shadow-modal` |

### Layout

- **Page max width:** 1280px (centred, generous gutters)
- **Section gap:** 48px (between major page regions)
- **Stack gap:** 24px (within a region — between cards, between paragraphs)
- **Element gap:** 12px (within a component — between rows, between meta lines)
- **Card padding:** 24px (interior content padding)
- **Sidebar width:** 280px
- **Main column max:** 720px (when reading-optimised; wider for tabular data)

## Components

### Primary Button

**Role:** Primary call to action — "Save matter", "Run Pre-Motion", "Send draft".

- Background: Oxblood `#a3331f`
- Text: Canvas `#faf8f3`
- Hover/pressed: Oxblood Deep `#7a2415`
- Padding: 10px vertical, 16px horizontal
- Radius: 4px
- Font: Inter 500, 14px

### Secondary Button

**Role:** Less-prominent action — "Cancel", "Discard", "View raw".

- Background: Surface `#ffffff`
- Text: Ink Primary `#171717`
- Border: 1px Hairline `#e8e3d8`
- Hover: Subtle Surface `#f5f1e8`
- Padding: 10px vertical, 16px horizontal
- Radius: 4px
- Font: Inter 500, 14px

### Ghost Link

**Role:** Tertiary navigation, inline links inside copy, sidebar nav items.

- Text: Ink Primary `#171717` (default), Oxblood `#a3331f` (current/active)
- Underline: 1px Hairline (default), 1px Oxblood (hover, active)
- Underline offset: 4px (sits below the baseline cleanly)
- Font: Inter 400, 14px

### Matter Card

**Role:** Matter index entry in the sidebar matter list, or in the matters dashboard.

- Background: Surface `#ffffff` (default), Subtle Surface `#f5f1e8` (hover), Accent Surface `#fbeae2` (current)
- Border-left: 2px Oxblood when current matter; 0px otherwise
- Padding: 16px
- Radius: 6px
- Title: Source Serif 4 600, 18px, Ink Primary
- Meta: Inter 400, 13px, Ink Tertiary (parties · date · status)
- Stack gap: 4px between title and meta

### Audit Log Row

**Role:** A single entry in the matter audit trail.

- Layout: timestamp · actor · action · resource (four columns, monospace-aligned)
- Timestamp: JetBrains Mono 400, 12px, Ink Tertiary
- Actor: Inter 500, 13px, Ink Primary
- Action: JetBrains Mono 400, 12px, Ink Secondary (e.g. `matter.created`, `model.call`)
- Resource: Inter 400, 13px, Ink Secondary
- Hash: JetBrains Mono 400, 11px, Ink Tertiary (truncated 8 chars with hover-reveal)
- Row padding: 8px vertical, 16px horizontal
- Row separator: 1px Hairline bottom

### Privilege Posture Badge

**Role:** Shows the matter's privilege posture in the matter header.

Three states, same shape:
- **Cleared (A):** Forest border, Forest text, Subtle Surface background. Text: "A · Cleared"
- **Mixed (B):** Amber border, Amber text, Subtle Surface background. Text: "B · Mixed"
- **Paused (C):** Vermillion border, Vermillion text, Subtle Surface background. Text: "C · Paused"

- Padding: 4px vertical, 10px horizontal
- Radius: 2px
- Font: Inter 500, 11px, all-caps, +0.05em tracking

### Section Header

**Role:** Major page region title — "Matter", "Audit Trail", "Documents", "Chronology".

- Font: Source Serif 4 600, 20px, Ink Primary
- Underline: 1px Hairline bottom, 12px below baseline
- Optional trailing meta: Inter 400, 13px, Ink Tertiary, right-aligned

### Document Tag

**Role:** Indicator on a document — "disclosure", "WP", "draft", "signed".

- Background: Subtle Surface `#f5f1e8`
- Text: Ink Secondary `#5a5a5a`
- Padding: 2px vertical, 8px horizontal
- Radius: 2px
- Font: Inter 500, 11px, all-caps, +0.05em tracking

### Pipeline Stage

**Role:** Pre-Motion adversarial pipeline visualisation — one of "Optimistic Analyst", "Evidence Inspector", "Premortem Adversary", "Synthesiser".

- Inactive: Hairline border, Ink Tertiary text
- Running: Oxblood border, Oxblood text, animated pulse on border
- Complete: Forest border, Forest text, checkmark glyph
- Failed: Vermillion border, Vermillion text
- Layout: four cards in a row, connected by horizontal hairline arrows
- Card padding: 16px
- Radius: 6px

## Do's and Don'ts

### Do

- Lead with serif headings and sans body. The serif/sans contrast IS the aesthetic.
- Use mono for every piece of code-shaped content: audit hashes, neutral citations, document IDs, prompt fingerprints, JSON snippets. Don't let mono drift into prose.
- Reserve Oxblood for primary action and current-state indication only. Maximum one use per visible region.
- Use tabular numerals (Inter `tnum`) in tables, dates, and counts so digits align.
- Use Source Serif's old-style figures (`onum`) in body prose so numbers don't read as block-shouty.
- Sit on Canvas (`#faf8f3`) as the page surface. Lift cards to Surface (`#ffffff`). Sink secondary panels to Subtle Surface (`#f5f1e8`).
- Use hairline borders, not shadows, for depth.
- Maintain 4px-grid alignment for every padding, margin, and gap.
- Apply negative tracking to serif at 24px+ so headings read tight and considered.

### Don't

- Don't use pure black (`#000000`) anywhere. Use Ink Primary `#171717` — warmer, kinder.
- Don't use pure white (`#ffffff`) as the page background. Canvas `#faf8f3` only; pure white reserved for elevated surfaces.
- Don't introduce a second chromatic accent. Oxblood is the single hue; everything else is neutral or functional status.
- Don't use pill-shaped buttons. 4px radius maximum on interactive controls.
- Don't use drop shadows on cards or panels. Borders only.
- Don't reach for system-ui or Arial as a substitute for the brand fonts unless explicitly building a print stylesheet.
- Don't use serif for body copy. Reading at 14-16px wants the sans.
- Don't use sans for citations or audit entries. Mono carries the technical register.
- Don't write status indicators in colour alone — pair colour with text and an icon for accessibility.
- Don't use marketing-tone copy in the workspace. Real legal language only.

## Surfaces

| Level | Name | Value | Purpose |
|-------|------|-------|---------|
| 0 | Canvas | `#faf8f3` | Page background, the cream foundation of every screen. |
| 1 | Surface | `#ffffff` | Cards, panels, primary content containers. The visual "lift" above Canvas. |
| 2 | Subtle Surface | `#f5f1e8` | Sidebars, sub-panels within cards, audit-trail backgrounds. Sits below Surface visually. |
| 3 | Accent Surface | `#fbeae2` | Backdrop behind the current-matter card; hover backdrop behind interactive Oxblood badges. Used sparingly. |

Depth hierarchy is communicated through these four surfaces plus hairline borders. No shadows.

## Imagery

The workspace is text-led. Imagery is largely absent from the app interior — solicitor work is reading and drafting, not browsing visual content. The exceptions:

- **Document thumbnails** in the document list: square previews of the first page of a PDF or DOCX, 80px × 80px, 6px radius, hairline border.
- **User avatars** in audit log rows: simple monogram chips, 24px circle, Subtle Surface background, Ink Primary monogram letters.
- **Iconography:** Lucide icons in a single 1.5px stroke weight, Ink Secondary by default, Oxblood for active state. Never decorative — always functional.

Landing page (`legalise.dev`) may use one full-bleed product screenshot. Inside the app, no marketing imagery.

## Layout

- Full-bleed Canvas background, content max-width 1280px centred with 32px horizontal padding.
- Two-column layout: 280px sidebar (matter list, navigation) + flexible main column.
- Main column max-width 720px for reading-heavy modules (Pre-Motion brief, drafted letter, chronology prose). Full main column width for tabular modules (audit log, document list, disclosure list).
- Sticky top bar (64px height) with workspace title, current-matter breadcrumb, and user menu. Subtle Surface background, hairline bottom border.
- Sticky left sidebar with matter list and module nav. Subtle Surface background, hairline right border.
- Section gap 48px between major regions. Stack gap 24px between cards within a region.

## Agent Prompt Guide

### Quick Colour Reference

- text: `#171717` (Ink Primary)
- background: `#faf8f3` (Canvas)
- card: `#ffffff` (Surface)
- border: `#e8e3d8` (Hairline)
- accent: `#a3331f` (Oxblood)
- primary action: Oxblood filled background

### Example component prompts

1. **Primary action button.** Oxblood (`#a3331f`) background, Canvas (`#faf8f3`) text, 4px border-radius, 10px vertical / 16px horizontal padding. Inter 500, 14px. Hover: Oxblood Deep (`#7a2415`).
2. **Matter card.** Surface (`#ffffff`) background, 6px radius, 16px padding, 1px Hairline border. Title in Source Serif 4 600, 18px, Ink Primary; meta in Inter 400, 13px, Ink Tertiary. Current matter: 2px Oxblood left border + Accent Surface background.
3. **Audit log row.** Four columns — timestamp (Mono 12px Tertiary), actor (Inter 500 13px Primary), action (Mono 12px Secondary), resource (Inter 400 13px Secondary). 8px vertical / 16px horizontal padding. 1px Hairline bottom separator.
4. **Privilege posture badge — Mixed.** Subtle Surface (`#f5f1e8`) background, Amber (`#9c6f1a`) border + text. 4px vertical / 10px horizontal padding, 2px radius. Text "B · MIXED" in Inter 500, 11px, all-caps, +0.05em tracking.
5. **Pre-Motion pipeline stage — Running.** 1px Oxblood border, Oxblood text, 6px radius, 16px padding. Animated pulse on border. Stage name in Inter 600, 14px Primary; sub-stage list in Inter 400, 12px Secondary.

## Similar Brands

- **Tana** — Serif display + sans body, single muted accent, calm-concentrated tone. The closest structural inspiration.
- **Stripe Dashboard** — Tabular discipline, ink-on-cream restraint, deep type hierarchy. The closest density inspiration.
- **The Modern House** — Letterhead-derived warmth, serif headlines, photography-led restraint. The closest mood inspiration.
- **GOV.UK** — Gravitas without stiffness; official UK design language. The closest jurisdiction inspiration.
- **Plain English Kitchens** — Serif wordmark, near-zero ornamentation, considered restraint. The closest brand-restraint inspiration.

## Quick Start

### CSS Custom Properties

```css
:root {
  /* Colours — Surfaces */
  --color-canvas: #faf8f3;
  --color-surface: #ffffff;
  --color-surface-subtle: #f5f1e8;
  --color-surface-accent: #fbeae2;

  /* Colours — Ink */
  --color-ink: #171717;
  --color-ink-secondary: #5a5a5a;
  --color-ink-tertiary: #999999;
  --color-ink-disabled: #c8c4ba;
  --color-hairline: #e8e3d8;

  /* Colours — Accent + Status */
  --color-accent: #a3331f;
  --color-accent-deep: #7a2415;
  --color-status-success: #3a7d44;
  --color-status-warn: #9c6f1a;
  --color-status-error: #a13d3d;

  /* Type — Families */
  --font-serif: "Source Serif 4", "Source Serif Pro", "Newsreader", Charter, Georgia, serif;
  --font-sans: "Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, "SF Mono", Menlo, Monaco, Consolas, monospace;

  /* Type — Scale */
  --text-caption-mono: 11px; --leading-caption-mono: 1.4;
  --text-caption: 12px;      --leading-caption: 1.4;
  --text-body-sm: 14px;      --leading-body-sm: 1.5;
  --text-body: 15px;         --leading-body: 1.6;
  --text-ui: 14px;           --leading-ui: 1.5;
  --text-label: 13px;        --leading-label: 1.4;
  --text-subheading: 18px;   --leading-subheading: 1.4;
  --text-heading-sm: 20px;   --leading-heading-sm: 1.35;
  --text-heading: 28px;      --leading-heading: 1.25;
  --text-heading-lg: 36px;   --leading-heading-lg: 1.2;
  --text-display: 48px;      --leading-display: 1.15;

  /* Spacing */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;
  --space-16: 64px;
  --space-20: 80px;

  /* Radius */
  --radius-0: 0px;
  --radius-1: 2px;
  --radius-2: 4px;
  --radius-3: 6px;
  --radius-4: 8px;

  /* Shadow (sparing) */
  --shadow-modal: 0 16px 48px rgba(23, 23, 23, 0.12);

  /* Layout */
  --page-max: 1280px;
  --sidebar-width: 280px;
  --reading-width: 720px;
  --topbar-height: 64px;
}
```

### Tailwind v4

```css
@theme {
  --color-canvas: #faf8f3;
  --color-surface: #ffffff;
  --color-surface-subtle: #f5f1e8;
  --color-surface-accent: #fbeae2;
  --color-ink: #171717;
  --color-ink-secondary: #5a5a5a;
  --color-ink-tertiary: #999999;
  --color-ink-disabled: #c8c4ba;
  --color-hairline: #e8e3d8;
  --color-accent: #a3331f;
  --color-accent-deep: #7a2415;
  --color-status-success: #3a7d44;
  --color-status-warn: #9c6f1a;
  --color-status-error: #a13d3d;

  --font-serif: "Source Serif 4", "Newsreader", Charter, Georgia, serif;
  --font-sans: "Inter", ui-sans-serif, system-ui, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace;

  --text-caption-mono: 11px;
  --text-caption: 12px;
  --text-body-sm: 14px;
  --text-body: 15px;
  --text-ui: 14px;
  --text-label: 13px;
  --text-subheading: 18px;
  --text-heading-sm: 20px;
  --text-heading: 28px;
  --text-heading-lg: 36px;
  --text-display: 48px;

  --spacing-1: 4px;
  --spacing-2: 8px;
  --spacing-3: 12px;
  --spacing-4: 16px;
  --spacing-5: 20px;
  --spacing-6: 24px;
  --spacing-8: 32px;
  --spacing-10: 40px;
  --spacing-12: 48px;
  --spacing-16: 64px;
  --spacing-20: 80px;

  --radius-0: 0px;
  --radius-1: 2px;
  --radius-2: 4px;
  --radius-3: 6px;
  --radius-4: 8px;
}
```

### Fonts

All three families are open-source and loadable from Google Fonts. Self-host for production.

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
```

## Versioning

This document is the v0.1 design contract. Token names and values are stable across `0.1.x`. Any token addition is additive only — no removals or renames inside a minor version. v0.2 may introduce a dark-mode palette under matching token names.
