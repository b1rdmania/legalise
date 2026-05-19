/** @type {import('tailwindcss').Config} */
// Tokens mirror docs/DESIGN.md v0.3 (Document-as-product, Memo + Warp lift).
// Six named colour tokens, two fonts, three letter-spacing utilities, zero radius, zero shadow.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Hanken Grotesk"', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
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
  plugins: [],
};
