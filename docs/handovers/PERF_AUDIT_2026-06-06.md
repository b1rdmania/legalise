# Performance audit — Legalise frontend (2026-06-06)

Goal: make first load feel near-instant. Status: **bundle audit done; live Core Web Vitals pending** (chrome-devtools MCP added, needs a session restart to run the trace against legalise.dev).

## Bundle audit (production build, this branch — `codex/chat-led-matter-shell`)

| Chunk | raw | gzip | Loads |
|---|---|---|---|
| `index-…js` (main app) | 1,355 kB | **386 kB** | **every page, first paint** ← the problem |
| `index-…js` (vendor) | 405 kB | 102 kB | first paint |
| `PdfDocumentViewer` | 469 kB | 139 kB | only on PDF view (split ✓) |
| `pdf.worker` | 1,244 kB | — | only on PDF view (split ✓) |
| `docx-preview` + `jszip` | 173 kB | 51 kB | only on docx (split ✓) |
| CSS | 42 kB | 8 kB | first paint (fine) |

**Headline:** ~490 kB gzipped JS parses before interactive. PDF/docx are correctly lazy-split, **but the document editor (Tiptap, 20+ extensions) + `DocumentRichEditor` (70K source) + `DocumentDetail` (98K) are in the MAIN bundle** — so chat, landing, and the matters list all pay for an editor they never use.

