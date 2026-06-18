# LegalTechTalk 2026 — The Teardown (microsite)

Static report microsite. React + Vite + Tailwind, styled with the Legalise
design system (Almond & Ink palette, Redaction serif) so it reads as a
Legalise artifact.

## Run
```bash
npm install
npm run dev      # local dev
npm run build    # -> dist/ (deploy to any static host)
npm run preview  # preview the build
```

## Content
- Scorecard data: `public/data/scorecard.json` (copied from the research
  dataset — the single source of truth for the screen).
- Page structure + framing: `src/App.tsx`, sections 01–05 mirror
  `../outputs/REPORT-STRUCTURE.md`. `[slot]` markers are where deeper dossier
  content gets written in.
- Design tokens: `tailwind.config.js` + `src/index.css`, lifted from the
  Legalise frontend.
