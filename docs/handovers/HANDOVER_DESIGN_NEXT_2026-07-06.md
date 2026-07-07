# Design/UX implementation plan — post-audit handover (2026-07-06)

For a build agent starting fresh. Context: a full design audit ran on 2026-07-06
(PR #263) and closed the correctness floor — contrast tokens, 390px overflow,
scroll restoration, project→matter copy, the Outputs rename, funnel routing,
doc-viewer chrome, touch targets. This document is the plan for what remains.
Everything here is speced to be executable without the audit session's context.

Work items are ranked. WI-1 is the only substantial build; the rest are small.
Do them as **one branch per work item, one PR each** unless told otherwise.

---

## 0. Operating rules (read before touching anything)

**Local stack.** `cd infra && docker compose up -d db redis minio backend worker frontend`.
Do NOT run the frontend with bare `npm run dev` — the Vite proxy targets
`http://backend:8000` (a Docker hostname) and every `/auth` + `/api` call will
500. The compose frontend serves on `localhost:3000`. Dev auto-verifies signup
(`auth.dev_autoverify` in backend logs) and the first registered user becomes
admin. A local account may already exist: `design-audit@example.com` /
`audit-pass-2026`, with the seeded Khan v Acme matter.

**Test discipline.** Run all test suites FOREGROUND (background suites wedge
agents — established fleet lesson). Frontend: `cd frontend && npx tsc --noEmit
&& npx vitest run` (fast, run the full suite). Backend: `cd backend &&
.venv/bin/python -m pytest tests/<file> -q` (the repo venv works; the docker
image has no pytest). Focused tests per sub-step, full suite before each commit.

**CI.** Push, then check the WHOLE board once (`gh pr checks <n>`) — backend
shards, e2e, frontend build, worker smoke, storage smoke, voice check. The e2e
suite signs in repeatedly; if you add rate-limited auth calls to tests, the
override pattern is `LEGALISE_RATE_LIMIT_LOGIN_PER_HOUR=0` in the e2e workflow
env (see PR #248's `6ebe1df` for precedent).

**Evidence discipline.** For anything visual: before/after screenshots at
1440, 834 and 390 via Playwright against the local stack, one revertible
commit per section-level change.

**Copy rules (founder-ratified, do not relitigate).**
- Register vocabulary (standing, admitted, ceremony, manifest, chain) is
  allowed where the user READS (ceremony, audit, My skills). It is banned
  where the user is STUCK (errors, settings, nudges) — there, write what
  happened + what to do next, no internal enums/ids.
- Vocabulary is "matter", never "project". The page under `/artifacts` is
  "Outputs" (it holds drafts AND signed outputs). Nav sections: Chat /
  Documents / Chronology / Skills / Outputs / Approvals / Activity.
- No em/en dashes in chrome strings — CI's "Voice check" fails the build.
- When copy feels wordy, delete sections, not adjectives.

**Design law (DESIGN.md was deleted in doc-cleanup; this is the living law —
the tokens carry inline comments explaining themselves).**
- Palette: Almond & Ink (`frontend/tailwind.config.js`): ink `#221E17`, paper
  `#F6F1E8`, wash `#EFE9DD`, rule `#E0D8C9`, muted `#6E6759` (≥4.5:1 on all
  surfaces — do not lighten), prose `#564E42`, seal `#7E2B22`, canvas/panel
  ladder for the floating-panel shell. NO cool greys (`text-gray-*` etc.), no
  greens/blues/ambers for emphasis — if you need a quiet highlight, use
  `bg-ink/[0.06]`; if you need a verdict, use seal.
- Seal is for verdicts only: refusals, blocked rows, CPR 31.22, destructive
  confirms, the stamp. NEVER nav accent, panel borders, backgrounds, or the
  brand mark.
- Type: everything is Redaction (serif). Grit grades (redaction20/35) only for
  rare large display moments. Eyebrows are 10px bold uppercase tracked.
- Geometry: radius/shadow live on the panel shell and content cards ONLY
  (`rounded-panel`/`rounded-card`/`rounded-item` tokens); pills, inputs,
  ledger rows stay square and flat. Hairline-ruled ledgers, not card grids.
- The ledger idiom is `LedgerLine` (`frontend/src/ui/certificate.tsx`) — index
  column, 0.18em label column, content, right meta. It wraps below `sm`; keep
  that behaviour if you touch it.
- Matter tabs share one header tier: `h1 text-lg font-semibold` + one-line
  `text-sm text-muted` description in a `mb-6` block. Display-size Redaction
  titles are reserved for workspace-level pages (Matters, Settings, Skill
  library, Demo).
- Small text links that must stay visually quiet get the `.hit` utility
  (`frontend/src/index.css`) — a pseudo-element tap-target extender, zero
  layout shift. Use it instead of padding when enlarging touch areas.
- Taste: restraint. No decorative motion, no gradients, no emoji, no new
  visual concepts. One discordant gesture already exists (seal + signature
  squiggle). If a surface feels cheap, first suspect competing weights or
  drifted spacing, not missing ornament.

---

## WI-1 — Chat turn control: Stop, then Regenerate

**Why.** Token streaming shipped in #262 (`model.delta` SSE → draft bubble).
A lawyer watching a wrong answer stream has no way to stop it, and no way to
re-roll a poor answer without retyping. This is the last first-class gap on
the launch-critical surface. Punch-list item #4's remainder.

**Where things are.**
- Client stream: `frontend/src/lib/api/assistant.ts:140`
  `postAssistantMessageStream(...)` — already accepts an `AbortSignal`
  (param at line ~143, passed to `apiFetch` at ~149). The signal is currently
  unused by callers.
- Consumer: `frontend/src/matter/tabs/AssistantTab.tsx` — `for await (const
  event of stream)` at ~line 420; the draft bubble accumulates `model.delta`
  text; the final persisted message arrives through the unchanged completion
  path (audit identity by construction — do not change that invariant).
- Backend: `backend/app/modules/assistant/pipeline.py` — streaming via
  `_EnvelopeContentStreamer`; the SSE endpoint is
  `POST /api/matters/{slug}/assistant/messages/stream`.
- Message actions row (Copy / Save as draft): `frontend/src/matter/MessageBubble.tsx`
  (~line 249 `linkCls`, actions container testid `message-actions`).

**Step 1 — investigate the load-bearing unknown (do this first).**
Determine what the backend does when the SSE client disconnects mid-stream:
does the turn still run to completion and persist (server-side generator
keeps executing), or is the pipeline coroutine cancelled (turn lost)?
Check FastAPI's disconnect behaviour for this endpoint + the #262 tests
(`backend/tests/test_assistant_streaming.py`). The answer picks the design:

- **Case A — server completes anyway (likely, and the better invariant):**
  Stop is purely client-side. Abort the fetch, keep the partial draft bubble
  with a quiet "Stopped — the full answer is still being recorded" line, and
  refresh the thread when the persisted message lands (poll the thread once
  after ~2s, or reuse the existing thread-refresh path). The audit chain
  stays exactly as today.
- **Case B — disconnect cancels the pipeline:** do NOT ship silent client
  abort (it would lose the user message + break the "every model call lands
  on the record" promise). Instead have Stop call abort AND rely on the
  existing failed-send recovery (composer restores the prompt — shipped in
  #248). Add a backend test pinning whatever persistence behaviour you ship.

**Step 2 — Stop UI.**
- While a stream is active, swap the composer's disabled Send for a `Stop`
  button (same geometry, bordered not dark; seal text is acceptable here — a
  stop is a small verdict). One `AbortController` per in-flight turn, held in
  a ref; abort on click, on thread switch, and on unmount.
- The draft bubble keeps its partial text until the refreshed thread replaces
  it (Case A) or the composer restores (Case B). No spinner theatre.
- Keyless/stub turns don't stream (they fall back silently) — Stop simply
  never appears for them. Guard on "stream active", not "request active".

**Step 3 — Regenerate.**
- Add `Regenerate` to the last assistant message's actions row in
  `MessageBubble.tsx`, next to Copy / Save as draft, same `linkCls` + `.hit`.
  Only on the LAST assistant message of the thread, only when no turn is in
  flight.
- Behaviour: resend the previous user message's content as a brand-new turn
  through the normal send path (streaming included). No special backend: each
  turn already gets its own audit rows; the record correctly shows both runs.
  Do not delete or hide the earlier answer — the record is append-only and
  the UI should match (the old turn stays in the transcript).
- Wire the same attach/skill context the original turn used if it's carried
  on the user message; if it isn't, plain content resend is acceptable v1 —
  note it in the PR.

**Tests.**
- Frontend (`AssistantTab.test.tsx` has streaming fixtures from #262): Stop
  mid-stream → fetch aborted, UI state per chosen case; Regenerate → second
  POST with identical content, appears as a new turn; Regenerate hidden while
  streaming; abort on unmount (no state-update-after-unmount warnings).
- Backend: only if Case B forces a persistence decision — pin it.

**Done when:** a streaming answer can be stopped within one frame of the
click; a completed answer can be regenerated without retyping; the audit
trail shows every model call including stopped/regenerated ones; full suites
green; live walk on the local stack with a real Anthropic key if available,
keyless otherwise (streaming needs a key — keyless falls back, so verify Stop
with the stub by adding a temporary artificial delay ONLY in a test, never in
shipped code).

---

## WI-2 — Mobile drawer: scrim, Escape, focus return

**Why.** The `md:hidden` nav drawer overlays content with no backdrop dim, no
Escape handling, and no focus management — the audit flagged it as the one
remaining keyboard/overlay gap. (Body scroll IS already locked while open —
`AppShell.tsx` ~line 91.)

**Where.** `frontend/src/app/AppShell.tsx` (drawer state, `Open menu` button
~line 149-156) and `frontend/src/ui/Drawer.tsx` (the public-pages drawer —
check whether it already has a scrim; apply the same treatment to both if
not).

**Spec.**
- Scrim: `fixed inset-0 bg-ink/20 z-<below drawer>` behind the panel, click
  closes. No blur, no transition longer than 150ms (restraint).
- Escape closes; focus moves to the first nav item on open and returns to the
  hamburger button on close. `role="dialog"` `aria-modal="true"` on the
  drawer container; the hamburger gets `aria-expanded`.
- Tab must not escape the drawer while open (a simple focus trap — first/last
  sentinel pattern is fine; no new dependency).

**Tests.** Component test: open → focus inside; Escape → closed + focus on
trigger; scrim click → closed. Screenshot at 390 with scrim visible.

**Done when:** keyboard-only users can open, navigate and leave the drawer;
the open drawer reads as a layer (scrim) instead of a slab beside live text.

---

## WI-3 — Chat empty state: give the void a spine

**Why.** A new thread at desktop is suggestion chips pinned top-left, a
composer at the bottom, and ~400px of dead panel between — no focal point
(audit finding, deferred as taste-level).

**Where.** `frontend/src/matter/tabs/AssistantTab.tsx` — the empty-thread
branch that renders the suggestion chips.

**Spec (restraint — this is composition, not content).**
- When the thread has zero messages, vertically centre a single block in the
  message area: the three suggestion chips (stacked, left-aligned, exactly as
  styled today) with one muted line above them: "Ask about the documents in
  this matter." Nothing else — no icon, no illustration, no card.
- The moment a first message exists, layout returns to today's flow. No
  animation on the transition.
- At `<md` keep the current top-anchored layout (small screens don't have a
  void to fill).

**Tests.** Existing AssistantTab tests must stay green (chips keep testids);
add one asserting the empty-state wrapper renders only when `messages.length
=== 0`. Screenshots 1440 + 390.

**Done when:** an empty chat reads as an invitation rather than an unfinished
page, and nothing else about the surface moved.

---

## WI-4 — InvocationRunner failure banners: plain-English pass (gated)

**Why.** Punch-list item #6, deliberately deferred: `capability_denied`,
`phase1_blocked` and `provider_upstream_error` banners still show diagnostic
codes. They were kept for the BYO-key eval audience; the founder's rule is
"plain them if beta testers trip on them." **Gate: only do this item if beta
feedback says testers hit these banners** — check with Andy first.

**Where.** `frontend/src/matter/InvocationRunner.tsx` — state kinds at ~lines
46-47, banner renders at ~lines 265 (`capability_denied`) and ~284
(`phase1_blocked`); the upstream-error parse at `AssistantTab.tsx` ~1455 is a
separate surface, same rule.

**Spec.** Follow the ratified boundary rule (§0 Copy rules): the user is
STUCK, so each banner becomes: what happened + what to do next, in UI words.
The diagnostic code moves to a collapsed "Details" disclosure (keep it
reachable — the eval audience reads it), and stays in logs untouched.
Suggested shapes:
- capability_denied → "This skill isn't allowed to do that in this matter.
  Open Skills to review what it can touch." + link to the Skills tab.
- phase1_blocked → "This request crossed the advice boundary, so Legalise
  stopped it before anything left the workspace. The refusal is on the
  record." + link to Activity.
- provider upstream → "The model provider returned an error. Nothing was
  recorded against the matter. Try again, or check your key in Settings."

**Done when:** each failure banner answers "what do I do now" in one read,
the code is still findable under Details, audit-page deep-links still work
(ReconstructionView's header comment lists which actions these banners cite —
keep the `?action=` links intact).

---

## WI-5 — Quick wins (bundle as one PR)

1. **PostureBanner role tokens (punch-list #7).**
   `frontend/src/matter/PostureBanner.tsx` renders role strings like
   `qualified_solicitor` verbatim (see the UX matrix comment at the top of
   the file). Map role tokens to display words ("qualified solicitor") in the
   banner copy ONLY when firm-role gates are enabled
   (`LEGALISE_FIRM_ROLE_GATES_ENABLED` — dormant on hosted, so this renders
   only in firm mode). Do not touch the substrate's role strings.
2. **skillDisplay ACRONYMS (punch-list #8).**
   `frontend/src/modules-v2/skillDisplay.ts` — extend the ACRONYMS list only
   if a specific catalogue name grates (current rule: NDA/GDPR/DPIA/CPR/EU/AI/
   PDF uppercase; Docx/Xlsx/Pptx sentence-case). One-line change + test.
3. **Matter-list mobile row order.** `LedgerLine` at `<sm` renders index/label
   → right-meta → title-last. It was shipped as acceptable; if Andy wants
   title-first, the fix is in `frontend/src/ui/certificate.tsx` — move the
   content span's `order-last` to the meta span instead, and re-screenshot
   /matters and /documents at 390. Ask before doing; do not silently reorder.

---

## Verification walk (run at the end of any WI)

Playwright against the local stack, 1440 + 390:
1. `/` → hero → demo section renders (video ≥sm, card <sm).
2. `/guided-demo` → click through all five acts → end CTA "Create a
   workspace →" present.
3. Sign in (`/auth/login`) → `/matters` (no h-scroll at 390) → open Khan →
   Chat: send keyless turn → honest extract, no dangling labels → Save as
   draft → Outputs shows "Draft from chat".
4. Documents → open the witness statement → one command row → back.
5. Activity → rows show "you", links top-right are quiet links.
6. Tab through the first screen of /matters — every stop has a visible ring.
7. `npx tsc --noEmit && npx vitest run` (frontend), targeted pytest
   (backend), push, check the whole CI board once.

## Out of scope — do not do

- No Model B / chat-dock restructure, no nav model changes, no new surfaces.
- No public-copy rewrites beyond what a WI names (launch week; positioning is
  Andy's).
- Do not resurrect DESIGN.md as a file without asking — the law lives in §0
  and in token comments; a stale duplicate is worse than none.
- Do not touch the audit-chain / completion-path invariants (#262): the
  persisted message must keep coming from the unchanged completion path.
- Do not add dependencies for any of this.
