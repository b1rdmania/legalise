# Handover — Legalise v0.2 substance + JOY pass

**For:** the reviewer agent (and Andy for context).
**As of:** 2026-05-19 night. Repo head: `737ea81` (post-R3 hardening, CI green). Last CI-green code head before this pass: `d8be353`.
**Scope:** everything that landed since the reviewer's backend scoping verdict and the "v0.1 truthfulness vs v0.2 substance" framing message. Read R3 first (most recent), then R2, then R1, then the original body if needed.

---

## R3 — pre-launch hardening pass (post-R2 signoff)

After R2 signoff, Andy raised a two-track question: fork-and-play backend (closer to ready) vs hosted demo (further). My recommendation flagged four items worth pulling forward from v0.2: provider-key posture audit, landing polish, upload validation, and provider-failure UX. All four landed tonight.

**Pre-launch accuracy fixes (`2a87803` + `613a1d6`)**

- `.env.example`: `ALLOW_SERVER_KEY_FALLBACK` → `LEGALISE_ALLOW_SERVER_KEY_FALLBACK`. Without the `LEGALISE_` prefix the env var was silently ignored by `config.py`'s `Field(alias=...)`. Real bug surfaced by the provider-key posture audit.
- `README.md`: replaced "BYO provider keys" with the actual posture: per-user AES-256-GCM keys added in Settings, stub-echo as keyless default. Quick-start no longer implies editing the env key is the path; Settings is.
- `Landing.tsx`: removed em dash in a code comment (voice-check only scans chrome, not comments) and softened §04's "v0.2 introduces tenants" to "Multi-tenant is post-v0.2" because the README's v0.2 list never made that promise.

**Three hardening items, parallel agents on worktrees, then sequential merge (`737ea81`)**

Andy dispatched me to do all three while he was AFK. Spun up three sub-agents on isolated worktrees so they couldn't step on each other; merged in order 1 → 2 → 3 with conflict resolution on the shared chat / workflow surfaces.

1. **Upload validation** (item 1 — agent committed on its behalf after timeout, then merged)
   - `backend/app/api/matters.py`: `MAX_UPLOAD_BYTES = 25 MB` + `ALLOWED_UPLOAD_MIMES` (pdf, docx, doc, txt, md, rtf — mirrors what `extract_text` actually processes). Validates content_type → 415, body size → 413. Structured detail bodies with `error / max_bytes / got_bytes` or `error / got / allowed`.
   - `frontend/src/lib/api.ts`: typed `UploadError` with `.kind` ∈ {`unsupported_mime`, `upload_too_large`}.
   - `frontend/src/matter/tabs/DocumentsTab.tsx`: inline banner on the typed error.
   - `backend/tests/test_upload_validation.py`: 3 tests (415, 413, valid-PDF regression guard). All pass.

2. **ProviderKeyMissing UX consistency** (item 2)
   - **Surprise:** audit of all `ProviderKeyMissing` catch sites found the backend was already consistent across **11** locations (matters.py:476, documents.py:204+552, plus 7 module routers + 2 internal worker silences). Zero backend changes. Work was entirely frontend wiring.
   - `frontend/src/lib/api.ts`: typed `ProviderKeyMissingError` + `providerKeyMissingFromBody()` parser tolerant of both `{detail: {...}}` and bare `{error, provider, message}` envelopes.
   - `frontend/src/ui/primitives.tsx`: `ProviderKeyMissingBanner` (border + text tokens only, no fill / rounded / shadow). Copy: `"Add a {Provider} API key in Settings to use this model. Or switch to stub-echo for the demo."` with `Open Settings` deep link to `#/settings`.
   - Banner wired into 8 components: `MatterDetail`, `RightRailAssistant`, `AssistantTab`, `LettersTab`, `PreMotionTab`, `ContractReviewTab`, `ReviewEditor`, and one shared error path.
   - `backend/tests/test_matters_routes.py::test_invoke_returns_provider_key_missing_envelope`: pins the 422 envelope shape. Initially failed in conftest because lifespan doesn't run — fixed by patching `plugin_bridge_module.bridge` with an `AsyncMock` directly (resolved during merge, see below).

