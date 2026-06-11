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
      colors: {
        ink: '#181818',
        paper: '#FFFFFF',
        wash: '#F4F4F4',
        rule: '#E5E5E5',
        muted: '#9CA3AF',
        prose: '#4B5563',
        // Tertiary accent — sealing wax. v0.5: verdicts, the seal/stamp,
        // privilege C_paused, audit blocked rows, CPR 31.22 flag,
        // destructive confirms. NEVER in workspace chrome (no nav accent,
        // no panel border), never a background, never on the brand mark.
        seal: '#8B0000',
        // v0.5 workspace register — neutral-grey floating-panel shell.
        // See docs/DESIGN.md P21. Used by the matter workspace only;
        // Landing/auth keep paper #FFFFFF.
        canvas: '#E8E8E8',
        panel: '#FAFAFA',
        'panel-hover': '#F3F3F3',
        'panel-sel': '#E6E6E6',
        'panel-2': '#F7F7F7',
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
