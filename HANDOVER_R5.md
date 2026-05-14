# Handover — Round 5 (Days 7 + 8)

R4 covered Days 5/6/9 plus the trust documentation workstream and
approved the Day 7/8 reorder. This round is the build that landed under
that reorder: **Day 7 (Letters)** and **Day 8 (Pre-Motion polish — SSE
streaming + PDF export).**

**Repo head:** the latest commit on `master` is this handover doc plus
the R5 fix commit that addresses the reviewer's P1/P2 findings.
**Last smoked code head (originally handed over):** `c0956b2` — that's
the runtime state the audit-row counts and §3 endpoint matrix below
describe. The fix commit on top adjusts the SSE C_paused row from
`http.post 200` to `http.post 409` (P1) and adds `envelope_hash` to the
PDF audit payload (P2). Any commit after `c0956b2` is either this
handover, a follow-up fix, or further documentation unless explicitly
called out.

2 feature commits + 1 fix commit. The original Day 7/8 build is ~1,070
lines of application code across 7 source files (1 backend module
added, 1 backend module touched, 2 frontend files touched). The fix
commit is ~25 lines in `pre_motion/router.py`.

---

## What I want from this round

1. **Audit-shape sign-off** on the two new endpoints:
   - `POST /pre-motion/run-stream` — SSE variant, identical audit rows
     to `/run`. Sub-question: does the background-task pattern preserve
     the audit invariant under client disconnect?
   - `POST /pre-motion/pdf` — single `module.pre_motion.pdf.exported`
     row per export. No `model.call` row (no LLM call). One row total.
2. **Two architectural deviations need explicit sign-off** before later
   surfaces lean on them — see §5.
3. **Spot-check the letters catalogue routing** against the matter_type
   string lifecycle (seed.py → matter create form → catalog.py). The
   eligibility sets are policy strings that nothing else enforces.

---

## 1. Commits in scope this round

| Hash | Day (BUILD_PLAN) | Contents | Reviewer smoked |
|---|---|---|---|
| `9ae46c8` | 7 | Letters module — catalog with matter-type routing, GET /letters/catalog + POST /letters/draft, frontend selector + draft view | not yet |
| `c0956b2` | 8 | Pre-Motion polish — SSE streaming pipeline + endpoint + frontend EventSource, PDF export via Gotenberg + frontend download | not yet |

Both commits AST-compile and the frontend typechecks clean
(`npx tsc --noEmit`). Live `docker compose up` smoke is the reviewer's
green-light gate this round — I did not bring the stack up in my
environment.

---

## 2. Source surface — new and changed files

### Backend

```
app/modules/letters/                  (NEW)
  __init__.py                         — module docstring
  catalog.py                          — LETTER_TYPES tuple is the single
                                        source of truth for letter-id →
                                        plugin/skill + matter-type eligibility.
                                        catalogue_for_matter_type(t),
                                        resolve(id, t), default_for(t).
  schemas.py                          — LetterCatalogueResponse,
                                        LetterDraftRequest, LetterDraftResponse
  router.py                           — GET  /letters/catalog (selector data)
                                        POST /letters/draft (resolve → bridge)

app/modules/pre_motion/
  pipeline.py                         (TOUCHED) — adds optional on_event
                                        async callback. _safe_emit wraps it
                                        with exception swallowing. Fired at
                                        stage.start / stage.end (× 4 stages)
                                        and run.complete. Audit semantics
                                        and per-stage commit cadence
                                        unchanged.
  router.py                           (TOUCHED) — adds POST /pre-motion/run-stream
                                        (StreamingResponse, text/event-stream,
                                        asyncio.Queue bridge, background task
                                        with its own DB session) and
                                        POST /pre-motion/pdf (envelope-POST).
  pdf.py                              (NEW) — _render_html() builds a
                                        print-shaped Oxide-light document;
                                        render_pre_motion_pdf() POSTs it to
                                        Gotenberg /forms/chromium/convert/html
                                        with a 60s timeout.

app/main.py                           (TOUCHED) — letters_router mounted
                                        at /api/matters alongside the
                                        existing four routers.
```

### Frontend

