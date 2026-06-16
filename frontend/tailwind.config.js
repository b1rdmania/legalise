/** @type {import('tailwindcss').Config} */
// Tokens mirror docs/DESIGN.md v0.3 (Document-as-product, Memo + Warp lift).
// Six named colour tokens, Redaction-first type, three letter-spacing utilities, explicit radius/shadow tokens.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        // Redaction (clean base) is the site typeface. Bold + italic come from
        // the @font-face kit (public/fonts/redaction). Georgia is the serif
        // fallback so a font-swap flash doesn't jump to a sans.
        sans: ['"Redaction"', 'Georgia', '"Times New Roman"', 'serif'],
        // `mono` aliases Redaction. JetBrains Mono and the Hanken grotesk
        // (`ui`) were fully removed 2026-06-06 — everything is Redaction.
        mono: ['"Redaction"', 'Georgia', '"Times New Roman"', 'serif'],
        // Degraded grades for deliberate, large, rare moments (font-redaction20,
        // -35). Grit muddies small — keep these for hero titles / stamps, not body.
        // Only the grades the UI uses are declared in redaction.css; re-add an
        // alias + its @font-face block together if a new grade is needed.
        redaction20: ['"Redaction 20"', 'Georgia', 'serif'],
        redaction35: ['"Redaction 35"', 'Georgia', 'serif'],
      },
        // Almond & Ink — warm-neutral register palette, site-wide
        // (2026-06-16). Replaces the old cool-grey tokens; near-marble
        // paper, oxblood seal at ~10% chroma.
        colors: {
        ink: '#221E17',
        paper: '#F6F1E8',
        wash: '#EFE9DD',
        rule: '#E0D8C9',
        muted: '#8B8273',
        prose: '#564E42',
        // Tertiary accent — sealing wax. v0.5: verdicts, the seal/stamp,
        // privilege C_paused, audit blocked rows, CPR 31.22 flag,
        // destructive confirms. NEVER in workspace chrome (no nav accent,
        // no panel border), never a background, never on the brand mark.
        seal: '#7E2B22',
        // Warm-neutral floating-panel shell (Almond & Ink value ladder).
        canvas: '#E9E2D4',
        panel: '#F2ECE1',
        'panel-hover': '#E9E2D4',
        'panel-sel': '#E0D7C6',
        'panel-2': '#F2ECE1',
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
        DEFAULT: '0',        // default stays ZERO — pills/inputs/Landing unaffected
        panel: '18px',       // v0.5 — floating panel shell ONLY
        item: '8px',         // v0.5 — nav items / rows / buttons / inputs / chips
        card: '12px',        // softened content cards / boxes (no-hard-edges, 2026-06-05)
      },
      boxShadow: {
        none: 'none',
        DEFAULT: 'none',     // default stays NONE — chrome unaffected
        // v0.5 — panel shell + P21 cards ONLY:
        panel: '0 8px 32px rgba(0,0,0,0.03), 0 1px 2px rgba(0,0,0,0.01)',
        'panel-hover': '0 2px 8px rgba(0,0,0,0.08)',
      },
    },
  },
  plugins: [],
};
