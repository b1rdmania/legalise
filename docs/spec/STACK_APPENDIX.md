# Frontend Stack Appendix

Tradeoffs only. Phase 14's first task is to confirm or override.

## The four candidates

| Stack | Bundle | Maturity | Ecosystem | Project fit |
| --- | --- | --- | --- | --- |
| Plain HTML + `fetch` | smallest (no framework) | n/a | n/a | works for <5 pages; this app has >12 routes |
| Vite + React | small | high | huge | consistent with Decipher / Firestar / Visible |
| SvelteKit | smaller bundle | medium | medium | less library reach than React |
| Next.js | largest | high | huge | SSR / RSC unused; overkill for SPA |

## Per-stack analysis

### Plain HTML + `fetch`

**Pros:** zero build step, smallest possible bundle, no framework drift, every page is independently understandable.

**Cons:** routing is hand-rolled, state management is hand-rolled, no component reuse for cross-page concerns (top nav, posture banner, reconstruction table). The reconstruction view alone needs pagination state + filter state + row-expansion state across hundreds of rows; that's where plain HTML + fetch falls over.

**Verdict:** insufficient. This app has too many cross-page concerns.

### Vite + React

**Pros:**
- Consistent with Andy's existing projects (Decipher / Firestar / Visible per memory).
- Mature ecosystem — pick a router (React Router or TanStack Router), pick a data-fetching library (TanStack Query is the obvious choice), pick a component primitive set (shadcn/ui or Radix Primitives).
- Hot-reload dev experience is good.
- SSR isn't needed — the SPA loads after auth; there's no SEO surface.
- Component library reach is huge if a real product surface needs e.g. a virtualised table for reconstruction.

**Cons:**
- React's per-render cost on a long reconstruction table needs memo discipline. Not a blocker; just a thing to know.
- Bundle is small for a single-tenant admin app but not the smallest of these candidates.

**Verdict:** the realistic recommendation. Phase 14 will likely confirm this.

### SvelteKit

**Pros:** smaller bundle than React; reactivity model is elegant; the build artifact can deploy as a SPA cleanly.

**Cons:**
- Less library ecosystem — a real component library is harder to assemble.
- Andy's other projects use React; cross-project skill transfer favours React.
- Phase 15+ may need libraries (markdown rendering, syntax highlighting for reconstruction payloads, etc.) that have first-class React support and second-class Svelte support.

**Verdict:** technically appealing, ecosystem-cost too high.

### Next.js

**Pros:** the most batteries-included framework — auth, routing, data fetching, SSR, RSC all in one box.

**Cons:**
- SSR/RSC features are wholly unused — the app is authenticated SPA.
- Larger bundle than Vite + React for what amounts to a single-tenant admin app.
- Tighter Vercel-deployment coupling than Phase 13's stack-agnostic posture wants.
- More moving parts than the spec needs.

**Verdict:** overkill. Use Vite + React instead.

## Recommendation

**Vite + React.** Confirms Phase 14's first task before any code lands. The reasons:

- Stack consistency with Andy's other projects (Decipher / Firestar / Visible).
- Library ecosystem reach for Phase 15+ features (TanStack Query for data fetching, TanStack Router or React Router for routing, shadcn/ui for component primitives, react-markdown + prism for reconstruction-row syntax highlighting).
- Avoids the SSR/RSC overhead of Next.js for an admin SPA that has no SEO surface.
- Avoids the ecosystem-cost of SvelteKit for a project where multi-project skill transfer matters.

## Open questions Phase 14 confirms

1. **Router** — React Router 6 vs TanStack Router. Pin one.
2. **Data fetching** — TanStack Query is the obvious choice; confirm.
3. **Component primitives** — shadcn/ui (copy-into-repo, owned components) vs Radix Primitives (low-level, builds your own) vs Mantine (fuller library).
4. **Forms** — react-hook-form vs Conform vs uncontrolled. Pin one.
5. **Styling** — Tailwind (consistent with Andy's projects) vs CSS modules vs vanilla-extract. Recommend Tailwind for consistency + brand-seal token inheritance.
6. **Test runner** — Vitest (in the unit/component layer) + Playwright (in the journey-acceptance layer). Recommend both.
7. **Build target** — single static SPA built to `frontend/dist/`, served by FastAPI's `StaticFiles` or by Cloudflare Pages. Phase 14 picks.

## What this appendix is NOT

- A stack lock. Phase 14 takes one pass through these questions, lands the decision, ships an ADR.
- A monorepo decision. The frontend lives at `frontend/` next to `backend/`. Phase 14 picks the workspace tooling (pnpm workspaces? Turborepo? plain dirs?).
- A deployment decision. The brand-seal handover already names Cloudflare Pages for the frontend (per `legalise-deploy.md` in memory). Phase 14 confirms.
