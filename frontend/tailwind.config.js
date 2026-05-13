/** @type {import('tailwindcss').Config} */
// Tokens mirror docs/DESIGN.md (Midnight Command Center, Oxide-derived).
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        carbon: "#0b0e12",
        graphite: "#1f2124",
        slate: "#303235",
        "dim-gray": "#434547",
        "steel-gray": "#5d5e61",
        "ash-gray": "#818284",
        "light-gray": "#a3a4a5",
        platinum: "#bababb",
        snow: "#dedede",
        "terminal-green": "#00d892",
        "deep-teal": "#002923",
        "emerald-shadow": "#005441",
        scrim: "#292929",
        "code-violet": "#c58aff",
        "code-red": "#ff6285",
        "code-error": "#9f3f53",
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['"Fira Code"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
      borderRadius: {
        DEFAULT: "1px",
      },
      boxShadow: {
        subtle: "oklab(0.77 -0.184187 0.0538599 / 0.15) 0px 0px 0px 1px inset",
        "subtle-2": "oklab(0.79 -0.000191013 -0.00108329 / 0.15) 0px 0px 0px 1px inset",
      },
    },
  },
  plugins: [],
};
