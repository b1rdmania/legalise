# Handover — Legalise v0.2 substance + JOY pass

**For:** the reviewer agent (and Andy for context).
**As of:** 2026-05-19 evening. Master on `4e15fd8`.
**Scope:** everything that landed since the reviewer's backend scoping verdict and the "v0.1 truthfulness vs v0.2 substance" framing message. Read in order; sections are short.

---

## 1. TL;DR

Four backend endpoints from the reviewer-locked spec all SHIPPED. The
`JOY.md` doctrine doc was added (reviewer's suggestion) and then
actioned end-to-end: Matter Pulse + Suggested Actions + Audit
Confirmation on the Assistant landing, anti-pattern sweep across the
rest of the product. README still claims 121 tests; current count is
138 collected, all passing.

Andy diverged from the reviewer's "v0.1 truthfulness first, v0.2
substance later" sequence. The substance landed first because most of
the truthfulness concerns (fake catalogue data, fake workflow state,
broken delete-account button, hardcoded plan badge) were the four
endpoints anyway — fixing them properly was cheaper than a
hide-then-rebuild pass.

What the reviewer needs to sign off:
1. The four endpoint implementations against the locked spec.
2. The JOY pass: did Matter Pulse / Suggested Actions / Audit
   Confirmation read as the patterns they intended, or did the
   implementation drift?
3. Known open items in §5 — soft-delete actor anonymisation, demo
   workflow count hardcode, dead chronology source-link TODO.

---

## 2. Status

- Master: `4e15fd8`
- Tests: 138 collected, 138 passing (`docker compose ... exec backend pytest`)
- Frontend build: green (`tsc -b && vite build`)
- Voice check: zero em/en dashes in any file touched this pass
  (chrome strings). Pre-existing em-dashes in seeded legal-content
  strings (snapshot.ts case theory etc.) are kept by intent — solicitor
  voice, not chrome.
- Deploy: live demo unchanged at legalise.dev; new endpoints are
  mounted but the live frontend still serves the pre-pass bundle until
  the next Pages deploy.

---

## 3. Backend pass — four endpoints, locked spec → as-built

Order shipped (serial, per reviewer's "no parallel" recommendation).

### 3.1 `GET /api/modules/public` — `a5dca6d`

Locked spec: source + skills + broken; per-skill `plugin`, `skill`,
`name`, `description`, `declared_capabilities`, `trust_posture`,
`source_url`. No `granted_capabilities`, no `enabled`. Same manifest
resolver as authed `/api/modules`. `Cache-Control: public, max-age=300`.

As-built: matches spec. Refactored the discovery loop into a private
`_discover_skills()` helper in `backend/app/api/modules.py`; both the
authed `list_modules` and the new `list_modules_public` call it. Tests
in `backend/tests/test_modules_public.py` (5) cover shape, no-leak
(asserts `granted_capabilities` / `enabled` keys are NOT present),
no-auth, cache header, and `(plugin, skill)` parity with the authed
endpoint. Frontend `Modules.tsx` unauth catalogue now fetches the live
data; the old static `PublicCataloguePreview` reading from
`WORKFLOW_TABS` is gone.

### 3.2 `GET /api/matters/{slug}/workflows` — `bddca3d`

Locked spec: derived live; `grant` ∈ {granted, partial, blocked,
not-installed}; `availability` ∈ {ok, blocked-by-posture,
blocked-by-grant, not-installed}; `last_run_at` from audit log scan;
matter-owner scoped. Backend defines the workflow taxonomy.

As-built: matches spec. `WORKFLOW_DEFS` in `backend/app/api/matters.py`
is the canonical taxonomy (5 workflows: premotion / letters /
contract-review / reviews / research; each with `declared_capabilities`
and `audit_modules` for last-run-at sourcing).
`_compute_workflow_state()` derives grant from declared ∩ user-granted,
posture-blocks any workflow declaring `model.invoke` under `C_paused`,
reports `missing capabilities: ...` in `reason` when partial/blocked.
Tests in `backend/tests/test_matter_workflows_route.py` (5) cover
shape, default-blocked, grant derivation (partial vs granted), posture
blocking, audit-sourced last_run_at, and 404 for non-owner matters.
Frontend `WorkflowsTab.tsx` swapped from static `installed / never / ok`
strings to fetched state.

### 3.3 `DELETE /api/users/me` — `1196599`

Locked spec: 409 `account_has_matters` when matters exist; otherwise
204 with soft-delete (is_active=False, profile scrubbed), session
revocation, cookie clear. Audit entries never cascade.

As-built: matches spec. New `backend/app/api/account.py`, mounted at
`/api/users`. Tests in `backend/tests/test_account_delete.py` (5) cover
no-matters soft-delete + revocation + cookie clear, matters-owned 409,
audit FK survival, auth-required, per-user session isolation. Frontend
`Settings.tsx` danger zone wired with `AccountHasMattersError` thrown
on 409 with the matter count surfaced to the user; copy bumps them
toward the v0.2 matter-delete flow which does not exist yet.

**Open policy item.** The locked v0.2 spec was "matter export / delete
+ scheduled hard purge with actor anonymisation". Neither is built.
The 409 stays as the safety rail until they are. If the reviewer wants
a different v0.2 ordering (e.g., matter-delete before scheduled
purge), flag it.

### 3.4 `User.plan` — `4583f4b`

Locked spec: single `String` column, defaulted `"free"`, display only,
no enforcement, no billing semantics. Comment must spell out "this is
not billing yet."

As-built: matches spec. `users.plan VARCHAR(32) NOT NULL DEFAULT 'free'`
via alembic `0009_user_plan`. Surfaced on `UserRead`, so
`/auth/users/me` and `/auth/register` both carry it. Inline comment in
`backend/app/models/user.py` is explicit about the v0.1 vs v0.2 line.
Tests in `backend/tests/test_user_plan.py` (2). Frontend `Settings.tsx`
swaps the prior `user.role`-as-plan hack for the real field;
capitalises for display ("free" → "Free").

---

## 4. JOY.md + the pass against it

### 4.1 The doctrine doc — `3e9b443`

Per the reviewer's "Calm Power" pass-back, `docs/JOY.md` was added as
the product-feel doctrine, separate from `DESIGN.md`'s visual rules.
It captures the core loop, product rules, required patterns (Matter
Pulse, Suggested Actions, Source Chips, Audit Confirmation, Module
Cards), and anti-patterns. Linked from `DESIGN.md` with the line
"design serves joy" so future agents read it before interpreting joy
as decoration.

### 4.2 JOY pass A — Assistant landing — `1ff2a75`

Three required patterns:

- **Matter Pulse.** New `frontend/src/matter/MatterPulse.tsx`
  renders a five-cell strip above the conversation column (Documents
  count / Chronology events count / Workflows granted count / Audit
  rows count / Posture label). Width-matched to the 920px conversation
  column. Data is in-scope from `MatterDetail` and `DemoMatter`; the
  auth path calls `getMatterWorkflows(slug)` and filters `grant ===
  "granted"`; demo path uses a static count of 4.
- **Suggested Actions.** AssistantTab empty state shows three
  matter-shaped chips per `matter_type` (`employment_tribunal`,
  `civil`, default). Clicking fills the composer textarea via
  `setInput()` and focuses; the solicitor still confirms and sends.
  Unauth/demo path: chips render but click flashes the sign-up CTA
  rather than silent no-op. The old `AgentStatusCard` preview block
  was removed — chips replace it as the next-action surface.
- **Audit Confirmation.** `MessageBubble.tsx` metadata line ends with
  ` · audit row written` on every assistant turn. Compact right-rail
  variant drops the source count to keep audit confirmation visible
  in 340px. The trust contract holds — backend assistant pipeline
  writes one audit row per turn, so the claim is honest, not
  decoration.

### 4.3 JOY pass B — anti-pattern sweep — `1b83353`

16 files touched across Documents / Chronology / Workflows / Audit /
Modules / Settings / AuthCard / module sub-tabs:

- **Raw HTTP errors.** Most surfaces used `setError(String(e))` which
  rendered "Error: 422 Unprocessable Entity: {...}" directly. Every
  catch now prefixes with action-shaped context ("Could not load
  reviews. ...", "Anonymisation failed. ...") and routes through the
  `ErrorCallout` primitive whose `parseError` strips the FastAPI JSON
  detail.
- **Empty-state dead ends.** `ChronologyTab` "No events yet. Live
  extraction lands in v0.2." was a status disclaimer with no
  affordance. Replaced with a sentence that names what populates the
  list and where to go.
- **Dead buttons.** `ChronologyTab` rendered source filenames as
  `<a href="#" onClick={ev.preventDefault()}>` — hover-styled link to
  nowhere. Demoted to `<span>` with `TODO(joy-source-link)` for when
  a routed Document detail view exists.
- **Trust copy needing paragraphs.** Modules and Workflows had
  multi-clause paragraphs explaining capability grants and the
  privilege-aware gateway. Cut to a sentence each.
- **Quarantined inline-styled errors.** `MappingTable.tsx` and
  `AnonymiseButton.tsx` use inline `style={{color:"crimson"}}` rather
  than Tailwind; agent prefixed the strings but deferred visual
  conversion to whoever owns anonymisation.

No JOY.md doctrine gap surfaced. The eight listed anti-patterns
covered every issue found.

---

## 5. Decisions Andy made that diverge from reviewer advice

Surfaced for explicit sign-off or pushback.

1. **Built v0.2 substance before doing the v0.1 truthfulness pass.**
   Reviewer's framing was: v0.1 = make current product truthful (hide
   or wire fake surfaces), v0.2 = build the four endpoints. Andy went
   v0.2 first because the truthfulness concerns and the endpoint
   targets overlapped substantially. The four endpoints replaced
   exactly the four fake surfaces the reviewer flagged (catalogue,
   workflow state, delete button, plan badge). The JOY-pass anti-
   pattern sweep then covered the remaining truthfulness gaps. Net
   result: less throwaway hide-then-rebuild work. If the reviewer
   thinks the sequence cost trust somewhere, call it out.

2. **JOY.md content is descriptive of decisions already taken**, not
   prescriptive of new patterns. Andy did not invent the "calm power"
   framing — it was the reviewer's. The doc codifies what was already
   the implicit design intent so future agents don't drift.

3. **Soft-delete still keeps `email` and `hashed_password`.** The
   reviewer endorsed `actor_id` survival on the audit log but flagged
   hard purge with anonymisation as a separate v0.2 job. Andy held
   the soft-delete narrow (deactivate + scrub editable profile
   fields), did NOT touch email/password. Hard purge is genuinely v0.2.

4. **Demo workflow count is hardcoded at 4.** The Matter Pulse panel
   needs a workflows-granted count; the demo path is offline so the
   agent fixed a 4. Honest but coarse. A demo workflows snapshot
   would fix this; flag if it bothers you.

---

## 6. Known open items

- **README claims 121 tests.** Real count: 138 (collected, all
  passing). Worth a one-line update.
- **`TODO(joy-source-link)`** in `ChronologyTab` — a routed Document
  detail view doesn't exist; source filename is a demoted span until
  it does.
- **`TODO(workflow-state)` follow-on**: workflow execution from the
  in-matter Workflows surface still uses the demo fixtures; building
  actual workflow runs on real matters is v0.2/v0.3 work, separate
  from the catalogue endpoint that shipped.
- **`TODO(public-modules)` no longer applies** — endpoint shipped.
- **Anonymisation inline-styled errors** — `MappingTable.tsx` and
  `AnonymiseButton.tsx` still use inline `style={{color}}`. JOY pass
  B added the action-shaped prefix but did not convert the visual.
  Whoever owns anonymisation should clean this up.
- **README provider-key posture** — reviewer's v0.1 truthfulness
  checklist mentioned "clear provider-key posture". Not audited this
  pass. The README currently describes BYO keys correctly but the
  Settings UI flow + the demo's use of the project key could be
  surfaced more cleanly.

---

## 7. What Andy is asking the reviewer

Three things, in priority:

1. **Endpoint sign-off.** Are the four implementations faithful to the
   locked spec? Anything drift, anything missed?
2. **JOY pass quality.** Matter Pulse, Suggested Actions, Audit
   Confirmation — do they read as the patterns you described in the
   pass-back, or did the implementation simplify them too far?
3. **v0.3 launch order.** Now that v0.2 substance is real, what's the
   v0.3 punch list? Andy's instinct: README accuracy pass + Landing
   polish + smoke deploy + HN/X positioning. Reviewer's call on
   sequence and on what counts as "ready".

If anything in §5 ("Decisions Andy made that diverge") needs to be
walked back, name the artefact and the desired behaviour and Andy will
fold it.

---

## 8. Related

- `docs/JOY.md` — calm-power product doctrine
- `docs/DESIGN.md` — visual contract, v0.4 FROZEN
- `docs/BACKEND_TODOS.md` — per-endpoint shipped notes
- `docs/HANDOVER_DESIGN_V04.md` — design doctrine handover
- `docs/HANDOVER_BACKEND_V01.md` — original scoping (now superseded
  by this doc but preserved for the question→answer trail)
- `EXECUTIVE_SUMMARY.md`, `ARCHITECTURE.md`, `README.md` — public copy
