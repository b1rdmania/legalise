# Simplify / dedup cut-list — 2026-06-04 (analysis output)

> Read-only multi-agent review. Doc-sprawl deletion executed same night; backend code surgery deferred until the 17 codex/document-* branches land (fights a moving target + needs green test baseline). Regulated core (state_machine / audit / grants / privilege / exports) is flag-only.

All the analysis is already in the lane outputs. I'll synthesize directly without re-running anything.

# Legalise Code-Quality Cut-List — Synthesized Review

Branch: `chore/kiss-simplify-pass` @ `be6f672`

## 1. Headline Numbers

| Category | Est. lines removable | Confidence |
|---|---|---|
| **(a) Doc-sprawl deletion** | ~100 files (build exhaust) | High — decision rule is the handovers `INDEX.md` itself |
| **(b) Auto-safe code cuts** | **~285 lines** | High — static-only, zero importers, no fence |
| **(c) Supervision-required code cuts** | **~1,400–2,000 lines** | Medium — genuine duplication, but touches HTTP/SSE/audit/posture contracts |

**Auto-safe breakdown (~285 lines):** `app/agents/` package (66–70), `parse_matter_md` (15), `VerifiedPublishersError` (4), `app/modules/matter/__init__.py` (2), stale `main.py` comment (2), 28 unused imports (~25), `core/api.py` None placeholders (15), `scrub_dict` import (1), frontend dead code is large but flagged non-auto (see below).

**Important honesty caveat:** the two single biggest line counts — `modules-page/Modules.tsx` (555) and `matter/AgentStatusCard.tsx` (98) — are dead with zero imports but the frontend lane marked them `auto_safe: false` pending a typecheck. They are near-certain deletes but need one green typecheck run, so they sit in category (c) by the lane's own caution, not (b).

## 2. Ranked Top Code Findings

Ranked by lines-saved × confidence (dead-code with zero importers ranks above refactors that touch live contracts).

| # | Title | Kind | Files | Est. lines | Auto-safe | Severity |
|---|---|---|---|---|---|---|
| 1 | `modules-page/Modules.tsx` fully orphaned v1 skills page | dead_code | `modules-page/Modules.tsx`, `router/index.tsx:138` | 555 | No (typecheck) | high |
| 2 | SSE streaming machinery duplicated near-verbatim (pre_motion ↔ contract_review) | duplication | `pre_motion/router.py:45-265`, `contract_review/router.py:47-264` | 200 | No | high |
| 3 | Provider-error try/except block duplicated across 7+ routers → 3 exception handlers | duplication | 7 routers + `api/matters.py` | 160 | No | high |
| 4 | Load-on-mount fetch lifecycle hand-rolled in ~20 components → one `useAsyncQuery` | duplication | `ArtifactsList`, `GrantsPanel`, `AdminUsersList` +17 | 120 | No | medium |
| 5 | `.docx` export handler duplicated 4x | duplication | letters/contract_review/pre_motion/tabular routers | 120 | No (**doc-engine fence**) | medium |
| 6 | Pipeline emit/stage/timing helpers duplicated (the two pipelines) | duplication | `contract_review/pipeline.py`, `pre_motion/pipeline.py` | 110 | No (**audit fence**) | medium |
| 7 | `matter/AgentStatusCard.tsx` dead component | dead_code | `matter/AgentStatusCard.tsx` | 98 | No (typecheck) | high |
| 8 | Per-module `AgentCall` + `BaseAgent.run` duplicated | duplication | `contract_review/agents.py`, `pre_motion/agents.py` | 90 | No | medium |
| 9 | Provider-key preflight gate duplicated 5x | duplication | 5 files | 70 | No | high |
| 10 | **`app/agents/` dead v0.2 placeholder package** (both backend lanes) | dead_code / over_abstraction | `app/agents/{__init__,base,orchestrator}.py` | 66–70 | **Yes** | medium |
| 11 | 3 MatterDetail export handlers near-identical → `useExportAction` | duplication | `MatterDetail.tsx:210/230/251` | 50 | No | medium |
| 12 | Dead barrel API fns in `lib/api.ts` (invokePlugin, runPreMotion, deleteAnonymisation, runContractReview) | dead_code | `lib/api.ts:1155/1352/2088/2477` | 40 | No (typecheck) | medium |
| 13 | Markdown report renderer reimplemented per module | duplication | contract_review/export, pre_motion/router, assistant/pipeline | 40 | No (doc-adjacent) | low |
| 14 | `_translate_status_error` verbatim (anthropic ↔ openai) | duplication | `anthropic_provider.py`, `openai_provider.py` | 35 | No | medium |
| 15 | Unused FE primitives (StatusBadge, ROW_CLASS_ORDER, grantedCapabilityKeys) | dead_code | primitives/auditClassify/skillRunnerModel | 35 | No (typecheck) | medium |
| 16 | Blob-download snippet copy-pasted 5x → `triggerDownload` | duplication | MatterDetail x3, LawveImport, ReviewEditor | 25 | No | medium |
| 17 | 28 unused imports across non-fenced files | dead_code | 25 files | 25 | **Yes** | low |
| 18 | `append_event()` documented but never called | dead_code | `core/jobs.py:191` | 25 | No (**audit fence**) | medium |
| 19 | `grant_many()` exported, zero callers | dead_code | `core/capabilities.py:336` | 20 | No (**grants fence**) | medium |
| 20 | Posture-blocked-message construction duplicated 3x | duplication | pre_motion/contract_review routers, api/jobs | 20 | No (posture fence) | low |
| 21 | Thin matter-resolve wrappers (6 one-liners) → call `resolve_owned_open_matter` directly | over_abstraction | 6 routers/api | 30 | No | low |
| 22 | `parse_matter_md()` exported, zero callers | dead_code | `core/matter_fs.py:78` | 15 | **Yes** | medium |
| 23 | `core/api.py` None placeholders (require_matter, storage) | dead_code | `core/api.py:65/253/261` | 15 | **Yes** | low |
| 24 | `_PluginBridgeProxy` unused indirection | over_abstraction | `core/api.py:226-250` | 18 | No (published `__all__` surface) | low |
| 25 | `VerifiedPublishersError` never raised/caught | dead_code | `core/publishers.py:16` | 4 | **Yes** | low |

