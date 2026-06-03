/** @type {import('tailwindcss').Config} */
// Tokens mirror docs/DESIGN.md v0.3 (Document-as-product, Memo + Warp lift).
// Six named colour tokens, two fonts, three letter-spacing utilities, zero radius, zero shadow.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        // Redaction (clean base) is the site typeface. Bold + italic come from
        // the @font-face kit (public/fonts/redaction). Georgia is the serif
        // fallback so a font-swap flash doesn't jump to a sans.
        sans: ['"Redaction"', 'Georgia', '"Times New Roman"', 'serif'],
        // `mono`/`sans` both map to Redaction during the restyle; `ui` kept on
        // the grotesk stack for dense-data carve-outs if legibility needs it.
        mono: ['"Redaction"', 'Georgia', '"Times New Roman"', 'serif'],
        ui: ['"Hanken Grotesk"', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
        // Degraded grades for deliberate, large, rare moments (font-redaction20,
        // -35). Grit muddies small — keep these for hero titles / stamps, not body.
        redaction10: ['"Redaction 10"', 'Georgia', 'serif'],
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
        // Tertiary accent — sealing wax. Used SPARINGLY: hero underline,
        // nav hover, privilege C_paused, audit blocked rows, chronology
        // CPR 31.22 flag, destructive confirms. Never as a background,
        // never on body prose, never on the brand mark.
        seal: '#8B0000',
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
  plugins: [],
};
