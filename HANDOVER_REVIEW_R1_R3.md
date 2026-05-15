# HANDOVER — Review of Rounds 1–3 (infra + Phase D W1 + partial Phase E)

**Repo:** `github.com/b1rdmania/legalise` · **HEAD:** updated post-reviewer fixes (one commit beyond `cefb108`)
**Base before this batch:** `2b039c0`
**Range to review:** `git log --oneline 2b039c0..HEAD` (10 commits, ~5,300 LoC net)

> **Update 2026-05-15:** reviewer adjudicated this brief and flagged 1×P1 + 3×P2 (disabled-skill 500s, prompt-body auth gap, silent missing-manifest, stale LBA-template wording in launch copy). All four fixed in a follow-up commit. Open flags A–G adjudicated; see `HANDOVER_INFRA_BUILD.md` §6.5 for the per-flag decision log.
**Read these first (decision authority):**
1. `backend/PHASE_INFRA_DELTA.md` — locked decisions (§4) + deferred doctrine (§5). Updated 2026-05-15 with reviewer amendments + docxtpl rejection.
2. `HANDOVER_INFRA_BUILD.md` — the build plan + reviewer-locked sequencing (§6). §6.5 has the in-flight execution log.
3. `HANDOVER_INFRA_REVIEW.md` — Andy's original infra review (the input that became the delta).

This file is the audit brief. The two above are the contract.

---

## Commit-by-commit map (oldest → newest)

| Commit | Unit | What it does | Files (rough) |
|---|---|---|---|
| `7efedad` | #1 | Batch-1 parsers (PyYAML/frontmatter/jsonschema) + audit centralisation sweep | +486 / −381 across ~21 files |
| `e7d730c` | #1a (partial) | `structured_output.py::parse_model_json` + 2 of 4 call-site swaps | +200 / −45, 3 files |
| `a89435f` | — | Handover log: #1a partial coverage + #1a-tail follow-up | docs only |
| `780238c` | #9 | Phase E W1 docs rewrite (README, PEERS, MANIFESTO, ROADMAP, ATTRIBUTIONS under `docs/`) | 5 docs files |
| `9e7012d` | #2 | App.tsx split (~3,450 lines → `app/ + auth/ + landing/ + matter/{tabs/} + modules-page/ + ui/`) | +3,518 / −3,448 across 34 files |
| `8ec83b1` | #11 | Phase E W3 — `PRE_FLIGHT.md` + Day-15 deploy + SSE-disconnect smoke step | 2 docs files |
| `bd95acf` | — | Root `ROADMAP.md` + `MANIFESTO.md` → pointer stubs; `docxtpl` removed; unit #8 spec revised | 6 files, −217 net |
| `287125b` | #10a | Four existing-surface smoke evals (`backend/tests/test_smoke_evals.py`) | +420 LoC, 1 file |
| `188d401` | #3 + Batch-2 fold | Phase D W1 enable/disable + capability+trust-posture display + lib/api.ts consolidation | backend api/workspace.py new; api/modules.py rewrites; modules-page/Modules.tsx rewrite; 4 module-local api.ts → re-export shims |

## Build/test status at HEAD `188d401`

- `cd backend && python -m compileall app` — clean
- `cd backend && python -m pytest -x` — **37 passed** (19 baseline + 18 new smoke evals)
- `cd frontend && npm run build` — `tsc -b` clean, Vite 89 modules / 347 kB

---

## Locked decisions reflected in the code (sanity grep targets)