```
src/lib/api.ts                        (TOUCHED) — adds:
  - LetterCatalogue / LetterType / LetterDraft types
  - getLetterCatalogue(slug), draftLetter(slug, id, inputs)
  - PreMotionStreamEvent discriminated union
  - runPreMotionStream(slug, inputs) async generator that parses
    text/event-stream frames into typed events
  - exportPreMotionPdf(slug, result): Promise<Blob>

src/App.tsx                           (TOUCHED) — Letters section between
                                        Pre-Motion and Chronology with
                                        LetterSelector + LetterDraftView.
                                        PremotionRunning replaced with
                                        PremotionStageStrip that updates
                                        live (pending → running → done/error
                                        per stage). EXPORT PDF → button on
                                        result card.
```

No migrations. No new tables. No schema changes.

---

## 3. Validation status

| Endpoint | Behaviour I expect (please confirm under live smoke) |
|---|---|
| `GET /api/matters/{slug}/letters/catalog` | ET matter returns 6 types, default=lba; civil matter returns 2 types, default=lbc; unknown matter_type returns 0 types |
| `POST /api/matters/{slug}/letters/draft` (lba on ET matter) | 200, draft_markdown populated, 3 audit rows: `plugin.invoked` + `model.call` + `http.post` |
| `POST .../letters/draft` (lbc on ET matter) | 400, body says "letter type 'lbc' is not available for matter type 'employment_tribunal'" |
| `POST .../letters/draft` on C_paused matter | 409, 1 audit row (middleware http.post) — same shape as `/invoke` and `/pre-motion/run` under C_paused |
| `POST .../pre-motion/run-stream` (A_cleared or B_mixed) | text/event-stream; frames in order `stage.start optimistic` → `stage.end optimistic` → `stage.start evidence` → `stage.end evidence` → `stage.start premortem` → `stage.end premortem` → `stage.start synthesis` → `stage.end synthesis` → `result` → stream closes. 12 audit rows identical to `/run`. |
| `POST .../pre-motion/run-stream` then disconnect mid-stream | Pipeline keeps running, audit rows for completed model calls land, no error logged at server |
| `POST .../pre-motion/run-stream` on C_paused (post-P1-fix) | HTTP returns 409 before the SSE channel opens — no stream frames. **1 audit row** (middleware `http.post 409`). No `module.pre_motion.run.start` row — matches `/run` exactly. (Pre-fix behaviour at `c0956b2`: 200 + SSE error frame, which produced an `http.post 200` row reading "successful request" for a blocked attempt.) |
| `POST .../pre-motion/pdf` with valid envelope | 200, application/pdf body, 1 audit row `module.pre_motion.pdf.exported` |
| `POST .../pre-motion/pdf` with mismatched matter_slug in body | 400 |
| `POST .../pre-motion/pdf` with Gotenberg down | 502 |

---

## 4. Audit-shape invariants (please re-derive and confirm)

The audit-row contract I'm holding for the new surfaces:

**Letters draft (`POST /letters/draft`)** — same shape as `/invoke`:
- middleware `http.post` (1)
- bridge `plugin.invoked` (1)
- gateway `model.call` (1)
- **Total: 3 rows per draft**

**Pre-Motion SSE (`POST /pre-motion/run-stream`)** — same shape as `/run`:
- middleware `http.post` (1)
- pipeline `module.pre_motion.run.start` (1)
- 9 × `model.call` (one per agent call)
- pipeline `module.pre_motion.run.complete` (1)
- **Total: 12 rows per run**

**Pre-Motion PDF (`POST /pre-motion/pdf`)** — no LLM call:
- middleware `http.post` (1)
- module `module.pre_motion.pdf.exported` (1)
- **Total: 2 rows per export**

**Blocked variants:**
- Letters draft on C_paused → 1 row (http.post 409 from gateway raise)
- SSE on C_paused → 1 row (`http.post 409` raised in the route handler
  preflight before `StreamingResponse` opens — semantically identical
  to `/run` C_paused. Reviewer caught this in R5 as P1; fix landed in
  the on-top commit.)
