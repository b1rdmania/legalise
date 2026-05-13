# Legalise — Design Contract (v0.1)
> Midnight Command Center. Tokens derived from Oxide Computer Company's style reference.

**Theme:** dark

Legalise presents a dark-themed, command-line-inspired interface, designed for clarity and precision. It features a stark black and deep gray palette, punctuated by a single vibrant Terminal Green for interactive elements and highlights. Typography is highly structured, using monospace and sans-serif fonts to convey technical accuracy. Components emphasize subtle borders and minimal elevation, maintaining a lightweight feel with controlled use of color to indicate interaction. Matters are addressable resources with IDs, regions, and retention windows; audit trails read as terminal log lines; modules invoke as CLI commands.

The visual register is a legal admin console for engineers — not a marketing surface, not a SaaS dashboard.

Reference mockup: `docs/mockups/matter-detail.html`.

## Tokens — Colors

| Name | Value | Token | Role |
|------|-------|-------|------|
| Carbon | `#0b0e12` | `--color-carbon` | Page background, surface level 1, deepest UI elements |
| Graphite | `#1f2124` | `--color-graphite` | Surface level 2, card and section backgrounds, subtle borders, inactive link backgrounds |
| Slate | `#303235` | `--color-slate` | Borders, input outlines, primary text backgrounds (when on text), dividers |
| Dim Gray | `#434547` | `--color-dim-gray` | Muted secondary text, icon fills |
| Steel Gray | `#5d5e61` | `--color-steel-gray` | Helper text, less prominent UI elements |
| Ash Gray | `#818284` | `--color-ash-gray` | Body text, general information, secondary headlines |
| Light Gray | `#a3a4a5` | `--color-light-gray` | Link text, navigation items, descriptive text |
| Platinum | `#bababb` | `--color-platinum` | Primary body text, prominent information |
| Snow | `#dedede` | `--color-snow` | Primary heading text, highest contrast text |
| Terminal Green | `#00d892` | `--color-terminal-green` | Interactive text elements, outline buttons, success indicators, command line output text — the sole vibrant accent for attention and action |
| Deep Teal | `#002923` | `--color-deep-teal` | Primary actions (filled buttons), active badge backgrounds — a darker, more subdued green for solid interaction |
| Emerald Shadow | `#005441` | `--color-emerald-shadow` | Subtle indicators, decorative fills, text-based visual accents (e.g. CLI cursor) |
| Scrim | `#292929` | `--color-scrim` | Overlay for modal backgrounds, creating depth |
| Orbital Glow | `radial-gradient(153.66% 69.56% at 50% 69.56%, oklch(0.483 0.0041 260) 0%, oklch(0.247 0.007 260) 100%)` | `--color-orbital-glow` | Subtle background gradient for hero section elements, adding depth to dark surfaces |
| Code Green | `#006d4a` | `--color-code-green` | Green text accent for links, tags, and emphasized short phrases. Use as a supporting accent, not as a status color |
| Code Violet | `#c58aff` | `--color-code-violet` | Violet text accent for links, tags, and emphasized short phrases. Use as a supporting accent, not as a status color |
| Code Red | `#ff6285` | `--color-code-red` | Red text accent for links, tags, and emphasized short phrases. Use as a supporting accent, not as a status color |
| Code Error | `#9f3f53` | `--color-code-error` | Red text accent for links, tags, and emphasized short phrases. Use as a supporting accent, not as a status color |

## Tokens — Typography

### SuisseIntl — Primary sans-serif for headings and prominent UI text, providing clarity and a structured feel. All weights contribute to a precise, engineered aesthetic. · `--font-suisseintl`
- **Substitute:** Inter
- **Weights:** 400
- **Sizes:** 11px, 12px, 14px, 16px, 18px, 20px, 25px, 36px, 50px, 65px
- **Line height:** 1.00, 1.10, 1.17, 1.28, 1.29, 1.30, 1.33, 1.35, 1.38
- **Letter spacing:** -0.0050em at 65px, -0.0030em at 50px, 0.0100em at 11px
- **OpenType features:** `"calt" 0, "ss02", "ss03", "ss06", "ss07", "ss08", "ss09"`
- **Role:** Primary sans-serif for headings and prominent UI text, providing clarity and a structured feel. All weights contribute to a precise, engineered aesthetic.