3. **Provider upstream errors** (item 3, the most surface area)
   - New `ProviderUpstreamError` exception in `backend/app/core/user_keys.py` (same module as `ProviderKeyMissing` for consistency) with fields: `provider`, `code` ∈ {`provider_invalid_key`, `provider_rate_limited`, `provider_overloaded`, `provider_error`}, `upstream_status`.
   - SDK wrapping done **inside each provider** (not in the gateway) — agent's choice, cleaner separation of concerns:
     - `backend/app/providers/anthropic_provider.py:73-93` (catches `anthropic.APIStatusError` + `APIConnectionError`)
     - `backend/app/providers/openai_provider.py:64-93` (catches `openai.APIStatusError` + `APIConnectionError`)
     - `backend/app/providers/ollama_provider.py:62-91` (catches `httpx.HTTPStatusError` + `httpx.HTTPError`)
   - Gateway-level wrapping at `backend/app/core/model_gateway.py:402-437` writes an **audit row on every upstream failure** before re-raising. Mandatory provenance preserved.
   - 10 route-level catch sites mirror the `ProviderKeyMissing` pattern: parallel `except ProviderUpstreamError → HTTPException(502, detail={error, provider, upstream_status, message})`. Sites: matters.py, documents.py ×2, plus 7 module routers.
   - Frontend: `ProviderUpstreamError` typed class + `providerUpstreamMessage()` helper mapping each code to friendly UI copy. Reused the existing `ErrorCallout` primitive (which does have a bg fill — agent's pragmatic judgment to avoid two visual treatments for similar error states; flagging it as a minor rule bend).
   - `backend/tests/test_provider_upstream_errors.py`: 8 gateway-level tests (each status code + audit-row assertion). Plus 1 route-level test that skips without Postgres.

**Merge resolution (`737ea81`)**

Items 2 and 3 both touched `frontend/src/lib/api.ts` and the four shared chat / workflow components (`RightRailAssistant`, `AssistantTab`, `ContractReviewTab`, the lib's network error handler). All four conflicts were additive-not-mutually-exclusive — both error types coexist, with the catch chain checking `ProviderKeyMissingError` first (422 with deep-link banner), `ProviderUpstreamError` second (502 with code-specific message), then the generic `Error` fallthrough.

Two small follow-ups landed in the merge commit:
- `test_matters_routes.py`: item 2's envelope test depended on a lifespan-initialised `plugin_bridge_module.bridge`. Conftest does not run lifespan. Fixed by patching the module attribute directly with `AsyncMock(invoke=AsyncMock(side_effect=ProviderKeyMissing("anthropic")))`.
- `test_provider_upstream_errors.py`: dropped one em dash from a docstring (caught by added-line voice check on the merged diff).

**Stats (post-R3)**

- Master: `737ea81`
- CI: green on every job (Backend pytest, Frontend build, Voice check).
- Tests: **155 passed, 53 skipped** (was 140 at d8be353; net **+15** tonight). README still claims 140; reviewer call on whether to bump.
- `tsc --noEmit`: clean on the merged tree.
- Voice check on added lines only: clean. (Baseline em-dashes in pre-existing comments/docs persist; the rule remained "introduce no new dashes" because the literal whole-tree pass would require a much bigger sweep.)

**What this hardening pass deliberately did NOT do**

- No deploy. CI is green, but `legalise.dev` still runs pre-R3 code until Andy promotes.
- No clean-clone smoke walk (item 4 from the plan). That's blocked on Andy doing a real `rm -rf && git clone && docker compose up` from scratch — the harness can't faithfully simulate "first-time user".
- No third-party guardrail integration (Lakera / Guardrails AI / Patronus). Recommendation was to wire the workflows into Andy's own `agent-kit` v0.2 post-launch rather than add a third-party dependency that contradicts the "no provider-specific bypass of the gateway" doctrine.

**Open questions for the reviewer**

1. **Item 3's `ErrorCallout` reuse.** The agent kept the existing primitive (which has `bg-[#FEF2F2]`) rather than introducing a parallel banner with no fill. Pragmatic call to keep visual consistency in the error-state surface. Defensible, or strict-rules violation worth fixing?
2. **README test-count claim.** Now 140 in README, 155 in actual suite. Bump or leave (some skipped tests are real-DB-only and the reviewer's previous nit was about exact match).
3. **`.env.example` `LEGALISE_` prefix bug.** This had been silently broken for at least a release cycle. Worth a `CHANGELOG` line, or just a quiet fix?

---

## R2 — KISS pass + CI bring-up (post-R1)

Two strands landed after the reviewer's R1 verdict: my own KISS pass against the same constraints the reviewer used, and a CI workflow that mechanises the test claim. CI is now green; reviewer can land sign-off with a checkmark next to the test-count claim.

**Engineering doctrine (`75b221a`)**
- `docs/ENGINEERING.md` added in response to the reviewer's KISS pass framing ("we build custom only where legal trust requires it; everything else is boring"). Names the bespoke surfaces (matter, posture, audit, capability vocabulary, CPR gate, JOY/design doctrine, citation UX) and the boring stack (FastAPI, SQLAlchemy, fastapi-users, Tailwind, Presidio, structlog). Documents the three v0.1 demo caveats (in-memory rate limit, SSE bound to request lifecycle, built-in workflow catalogue) and the "not landed yet" backlog (TanStack Query, `ApiError`, audit-action constants, `module_catalogue` extract, TanStack Table, `arq`). Linked from README under Architecture and design.

**My own KISS pass items reviewer didn't flag (`3b331ee`)**

These three items came from a self-review I did using the reviewer's "bespoke vs boring" lens. Andy approved them as pre-launch fixes; the larger items (TanStack Query migration, single `ApiError`, audit-action constants, `module_catalogue` extract) are deferred to post-launch per the reviewer's own "after launch" split.

- **URL prefix unified.** `DELETE /api/users/me` moved to `DELETE /auth/users/me` so the entire user resource lives at one prefix alongside the existing `GET/PATCH /auth/users/me` that fastapi-users owns. `account_router` mounts BEFORE `auth_router` in `main.py` so the literal `/me` wins over fastapi-users' superuser-only `DELETE /{id}` catch-all (which would otherwise match `me` with id=`"me"` and 403). Frontend `deleteAccount` URL + 5 account tests + BACKEND_TODOS notes updated.
- **Schema vs vocabulary parity test.** `backend/tests/test_capability_vocabulary_schema.py` (2 tests) asserts both `schemas/module.json` enum locations (plugin-level + per-skill) equal `CAPABILITY_VOCABULARY` exactly. Side fix: `infra/docker-compose.yml` now bind-mounts `../schemas:/schemas:ro` because `modules.py`'s validator was silently returning None inside the container (schema file invisible). Honest gap closed — manifest validation is now actually running.
- **`CONTRIBUTING.md` refreshed.** Stale "pre-build state" block replaced with the real `docker compose up` / `pytest` / `alembic upgrade` commands and the voice-check rg recipes. Ground rules / CLA / AI-generated-contributions / code-of-conduct sections preserved.

**CI workflow (`da81a1c` → `d8be353`)**

GitHub Actions workflow at `.github/workflows/ci.yml` runs on push to master + every PR:

- `backend` job spins up `pgvector/pgvector:pg16` as a service, clones `claude-for-uk-legal` at the SHA pinned in `backend/Dockerfile` so the modules tests exercise real plugin discovery, installs with `[dev]`, alembic upgrades the test DB, then `pytest -x`. Env: `POSTGRES_DSN` (psycopg sync, for alembic) + `TEST_DATABASE_URL` (asyncpg async, for conftest); `ENVIRONMENT=development` so the email module's dev path engages; `MATTERS_ROOT` overridden to a workspace-relative path.
- `frontend` job is `npm ci` + `npm run build` (tsc + vite).
- `voice-check` job rg-scans the five public-copy docs for em or en dashes — matches the local check.
- Concurrency group cancels in-progress runs on the same ref.

`.env.example` rewritten to match what `config.py` actually reads: dropped the stale "v0.2 swaps to WorkOS / Stytch" comment; added `SESSION_COOKIE_NAME`, `SESSION_COOKIE_SECURE`, `LEGALISE_KEY_ENCRYPTION_SECRET`, `ALLOW_SERVER_KEY_FALLBACK`, `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_VERIFY_URL_BASE`, `PASSWORD_RESET_URL_BASE`, `PLUGINS_HOST_PATH`, `PLUGINS_REPO`, `PLUGINS_REPO_REF`, `SUBMISSION_ENABLED`, `GITHUB_SUBMISSION_TOKEN`, `GITHUB_SUBMISSION_REPO`, `GITHUB_SUBMISSION_BASE_BRANCH`, `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, `SUBMISSION_RATE_LIMIT_PER_HOUR`, `CORS_ORIGINS`.

**Five-commit CI bring-up arc** (each fix surfaced a real issue):
1. `da81a1c` initial workflow. Failed: email module fail-closed under `ENVIRONMENT=test` (DEV_ENVIRONMENTS allowlist is `{development, dev, local}`).
2. `a905dae` set `ENVIRONMENT=development`. Failed: `PermissionError: '/data'` because `matters_root` default is `/data/matters` (the docker volume).
3. `c5668a4` overrode `MATTERS_ROOT` to `$GITHUB_WORKSPACE/_matters`. Failed: `test_modules_per_skill_capabilities` fixture used retired `audit.emit`. **This was the schema-vocabulary-bind-mount finally biting** — the validator now actually runs (was silently no-op before), and it caught a stale fixture that had been carrying retired vocabulary unflagged.
4. `7abce27` swapped fixture `audit.emit` → `chronology.read`. Failed: `python-frontmatter` 1.2 tightened `frontmatter.dump(post, buf)` to bytes-only buffer; submissions code path writes str.
5. `d8be353` pinned `python-frontmatter>=1.1,<1.2`. **Green.**

**Stats (post-R2)**
- Master: `d8be353`
- CI: green on every job (Backend pytest, Frontend build, Voice check).
- Tests: **142** collected and passing, both locally and in CI.
- README test-count claim: 142, matches reality.

**One real bug fixed in this arc, worth flagging to the reviewer:** `test_modules_per_skill_capabilities.py` had been declaring `audit.emit` in its fixture manifests since before `audit.emit` was retired from the runtime vocabulary. The schema bind-mount in `3b331ee` is what made manifest validation start working — and the very first time validation was real in CI, it caught a fixture that hadn't been doctrine-correct in weeks. That's the schema-vocabulary parity test paying off on its first run, in production-shaped conditions.

---

## R1 — what landed after the original handover

Reviewer's first verdict approved 3/4 endpoints and blocked workflow-state on capability vocabulary, grant derivation, and the unreachable `not-installed` enum. Fixed in `d9af89f`, with three follow-ups in `3b331ee`.

**Backend (`d9af89f`)**
- `WORKFLOW_DEFS` capability vocabulary stripped to runtime-only: `audit.write` / `review.write` / `net.http` removed. The intent ("writes review table", "uses network") now lives in the human `description`. New regression test `test_workflow_declared_capabilities_match_runtime_vocabulary` asserts every workflow's declared set ⊆ `CAPABILITY_VOCABULARY`.
- `not-installed` removed from `WorkflowGrant` and `WorkflowAvailability` (response enum and frontend types). v0.1 admits the endpoint is a built-in catalogue; `not-installed` is reserved for future marketplace modules. Guard test `test_workflows_grant_values_never_include_not_installed`.
- Grant derivation kept as workspace-level union (the workflows are in-app pipelines, not skill-backed), with the docstring on `_compute_workflow_state`, `WorkflowState` comment, and `WORKFLOW_DEFS` header all spelling out the v0.1 semantics explicitly.

**Pre-launch tidy (`3b331ee`)**
- `DELETE /api/users/me` moved to `DELETE /auth/users/me` so the entire user resource lives at one URL prefix. `account_router` mounts before `auth_router` in `main.py` so the literal `/me` wins over fastapi-users' superuser-only `/{id}` catch-all. Frontend `deleteAccount` URL + 5 account tests + BACKEND_TODOS doc updated.
- `backend/tests/test_capability_vocabulary_schema.py` (2 tests) asserts both schema enum locations in `schemas/module.json` equal `CAPABILITY_VOCABULARY` exactly. Side fix: `docker-compose.yml` now bind-mounts `../schemas:/schemas:ro` because `modules.py`'s validator was silently returning None inside the container (schema file invisible). Honest gap closed.
- `CONTRIBUTING.md` refreshed: stale "pre-build state" replaced with real `docker compose up` / `pytest` / `alembic upgrade` commands + voice-check rg recipes.

**Stats (post-R1)**
- Master: `3b331ee`
- Tests: **142** collected, all passing (was 138 in the original handover; the original said 121 because the README was stale at that point — README now matches at 142).
- Workflow `grant` enum: `granted` | `partial` | `blocked`
- Workflow `availability` enum: `ok` | `blocked-by-posture` | `blocked-by-grant`

**Frontend hygiene also done in R1:**
- `frontend/src/matter/tabs/types.ts::WORKFLOW_TABS` had a second stale capability vocabulary (`audit.write`, `document.write`, `review.write`, `net.http`). Stripped: `WorkflowTab` is now `{ key, label }` only. Backend `WORKFLOW_DEFS` is the single source of truth for workflow metadata.
- `docs/JOY.md` Module Cards pattern clarified: `not-installed` is for future marketplace modules, never v0.1 built-in workflows.

The body of this doc below is the original handover content. The status block at the top of §2 lists the original numbers; refer to this R1 section for current state.

---

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
