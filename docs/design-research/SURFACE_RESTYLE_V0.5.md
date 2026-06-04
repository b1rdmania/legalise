# Surface Restyle — Design Contract Amendment v0.5 (PROPOSED)

> **Status: PROPOSED. Not yet folded into `DESIGN.md`.** This is a decision
> doc in the `design-research/` pattern (same as the left-rail audit). It
> exists so the surface restyle is a *conscious contract amendment* with
> dated supersession lines — not silent drift away from the v0.4 hard rules.
> Andy ratifies the open values below; only then does it land in `DESIGN.md`
> as v0.5 and `tailwind.config.js`. Variant exploration runs in parallel; the
> open decisions are exactly the knobs the variants should settle.
>
> Date opened: 2026-06-04. Author: design pass. Reference archetype: legal /
> productivity workspaces (continuity with P19/P20).

---

## 1. What this amendment changes — and why it's an amendment, not a bug

The Redaction identity (`legalise-redaction-brand.md`, 2026-06-03) committed
to a **"soft cards direction"** for surfaces. The wordmark + typography roll
was the first half; this is the second. The v0.4 contract was built on the
opposite premise, so three of its **hard rules are deliberately superseded
here** — recorded so spec and code never disagree:

| v0.4 hard rule | v0.5 disposition |
|---|---|
| **No shadows.** "Depth comes from borders and surface stacking." | **Superseded for the card surface only.** A single low two-layer shadow defines card elevation. Chrome (rails, breadcrumb, tables, pills, buttons) stays shadowless. |
| **No rounded corners.** "Every box is `radius: 0`. `rounded-*` is forbidden." | **Superseded for the card surface only.** Cards take one small radius token. Everything else stays `radius: 0`. |
| **Paper-white background (`#FFFFFF`).** | **Superseded globally.** The app canvas warms to an off-white; cards stay paper-white so they read as lifted *off* the canvas. |

**The load-bearing discipline of v0.5 is scope.** Elevation + radius + warmth
are *not* a free-for-all. They apply to **one new primitive — the soft surface
card (P21)** — and to the canvas behind it. Every existing pattern P1–P20
keeps its square, shadowless, border-defined treatment. This is what stops
"soft cards" from metastasising into rounded buttons, shadowed pills, and the
exact bespoke creep the process notes warn about. If a PR rounds or shadows
anything that isn't a P21 card or the canvas, reject it.

---

## 2. Mobbin evidence

Web pass, 2026-06-04, deep mode. Archetype: productivity / knowledge / project
workspaces (legal-AI adjacent — the P19/P20 reference family). The soft-surface
question converges across three serious apps; the rest of the result set
(monday.com, ClickUp accent themes) was discarded for fighting a monochrome
brand with saturated colour.

| App | Screen ID | What it evidences |
|---|---|---|
| **Basecamp** | `993f2b31-f15e-4b20-b0bd-436ca38b96ec` | The warmest, softest precedent. Cream/off-white app canvas; white content cards with a thin border + *very* subtle shadow + small radius; eyebrow label ("SAMPLE") + bold title + description + generous padding. The closest single reference to "soft + warm". |
| **ClickUp — Home** | `b843aaa3-9845-4b8b-b43b-6754f9ad8f6e`, `c3462ca9-6a7b-47f7-982b-d15a5554f76c` | The dashboard-of-cards pattern. White widget cards on a light canvas; thin border, ~8px radius, low subtle shadow; in-card section header (bold) + "see all" link top-right + list rows. |
| **Frame** | `a3c75161-31e6-44f4-95b2-d9a96e136fe1` | Doc records as cards on a light canvas; same border + small radius + low-elevation language, generous padding. Confirms the convention holds beyond one app. |

**Convergent reading (the pattern, stated as values):**

- Warm/light **canvas** behind the content (not pure white).
- **Card** = white fill, thin 1px border, small radius, *one low two-layer shadow*, generous internal padding.
- **Card header** = bold title, optional eyebrow/section label, optional top-right action link.
- **Hover** = shadow lifts slightly; border may darken a step.

We lift the **geometry and elevation** (radius, shadow, padding, border weight)
and apply the **Legalise palette** (warm paper canvas, ink, seal). The
references skew cool-grey (ClickUp `#f7f8fa`); the warmth comes from *our*
canvas token, not from copying their grey. That swap is the only deliberate
divergence from the references and is recorded in P21 below.

---

## 3. Proposed token changes (`tailwind.config.js`)

Additive. Nothing existing is removed; the zero-radius / no-shadow **defaults
stay** so chrome is unaffected. New tokens are opt-in via the P21 card class.

