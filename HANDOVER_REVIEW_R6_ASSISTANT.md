# HANDOVER — Review of polish + demo + assistant (Rounds 6-ish)

**Repo:** `github.com/b1rdmania/legalise` · **HEAD:** `acfae77` on `master`
**Base before this batch:** `976812d` (your last signoff — reviewer fixes on Round 5)
**Range to review:** `git log --oneline 976812d..acfae77` (6 commits, ~1,400 LoC net)
**Read these first (decision authority):**
1. `HANDOVER_ASSISTANT.md` — locked design decisions for the assistant build (§1) + scope (§2 backend, §3 frontend) + acceptance bar (§4). Andy's amendments at the end (2026-05-15) lock Assistant as a sibling tab, not the default landing.
2. `HANDOVER_INFRA_BUILD.md` §6.5 — execution log with the polish-pass + demo + assistant entries.
3. `backend/PHASE_INFRA_DELTA.md` §4 — locked doctrine (still binding).

---

## Commit-by-commit map

| Commit | Unit | What it does | LoC |
|---|---|---|---|
| `dec29ef` | Polish | Settings 204 bug + auth-shadow fix (`/api/modules/submissions/config`) + full orchestrator eval + audit-tab module filter UI | +313 / -36 |
| `cefb108` | Doc | Earlier consolidated review brief (R1–R3). No code. | docs only |
| `3591833` | Demo | Public `#/demo` route, snapshot of Khan v Acme, no backend calls. Three module tabs gain optional `initialData` / `previewResult` props so they render from canned data | +~2,200 |
| `80aa5a6` + `8cdf21c` | Doc | `HANDOVER_ASSISTANT.md` build plan + Andy's placement/prompt decisions. No code. | docs only |
| `e8d32c4` | Assistant backend | New table + router + pipeline + 5 tests + audit-row parametrize bump | +~700 |
| `acfae77` | Assistant frontend | New AssistantTab + chat UI + demo conversation fixture | +492 / -2 |

## Build/test status at HEAD `acfae77`

- `cd backend && python -m compileall app` clean
- `cd backend && python -m pytest -x` — **66 passed** (was 60; +5 assistant tests + 1 audit-row parametrize from canonical-modules extension)
- `cd frontend && npm run build` — `tsc -b` clean, Vite 414.17 kB / gzip 119.25 kB
- Dev stack live: `http://localhost:3000` (frontend) + `http://localhost:8000` (backend)
- Assistant POST unauth verified returns 401 against the live backend

---

## Locked doctrine still in effect