## Ranked wins
1. **Lazy-load the document-editor stack** (`React.lazy` the document route → Tiptap + `DocumentRichEditor` + `DocumentDetail` load only when a document is opened). Biggest win, est. **−150–200 kB gzip** off first load. *(frontend/components — Codex's lane.)*
2. **`manualChunks` vendor split** (`react`/`react-dom`, `@tanstack/*`, `@tiptap/*`) — Vite flagged the >500 kB chunk. Better caching + parallel fetch. *(vite.config — isolated, safe to do standalone.)*
3. **Lazy the demo** — `snapshot.ts` (46K) + `DemoMatter` (35K) only for `/demo`; don't ship demo data to real first load.
4. **Prune unused Redaction grades** — 21 `@font-face` / 1.1 MB; only grades 20/35 referenced. Drop unused grade declarations (10/50/70/100) from `public/fonts/redaction/redaction.css` to avoid accidental fetches. *(asset/CSS — isolated, safe to do standalone.)*
5. **PDF worker (1.2 MB)** is correctly lazy — confirm nothing preloads it.

**Target:** first-load (chat/landing/matters) from ~386 kB gzip → **~120–150 kB**, deferring editor/PDF/docx until a document is opened.

**Perceived speed (chat):** SSE-progress streaming (already the decided approach) covers this — responses feel instant even with multi-second model calls.

## Live Core Web Vitals — DONE (2026-06-06, prod / master, legalise.dev)

Cold load, Chrome DevTools trace, desktop, no throttling. CrUX field data: **n/a** (too little real-user traffic to report).

| Metric | Value | Rating |
|---|---|---|
| TTFB | 87 ms | ✅ good (Cloudflare LHR edge, brotli) |
| LCP | **312 ms** | ✅ good — TTFB 87 ms + render-delay 225 ms, ~0 ms resource load (LCP node is text, not an image) |
| CLS | **0.00** | ✅ good — no layout shift |
| FCP | ~310 ms | ✅ good |
| Render-blocking | 0 ms est. savings | ✅ nothing actionable on the critical path |
| INP | n/a | no interaction captured in the cold-load trace |

**Verdict: master first load is already excellent — the headline bundle problem is branch-only.** The entire LCP is render-delay (JS parse/exec), not network. Master ships the main bundle brotli-compressed from the Cloudflare LHR edge, and the heavy chunks are correctly lazy: the main bundle's `__vite__mapDeps` confirms `PdfDocumentViewer` + `jszip` are split out, so PDF/docx never touch first paint on prod.

### Two findings the live trace confirmed (both already in the ranked wins above)
1. **Redaction fonts fetch on the landing page.** First load pulls 4 woff2 (`Redaction-Regular`, `-Bold`, `Redaction_20-Bold`, `-Italic`) via `redaction.css`. Not blocking LCP (text LCP paints on fallback first), but it's bandwidth on every cold visit → **win #4 (prune unused grades)** is real and confirmed live.
2. **Two render-path third parties:** `fonts.googleapis.com` (Hanken Grotesk) and `unpkg.com/@lottiefiles/lottie-player@2.0.3`. Neither hurts the 312 ms LCP today, but the Lottie player loads from unpkg on the critical path — self-hosting it (consistent with the memory note to self-host Lottie JSON) removes a third-origin dependency. Low priority given current numbers.

### Caveat
These are lab numbers on an unthrottled desktop connection. The 225 ms render-delay scales with CPU and bundle size — so on a mid-tier mobile / slow CPU, **win #1 (lazy-load the editor stack on the branch build) is still the thing that matters** before that branch merges. Master is fast today *because* the editor-heavy reshape isn't on it yet.

## Implementation — DONE (2026-06-06, branch `codex/chat-led-matter-shell`)

All five wins applied. The editor/demo splits were done at the **router layer only** (`src/router/index.tsx`) via `React.lazy` + `Suspense` — `DocumentDetail.tsx` / `DemoMatter.tsx` themselves were not touched, so there's no collision with Codex's in-flight component work.

| # | Win | Change | Result |
|---|---|---|---|
| 1 | Lazy editor stack | `React.lazy` on `DocumentDetail` route | **611 kB / 183 kB gzip moved to an async chunk** — Tiptap + 18 extensions + ProseMirror now load only when a document is opened |
| 3 | Lazy demo | `React.lazy` on the 3 `/demo` routes (shared `DemoMatterPage`) | `DemoMatter` + snapshot → **60 kB / 16.7 kB gzip** async chunk |
| 2 | Vendor split | `manualChunks` in `vite.config.ts` (function form) | `react` 60.8 kB gzip + `tanstack` 28.7 kB gzip → own long-cached chunks; no empty-chunk warning |
| 4 | Prune Redaction grades | dropped grades 10/50/70/100 from `redaction.css` + the `redaction10` Tailwind alias; **deleted 12 unused woff2** (~700 kB off the deploy) | only base + 20 + 35 ship (9 files); the 4 live-fetched faces unchanged |
| 5 | PDF worker preload | verified | nothing preloads `pdf.worker` in `index.html` — no action needed |

### Measured first-paint JS (production build, this branch)
| | Audit baseline | After |
|---|---|---|
| First-paint gzip | 488 kB (386 main + 102 vendor) | **~287 kB** (entry 95.4 + vendor 101.9 + react 60.8 + tanstack 28.7) |

**−201 kB gzip / −41% off first load.** PDF (139 kB), docx (20.7 kB), editor (183 kB), demo (16.7 kB) are all confirmed async — none touch first paint.

### Verification
- `tsc --noEmit` clean.
- Build green (exit 0), no empty-chunk warning.
- Targeted tests pass: `src/router`, `src/demo`, document routing.
- The 3 failing tests in `DocumentDetail.test.tsx` (`signed output cites this file`) are **pre-existing on clean HEAD `92e23c0`** (stash-verified) — Codex's in-flight tool-loop work, unrelated to these changes.

### Open follow-up (not in the original 5)
There's still a ~404 kB / 102 kB-gzip shared vendor `index` chunk on first paint. Worth a future pass to see what's in it (markdown/highlight/date libs?) and whether any of it can be deferred — that's the path from ~287 kB toward the ~150 kB stretch target. Out of scope for this round.

---
*Report complete: bundle audit + live CWV + implementation all done. Changes are in the working tree, uncommitted — see `git status`.*