- `grep -in "capability-gated\|capability-enforced\|enforces.*capabilit" frontend/src/ backend/app/` → must be empty (it is). v0.1 doctrine: "module enable/disable is enforced; declared capabilities are schema-validated and displayed for review."
- `grep -rn "AuditEntry(" backend/app/ --include="*.py"` → only `core/audit.py`, `core/api.py` (the `_AuditAPI.log` helper itself), `models/audit.py`. Middleware path lives in `core/audit.py`. Three physical files, four logical sites.
- `grep -rn "docxtpl" backend/` → must be empty (it is). Unit #8 spec switched to Path A (procedural) or Path B (internal `python-docx` helper with `{{placeholders}}` — no LGPL).
- `grep -in "ziggythebot" infra/ docs/ | grep -v variant-workflow` → only the negation guard in `infra/deploy/cloudflare.md` (`b1rdmania` PAT, NOT `ziggythebot`).
- `grep -in "JWT_SECRET\|DATABASE_URL" infra/ docs/` should resolve to the actual code names: `SESSION_SECRET` and `POSTGRES_DSN` (Agent 11 corrected these against `core/config.py`).

---

## Behaviour changes worth your eye

1. **`GET /api/modules` now requires auth.** Previously unauthenticated. If any external tooling hits it unauth'd, it now 401s. (Agent 3, `188d401`.)
2. **`PluginBridge.invoke()` now enforces enable/disable at runtime** — SELECT against `workspace_disabled_skills` per actor, raises new `SkillDisabled` exception. This is the v0.1 doctrine line in code form (enable/disable enforced; capability enforcement still v0.2).
3. **`workspace_disabled_skills` table** existed since Phase A migration `0004`; now actually has endpoints to read/write it (`POST /api/workspace/skills/{plugin}/{skill}/{disable|enable}`, `GET /api/workspace/disabled-skills`).
4. **`audit_entries.module`** is now non-null for every module-semantic row (sweep complete). Middleware `http.*` rows may remain `module=null` — they are infrastructure, not module activity (this is the doctrine call from `PHASE_INFRA_DELTA.md` §3.1 acceptance).
5. **Frontend `App.tsx` is a 2-line re-export shim** of `app/App.tsx`. `main.tsx` unchanged. Old imports of `App` still resolve.
6. **Module-local `frontend/src/modules/{anonymisation,case_law,contract_review,tabular_review}/api.ts`** are now 1-line re-exports of `lib/api.ts`. Every function/type moved verbatim; signatures unchanged.

---

## Open flags raised by agents — your judgment

### A. Unit #1a partial coverage (`e7d730c`)
Agent 1B honoured the "do not invent Pydantic classes" guard and skipped two of four sites:
- `backend/app/modules/document_edit/pipeline.py` — no `ChangesEnvelope` class exists for the `{changes: [...]}` wire shape.
- `backend/app/modules/anonymisation/prompts.py` — no envelope class for the `{tokens, spans}` wire shape.

**`#1a-tail` follow-up**: ~60 LoC — add `document_edit/schemas.py::ChangesEnvelope` + `anonymisation/schemas.py::AnonymisationEnvelope` (additive only, mirror existing parser output), then complete the two swaps. Boundary: gateway/parser stays intact for already-swapped sites; current state ships fine.

**Question for reviewer:** is `#1a-tail` pre-launch or v0.2?

### B. Eval 3 resolver semantics (`287125b`)
`apply_anchor_substitution` is documented "first wins" on multi-match — does NOT raise on ambiguity. Agent 10a tested the existing `skipped_no_anchor` signal instead of inventing a raise.

**Question for reviewer:** is "first wins" the intended semantic, or should the resolver raise on ambiguity (which is a separate unit, not a test fix)?

### C. Eval 4 routing (`287125b`)
Bypassed `run_contract_review` (would need extensive DB-query mocking) and hit `ParserAgent.run` + `RedlinerAgent.run` directly. Still exercises `parse_model_json` end-to-end against `KHAN_NDA_BODY`.

**Question for reviewer:** acceptable, or do you want the full orchestrator covered (would require a Postgres test fixture)?

### D. Audit-row module set (`287125b`)
Lifted from code, not from the handover's enumeration. Actual literals in use: `letters`, `pre_motion`, `contract_review`, `anonymisation`, `case_law`, `chronology`, `document_edit`, `tabular_review`, `module_lifecycle`, `plugin`. Handover had `document_generation` (turns out to be an action suffix under `document_edit`, not a module), missed `tabular_review`. Code is authoritative.