Lower-value tail (each <16 lines, all flagged): observability wrappers (16), `_find_capability_declaration` dup (12, grants fence), `TransitionDef` (10, state_machine fence), Ollama 3-arm except (8), waitlist constants (6), `tabular_review._require_matter` (6), tabs/* re-export shims (3), stale main.py comment (2), `modules/matter/__init__.py` (2), `audit_reconstruction.py` UTC import (1, audit fence).

## 3. Regulated Core — Leave Alone (correctly protected)

Both backend lanes converged on the same fence and held it. Confirmed protected:

- **Audit surface:** `append_event` (writes audit log), pipeline `run.start`/`run.complete` rows, `audit_reconstruction.py` (UTC import flagged but NOT cut), `ProviderResponse` cost columns, `MatterDetail` `listAudit` refresh.
- **Grants/capabilities:** `grant_many`, `_find_capability_declaration` in `grants_lifecycle.py`.
- **State machine:** `state_machine/**`, `TransitionDef`.
- **Posture gating:** the C_paused 409 message + privilege-posture preflight.
- **Provider-key policy:** the keyless-Ollama / dev-fallback gate (hardened over R2/R3 Codex rounds) — flagged for dedup but explicitly "verify behavior preserved across all 5 sites."
- **Doc-engine:** `.docx` export handlers, `generate_docx`, `/api/documents/generated`, `render_*_markdown`, frontend `document_preview`/`document_edit` modules.
- **Deliberate architecture-rewrite scaffolds (keep/defer, owner call — NOT dead code):** `mcp_host/**` (~562 LoC) and `sandbox/**` (~399 LoC). Per project memory these are the locked MCP-first capability-runtime pre-wiring. Do not cut.

This is the right call — none of the high-value cuts breach the fence.

## 4. Tomorrow's Supervised Pass — Ordered Checklist

Each group is independently testable. Land in order; commit per group so a failing test bisects cleanly.

**Group 0 — Auto-safe sweep (run typecheck + focused tests only, ~285 lines).**
- [ ] Delete `app/agents/` package (both backend lanes agree; zero importers, `NotImplementedError` body).
- [ ] Delete `parse_matter_md`, `VerifiedPublishersError`, `app/modules/matter/__init__.py`, `core/api.py` None placeholders.
- [ ] Remove the 28 unused imports + stale `main.py:392` comment + `scrub_dict` import.
- [ ] Gate: `pytest` import/collection + `ruff`/typecheck green.

**Group 1 — Frontend dead-code deletes (one `tsc --noEmit` + vitest run).**
- [ ] Delete `modules-page/Modules.tsx` (555) — confirm `legacyModulesRedirect` shim is a `beforeLoad` redirect, not a render.
- [ ] Delete `matter/AgentStatusCard.tsx` (98).
- [ ] Remove dead `lib/api.ts` barrel fns (4) + unused primitives (StatusBadge/ROW_CLASS_ORDER/grantedCapabilityKeys) + waitlist constants.
- [ ] Gate: typecheck + vitest. Keep test-only seams (`parseHash`, `routeFromPath`, `artifactIdsFromResult`, `__routeIdsForTests`).

**Group 2 — Provider error contract (run full API test suite + provider unit tests).**
- [ ] Centralise the provider-error except-chain into 3 `@app.exception_handler`s in `main.py` (mirror existing `CapabilityDenied`). Removes ~160 lines across 7 routers.
- [ ] Fold the C_paused 409 posture message into the same path (~20).
- [ ] Hoist `_translate_status_error` to a shared home (`providers/_errors.py` or `core/user_keys.py`) — its "circular import" docstring is stale (~35).
- [ ] Gate: every status code + JSON `detail` body byte-identical. Keep inline `ValueError`/`SkillDisabled`/`FileNotFoundError` catches.

**Group 3 — Provider-key preflight (provider-key + posture tests).**
- [ ] Extract `require_provider_key(session, user_id, model_id, posture)` → `core/user_keys.py`, raising `ProviderKeyMissing`; HTTP mapping handled by Group 2's handler. Collapses 5 sites (~70).
- [ ] Gate: keyless-Ollama and dev-fallback behaviour preserved at all 5 sites (R2/R3-hardened — verify, don't assume).

**Group 4 — SSE + pipeline runtime (streaming/SSE tests + manual disconnect check + audit tests).**
- [ ] Extract `core/sse.py::stream_pipeline(...)` from the two near-identical run-stream endpoints (~200).
- [ ] Extract shared `AgentCall` + dispatch wrapper → `core/agent_call.py` (~90).
- [ ] Extract pipeline emit/stage/timing helpers (~110) — **audit fence: `run.start`/`run.complete` rows must still land on disconnect.**
- [ ] Gate: manual SSE disconnect → confirm pipeline keeps running and audit rows persist.

**Group 5 — Frontend refactors (full vitest + typecheck + reviewer).**
- [ ] `triggerDownload(blob, filename)` util → rewire 5 call sites (~25).
- [ ] `useExportAction` for the 3 MatterDetail handlers (~50) — audit-refresh + busy states must still fire.
- [ ] `useAsyncQuery<T>` hook for the ~20 load-on-mount components (~120) — **high blast radius, audit/grants/signoff panels; reviewer sign-off required, do last.**

**Owner decisions (not cuts — queue separately):** keep/defer `mcp_host` + `sandbox` (~960 LoC); `_PluginBridgeProxy` and `tabs/*` re-export shims (published-surface / deliberate-uniformity judgment calls); `demo/snapshot.ts` (1316 lines) — code-split candidate, product decision.

## 5. Cross-Lane Dedup (merges applied above)

- **`app/agents/` package** — flagged by *both* backend lanes (dead-code lane #1 "unused v0.2 placeholder" 66 lines; KISS lane "dead agent scaffolds" 70 lines). Merged into ranked row #10, single 66–70 line entry, auto-safe.
- **`VerifiedPublishersError`** — flagged by both backend lanes (dead-code + KISS). Merged, row #25.
- **`scrub_dict` unused import** — appears in dead-code lane's import batch AND KISS lane as standalone. Merged into Group 0.
- **`tabular_review._require_matter` / thin matter-resolve wrappers** — duplication lane (6 wrappers, #21) and KISS lane (the tabular one specifically). Merged; the duplication-lane framing (all 6) supersedes.
- **Provider-key preflight + provider-error block** — duplication lane's findings #1 and #3 are interdependent (the preflight's HTTP mapping is deleted *by* the exception handler). Sequenced together as Groups 2→3 so they're not double-counted: ~160 + ~70, not additive surprises.
- No conflicting verdicts found across lanes — where two lanes touched the same symbol they agreed on disposition.

**Confidence summary:** category (a) doc deletes and category (b) auto-safe cuts are high-confidence and could ship tomorrow behind a typecheck. Category (c) is genuine duplication, not coincidental similarity, but every item touches a behaviourally load-bearing contract (HTTP status bodies, SSE disconnect semantics, audit emission, the R2/R3-hardened key policy) — so the line-savings are real but each must clear its named test gate before merge. Do not batch Groups 2–5 into one PR.