### GT America Mono — Monospace for all code snippets, terminal inputs, and technical data, reinforcing the 'command center' metaphor. The fixed-width character spacing emphasizes precision and technical accuracy. · `--font-gt-america-mono`
- **Substitute:** Fira Code
- **Weights:** 400
- **Sizes:** 10px, 11px, 12px, 13px, 20px
- **Line height:** 1.00, 1.20, 1.25, 1.30, 1.33, 1.40, 1.45, 1.60
- **Letter spacing:** 0.0140em at 10px, 0.0530em at 12px, 0.0640em at 20px
- **OpenType features:** `"calt" 0, "ss02", "ss03", "ss06", "ss07", "ss08", "ss09"; "calt" 0, "ss06"`
- **Role:** Monospace for all code snippets, terminal inputs, and technical data, reinforcing the 'command center' metaphor. The fixed-width character spacing emphasizes precision and technical accuracy.

### Type Scale

| Role | Size | Line Height | Letter Spacing | Token |
|------|------|-------------|----------------|-------|
| caption | 10px | 1 | 0.14px | `--text-caption` |
| heading | 18px | 1.33 | — | `--text-heading` |
| heading-lg | 36px | 1.35 | — | `--text-heading-lg` |
| display | 65px | 1.1 | -0.05px | `--text-display` |

## Tokens — Spacing & Shapes

**Base unit:** 4px

**Density:** comfortable

### Spacing Scale

| Name | Value | Token |
|------|-------|-------|
| 4 | 4px | `--spacing-4` |
| 8 | 8px | `--spacing-8` |
| 12 | 12px | `--spacing-12` |
| 16 | 16px | `--spacing-16` |
| 20 | 20px | `--spacing-20` |
| 24 | 24px | `--spacing-24` |
| 32 | 32px | `--spacing-32` |
| 36 | 36px | `--spacing-36` |
| 40 | 40px | `--spacing-40` |
| 48 | 48px | `--spacing-48` |
| 56 | 56px | `--spacing-56` |
| 60 | 60px | `--spacing-60` |
| 64 | 64px | `--spacing-64` |
| 80 | 80px | `--spacing-80` |
| 128 | 128px | `--spacing-128` |

### Border Radius

| Element | Value |
|---------|-------|
| none | 0px |
| cards | 1px |
| links | 1px |
| badges | 1px |
| inputs | 1px |
| buttons | 1px |

### Shadows

| Name | Value | Token |
|------|-------|-------|
| subtle | `oklab(0.77 -0.184187 0.0538599 / 0.15) 0px 0px 0px 1px inset` | `--shadow-subtle` |
| subtle-2 | `oklab(0.79 -0.000191013 -0.00108329 / 0.15) 0px 0px 0px 1...` | `--shadow-subtle-2` |

### Layout

- **Section gap:** 56px
- **Card padding:** 12px
- **Element gap:** 12px

## Components

### Primary Filled Button
**Role:** High-priority action button

