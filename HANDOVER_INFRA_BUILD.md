# HANDOVER — Infra + Phase D + Phase E build plan to v0.1 launch

**Base heads:** Code base `be8af63`; planning docs `89c2390` (Phases A + B + C committed + Codex R1/R2/R3 closed; Contract Review SSE UI lands P2.8; `PHASE_INFRA_DELTA.md` approved with Andy's amendments 2026-05-15). Agents rebase from the code-base head; review against the planning-docs head.
**Scope:** how the 14 work units in `backend/PHASE_INFRA_DELTA.md` §1 actually get built. Sequencing, file ownership per agent, acceptance per unit, hard guards.
**Reviewer's job:** confirm the sequencing is right, the agent spawn boundaries do not collide, and the acceptance bars are tight enough to catch a regression before launch.

This is a build plan, not a product pivot. Doctrine and launch-compromise wording follow `PHASE_INFRA_DELTA.md` §4 verbatim — do not soften.

---

## 0. Reading order for reviewer

1. `BUILD_PLAN_BROADER.md` §4g–§4j + §5 (Phase D + E scope envelope; 15–22 days).
2. `HANDOVER_INFRA_REVIEW.md` (Andy's infra review; the source for Batches 1–5).
3. `backend/PHASE_INFRA_DELTA.md` (the reconciliation; §4 = locked decisions, §1 = sequenced work units, §5 = v0.2 deferrals).
4. This file.
5. `backend/PHASE_D_DELTA.md` + `backend/PHASE_E_DELTA.md` (per-phase scratch — superseded by §1 here on sequencing; per-unit scope still authoritative).

---

## 1. Build order (14 units, 10.5–14 working days from `be8af63`)

Days are working-day estimates at AI-pair-programming velocity. Reviewer round-trips absorbed in the build-plan §5 "15–22 days" envelope.

| # | Unit | Days | Parallel safe? | Blocks |
|---|---|---|---|---|
| 1 | Batch-1 parser libs + audit centralisation | 1.0–1.5 | No (touches every module router) | 5, 1a |
| 1a | Structured-output helper (`structured_output.py`) | 0.25 | **Sequential after #1** (shares files in `contract_review/`, `document_edit/`) | 10a, 10b |
| 2 | App.tsx split (Phase B W0) | 1.0 | No (mechanical move across ~25 files) | 3, 5, 6 |
| 3 | Phase D W1 + deferred buttons + Batch-2 fold | 1.5–2.0 | Partially (backend + frontend split) | 5, 9 |
| 10a | Phase E W2 — existing-surface evals (4 of 5: audit-row, posture-routing, redline-anchor, NDA-parse) | 0.75 | Yes (own `evals/` subtree) | 12 |
| 5 | ~~Phase D W2 — matter wire-format + import/export~~ **CUT to v0.3 (Andy 2026-05-15)** | — | — | — |
| 10b | ~~Phase E W2 — matter-portability round-trip eval~~ **CUT with #5** | — | — | — |
| 6 | Phase D W3 — public submission flow | 1.5–2.0 | Yes (own new endpoint + new page) | 12 |
| 8 | LBA docx template (Batch-5 partial) | 0.5–1.0 | Yes (own new template + one router branch) | 9 |
| 9 | Phase E W1 — README/PEERS/MANIFESTO/ROADMAP/ATTRIBUTIONS | 1.0 | Yes (docs only) | 12 |
| 11 | Phase E W3 — pre-flight + Day-15 deploy delta | 0.5 | Yes (docs + Dockerfile + env vars) | 12 |
| 12 | Phase E W4 + W5 — launch posture + Day-18 coord | 1.0 | No (Andy-coordinated; agent drafts only) | — |
| 13 | v0.2 backlog freeze | — | — | — |

**Critical sequence constraints (re-stated for reviewer):**
- #1 strictly before #5 (`jsonschema` is load-bearing on §4g import validation).
- #1 strictly before #1a — **sequential, not parallel**. Audit sweep touches every module router (broad/mechanical); structured-output swap touches the same files semantically. Let #1 stabilise, then #1a edits.
- #2 strictly before #3 (post-split tab files needed for deferred-button homing).
- #4 is **folded** into #3, not parallel.
- #10a (existing-surface evals) can ship before #5; #10b (matter-portability) ships strictly **after** #5.
- **#5 ↔ #10b coupling (P1 doctrine):** matter portability is a trust feature. If #5 slips, cut the whole import/export surface from v0.1 — do not ship the endpoints without the round-trip eval, and do not ship the eval without the endpoints. Acceptable launch shape: 4 evals + no import/export surface. Unacceptable: import/export + no round-trip eval.
- #11 strictly before Day-15 deploy.

---

## 2. Agent spawn plan

Same pattern that worked across Phases A → C: agents own non-overlapping files; integration diffs into `App.tsx` / `lib/api.ts` / `main.py` return in summaries and I apply serially after agents return. Module-local `api.ts` shims used during parallel work, consolidated in unit #3.

### Round 1 — unit #1, then unit #1a (sequential)

**Agent 1A — parser swap + audit sweep (`general-purpose`, foreground). Runs first.**
- Owns: `backend/app/core/matter_fs.py`, `backend/app/adapters/plugin_bridge.py`, `backend/app/api/modules.py`, `schemas/module.json`, all 14 files in §3.1 audit sweep list.
- Adds deps: `pyyaml>=6.0`, `python-frontmatter>=1.1`, `jsonschema>=4.21` in `backend/pyproject.toml`.
- Acceptance:
  - `grep -rn "AuditEntry(" backend/app/ --include="*.py"` returns only the **four** permitted sites: `backend/app/core/audit.py` (helper layer), `backend/app/core/api.py` (where the `_AuditAPI.log` helper itself constructs `AuditEntry(...)`), `backend/app/models/audit.py` (model definition), and the audit middleware.
  - All **module semantic rows** carry non-null `module`. Middleware `http.*` rows are allowed to remain `module=null` — they are infrastructure, not module activity.
  - `python -m compileall backend/app` clean. Existing Phase A/B/C tests green.

**Agent 1B — structured-output helper (`general-purpose`, foreground). Runs strictly after 1A commits.**
- Owns: new `backend/app/core/structured_output.py`, and four call sites: `backend/app/modules/contract_review/agents.py`, `backend/app/modules/document_edit/pipeline.py`, `backend/app/modules/pre_motion/agents.py`, `backend/app/modules/anonymisation/prompts.py`.
- Adds: `StructuredOutputError(Exception)` with `raw_text` attribute for audit; `parse_model_json(raw: str, model: type[BaseModel]) -> BaseModel` that strips ```json fences, takes first balanced `{...}`, validates against `model`.
- **Must not** import from `model_gateway.py`. Gateway/parsing boundary is doctrine.
- Acceptance: four ad-hoc regex sites retired. Smoke run of Contract Review pipeline against Khan-NDA seed still produces valid `ContractReviewResult`.

**Sequencing rationale (reviewer-locked):** audit centralisation is broad and mechanical; structured-output is semantic. Stabilising the files via 1A first means 1B's diff stays small and reviewable. No thin pre-pass — full sequential.

### Round 2 — unit #2 (App.tsx split)

**Agent 2 — mechanical-only split (`general-purpose`, foreground).**
- Verbatim scope from `PHASE_B_DELTA.md` §W0. Target tree: `frontend/src/{app,auth,landing,matter,modules,ui,modules-page,lib}/`.
- ~3,450 lines moved across ~25 files. No new components. No behaviour change.
- Gotcha (per Phase B handover): lift `AuthProvider` + `useAuth` together into `app/App.tsx` root, not piecemeal.
- Acceptance: `npm run build` green. `tsc -b` clean. Pixel-identical UI before/after at every tab. `App.tsx ≤ 350 lines`.

**No parallelism on this unit** — surgical move across the whole tree.

### Round 3 — units #3 + #8 + #9 + #10a + #11 in parallel (after #2 lands)

Once the App.tsx split lands, frontend ownership is sharded by directory, making parallelism safe.

**Agent 3 — Phase D W1 + deferred buttons + Batch-2 fold.**
- Backend owns: `backend/app/api/modules.py` (capabilities + trust_posture surfacing), `backend/app/api/workspace.py` (toggle endpoints if not yet present).
- Frontend owns: `frontend/src/modules-page/Modules.tsx`, `frontend/src/matter/tabs/LettersTab.tsx`, `frontend/src/matter/tabs/PreMotionTab.tsx`, `frontend/src/matter/tabs/DocumentsTab.tsx`. Consolidates module-local `api.ts` shims into `frontend/src/lib/api.ts`.
- **v0.1 launch-copy guard:** Modules page must say declared capabilities are *under review / displayed*, **not** "capability-gated." Reviewer should grep the diff for the phrase "capability-gated" and reject if present in user-facing strings.
- Acceptance: §3.3 of `PHASE_INFRA_DELTA.md` bars; disabled-pill renders; audit-tab filter by `module` column works; three deferred buttons fire end-to-end.

**Agent 8 — LBA docx template (revised 2026-05-15; no `docxtpl`).**
- Path A (recommended): **drop unit #8 entirely for v0.1.** LBA stays on the existing procedural `generate_docx` path. `docxtpl` LGPL-2.1 not worth the launch-copy friction on an Apache-2.0 clean-room launch (per reviewer decision; see `PHASE_INFRA_DELTA.md` §4 decision 4).
- Path B (only if visual LBA polish proves launch-critical): Andy authors `backend/app/templates/docx/lba.docx` in Word with `{{placeholders}}`; agent wires a tiny `backend/app/modules/letters/lba_template.py` using `python-docx` (already a runtime dep, MIT) to walk runs/cells and substitute. ~60 LoC. No new deps.
- **Boundary in Path B:** audit row shape unchanged; `module.letters.docx.exported` payload gains `"template_name": "lba"`. Other letter types fall through to existing `generate_docx` path — no regression.
- Acceptance (Path B): Khan-LBA renders via internal helper; `pytest` audit-shape eval green.

**Agent 9 — docs rewrite (Phase E W1).**
- Owns: `README.md`, `docs/PEERS.md`, `docs/MANIFESTO.md`, `docs/ROADMAP.md`, `docs/ATTRIBUTIONS.md`.
- Hard guards: Will Chen (Mike, AGPL-3.0) and Jan Kubica (Stella, Apache-2.0) framed as **peers, not competitors**. Solicitor-first README. No agent files DMs/issues/discussions — drafts in `docs/outreach/` only.
- Acceptance: cold reader (non-technical solicitor) can read README and form intent to clone within 60 seconds.

**Agent 10a — existing-surface smoke evals (Phase E W2, four of five).**
- Owns: `evals/` subtree (currently empty or thin). Four evals: audit-row contract, posture-routing, redline anchor resolution, NDA-clause parse. Matter-portability round-trip (the fifth) is **deferred to #10b in Round 4.5**, strictly after #5.
- Acceptance: four evals green against the integrated tree.

**Agent 11 — pre-flight runbook + Dockerfile (Phase E W3).**
- Owns: `infra/PRE_FLIGHT.md`, `backend/Dockerfile`, `infra/deploy/cloudflare.md` (Day-15 deploy delta).
- Adds to Dockerfile: any new pip deps from #1 + #1a + #8 (`pyyaml`, `python-frontmatter`, `jsonschema`, `docxtpl`). `RUN python -m spacy download en_core_web_sm` already present from Phase C.
- Adds to runbook: `GITHUB_SUBMISSION_TOKEN` (`b1rdmania`-scoped fine-grained PAT, `contents:write` + `pull_requests:write` on `claude-for-uk-legal` only — **NOT `ziggythebot`**), `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`.
- Adds Day-15 smoke step: SSE disconnect during Contract Review run (per §4.6 doctrine — surfaces job-runner brittleness before launch).

### Round 4 — unit #5 (Phase D W2) standalone

**Agent 5 — matter wire-format RFC + importer/exporter.**
- Owns: new `backend/app/api/exports.py`, new `backend/app/api/imports.py` (or one file), new `docs/MATTER_WIRE_FORMAT.md` (the RFC), new `schemas/matter.json`. Frontend: new "Export matter" + "Import matter" actions in matter settings.
- Uses `Draft202012Validator(schema).iter_errors(payload)` + `error.absolute_path` → JSON pointer body. **Do not use `jsonschema.validate()`** — it raises on first error.
- Uses `frontmatter.dump(post, handler=frontmatter.YAMLHandler())` for `matter.md` — no string-concat YAML.
- **Privilege-aware redaction is mandatory** (reviewer-locked). Export modes are explicit from day one: `full_internal` (no redaction; same posture only) and `shareable` (redaction matrix per `PHASE_D_DELTA.md` Gotcha 1 applied). No thin-proof escape — matter portability is a trust feature, not a convenience feature. If the redaction matrix cannot ship in #5's budget, **cut the whole import/export surface from v0.1** (defer #5 and #10b together).
- Acceptance: round-trip Khan matter export (both modes) → import to a fresh DB → all audit rows replay for `full_internal`; redacted fields stripped per matrix for `shareable`; slug-collision returns 409 with conflict body.

Standalone because it touches the import/export surface across backend + frontend + docs simultaneously and the RFC needs a coherent voice.

### Round 4.5 — unit #10b (after #5)

**Agent 10b — matter-portability round-trip eval.**
- Owns: one new file in `evals/` (e.g., `evals/matter_portability.py`).
- Round-trips Khan matter through both export modes → fresh DB → asserts audit replay + redaction matrix correctness.
- **Spawn rule:** if #5 has not landed (or has been cut from v0.1), do not spawn 10b. The eval and the surface ship together or not at all.

### Round 5 — unit #6 (Phase D W3) standalone

**Agent 6 — public submission flow.**
- Owns: new `backend/app/api/submissions.py`, new `frontend/src/landing/SubmitModule.tsx`, Turnstile wiring.
- Backend SKILL.md builder via `frontmatter.dump(post, handler=frontmatter.YAMLHandler())`. Closes Phase D W3 Gotcha 9 (YAML-injection risk) by library, not by hand-validation.
- IP rate-limit in-memory token bucket (multi-instance Redis rate-limit is v0.2 — single Fly instance sufficient at launch).
- **Hard guard repeated:** the endpoint opens a draft PR via the `b1rdmania`-scoped PAT. **No agent files PRs, issues, or DMs to humans.** Andy reviews every draft PR.
- Acceptance: form → endpoint → draft PR opens against `b1rdmania/claude-for-uk-legal` with synthesised SKILL.md + capabilities multi-select reflected; Turnstile rejects bots; `submission_enabled=false` config gate works.

### Round 6 — unit #12 (Phase E W4 + W5)

Andy-coordinated launch posture. Agent drafts only — `HANDOVER_LAUNCH.md`, Will/Jan DM refines (in `docs/outreach/`), HN/X/LinkedIn final drafts. Andy files every external action.

---

## 3. Hard guards (preserved verbatim across rounds)

1. **No AGPL contamination.** Apache-2.0 stays. Do not copy code from Mike's repo. Read for shape understanding; implement independently.
2. **Peer framing.** Mike (Will Chen, `claude-for-uk-legal`, AGPL-3.0) and Stella (Jan Kubica, Apache-2.0) are peers. No competitor framing in any public artifact.
3. **No agent-filed external comms.** No public issues, discussions, DMs. Drafts land in `docs/outreach/`. Andy files.
4. **GitHub token scope.** `GITHUB_SUBMISSION_TOKEN` is a `b1rdmania`-scoped fine-grained PAT with `contents:write` + `pull_requests:write` on `claude-for-uk-legal` only. **Not `ziggythebot`.**
5. **Product lock.** Privilege posture, audit semantics (including `module` column from Phase A R1), matter/module legal shape, Python+FastAPI, gateway posture-aware provider selection (R2/R3) — all bespoke, all unchanged.
6. **Launch copy lock.** v0.1 must say "module enable/disable is enforced; declared capabilities are schema-validated and displayed for review." The phrase "capability-gated" must not appear in user-facing strings, README, or launch artifacts. Doctrine for v3.x makes capabilities enforceable; v0.1 must not imply that exists yet.
7. **Gateway/parsing boundary.** `parse_model_json` lives in `backend/app/core/structured_output.py`, not `model_gateway.py`. Gateway routes and audits; parsing is a consumer concern.
8. **Job runner direction (locked, impl deferred).** When the time comes, it's `arq` + Redis + `jobs` table. No re-debate of Dramatiq/RQ.
9. **Audit constants required v0.2.** Not optional. `backend/app/core/audit_actions.py` lands in v0.2; stringly-typed actions are a v3.x liability.

---

## 4. Per-unit acceptance bar (one line each, for reviewer audit)

| Unit | Acceptance bar (binary) |
|---|---|
| #1 | `grep -rn "AuditEntry(" backend/app/` returns only 4 permitted sites (`core/audit.py`, `core/api.py` helper, `models/audit.py`, audit middleware); **module-semantic** audit rows non-null `module` (middleware `http.*` rows may be null); existing tests green |
| #1a | Four regex sites retired; `structured_output.py` exports `parse_model_json`; gateway not imported into it; Contract Review against Khan-NDA round-trips |
| #2 | `npm run build` green; `App.tsx ≤ 350 lines`; pixel-identical UI; no behaviour change |
| #3 | Modules page renders capabilities + trust posture as **declarations**; three deferred buttons land; module-local `api.ts` shims consolidated |
| #5 | Both export modes ship (`full_internal` + `shareable`); round-trip Khan matter → fresh DB → audit replay for `full_internal`, redaction-matrix verified for `shareable`; slug-collision 409; `Draft202012Validator` + JSON pointer 422 body verified. **If redaction matrix cannot ship, cut the whole surface from v0.1.** |
| #6 | Draft PR opens against `b1rdmania/claude-for-uk-legal` via `b1rdmania` PAT; Turnstile rejects synthetic submission; config gate works |
| #8 | **Path A (recommended): skip — LBA stays procedural.** Path B: Khan-LBA renders via internal `python-docx` placeholder helper; audit row payload includes `template_name: "lba"`; non-LBA letter types fall through unchanged. No `docxtpl`. |
| #9 | Cold solicitor reader: 60-second README → intent to clone; PEERS/MANIFESTO/ROADMAP/ATTRIBUTIONS cross-link cleanly |
| #10a | Four existing-surface evals (audit-row, posture-routing, redline-anchor, NDA-parse) green against the integrated tree |
| #10b | Matter-portability round-trip eval green; covers both export modes. Spawned only if #5 ships. |
| #11 | Pre-flight runbook lists every new env var; Dockerfile installs every new dep; Day-15 smoke includes SSE-disconnect-during-Contract-Review check |
| #12 | HANDOVER_LAUNCH rewritten; Will/Jan DM drafts in `docs/outreach/`; HN/X/LinkedIn drafts; Andy files everything |

---

## 5. What's NOT in this handover

Everything in `PHASE_INFRA_DELTA.md` §5 ("Deliberately deferred to v0.2"). Re-stated:
- TanStack Router + Query migration.
- `arq` + Redis + `jobs` table implementation (direction locked here; build v0.2).
- Provider-native structured output / tool calling.
- `sse-starlette` swap.
- Runtime per-capability enforcement.
- `module.json` signed manifests.
- Docx templates for Pre-Motion + Contract Review.
- `generate_docx` markdown-table extension.
- `audit_actions.py` constants module (required v0.2).
- Audit-tab UI filter by `module` (Phase E polish or v0.2).
- Multi-instance Redis-backed rate-limiter for submission flow.
- GitHub App for submission flow (PAT-based v0.1; App-based v0.2).

Plus the eternal v0.1 guards:
- Any change to privilege posture semantics.
- Any change to gateway posture-aware provider selection.
- Any new product surface beyond `BUILD_PLAN_BROADER.md` §4g–§4j.

---

## 6. Reviewer decisions (locked, 2026-05-15)

1. **Round 1:** run 1A first, then 1B. No thin pre-pass. Audit centralisation is broad/mechanical; structured-output is semantic — let 1A stabilise the files, then 1B edits.

2. **Unit #5:** privilege-aware redaction matrix ships with #5, day one. Export modes are explicit: `full_internal` vs `shareable`. If the matrix cannot ship in budget, cut the entire import/export surface from v0.1 — not just the redaction.

3. **Unit #8:** Andy authors `lba.docx` in Word. Agent wires `docxtpl`, provides merge-field docs, and adds the smoke test. Visual Word polish is faster human-authored.

4. **#5 ↔ #10b coupling:** matter-portability eval and matter-portability surface ship together or not at all. Acceptable launch shape: 4 evals + no import/export. Unacceptable: import/export + no round-trip eval.

5. **Round 3 ↔ #5 API conflict:** Agent 5 is standalone in Round 4, after Agent 3's consolidation completes. Agent 5 edits `frontend/src/lib/api.ts` directly. No module-local shim required.

---

## 6.5. Execution log (in-flight)

- **`7efedad` — Agent 1A (unit #1) landed.** Parsers swapped; 14 module audit sites centralised through `audit.log()`; 4 permitted direct-constructor sites preserved; `schemas/module.json` published with closed capability set + trust_posture. Acceptance: `python -m compileall app` clean, 19 pytests green.
- **`e7d730c` — Agent 1B (unit #1a) landed with partial coverage.** `structured_output.py` published (119 LoC). Swapped: `contract_review/agents.py`, `pre_motion/agents.py` (Optimistic + Synthesis stages). NOT swapped: `document_edit/pipeline.py` (no `ChangesEnvelope` Pydantic class exists) and `anonymisation/prompts.py` (no `{tokens, spans}` envelope class exists). Agent honoured the "do not invent a class" guard.
  - **Follow-up unit needed before launch:** `#1a-tail` — define `document_edit/schemas.py::ChangesEnvelope` and `anonymisation/schemas.py::AnonymisationEnvelope` (additive only, mirror existing wire shape), then complete the two swaps. ~60 LoC. Andy's call on whether to do this pre-launch or v0.2 — the current state ships fine; gateway/parser boundary is intact for the two swapped sites.
- **Agents 2 (App.tsx split) and 9 (docs rewrite) running in parallel as of `e7d730c`.**
- **`9e7012d` — Agent 2 (unit #2) landed.** App.tsx split into `app/ + auth/ + landing/ + matter/{tabs/} + modules-page/ + ui/`. App.tsx is now a 2-line re-export shim. Build green, 343.51 kB gzipped.
- **`780238c` — Agent 9 (unit #9) landed.** README + PEERS + MANIFESTO + ROADMAP + ATTRIBUTIONS rewritten under `docs/`. Root `MANIFESTO.md` + `ROADMAP.md` initially left untouched; **2026-05-15 follow-up:** root files replaced with pointer stubs to canonical `docs/` versions per Andy's call; `docs/MODULE_DEVELOPMENT.md` cross-refs updated.
- **2026-05-15 Andy decision — `docxtpl` rejected for v0.1.** LBA path is now Path A (procedural, recommended) or Path B (internal `python-docx` placeholder helper). `docs/ATTRIBUTIONS.md` Licence note removed. Delta §4 decision 4 + §3.5 unit #8 spec revised.
- **2026-05-15 Andy decision — units #5 + #10b cut to v0.3.** Matter export/import surface has no real second user or second matter to pressure-test at v0.1. Per reviewer's locked rule ("surface and eval ship together or not at all"), both cut as a pair. v0.3 doctrine recorded in `docs/ROADMAP.md` v0.3+ section with the explicit two-mode framing (`full_internal` vs `shareable`) for when it lands. README + ROADMAP updated to remove from v0.1 surface list and from the smoke-eval count (5 → 4). Round 4 + Round 4.5 dissolved. Round 5 (#6 submission flow) is next.
- **`dcfa787` — Agent 6 (unit #6) landed.** Public submission flow shipping. New `POST /api/modules/submissions` (unauthenticated) + `GET /api/modules/submissions/config`. Frontend `SubmitModule.tsx` at `#/modules/submit` with Turnstile widget, capability multi-select, trust-posture radio, live preview, error UX. `frontmatter.dump` keeps YAML-injection safety library-bounded. 52 tests green.
- **2026-05-15 Reviewer adjudication on Round 5 + reviewer fixes batch:**
  - **P1 fix — IP spoofing**: `_client_ip()` now trusts only `CF-Connecting-IP` (set by Cloudflare); falls back to `request.client.host`. `X-Forwarded-For` no longer honoured — an attacker reaching Fly directly cannot rotate the header to bypass the rate limit.
  - **P1 fix — Existing-plugin `module.json`**: endpoint no longer re-PUTs identical content (which the GitHub Contents API rejects as "no changes detected"). The module.json is created only when the plugin does not already exist upstream. Sibling skills under existing plugins stay intact; Andy reconciles at PR review.
  - **P2 fix — `submitter_contact` YAML-injection test**: added; the synthesised frontmatter still survives evil terminators in that field.
  - **P2 fix — Mocked Turnstile + GitHub flow tests**: added six new tests covering Turnstile failure short-circuit, rate-limit 429 after quota, fresh-plugin PR (verifies `module.json` PUT lands), existing-plugin PR (verifies `module.json` PUT skipped — closes P1 #2), GitHub upstream sanitisation (no raw upstream body leaks into 502).
  - **P2 fix — Pre-existing `documents.py:630` FastAPI 204 bug**: `DELETE /{document_id}/anonymise` now uses `response_class=Response` and returns `Response(status_code=204)` — unblocks `TestClient` mounting for any future integration test.
  - **P3 fix — Stale URL in `PRE_FLIGHT.md`**: `POST /api/submissions` → `POST /api/modules/submissions`.
  - Tests: 58/58 (was 52; +6 new — `submitter_contact` injection + five mocked-HTTP tests).
- **2026-05-15 Reviewer adjudications on Rounds 1–3 (post `188d401`):**
  - **P1 fix landed:** `SkillDisabled → HTTP 403` mapped at the three bridge call-sites (`api/matters.py`, `letters/router.py`, `case_law/router.py`) + new disable-short-circuit eval (`test_smoke_evals.py::TestSkillDisabledShortCircuit`). 38/38 tests green.
  - **P2 fix landed:** `GET /api/modules/{plugin}/{skill}` now requires `current_user`. Disabled skills remain inspectable for review-before-re-enable.
  - **P2 fix landed:** missing `module.json` now surfaces in `broken[]` with `"manifest missing"` rather than rendering as a normal skill with empty capabilities.
  - **P2 fix landed:** README + `docs/ROADMAP.md` LBA wording corrected to "procedural .docx generator in v0.1; template-driven LBA returns in v0.2" (3 sites).
  - **Open flag A — `#1a-tail`:** reviewer says finish pre-launch. Spawn a small agent to add `document_edit/schemas.py::ChangesEnvelope` + `anonymisation/schemas.py::AnonymisationEnvelope` and complete the two parser swaps.
  - **Open flag B — resolver "first wins":** reviewer says do NOT make this v3.x doctrine. Ambiguous anchor should become conflict/no-op in v0.2 redline-integrity work. Logged as v0.2 item below.
  - **Open flag C — Eval 4 bypassing full orchestrator:** acceptable for this batch; add one full `/contract-review/run` eval pre-launch as part of `#10b` or Phase E W2 polish.
  - **Open flag D — audit module set:** code is authoritative (`tabular_review` in; `document_generation` was a typo for an action suffix under `document_edit`). Handover/docs already match code.
  - **Open flag E — Anonymise button:** caption-fallback accepted; inline toggle is v0.2.
  - **Open flag F — `docxtpl`:** rejected (already done).
  - **Open flag G — `module.skill.disabled/enabled` taxonomy:** accepted; this is the canonical pair that goes into the required-v0.2 `audit_actions.py` constants module.

## 5.5. v0.2 backlog additions (logged from reviewer adjudication)

- **Redline-integrity (anchor-ambiguity)**: `apply_anchor_substitution` should distinguish between unique-anchor success, no-anchor (already signalled as `skipped_no_anchor`), and ambiguous-anchor (currently silent first-match). v0.2 should make ambiguity a conflict/no-op signal — never a silent first match. Owner: document_edit module.
- **Full orchestrator eval**: end-to-end `/contract-review/run` against Khan-NDA with mocked gateway. Currently #10a covers the agent-level path via `ParserAgent.run` + `RedlinerAgent.run` directly. Pre-launch polish, not blocker.

## 7. Files this handover touches

This file (`HANDOVER_INFRA_BUILD.md`) is reviewer-facing — not load-bearing on the build. The build is governed by `backend/PHASE_INFRA_DELTA.md` (decisions) and the per-phase deltas (scope). If reviewer flags inconsistency between this file and the delta, the delta wins; this file gets corrected.