- PDF — no posture gate (no LLM call). C_paused matters can still export
  a prior run's envelope. **Question for reviewer:** is this the right
  call? My read is yes — PDF is data-extraction over a result that was
  already cleared through posture at run time, so re-gating would be
  belt-and-braces. But worth a sign-off.

---

## 5. Architectural deviations — explicit sign-off needed

### 5a. Matter-type policy strings unenforced (Day 7)

`backend/app/modules/letters/catalog.py` declares:

```python
EMPLOYMENT_MATTER_TYPES = frozenset({"employment_tribunal", "unfair_dismissal", ...})
CIVIL_MATTER_TYPES      = frozenset({"civil_litigation", "professional_negligence", ...})
```

These are the policy lists driving letter-type eligibility. Nothing else
in the codebase enforces these strings — `seed.py` writes
`matter_type="employment_tribunal"` as a free-form `String(64)` column,
and matter creation accepts arbitrary strings.

**Failure mode if they diverge:** `GET /letters/catalog` returns an
empty list, `POST /letters/draft` returns 400. No data loss, no audit
gap, no privacy impact — but a silent UX downgrade.

**Options the reviewer should pick from:**
1. **Accept as-is.** Small surface, fix is a one-line catalog edit, no
   migration required.
2. **Lift to an enum.** Convert `Matter.matter_type` to a Postgres enum
   and add a matching Python `MatterType` enum used everywhere. Requires
   a migration; harder to extend at runtime.
3. **Add a registry check at matter-create time** that warns (not
   blocks) on unknown matter types. Cheap but adds policy surface.

My recommendation: **option 1 for v0.1**, revisit at v0.2 when adding
WorkOS auth and other matter types ship.

### 5b. PDF export via envelope-POST, not run-id (Day 8)

BUILD_PLAN Day 8 spec said:
> Endpoint: `POST /api/matters/{slug}/pre-motion/runs/{run_id}/pdf`

I shipped:
> Endpoint: `POST /api/matters/{slug}/pre-motion/pdf` (envelope in body)

**Why I deviated:** the `{run_id}` shape implies a persisted
`PreMotionRun` row. v0.1 has no such table. Adding one means:
- new SQLAlchemy model
- new Alembic migration
- new lifecycle decisions (when to expire? row size? envelope JSON in
  one column or fully normalised?)