`grep -in "capability-gated\|capability-enforced\|enforces.*capabilit" frontend/src/ backend/app/` → empty.
`grep -rn "AuditEntry(" backend/app/ --include="*.py"` → still only the 4 permitted helper/model/middleware sites.
`grep -rn "docxtpl" backend/` → empty (still v0.3 per Andy's call).
`grep -rn "ziggythebot" backend/ frontend/src/ infra/ docs/ | grep -v variant-workflow` → only the negation guards in `cloudflare.md` + `config.py` + `submissions.py`.
`grep -rn "model_gateway" backend/app/core/structured_output.py` → empty (gateway/parser boundary preserved).
Module set in tests now: `letters, pre_motion, contract_review, anonymisation, case_law, chronology, document_edit, tabular_review, module_lifecycle, plugin, assistant` — assistant added cleanly.

---

## Behaviour changes worth your eye

### Assistant — new surface

1. **`assistant_messages` table** persists per-matter conversation. Migration `0006 → 0007` adds the table with FK CASCADE on matter delete + composite index on `(matter_id, created_at)`. Verified `alembic upgrade head` runs clean inside the backend container.

2. **`POST /api/matters/{slug}/assistant/messages`** — appends a user message, runs `run_assistant_turn`, persists the assistant reply with `suggested_actions`, returns both messages. Owner-only (`Matter.created_by_id == user.id`). 404 on missing/foreign matter, 409 on `PrivilegePaused`, 422 on `ProviderKeyMissing`.

3. **`GET /api/matters/{slug}/assistant/messages`** — returns ordered conversation. Same ownership gate.

4. **Pipeline composition (the substrate proof):** same `gateway.call(...)` → posture-aware routing handles C_paused automatically. Same `audit.log(...)` → new `module="assistant"`, action `module.assistant.message`. Same `parse_model_json` from `core/structured_output.py` against `AssistantResponseEnvelope`. **Gateway/parser boundary preserved** — `pipeline.py` does NOT import `model_gateway`'s internals beyond the `gateway` instance.

5. **Prompt assembly order** (matters for truncation): matter facts → chronology summary → selected/recent document snippets → installed-modules list → conversation history → user message. Hard char-budget at `token_budget * 4`. User's own question survives if the budget is hit.

6. **Parse-fallback behaviour:** if the model returns non-JSON (likely with `stub-echo` provider), the pipeline persists the raw text as `content` with `suggested_actions=[]` rather than 5xx-ing the turn. Gateway's `model.call` audit row still captures the response hash. **Worth your judgment** — is this the right user-facing behaviour, or should we surface the parse failure to the chat thread as a "model returned invalid output, retry" error?

7. **System prompt is a v0.1 stub** — the §2 step-3 placeholder from `HANDOVER_ASSISTANT.md` with a JSON-shape trailer line added by the backend agent so `parse_model_json` has something to anchor. Andy will refine the prompt in a follow-up pass before launch. The trailer line is in `backend/app/modules/assistant/pipeline.py`.

8. **Installed-modules surfacing:** `_load_installed_modules` in `pipeline.py` mirrors `_skill_paths` from `api/modules.py` rather than importing/refactoring it. Agent flagged this as deliberate to avoid coupling to the HTTP endpoint or a private helper. **Drift risk** — if the module-discovery logic in `api/modules.py` changes, this mirror needs to follow. Worth a doctrine call: extract to a shared helper now, or accept the duplication for v0.1?

### Frontend — assistant tab

9. **New tab appended to the end** of the matter tab bar (after Audit). `initialTab` unchanged → Overview is still the default landing.

10. **Citation chips** rendered inline via regex over message content: `[doc:Title]` and `[chron:event-id]` become clickable buttons that call `setTabAndHash(...)`. JSX text nodes (React auto-escaping) — but the regex parser is hand-rolled. **Worth checking** — is the pattern safe against `]` / `[` in document titles? E.g., a doc titled `[draft] LBA — Khan` would parse oddly.

11. **Optimistic UI:** user message renders immediately with an `optimistic-<ts>` id, "Assistant is thinking…" placeholder, replaced with server response on completion. On error the optimistic row is filtered out so user can retry.

12. **Context strip:** top 3 docs sorted by `uploaded_at` desc + top 3 chronology events by significance/date. Checkboxes drive `selected_document_ids` on the next POST. No per-message state retained — checkbox state lives only on the next send.

### Demo — assistant conversation

13. **4-turn canned conversation** in `frontend/src/demo/snapshot.ts`. User asks for NDA summary → assistant cites `[doc:Mutual NDA — Khan & Acme]` + emits `review_contract` chip. User asks for dismissal date → assistant cites `[chron:ev-05]` + emits `view_chronology` and `run_pre_motion` chips. Cold-readable, no architectural leak.

14. **Textarea disabled in demo** with placeholder "Sign up to chat with the assistant on your own matter." Action-chip clicks navigate inside the demo's existing tab snapshot — never call the backend.

### Polish (`dec29ef`)

15. **`/api/settings/keys/{provider}` DELETE 204 fix** — same FastAPI assertion bug pattern as `documents.py:630`. Surfaced by the orchestrator-eval agent when mounting TestClient.

16. **`GET /api/modules/submissions/config` no longer 401s in dev** — routing-conflict fix. The modules router's auth-gated catch-all `GET /{plugin}/{skill}` was shadowing the public `GET /submissions/config`. Mount order swapped in `main.py` (submissions before modules under shared `/api/modules` prefix).

17. **Audit-tab module filter UI** — dropdown with per-module entry counts and a separate `http (middleware)` bucket. Closes the "Phase E polish if time" item from `PHASE_INFRA_DELTA` §5.

18. **Full orchestrator eval** — `TestContractReviewOrchestratorE2E` mounts `TestClient(app)`, overrides auth + session deps, mocks all four agents, posts to `/api/matters/.../contract-review/run`. Happy-path + C_paused 409. Closes the open flag C from your first review round.

---

## Open flags requesting adjudication

**A. Parse-fallback behaviour on non-JSON model output.** Current: persist raw text + empty `suggested_actions`. Alternative: surface a "model returned invalid output, retry" message in the chat thread. (Item 6.)

**B. `_load_installed_modules` duplication.** Pipeline mirrors `_skill_paths` from `api/modules.py`. Doctrine call: extract to a shared helper now, or accept v0.1 duplication and clean up in v0.2? (Item 8.)

**C. Citation-chip regex robustness.** Hand-rolled `[doc:...]` / `[chron:...]` parsing on message content. Document titles containing `[` / `]` may parse oddly. Should we escape brackets on the model side via the system prompt, or harden the parser? (Item 10.)

**D. System prompt before launch.** Currently a v0.1 stub with a JSON-shape trailer. Andy plans a follow-up rewrite. Reviewer call: must the rewrite land before launch, or can a stubby prompt ship for v0.1?

**E. Demo route bundle weight.** Vite gzipped output jumped 99 → 119 kB (snapshot + demo component + assistant tab). Acceptable for v0.1? Or worth code-splitting the demo route?

---

## Hard guards still in force (re-stated)

1. No AGPL contamination. Apache-2.0 only.
2. Peer framing (Mike / Stella) lives in `docs/PEERS.md` only — workspace stays product-positioned per Andy's 2026-05-15 decision. No skill-source ribbons, no "skills fired" chips, no peers footer inside the product.
3. No agent-filed external comms. Outreach drafts in `docs/outreach/` only.
4. `GITHUB_SUBMISSION_TOKEN` = `b1rdmania`-scoped PAT only. Not `ziggythebot`.
5. v0.1 launch copy must NOT use "capability-gated" / "capability-enforced".
6. Gateway/parser boundary: `parse_model_json` in `core/structured_output.py`, not `model_gateway.py`.
7. Job runner direction locked v0.2: `arq` + Redis + `jobs` table. SSE-disconnect smoke step required Day-15.
8. Matter portability (`#5 + #10b`) cut to **v0.3** per Andy 2026-05-15. Wire-format doctrine preserved in `docs/ROADMAP.md` v0.3+ section for when demand evidence appears.

---

## What the reviewer should do

1. `git log --oneline 976812d..acfae77` — eyeball the 6 commits.
2. Walk the **behaviour changes** above; check each is intentional. Item 4 (assistant pipeline composition) is the most load-bearing — verify it really does compose over the existing substrate without introducing a parallel path.
3. Sample the **doctrine grep targets** — confirm all empty.
4. Adjudicate **open flags A–E**.
5. Live-test: sign up at `localhost:3000`, open Khan v Acme, click the Assistant tab. Send a message. Confirm the suggested-action chip navigates correctly. Then open `#/demo` and confirm the canned conversation renders without any 401s in the network tab.
6. Stress-test owner-only access: create a second user, try to GET `/api/matters/khan-v-acme/assistant/messages` — should 404, not return the first user's conversation.

If the doctrine in `PHASE_INFRA_DELTA.md` §4 or `HANDOVER_ASSISTANT.md` §1 is contradicted by code, the doctrine wins and the code gets fixed.