Filled with Deep Teal (#002923), text in Terminal Green (#00d892), 1px border radius, 0px vertical padding, 12px horizontal padding. Font is GT America Mono 400.

### Ghost Button
**Role:** Secondary action button for less emphasis

Transparent background, text in Platinum (#bababb) with a subtle Slate (#303235) border on top, 1px border radius, 8px vertical padding, 12px horizontal padding. Font is SuisseIntl 400.

### Navigation Link
**Role:** Main navigation and textual links

Transparent background, text in Light Gray (#a3a4a5) with a subtle Graphite (#1f2124) border on top, 0px border radius, 8px vertical padding, 6px horizontal padding. Font is SuisseIntl 400.

### Badge (Active)
**Role:** Indicates status or small informational tags for active states

Deep Teal (#002923) background, Terminal Green (#00d892) text, 1px border radius, 1px vertical padding, 2px horizontal padding. Inset shadow oklab(0.77 -0.184187 0.0538599 / 0.15) 0px 0px 0px 1px inset.

### Badge (Inactive)
**Role:** Indicates status or small informational tags for inactive states

Graphite (#181a1d) background, Platinum (#bababb) text, 1px border radius, 1px vertical padding, 2px horizontal padding. Inset shadow oklab(0.79 -0.000191013 -0.00108329 / 0.15) 0px 0px 0px 1px inset.

### Text Input
**Role:** Field for user text entry

Transparent background, Platinum (#bababb) text, Slate (#303235) border on top, 1px border radius, 0px vertical padding, 12px left padding. Font is SuisseIntl 400.

### Code Block Terminal Line
**Role:** Displaying command line interface content

Transparent background, Terminal Green (#00d892) text for active line/output, Platinum (#bababb) for input. Font is GT America Mono 400 at 12px, 1.25 line height, 0.053em letter spacing.

## Do's and Don'ts

### Do
- Prioritize a dark aesthetic using Carbon (#0b0e12) and Graphite (#1f2124) as primary background surfaces.
- Use Terminal Green (#00d892) as the singular, vivid accent color for all interactive elements, active states, and critical highlights.
- Employ the SuisseIntl font for all primary headings and UI text to maintain a structured, engineering-focused tone, varying sizes up to 65px for display.
- Utilize GT America Mono for all code snippets, terminal outputs, and any data emphasizing precision and technicality.
- Apply a minimal 1px border radius to all interactive components like buttons, inputs, and badges to preserve the crisp, technical feel.
- Maintain a clear visual hierarchy with text colors: Snow (#dedede) for main headings, Platinum (#bababb) and Ash Gray (#818284) for body text, and Dim Gray (#434547) for secondary details.
- Structure layouts with a base spacing unit of 4px, using 12px for element gaps and card padding to achieve comfortable density.

### Don't
- Avoid introducing additional saturated colors; maintain Terminal Green (#00d892) as the exclusive accent color to prevent visual clutter.
- Do not use large, rounded corners; stick to 1px or 0px radii for a clean, technical edge.
- Refrain from using heavy drop shadows or significant elevation shifts; rely on subtle background color changes and thin borders for UI separation.
- Do not use highly decorative or illustrative imagery that conflicts with the stark, technical aesthetic.
- Avoid overly bold or aggressive typography for headlines; SuisseIntl's 400 weight should carry visual weight through size, not extreme thickness.
- Do not use auto layout margins for section gaps; adhere to the established sectionGap of 56px for consistent vertical rhythm.
- Avoid generic icon styles; prefer outlined or precisely filled icons that align with the technical, minimalist ethos.

## Surfaces

| Level | Name | Value | Purpose |
|-------|------|-------|---------|
| 1 | Carbon | `#0b0e12` | Primary page background, base layer. |
| 2 | Graphite | `#1f2124` | Card and secondary section backgrounds, subtly raised from the base. |
| 3 | Deep Teal | `#002923` | Background for active components like filled buttons and badges, indicating interaction. |

## Elevation

The design system explicitly avoids traditional drop shadows for elevation. Instead, depth and hierarchy are communicated through subtle changes in background color (Carbon, Graphite, Deep Teal), thin borders in Slate (#303235), and minimal inset shadows on interactive elements. This approach maintains a flat, precise, and streamlined aesthetic, consistent with a technical, command-line interface feel.

## Imagery

The visual language predominantly features product screenshots and 3D renders of server racks and hardware, treated with a high-fidelity, polished realism against dark or stark white backgrounds. These are mainly contained within designated sections, not full-bleed. Illustrations are minimal and abstract, often using geometric shapes and wireframe aesthetics in shades of gray and black with hints of Terminal Green (#00d892) to explain complex concepts rather than decorate. Icons are typically outlined or subtly filled, maintaining thin stroke weights, and are monochromatic in various shades of gray or Terminal Green. Imagery serves a functional, explanatory role, showcasing the product or visualizing technical ideas, rather than decorative or lifestyle content. The visual density is balanced, with imagery often taking significant space but not overwhelming text.

## Layout

The page primarily uses a full-bleed dark background (Carbon #0b0e12) model, with content centered. The hero section features a large, centered headline over a dark background with prominent 3D product renders. Sections alternate between dark (Carbon #0b0e12, Graphite #1f2124) and slightly less dark (e.g., Orbital Glow radial gradient) backgrounds, creating a subtle internal rhythm without aggressive visual dividers. Content is often arranged in 2-column text+visual layouts or centered stacks for feature descriptions. Navigation is a sticky top bar, minimal and dark, with ghost links and a distinct primary action button.

## Agent Prompt Guide

Quick Color Reference: 
- text: #bababb
- background: #0b0e12
- border: #303235
- accent: #00d892
- primary action: #002923 (filled action)

Example Component Prompts:
- Create a hero section: Carbon (#0b0e12) background. Headline 'On-prem that feels like the public cloud' in SuisseIntl weight 400 at 65px, color Snow (#dedede), letter-spacing -0.05em, line height 1.1. Feature prominent product renders.
- Create a Primary Action Button: #002923 background, #dedede text, 9999px radius, compact pill padding. Use this filled treatment for the main CTA.
- Create a ghost navigation link: Text 'Solutions' in SuisseIntl weight 400 at 12px, color Light Gray (#a3a4a5), no background, 1px border radius, 8px vertical padding, 6px horizontal padding.
- Create a code block line: Background transparent, text 'oxide auth login' in GT America Mono weight 400 at 12px, color Platinum (#bababb), with a flashing '▎' cursor in Emerald Shadow (#005441).
- Create an active badge: Deep Teal (#002923) background, text 'INITIALIZED' in Terminal Green (#00d892), 1px border radius, 1px vertical padding, 2px horizontal padding, with an inset shadow oklab(0.77 -0.184187 0.0538599 / 0.15) 0px 0px 0px 1px inset.

## Similar Brands

- **Vercel** — Shares a developer-centric, dark-mode aesthetic with strong emphasis on typography and a single accent color for interactivity.
- **Stripe** — Features a similar precision in UI, subtle use of neutrals, and a focus on clean, structured layouts.
- **Linear** — Employs a dark, high-contrast theme with sharp edges and a functional, utilitarian approach to component design.
- **Figma (Dark Mode)** — Utilizes a dark canvas with subtle surface variations and a consistent use of a bright, functional accent color for interactive elements.

## Quick Start

### CSS Custom Properties

```css
:root {
  /* Colors */
  --color-carbon: #0b0e12;
  --color-graphite: #1f2124;
  --color-slate: #303235;
  --color-dim-gray: #434547;
  --color-steel-gray: #5d5e61;
  --color-ash-gray: #818284;
  --color-light-gray: #a3a4a5;
  --color-platinum: #bababb;
  --color-snow: #dedede;
  --color-terminal-green: #00d892;
  --color-deep-teal: #002923;
  --color-emerald-shadow: #005441;
  --color-scrim: #292929;
  --color-orbital-glow: #767a7b;
  --gradient-orbital-glow: radial-gradient(153.66% 69.56% at 50% 69.56%, oklch(0.483 0.0041 260) 0%, oklch(0.247 0.007 260) 100%);
  --color-code-green: #006d4a;
  --color-code-violet: #c58aff;
  --color-code-red: #ff6285;
  --color-code-error: #9f3f53;

  /* Typography — Font Families */
  --font-suisseintl: 'SuisseIntl', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-gt-america-mono: 'GT America Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;

  /* Typography — Scale */
  --text-caption: 10px;
  --leading-caption: 1;
  --tracking-caption: 0.14px;
  --text-heading: 18px;
  --leading-heading: 1.33;
  --text-heading-lg: 36px;
  --leading-heading-lg: 1.35;
  --text-display: 65px;
  --leading-display: 1.1;
  --tracking-display: -0.05px;

  /* Typography — Weights */
  --font-weight-regular: 400;

  /* Spacing */
  --spacing-unit: 4px;
  --spacing-4: 4px;
  --spacing-8: 8px;
  --spacing-12: 12px;
  --spacing-16: 16px;
  --spacing-20: 20px;
  --spacing-24: 24px;
  --spacing-32: 32px;
  --spacing-36: 36px;
  --spacing-40: 40px;
  --spacing-48: 48px;
  --spacing-56: 56px;
  --spacing-60: 60px;
  --spacing-64: 64px;
  --spacing-80: 80px;
  --spacing-128: 128px;

  /* Layout */
  --section-gap: 56px;
  --card-padding: 12px;
  --element-gap: 12px;

  /* Border Radius */
  --radius-sm: 1px;
  --radius-md: 4px;
  --radius-full: 9999.01px;

  /* Named Radii */
  --radius-none: 0px;
  --radius-cards: 1px;
  --radius-links: 1px;
  --radius-badges: 1px;
  --radius-inputs: 1px;
  --radius-buttons: 1px;

  /* Shadows */
  --shadow-subtle: oklab(0.77 -0.184187 0.0538599 / 0.15) 0px 0px 0px 1px inset;
  --shadow-subtle-2: oklab(0.79 -0.000191013 -0.00108329 / 0.15) 0px 0px 0px 1px inset;

  /* Surfaces */
  --surface-carbon: #0b0e12;
  --surface-graphite: #1f2124;
  --surface-deep-teal: #002923;
}
```

### Tailwind v4

```css
@theme {
  /* Colors */
  --color-carbon: #0b0e12;
  --color-graphite: #1f2124;
  --color-slate: #303235;
  --color-dim-gray: #434547;
  --color-steel-gray: #5d5e61;
  --color-ash-gray: #818284;
  --color-light-gray: #a3a4a5;
  --color-platinum: #bababb;
  --color-snow: #dedede;
  --color-terminal-green: #00d892;
  --color-deep-teal: #002923;
  --color-emerald-shadow: #005441;
  --color-scrim: #292929;
  --color-orbital-glow: #767a7b;
  --color-code-green: #006d4a;
  --color-code-violet: #c58aff;
  --color-code-red: #ff6285;
  --color-code-error: #9f3f53;

  /* Typography */
  --font-suisseintl: 'SuisseIntl', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-gt-america-mono: 'GT America Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;

  /* Typography — Scale */
  --text-caption: 10px;
  --leading-caption: 1;
  --tracking-caption: 0.14px;
  --text-heading: 18px;
  --leading-heading: 1.33;
  --text-heading-lg: 36px;
  --leading-heading-lg: 1.35;
  --text-display: 65px;
  --leading-display: 1.1;
  --tracking-display: -0.05px;

  /* Spacing */
  --spacing-4: 4px;
  --spacing-8: 8px;
  --spacing-12: 12px;
  --spacing-16: 16px;
  --spacing-20: 20px;
  --spacing-24: 24px;
  --spacing-32: 32px;
  --spacing-36: 36px;
  --spacing-40: 40px;
  --spacing-48: 48px;
  --spacing-56: 56px;
  --spacing-60: 60px;
  --spacing-64: 64px;
  --spacing-80: 80px;
  --spacing-128: 128px;

  /* Border Radius */
  --radius-sm: 1px;
  --radius-md: 4px;
  --radius-full: 9999.01px;

  /* Shadows */
  --shadow-subtle: oklab(0.77 -0.184187 0.0538599 / 0.15) 0px 0px 0px 1px inset;
  --shadow-subtle-2: oklab(0.79 -0.000191013 -0.00108329 / 0.15) 0px 0px 0px 1px inset;
}
```
