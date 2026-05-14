# Handover — Round 6 (Days 10, 11–12, 13–14)

R5 closed at `ee78cb9` with all three yes/nos signed off (audit shapes,
matter-type strings, envelope-POST PDF). This round is the frontend
hardening + demo flow that landed on top:

- **Day 10** — Contract Review v0.2 roadmap section
- **Days 11–12** — Integration polish (ErrorCallout, LoadingLine) +
  Gotenberg-on-live-deploy decision
- **Days 13–14** — Demo flow (landing page at `#/`, demo button,
  nav polish)

**Repo head:** the latest commit on `master` is this handover doc.
**Last smoked code head (originally handed over):** `2724932` — that's
the runtime state the audit-row counts, endpoint matrix and §3
expectations below describe. Any later commit is documentation-only
unless explicitly called out.

3 feature commits, ~310 lines of frontend code plus ~50 lines of deploy
documentation. No backend changes. No migrations.

---

## What I want from this round

1. **Sign-off on the `parseError` regex** in `ErrorCallout`. It parses
   the shape `Error: <status> <statusText>: <body>` that `api.ts`
   throws, with a fallback for non-matching shapes (network errors,
   TypeError). Risk: if backend ever changes the error envelope, the
   regex degrades silently to raw-message display.
2. **Architectural sign-off on the Gotenberg sidecar Fly app plan**.
   Documentation-only at this stage; runtime evidence arrives at Day 15.
   I want the plan reviewed *before* the deploy so we don't relitigate
   under deploy pressure.
3. **Landing-page copy honesty check.** v0.1 ships matter spine,
   Pre-Motion, Letters, Chronology+gate, audit, plugin bridge. The
   four SurfaceCards plus the hero paragraph plus the trust paragraph
   describe exactly that set. Confirm no overclaim sneaked in.
4. **Route refactor — no dead links.** Cancel/back/breadcrumb/empty-state
   links retargeted to `#/matters`; `#/` now routes to Landing. I want
   a click-through to confirm nothing 404s into the dispatcher default.

---

## 1. Commits in scope this round

| Hash | Day (BUILD_PLAN) | Contents | Reviewer smoked |
|---|---|---|---|
| `05bbad0` | 10 | Contract Review v0.2 roadmap section on matter detail — visible-but-not-active, four-agent pipeline (Parser → Analyst → Redliner → Summariser) graduates from counsel-mvp onto `app.core.api` at v0.2 | not yet |
| `7659514` | 11–12 | Integration polish — `ErrorCallout` parses backend error strings into status chip + plain-language body, replaces 6 raw `String(err)` `<pre>` dumps; `LoadingLine` replaces bare "loading…" text. Gotenberg-on-live-deploy decided: Fly sidecar app in `lhr` with auto-stop, documented in `infra/deploy/cloudflare.md` §5b | not yet |
| `2724932` | 13–14 | Demo flow — `Landing` component at `#/` with hero copy + OPEN DEMO MATTER button resolving the Khan slug via `listMatters()` + four SurfaceCards summarising v0.1. `Route` gains "landing" variant. TopBar brand crumb contextual (`legalise / <surface>`); `NavLink` highlights active surface | not yet |

All three commits AST-compile and the frontend typechecks clean
(`npx tsc --noEmit`).

---

## 2. Source surface — new and changed files

### Frontend

```
src/lib/route.ts                      (TOUCHED) — Route gains "landing"
                                       variant. parseHash:
                                         #/ → landing
                                         #/matters → list
                                         everything else unchanged
                                       Fall-through is "landing", not
                                       "list" — keeps a typo from
                                       silently landing on the matter
                                       index.

src/App.tsx                           (TOUCHED across three commits)
                                       Day 10:
                                         + Contract Review v0.2 section
                                           between Chronology and Audit
                                       Days 11–12:
                                         + ErrorCallout component +
                                           parseError() helper
                                         + LoadingLine component
                                         ~ 6 raw <pre>{error}</pre>
                                           replaced; 5 bare "loading…"
                                           replaced
                                       Days 13–14:
                                         + Landing component + SurfaceCard
                                         + NavLink component
                                         ~ TopBar takes a Route prop;
                                           brand crumb contextual;
                                           NavLink highlights active
                                         ~ Cancel-on-new → #/matters
                                         ~ Back-on-error → #/matters
                                         + App dispatcher gains landing case
```

### Infra / docs

```
infra/deploy/cloudflare.md            (TOUCHED) — new §5b "Gotenberg
                                       sidecar — Fly.io lhr" documents
                                       the deploy pattern: second Fly
                                       app running gotenberg/gotenberg:8,
                                       auto_stop_machines = true, reached
                                       over Fly's *.internal 6PN network.
                                       Includes fly.toml inline + the
                                       backend's `fly secrets set
                                       GOTENBERG_URL=...` command. No
                                       code change — backend already
                                       reads gotenberg_url from settings.

HANDOVER_R6.md                        (NEW) — this file.
```

