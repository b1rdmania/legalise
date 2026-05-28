# Session handover — 2026-05-27 → 28 (for the Reviewer)

Full record of an overnight builder session. Everything here is either
landed, awaiting your review, or proposed for your redline. Nothing
substrate-touching shipped without a plan; Phase 17 redesign has NOT
started (still walkthrough-gated).

---

## 1. Landed on master

| Commit | What |
| --- | --- |
| `77e871f` | **PR #10** (Raijun) squash-merged — unblock local signup + Phase 17 auth entry. Closed walkthrough findings L-1 (landing affordance) + L-2 (signup 404 via `/auth` proxy) + P18-C (CI red on master, repo-root PYTHONPATH). |

CI on master green at merge.

---

## 2. Open PR awaiting your review / merge

**PR #11** — `fix/vite-auth-proxy-spa-bypass` (`fc10e77`). **All checks green** (backend pytest, frontend build, e2e 3m25s, storage, worker, voice).

- **What:** follow-up to #10. PR #10's blanket `/auth` Vite **dev** proxy catches frontend route cold-loads: `GET /auth/signin` and `/auth/signup` get forwarded to FastAPI (no GET handler) → 404. In-app nav works (React Router client-side); URL-bar entry doesn't.
- **Why CI missed it:** #10's `serve-e2e-preview.mjs` does correct SPA fallback for the built bundle; CI uses that. Local `vite dev` uses the proxy block in `vite.config.ts`, which had no HTML bypass.
- **Fix:** one file — `proxyHtmlBypass` returns the URL for HTML GETs (SPA serves), POSTs/JSON fall through to backend.
- **Verification gap:** live re-probe blocked because the running local stack is bound to a *different checkout* (see §6). Static verification + typecheck clean; e2e green confirms preview path unbroken.
- **Decision for you:** merge, or redline. If merged, the Phase 17 walkthrough can cold-load `/auth/signin` and `/auth/signup`.

---

## 3. Plans awaiting your redline

### Phase 17 — CRM-Ergonomic UI Pass (v3, on `phase-17-crm-pass`)

Already ratified through v3 earlier. **Step 0 split** into:
- **Operator-proxy walkthrough** (now-runnable engineering gate) — cold CRM/SaaS operator preferred; Andy-fallback allowed but labelled non-cold.
- **Solicitor/legal-ops walkthrough** (deferred launch-readiness gate) — before public launch / design-partner outreach.

Three target screens: matter detail, modules, audit reconstruction. Hard gate (not the 40% metric): top P1 findings closed + unaided second run + e2e green + no substrate touches. Substrate tripwire by path: `backend/app/**`, `backend/alembic/**`, `schemas/**`, `examples/modules/**` blocked; `frontend/src/**` allowed.

**Status: ratified. Blocked on the walkthrough artifact existing.** 17A/B/C cannot start until `PHASE_17_COLD_WALKTHROUGH.md` is filled and you lock the build order.

### Phase 18-G — Module DX (v1, awaiting redline)

`docs/handovers/PHASE_18_G_MODULE_DX_PLAN.md` (`78bebcf`). Two CLIs sibling to bootstrap_admin/doctor:
- `legalise module new <name>` — scaffold a starter module.
- `legalise module validate <path>` — wraps `validate_manifest_v2` with author-language error translation.

B ships before A so scaffold output is unit-tested against the validator. No substrate, no schema, no signing changes. Seven open questions, all with proposed defaults. **Needs your redline.**

---

## 4. Backlog state (`POST_PHASE_17_BACKLOG.md`)

| ID | Item | State |
| --- | --- | --- |
| P18-A | Document Parser reference module (Marker, build-ourselves) | Planned, not started. Substrate work — own phase. |
| P18-B | Signup 404 (L-2) | **CLOSED by PR #10** |
| P18-C | CI red on master (posture-block 500/403) | **CLOSED by PR #10** (root cause was PYTHONPATH, not audit_failure bypass) |
| P18-D | Stale worktree-agent-* branches | Confirmed fully merged; locked by active session, prune after `/clear` |
| P18-E | Audit export (PDF/CSV) | Backlog |
| P18-F | Security hardening sweep | Backlog |
| P18-G | Module DX | **Plan v1 drafted, awaiting your redline** |
| P18-H | Document Redliner | Backlog (Phase 17 inventory should clarify if distinct from existing doc-edit) |
| P18-I | Lawve AI skill submissions | Strategy drafted (3 batches, Nash-bands IP caveat) |
| P18-J | Host-aware waitlist env var | Documented in hosted-prod handover §11.4.1 |
| P18-K | *(new this session)* `/auth` proxy SPA bypass | **CLOSED by PR #11** (pending merge) |

---

## 5. Proposed next moves (your call on order)

1. **Merge PR #11** → unblocks the walkthrough cold-loads.
2. **Resolve the two-checkout situation** (§6) → so the running stack reflects master.
3. **Run the operator-proxy walkthrough** → Andy or a cold CRM operator drives `docs/DEMO.md`, fills `PHASE_17_COLD_WALKTHROUGH.md`.
4. **You lock 17A/B/C order** from the walkthrough findings.
5. **Redline P18-G** whenever — independent of Phase 17.
6. **P18-A (advanced parsing / Marker)** — gets its own plan when Phase 17 closes. Three optional spikes proposed (Marker quality on legal PDFs, licence/footprint due diligence, plan draft) — none started, awaiting your steer on whether to advance ahead of Phase 17.

---

## 6. Environmental finding — two checkouts

The running Docker stack is bound to `/Users/andy/Documents/New project/legalise/` (the Reviewer/Raijun checkout), NOT `/Users/andy/Cursor Projects 2026/legalise/` (the builder checkout this session worked in). Its sibling `claude-for-uk-legal` is empty/missing → `legalise doctor` reports 0 plugins.

**Implication:** smoke and live probes from the builder checkout don't reflect the running stack, and vice versa. PR #11's fix won't take effect on the running stack until the Documents checkout pulls master + restarts, or the stack is brought up fresh from the builder checkout.

**Decision needed:** which checkout is canonical for active dev? Two-checkout is fine if deliberate (builder + reviewer), but the Docker port-binding means only one stack runs at a time, and confusion is easy.

---

## 7. Separate private repo — `legalise-scoping`

Renamed from `legal-ai-scoping`. Now the freestyle pre-canonical thinking space (kept out of the public `legalise` repo). Seeded with:
- `skills/LAWVE_SUBMISSION_STRATEGY.md`
- `cross-project/KRAMER_LEGALISE_CROSSOVER.md`
- `modules/DOCUMENT_PARSER_OMNIPARSE_NOTE.md`

Old "Counsel MVP" content preserved at `archive-counsel/`. Pointing is asymmetric by design: scoping repo references canonical backlog entries; canonical repo never references the private one.

---

## 8. Branch state

- `master` @ `77e871f` — canonical.
- `fix/vite-auth-proxy-spa-bypass` @ `fc10e77` — PR #11, green, awaiting merge.
- `phase-17-crm-pass` @ `78bebcf` — all the session's plans + backlog + walkthrough scaffolding. NOT yet merged (holds Phase 17 plan, P18-G plan, backlog, UI inventory, overnight notes). Merges when Phase 17 has ratified progress, or sooner if you want the docs on master.
- Three `worktree-agent-*` — merged, locked, prune after session ends.
