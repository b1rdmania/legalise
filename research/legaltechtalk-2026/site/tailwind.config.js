/** @type {import('tailwindcss').Config} */
// Tokens lifted from the Legalise design system (Almond & Ink, v0.5):
// Redaction-first type, six warm-neutral colour tokens, sealing-wax accent,
// zero default radius. Kept in sync deliberately so the report reads as a
// Legalise artifact.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Redaction"', "Georgia", '"Times New Roman"', "serif"],
        mono: ['"Redaction"', "Georgia", '"Times New Roman"', "serif"],
        redaction20: ['"Redaction 20"', "Georgia", "serif"],
        redaction35: ['"Redaction 35"', "Georgia", "serif"],
      },
      colors: {
        ink: "#221E17",
        paper: "#F6F1E8",
        wash: "#EFE9DD",
        rule: "#E0D8C9",
        muted: "#8B8273",
        prose: "#564E42",
        seal: "#7E2B22",
        canvas: "#E9E2D4",
        panel: "#F2ECE1",
      },
      maxWidth: {
        page: "1100px",
      },
      letterSpacing: {
        tight2: "-0.02em",
        track1: "0.1em",
        track2: "0.2em",
      },
      borderRadius: {
        none: "0",
        DEFAULT: "0",
        card: "12px",
      },
    },
  },
  plugins: [],
};