- new endpoints to list/fetch prior runs (or the UI can't address them)

None of that is in BUILD_PLAN's v0.1 scope. The envelope-POST shape
sidesteps it entirely — the frontend already holds the envelope in
memory from `/run` or the SSE `result` frame, so it can POST it back
when the user clicks EXPORT.

**Forensic visibility:** the `module.pre_motion.pdf.exported` audit
row records matter, actor, byte size, verdict, total_token_count,
**envelope_hash (sha256 of the serialised result envelope)**, and
timestamp. So "did anyone export this matter's brief?" is answerable
from the audit log without a runs table, and "was this PDF rendered
from a real run envelope?" reduces to a hash comparison against runs
that touched the model — same envelope hash means same logical run.
(R5 P2: reviewer flagged the missing hash; fix in the on-top commit.)

**Trade-off:** a user can synthesise a fake envelope and POST it for
rendering. Since the renderer is read-only HTML→PDF over the envelope
fields and never reads matter state for the body (only `matter.title`
and `matter.matter_type` for the header), the worst case is "a user
exports a PDF that doesn't match a real run". That's an audit-trail
weakness but not a data-leak weakness, and persisted runs would not
fully solve it without server-side render-of-record.

**Reviewer call:** accept the deviation, or do you want me to add the
`PreMotionRun` table now? If yes, v0.2-grade or quick JSONB blob?

### 5c. SSE channel is UI-only, audit-independent (Day 8)

The pipeline's `on_event` callback is **never load-bearing**:
- Callback errors are caught and swallowed (`_safe_emit`)
- The pipeline owns its own DB session inside the background task
- Client disconnect does not cancel the task — audit rows still land

This is by design and the canonical statement is in
`pipeline.py:run_pre_motion` docstring. The reviewer should explicitly
sign off on this discipline because future modules with streaming
surfaces will lean on the same pattern.

**Specific attack the reviewer should run:** start a stream, kill the
client mid-Stage-3, hit `GET /audit` 60s later. Expect: 12 rows.

---

## 6. Risk register refresh

### Resolved since R4
- ~~Letters skill prompt might need a matter-context shim~~ —
  Pre-Day-7 smoke confirmed `cpr-letter-drafter` is civil-only and the
  ET equivalent is `uk-employment-legal/lba-drafter`. Caught the
  routing requirement before UI shipped. Catalogue is the shim.
- ~~SSE Fly HTTP/2 risk~~ — landed cleanly with `X-Accel-Buffering: no`
  and `Cache-Control: no-cache`. Awaits real Fly smoke at Day 15.

### Still live
- **Demo without ANTHROPIC_API_KEY shows borderline-only Pre-Motion
  output.** Unchanged from R4. Action item carried.
- **No tests committed.** Carried — Day 16.

### Newly identified
- **Matter-type string policy** — see §5a. Reviewer call.
- **PDF render-of-record gap** — see §5b. Reviewer call.
- **Gotenberg dependency in compose, not in live deploy plan.** Day 15
  deploy hits Cloudflare/Fly. Gotenberg image will need either a
  sidecar Fly app or a switch to a hosted PDF API. Action: confirm
  Gotenberg lives in self-host stack only and live demo gets a
  different path (or: live demo has Gotenberg sidecar). Decide before
  Day 15.

---

## 7. Remaining days

R4 estimate held: 8–10 working days to launch.

| Day | Workstream | Estimate | Notes |
|---|---|---|---|
| 10 | Module tabs (Contract Review v0.2 label, nav polish) | 0.5 day | Mostly UI plumbing |
| 11-12 | Integration polish (loading/error/empty states) | 1–2 days | Includes Gotenberg path decision |
| 13-14 | Demo flow + dry runs | 1 day | |
| 15 | Live deploy (Fly + Neon + CF) | 0.5–1 day | Gotenberg decision blocks |
| 16 | Evals | 0.5 day | |
| 17 | README + launch assets | 0.5 day | |
| 18 | Launch | live day | |

Days 7 and 8 came in on estimate (0.5–1 day each).

---

## 8. What to attack before Day 10 begins

1. **Letters routing under unknown matter_type.** Create a matter with
   `matter_type="something_weird"`. Confirm `/letters/catalog` returns
   `{matter_type: "something_weird", letter_types: []}` (200, empty
   list) and the UI shows the empty-state message. **Not** a 500.

2. **Letters draft routing rejection.** Send `POST /letters/draft` with
   `{"letter_type": "lbc"}` against the seeded Khan matter (ET). Expect
   400 with the "is not available for matter type 'employment_tribunal'"
   message and **zero** semantic audit rows (only the middleware
   http.post 400 row).

3. **SSE disconnect invariant.** Start a stream, kill the client at
   Stage 3, wait 60s, confirm full 12 audit rows landed. This is the
   load-bearing claim in §5c.

4. **PDF cross-matter forgery.** POST a valid envelope for matter A to
   `/api/matters/{slug=B}/pre-motion/pdf`. Expect 400 (matter_slug
   mismatch check in router).

5. **Letters audit trail readable.** After a successful draft, the
   audit log should show `plugin.invoked` with payload
   `{"plugin": "uk-employment-legal", "skill": "lba-drafter", ...}`.
   Confirm the catalogue id (`"lba"`) is not what gets recorded — the
   plugin/skill resolution is the canonical audited fact.

---

## 9. Sign-off ask

Three yes/nos:

- **Audit shape accepted** for `/letters/draft` (3 rows),
  `/pre-motion/run-stream` (12 rows, same as `/run`, 1 on C_paused), and
  `/pre-motion/pdf` (2 rows)?
- **Architectural deviation 5a (matter-type strings)** — accept option
  1 (as-is) for v0.1?
- **Architectural deviation 5b (envelope-POST PDF)** — accept the
  deviation from BUILD_PLAN spec, defer `PreMotionRun` table to v0.2?

If all three yes, I roll into Day 10. If any is no, name the change and
I'll address before Day 10 lands.