### E. `Anonymise` button in `DocumentsTab` (`188d401`)
Phase C's `RedactedToggle` caption-fallback preserved verbatim. A clean inline toggle still needs `originalText` from a document body fetch — out of scope here. Routed-Document-detail-view rewrite is v0.2 surface.

### F. `docxtpl` rejection (`bd95acf`)
Unit #8 spec now has **Path A (recommended)** = LBA stays procedural; **Path B** = internal `python-docx` `{{placeholder}}` helper if visual polish proves load-bearing. No LGPL surface on Apache-2.0 launch. `docs/ATTRIBUTIONS.md` Licence-note section removed.

**Question for reviewer:** confirm Path A; reject Path B unless screenshots demand it.

### G. Audit-row module-lifecycle action names (`188d401`)
Agent 3 chose `module.skill.disabled` / `module.skill.enabled` with `module="module_lifecycle"` (matches `PHASE_D_DELTA.md` audit conventions). No other actions emitted from the new endpoints. Worth confirming this is the taxonomy you want for the eventual `audit_actions.py` constants module (required v0.2).

---

## Pending agents NOT spawned (gated on your decisions)

| Unit | Why gated | Triggers |
|---|---|---|
| #5 — matter wire-format + import/export | Reviewer-locked: redaction matrix is mandatory, otherwise cut entire surface | Confirm redaction-matrix scope |
| #10b — matter-portability eval | Reviewer-locked: ships only with #5 | #5 lands |
| #6 — public submission flow | Round 5, after #5 + reviewer-locked sequencing | #5 lands |
| #8 — LBA template (Path B only) | Andy authors `lba.docx` in Word | Path A confirmed (recommended) or Path B + template |
| `#1a-tail` | Andy decides invent-the-classes vs v0.2 | Above |
| #12 — launch posture (Phase E W4+W5) | Andy-coordinated, agent drafts only | After everything else |

---

## Hard guards still in force (re-stated for reviewer)

1. No AGPL contamination. Apache-2.0 only.
2. Mike (Will Chen, `claude-for-uk-legal`, AGPL-3.0) and Stella (Jan Kubica, Apache-2.0) framed as peers, not competitors. Verify in `README.md` + `docs/PEERS.md`.
3. No agent-filed external comms. Outreach drafts in `docs/outreach/` only. Andy files.
4. `GITHUB_SUBMISSION_TOKEN` = `b1rdmania`-scoped PAT (`contents:write` + `pull_requests:write` on `claude-for-uk-legal` only). NOT `ziggythebot`. Verified in `infra/deploy/cloudflare.md`.
5. v0.1 launch copy must NOT use "capability-gated" / "capability-enforced" / "enforces capabilities". Verified empty.
6. Gateway/parser boundary: `parse_model_json` lives in `core/structured_output.py`, NOT in `model_gateway.py`. `grep -rn "model_gateway" backend/app/core/structured_output.py` empty.
7. Job runner direction locked (v0.2): `arq` + Redis + `jobs` table. Day-15 deploy smoke includes SSE-disconnect test to surface brittleness pre-launch.

---

## What the reviewer should actually do

1. `git log --oneline 2b039c0..188d401` — eyeball the 8 commits.
2. Walk the **behaviour changes worth your eye** section above; check each is intentional.
3. Sample the **sanity grep targets** — confirm they're all clean.
4. Adjudicate the seven open flags (A–G). The build is paused on (A), (B), (F), and #5 redaction-matrix confirmation. Everything else is reviewer-optional cleanup.
5. Stress-test #3's `PluginBridge.invoke()` disable enforcement against a real workspace — that's the most load-bearing new behaviour.
6. Read `docs/PEERS.md` and confirm peer framing is right.

Doctrine is the contract; this file is the audit. If anything in code contradicts `PHASE_INFRA_DELTA.md` §4 decisions, the delta wins and the code gets fixed.
