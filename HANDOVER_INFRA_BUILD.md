# HANDOVER — Infra + Phase D + Phase E build plan to v0.1 launch

**Base head:** `190a074` on `master` (Phases A + B + C committed + Codex R1/R2/R3 closed; Contract Review SSE UI lands P2.8; `PHASE_INFRA_DELTA.md` approved with Andy's amendments 2026-05-15).
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

## 1. Build order (14 units, 10.5–14 working days from `190a074`)

Days are working-day estimates at AI-pair-programming velocity. Reviewer round-trips absorbed in the build-plan §5 "15–22 days" envelope.

| # | Unit | Days | Parallel safe? | Blocks |
|---|---|---|---|---|
| 1 | Batch-1 parser libs + audit centralisation | 1.0–1.5 | No (touches every module router) | 5 |
| 1a | Structured-output helper (`structured_output.py`) | 0.25 | Yes — owns one new file + four call sites | 9, 10 |
| 2 | App.tsx split (Phase B W0) | 1.0 | No (mechanical move across ~25 files) | 3, 5, 6 |
| 3 | Phase D W1 + deferred buttons + Batch-2 fold | 1.5–2.0 | Partially (backend + frontend split) | 5, 9 |
| 5 | Phase D W2 — matter wire-format + import/export | 2.5–3.5 | No (RFC + endpoints + frontend integrated) | 9, 10 |
| 6 | Phase D W3 — public submission flow | 1.5–2.0 | Yes (own new endpoint + new page) | 12 |
| 8 | LBA docx template (Batch-5 partial) | 0.5–1.0 | Yes (own new template + one router branch) | 9 |
| 9 | Phase E W1 — README/PEERS/MANIFESTO/ROADMAP/ATTRIBUTIONS | 1.0 | Yes (docs only) | 12 |
| 10 | Phase E W2 — five smoke evals | 1.0 | Yes (own `evals/` subtree) | 12 |
| 11 | Phase E W3 — pre-flight + Day-15 deploy delta | 0.5 | Yes (docs + Dockerfile + env vars) | 12 |
| 12 | Phase E W4 + W5 — launch posture + Day-18 coord | 1.0 | No (Andy-coordinated; agent drafts only) | — |
| 13 | v0.2 backlog freeze | — | — | — |

**Critical sequence constraints (re-stated for reviewer):**
- #1 strictly before #5 (`jsonschema` is load-bearing on §4g import validation).
- #2 strictly before #3 (post-split tab files needed for deferred-button homing).
- #4 is **folded** into #3, not parallel.
- #1a can run alongside #1 (separate file, separate call sites) but commit after #1 to keep the audit sweep diff clean.
- #11 strictly before Day-15 deploy.

---

## 2. Agent spawn plan

Same pattern that worked across Phases A → C: agents own non-overlapping files; integration diffs into `App.tsx` / `lib/api.ts` / `main.py` return in summaries and I apply serially after agents return. Module-local `api.ts` shims used during parallel work, consolidated in unit #3.

### Round 1 — units #1 + #1a in parallel

**Agent 1A — parser swap + audit sweep (`general-purpose`, foreground).**
- Owns: `backend/app/core/matter_fs.py`, `backend/app/adapters/plugin_bridge.py`, `backend/app/api/modules.py`, `schemas/module.json`, all 14 files in §3.1 audit sweep list.
- Adds deps: `pyyaml>=6.0`, `python-frontmatter>=1.1`, `jsonschema>=4.21` in `backend/pyproject.toml`.
- Acceptance: `grep -rn "AuditEntry(" backend/app/ --include="*.py"` returns only `audit.py` + `models/audit.py` + middleware. `python -m compileall backend/app` clean. Existing Phase A/B/C tests green.

**Agent 1B — structured-output helper (`general-purpose`, foreground).**
- Owns: new `backend/app/core/structured_output.py`, and four call sites: `backend/app/modules/contract_review/agents.py`, `backend/app/modules/document_edit/pipeline.py`, `backend/app/modules/pre_motion/agents.py`, `backend/app/modules/anonymisation/prompts.py`.
- Adds: `StructuredOutputError(Exception)` with `raw_text` attribute for audit; `parse_model_json(raw: str, model: type[BaseModel]) -> BaseModel` that strips ```json fences, takes first balanced `{...}`, validates against `model`.
- **Must not** import from `model_gateway.py`. Gateway/parsing boundary is doctrine.
- Acceptance: four ad-hoc regex sites retired. Smoke run of Contract Review pipeline against Khan-NDA seed still produces valid `ContractReviewResult`.

**Conflict surface:** Agent 1A touches `contract_review/agents.py` and `document_edit/pipeline.py` for audit sweep; Agent 1B touches the same files for parsing swap. Resolution: Agent 1B blocks on Agent 1A's commit, then rebases. Run 1A foreground first; spawn 1B after 1A returns.

### Round 2 — unit #2 (App.tsx split)

**Agent 2 — mechanical-only split (`general-purpose`, foreground).**
- Verbatim scope from `PHASE_B_DELTA.md` §W0. Target tree: `frontend/src/{app,auth,landing,matter,modules,ui,modules-page,lib}/`.
- ~3,450 lines moved across ~25 files. No new components. No behaviour change.
- Gotcha (per Phase B handover): lift `AuthProvider` + `useAuth` together into `app/App.tsx` root, not piecemeal.
- Acceptance: `npm run build` green. `tsc -b` clean. Pixel-identical UI before/after at every tab. `App.tsx ≤ 350 lines`.

**No parallelism on this unit** — surgical move across the whole tree.

### Round 3 — units #3 + #8 + #9 + #10 + #11 in parallel (after #2 lands)

Once the App.tsx split lands, frontend ownership is sharded by directory, making parallelism safe.

**Agent 3 — Phase D W1 + deferred buttons + Batch-2 fold.**
- Backend owns: `backend/app/api/modules.py` (capabilities + trust_posture surfacing), `backend/app/api/workspace.py` (toggle endpoints if not yet present).
- Frontend owns: `frontend/src/modules-page/Modules.tsx`, `frontend/src/matter/tabs/LettersTab.tsx`, `frontend/src/matter/tabs/PreMotionTab.tsx`, `frontend/src/matter/tabs/DocumentsTab.tsx`. Consolidates module-local `api.ts` shims into `frontend/src/lib/api.ts`.
- **v0.1 launch-copy guard:** Modules page must say declared capabilities are *under review / displayed*, **not** "capability-gated." Reviewer should grep the diff for the phrase "capability-gated" and reject if present in user-facing strings.
- Acceptance: §3.3 of `PHASE_INFRA_DELTA.md` bars; disabled-pill renders; audit-tab filter by `module` column works; three deferred buttons fire end-to-end.

**Agent 8 — LBA docx template.**
- Owns: new `backend/app/templates/docx/lba.docx` (binary; built in Word by Andy or via `python-docx` scaffold + manual polish), `backend/app/modules/letters/router.py` (one branch `if letter_type == "lba"`).
- Adds dep: `docxtpl>=0.16` in `pyproject.toml`.
- **Boundary:** audit row shape unchanged; `module.letters.docx.exported` payload gains `"template_name": "lba"`. Other letter types fall through to existing `generate_docx` path — no regression.
- Acceptance: Khan-LBA renders via template; `pytest` audit-shape eval green.

**Agent 9 — docs rewrite (Phase E W1).**
- Owns: `README.md`, `docs/PEERS.md`, `docs/MANIFESTO.md`, `docs/ROADMAP.md`, `docs/ATTRIBUTIONS.md`.
- Hard guards: Will Chen (Mike, AGPL-3.0) and Jan Kubica (Stella, Apache-2.0) framed as **peers, not competitors**. Solicitor-first README. No agent files DMs/issues/discussions — drafts in `docs/outreach/` only.
- Acceptance: cold reader (non-technical solicitor) can read README and form intent to clone within 60 seconds.

**Agent 10 — five smoke evals (Phase E W2).**
- Owns: `evals/` subtree (currently empty or thin). Five evals per `PHASE_E_DELTA.md` W2: matter portability round-trip, audit-row contract, posture-routing, redline anchor resolution, NDA-clause parse.
- Depends on #5 endpoints — schedule **after** #5 lands. If #5 slips, ship #9 + #11 + #12 first and treat #10 as thin-proof escape per Phase E §"Thin-proof escape."

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
- Privilege-aware redaction: per `PHASE_D_DELTA.md` Gotcha 1 redaction matrix. Thin-proof: ship without; credible: ship with.
- Acceptance: round-trip Khan matter export → import to a fresh DB → all audit rows replay; slug-collision returns 409 with conflict body.

Standalone because it touches the import/export surface across backend + frontend + docs simultaneously and the RFC needs a coherent voice.

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
| #1 | `grep -rn "AuditEntry(" backend/app/` returns only 3 permitted sites; all audit rows non-null `module`; existing tests green |
| #1a | Four regex sites retired; `structured_output.py` exports `parse_model_json`; gateway not imported into it; Contract Review against Khan-NDA round-trips |
| #2 | `npm run build` green; `App.tsx ≤ 350 lines`; pixel-identical UI; no behaviour change |
| #3 | Modules page renders capabilities + trust posture as **declarations**; three deferred buttons land; module-local `api.ts` shims consolidated |
| #5 | Export tarball → import to fresh DB → audit rows replay; slug-collision 409; `Draft202012Validator` + JSON pointer 422 body verified |
| #6 | Draft PR opens against `b1rdmania/claude-for-uk-legal` via `b1rdmania` PAT; Turnstile rejects synthetic submission; config gate works |
| #8 | Khan-LBA renders via `docxtpl` template; audit row payload includes `template_name: "lba"`; non-LBA letter types fall through unchanged |
| #9 | Cold solicitor reader: 60-second README → intent to clone; PEERS/MANIFESTO/ROADMAP/ATTRIBUTIONS cross-link cleanly |
| #10 | Five smoke evals green against integrated tree |
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

## 6. Reviewer questions worth answering before round 1 spawns

1. **Round 1 conflict surface (1A vs 1B on shared files):** is "1A foreground first, 1B after" right, or should 1B own a thin pre-pass that adds `structured_output.py` + StructuredOutputError, then 1A's audit sweep cleans up parsing call-site audit calls in the same pass?

2. **Unit #5 thin-proof vs credible:** ship without privilege-aware redaction matrix (thin) and add v0.2, or fold the matrix in now (+0.5–1.0 day)? Recommendation: thin for launch, since the demo matter (Khan) doesn't exercise the multi-posture edge case that justifies the matrix.

3. **Unit #8 template authoring:** Andy authors `lba.docx` in Word, or agent scaffolds via `python-docx` and Andy polishes? Recommendation: Andy authors directly — template editing is faster in Word than scripting it.

4. **Unit #10 evals depending on #5:** if #5 slips past Day-12, do we ship Phase E without the matter-portability eval (5 → 4)? Recommendation: yes — thin-proof escape per `PHASE_E_DELTA.md`.

5. **Round 3 parallel safety:** Agent 3 touches `frontend/src/lib/api.ts` (consolidation) at the same time Agent 5 is adding new endpoints. Mitigation: Agent 5 lands its `lib/api.ts` additions as a module-local shim that Agent 3's consolidation absorbs after #5 returns. Confirm or propose alternative.

---

## 7. Files this handover touches

This file (`HANDOVER_INFRA_BUILD.md`) is reviewer-facing — not load-bearing on the build. The build is governed by `backend/PHASE_INFRA_DELTA.md` (decisions) and the per-phase deltas (scope). If reviewer flags inconsistency between this file and the delta, the delta wins; this file gets corrected.