```js
colors: {
  // ...existing ink / paper / wash / rule / muted / prose / seal unchanged...
  canvas: '#FAFAF7',   // NEW — warm off-white app background (OPEN: exact hex)
  // Optional: a warmer border for cards specifically.
  'rule-warm': '#ECEBE7', // NEW — softer/warmer than rule #E5E5E5 (OPEN: keep or drop)
},
borderRadius: {
  none: '0',
  DEFAULT: '0',        // default stays ZERO — chrome unaffected
  card: '8px',         // NEW — card surface only (OPEN: 6 / 8 / 10)
},
boxShadow: {
  none: 'none',
  DEFAULT: 'none',     // default stays NONE — chrome unaffected
  // NEW — card elevation only:
  card: '0 1px 2px rgba(24,24,24,0.04), 0 1px 3px rgba(24,24,24,0.06)',
  'card-hover': '0 2px 8px rgba(24,24,24,0.08)',
},
```

Body background moves `#FFFFFF` → `var canvas` in global CSS. Cards stay
`bg-paper` (`#FFFFFF`) so they read as lifted off the warm canvas.

---

## 4. P21 — Soft surface card (PROPOSED — to fold into `DESIGN.md`)

```markdown
## P21 — Soft surface card (workspace content)

Source: Basecamp + ClickUp Home + Frame via Mobbin (web, 2026-06-04).
Convergent soft-surface convention across three serious workspace apps.
Reference screen IDs: 993f2b31-f15e-4b20-b0bd-436ca38b96ec (Basecamp),
b843aaa3-9845-4b8b-b43b-6754f9ad8f6e (ClickUp), a3c75161-31e6-44f4-95b2-d9a96e136fe1 (Frame).

What we lift:
- Card geometry: white fill on a warm canvas, thin border, small radius, one low shadow.
- Generous internal padding (roomier than the dense P10/P16 surfaces).
- In-card header: bold title + optional eyebrow + optional top-right action link.
- Hover lifts the shadow one step.

Exact values (copy, do not approximate):
| Property        | Value                                   | Notes                                  |
|-----------------|-----------------------------------------|----------------------------------------|
| Canvas (page bg)| `bg-canvas` #FAFAF7                      | warm off-white — OPEN value            |
| Card fill       | `bg-paper` #FFFFFF                       | stays paper-white to lift off canvas   |
| Card border     | `border border-rule-warm`               | 1px; OPEN whether to warm the rule     |
| Card radius     | `rounded-card` 8px                      | card surface ONLY — OPEN 6/8/10        |
| Card shadow     | `shadow-card`                           | low two-layer; card surface ONLY       |
| Card hover      | `hover:shadow-card-hover`               | shadow lift only — no transform        |
| Card padding    | `p-5` (20px) compact / `p-6` (24px) roomy | OPEN which is default                 |
| Card title      | `text-sm font-semibold text-ink`        | reuse, do not restyle                  |
| Card eyebrow    | `.eyebrow` (existing)                    | optional, top of card                  |
| Action link     | `text-xs text-muted hover:text-ink`      | optional, top-right ("See all")        |

Where it lands: matter workspace content surfaces that group records into
panels — Documents groupings, Skills/Workflows catalogue cards, Record/Audit
summary panels, dashboard-style landings. NOT the rails, breadcrumb, dense
tables (P16), dense rows (P10), pills (P15), or buttons (P12) — those stay
square + shadowless.

Deliberate divergences from the reference:
- References use a cool-grey canvas (~#f7f8fa); we use a warm off-white
  (#FAFAF7) to carry the Redaction/oxblood brand. Geometry is lifted; the
  hue is ours.

Hard rules (carry the v0.4 discipline into the new primitive):
- Radius + shadow live on the card class ONLY. No rounded/shadowed chrome.
- No transform on hover — shadow lift only (keeps the v0.4 "hover is bg/elevation, never transform" spirit).
- Seal (#8B0000) stays sparing — never a card fill or border by default.
```

---

## 5. Open decisions for Andy (the variant knobs)

These are exactly what the parallel variant exploration should settle. Each is
a single value; pick from variants, then I fold v0.5 into `DESIGN.md` + config.

1. **Canvas hex.** `#FAFAF7` (warm paper) vs a touch warmer `#F8F7F4` / oatmeal. How warm before it reads "cream", not "professional"?
2. **Card radius.** `6px` (restrained) / `8px` (proposed) / `10px` (soft). 6 keeps it close to the printed-brief register; 10 leans consumer.
3. **Shadow weight.** The proposed two-layer is deliberately faint. Decide if cards should sit *barely* off the page or with a clearer lift.
4. **Warm the rule?** Keep `rule` #E5E5E5 on cards, or introduce `rule-warm` #ECEBE7 so borders match the warm canvas.
5. **Default padding.** `p-5` (20px) vs `p-6` (24px).
6. **Scope list — ratify §4 "Where it lands".** Confirm which surfaces become cards and which stay flat. This is the most important one: it's the fence that keeps soft from creeping.

---

## 6. What lands when ratified

1. Fold §3 token block into `tailwind.config.js`.
2. Add P21 (§4) to `DESIGN.md`, bump header to **v0.5**, add a "What changed
   in v0.5" block, and add dated supersession lines under the three hard rules
   in §1 (no-shadow / no-radius / paper-white) pointing at P21's scope.
3. Move the canvas background into global CSS.
4. Apply P21 to the ratified surface list — strict preservation, no creep.
5. Phase-4 fidelity audit: diff built cards against P21; reconcile.