No backend changes. No model changes. No schema changes. No migrations.

---

## 3. Validation status — endpoint matrix unchanged

All R5 endpoint-shape claims still hold at `2724932`. The audit-row
invariants are unchanged (3 / 12 / 2 rows for Letters / SSE / PDF, with
the C_paused fast-fail variants on the first two).

What this round adds is a frontend-only set of expectations:

| Surface | Behaviour I expect (please confirm under live smoke) |
|---|---|
| `GET /` (landing) | Renders hero + 4 SurfaceCards + trust paragraph. `OPEN DEMO MATTER →` resolves Khan slug from `listMatters()` and navigates to `/matters/khan-v-acme-trading-2026`. While `listMatters()` is in-flight the button reads `LOADING DEMO…` and is disabled. |
| Empty workspace | Button falls back to the first matter; if zero matters, button stays disabled. No crash. |
| Landing with backend down | Hero still renders; `OPEN DEMO MATTER →` stays disabled; `ErrorCallout` renders the failure inline below the CTA row. |
| Navigation back from a matter | Brand crumb reads `legalise / matters / khan-v-acme-trading-2026`; clicking brand goes to landing; `NavLink` "Matters" highlights green on `#/matters` and `#/matters/<slug>`. |
| Cancel from new-matter form | Navigates to `#/matters`, not `#/`. |
| Back from matter-detail error state | Same — `#/matters`. |
| Contract Review section | Renders between Chronology and Audit on matter detail. v0.2 badge top-right. Four-agent roadmap echoed as terminal output. No buttons. |
| `ErrorCallout` on a backend 400 | Top chip reads `error · http 400`; body reads the unwrapped `detail` field if the response body was JSON. |
| `ErrorCallout` on a network drop (TypeError) | Top chip reads `error`; no status; body is the raw message. No crash. |
| `LoadingLine` everywhere | Five sites: matter detail load, documents, letter catalogue, chronology, audit. Each renders `⟳ loading X` with a blinking emerald cursor. |

---

## 4. Architectural decisions — explicit sign-off needed

### 4a. ErrorCallout regex tightly couples to api.ts error shape

`parseError(err)` matches:

```regex
/^Error:\s*(\d{3})\s+([^:]+):\s*(.*)$/s
```

This is the literal shape thrown by `api.ts:jsonOrThrow`:

```typescript
throw new Error(`${res.status} ${res.statusText}: ${text}`);
```

If anyone changes that throw site without updating `parseError`, the
regex falls through and the user sees `<status> <statusText>: <body>`
as a plain string with no status chip. The fallback is graceful (no
crash; legible text) but the visual contract degrades.

**Three options:**
1. **Accept as-is.** Coupling is local, easy to spot in review.
2. **Throw a structured error.** Define `class ApiError extends Error
   { status; body }` in `api.ts`, throw instances of it, have
   `ErrorCallout` accept `Error | ApiError`. Cleaner contract, more
   code.
3. **Encode the status into the error name field** instead of the
   message. Brittle differently.

My recommendation: **option 1** for v0.1. Three sites in `api.ts`
share this throw, all centralised in `jsonOrThrow`. Option 2 is the
right v0.2 cleanup when other parts of the frontend start needing
machine-readable error info (e.g. for retry logic on idempotent calls).

### 4b. Gotenberg sidecar deploy plan — documentation-only, no runtime evidence yet

R5 §6 surfaced Gotenberg as the deploy-blocker for Day 15. R6 documents
the decision in `infra/deploy/cloudflare.md` §5b: **second Fly app in
`lhr`** running the official `gotenberg/gotenberg:8` image, reached
over Fly's `*.internal` 6PN network, with `auto_stop_machines = true`
so the cost is near-zero when nobody's exporting.

**Three alternatives considered and rejected:**

1. **Hosted PDF API (Browserless, Doppio, etc.)** — adds a vendor
   relationship, an extra egress path for matter content, and a
   second residency story to defend. Rejected.
2. **Backend renders PDFs in-process** (e.g. weasyprint or playwright
   in the FastAPI container) — bloats the backend image, makes deploy
   memory characteristics less predictable, harder to swap out.
   Rejected.
3. **Strip PDF from live demo** — degrades the demo experience; PDF
   is in the BUILD_PLAN v0.1 scope. Rejected for the launch path,
   kept as the fallback if the sidecar is yellow on demo day.

**Trade-offs the sidecar carries:**

- Cold-start latency on the first PDF after auto-stop (1–3s).
  Acceptable for a demo surface; not acceptable for a high-throughput
  product surface — v0.2 sets `min_machines_running` if PDF becomes
  load-bearing.
- Inter-app traffic crosses Fly's internal network. No public ingress
  on the Gotenberg app, no auth wrapper. Threat model: anyone with Fly
  organisation access can reach Gotenberg. For v0.1 that's the same
  trust boundary as the database.
- Second app to monitor — health and uptime split across two Fly apps.

**Reviewer call:** accept the plan as documented, defer runtime
validation to Day 15 deploy smoke? If yes, R7 will carry the deploy
log evidence; if no, name the alternative.

### 4c. Routing fall-through changed from "list" to "landing"

`parseHash` previously returned `{ name: "list" }` for unrecognised
hashes; now returns `{ name: "landing" }`. This means a stale link or
typo lands on the marketing-shaped home page rather than the matters
index.

**Trade-off:** typo `#/mattes/khan` now goes to the landing page, not
to the matters list. For a public demo that's the safer default —
landing has the "OPEN DEMO MATTER →" CTA so the user is one click from
where they probably meant to go. For an internal tool I'd argue the
other way.

**Accept as-is** unless reviewer disagrees.

---

## 5. Risk register refresh

### Resolved since R5
- ~~Gotenberg-on-live-deploy decision blocks Day 15~~ — decided and
  documented in `infra/deploy/cloudflare.md` §5b. Awaits runtime
  validation at Day 15.
- ~~Raw `String(err)` dumps scattered across module surfaces~~ —
  consolidated to `ErrorCallout`.
- ~~Bare `loading…` text inconsistent across modules~~ — consolidated
  to `LoadingLine`.

### Still live
- **Demo without `ANTHROPIC_API_KEY` shows borderline-only Pre-Motion
  output.** Carried — Day 15 deploy needs a real key.
- **No tests committed.** Carried — Day 16 evals.

### Newly identified
- **Landing depends on `listMatters()` succeeding for the demo CTA.**
  If the backend is down at landing time, the button never enables.
  `ErrorCallout` renders the failure inline so the user knows why, but
  the experience is "broken-looking" until the backend recovers.
  Acceptable for v0.1 (the demo is a backend showcase, so a dead
  backend should look dead).
- **Gotenberg cold-start adds 1–3s to first PDF export after idle.**
  Documented as acceptable for a demo surface; revisit at v0.2 if PDF
  becomes load-bearing.
- **Brand-crumb truncation** — at 40ch the matter slug
  `khan-v-acme-trading-2026` fits (24 chars). A slug longer than ~40
  chars truncates with no ellipsis tooltip. Edge case; revisit if it
  shows up in real demos.

---

## 6. Remaining days

| Day | Workstream | Estimate | Notes |
|---|---|---|---|
| 15 | Live deploy (Fly + Neon + CF + Gotenberg sidecar) | 0.5–1 day | Carries the only architectural runtime risk left |
| 16 | Evals (sample-matter smoke) | 0.5 day | |
| 17 | README + launch assets | 0.5 day | Plain-English is stretch only if Day 16 green |
| 18 | Launch | live day | HN Tuesday |

**3.5–4 working days to launch.** Days 7–14 came in on the R4 estimate
of "1 day each" for the build days. No slip surfaced.

---

## 7. What to attack before Day 15 begins

1. **Click-through the landing CTA.** Fresh browser, navigate to
   `#/`, click `OPEN DEMO MATTER →`. Expect to land on
   `#/matters/khan-v-acme-trading-2026`. Confirm `listMatters()` ran
   exactly once.

2. **`parseError` regex on real backend errors.** Trigger a 400 by
   posting an invalid letter type. Trigger a 409 by sending a draft
   to a C_paused matter. Trigger a 503 by `docker compose stop
   ollama` (won't help — the stub provider is always available, so
   pick a different vector: `docker compose stop backend` to force a
   network drop and confirm the `TypeError` fallback path). Three
   shapes expected: status chip + body; status chip + body; no chip
   + raw message.

3. **Route fall-through.** Visit `#/mattes` (typo), `#/random/nonsense`,
   `#/matters/`. All should land on landing or list, never blank
   white.

4. **Contract Review section copy.** Confirm "graduates from
   counsel-mvp onto `app.core.api` at v0.2" is honest — the agents
   exist in `counsel-mvp/backend/app/agents/` and would need
   re-wiring against the platform SDK; no v0.1 implementation hidden
   behind a feature flag.

5. **Trust-paragraph link target.** `docs/TRUST.md` link in the
   landing trust paragraph — confirm it resolves to the canonical
   trust doc on GitHub, not a stale path.

6. **Gotenberg sidecar plan reading.** Read
   `infra/deploy/cloudflare.md` §5b end-to-end; confirm the
   `fly.toml` block is syntactically valid (no inline mistakes) and
   that the GOTENBERG_URL pattern (`http://legalise-gotenberg.internal:3000`)
   matches Fly's documented 6PN naming.

---

## 8. Sign-off ask

Three yes/nos:

- **`ErrorCallout` regex coupling (4a)** — accept option 1
  (as-is for v0.1), defer structured `ApiError` to v0.2?
- **Gotenberg sidecar plan (4b)** — accept as documented, defer
  runtime validation to Day 15 deploy smoke?
- **Landing-page narrative + route fall-through (4c)** — accept,
  no overclaim, no dead links?

If all three yes, I roll into Day 15. If any is no, name the change
and I'll address before deploy lands.
