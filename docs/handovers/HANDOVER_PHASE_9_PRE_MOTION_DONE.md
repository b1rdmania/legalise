# Handover — Phase 9 Done (Pre-Motion, Second Reference Module)

**Builder:** Claude
**Branch:** `runtime-rewrite`
**Plan:** `docs/handovers/PHASE_9_PRE_MOTION_BUILD_PLAN.md` (v2.1)
**Sweep:** 636 passed, 8 skipped, 0 failed

---

## The substrate-reusability claim, empirically confirmed

The plan defined three success criteria. The build met all three:

| Criterion | Result |
| --- | --- |
| No `core/` / `api/` / `models/` / `alembic/` edits | **Zero.** `git diff --stat 872d84c..HEAD -- backend/app/core backend/app/api backend/app/models backend/alembic` is empty. |
| No new vocabulary (capabilities, audit actions, BlockedReason, postures) | **Zero new.** Pre-Motion reuses `matter.document.read` + `matter.artifact.write` + the four canonical audit actions Phase 6 + Phase 8 produced. |
| No edits to existing tests | **Zero.** `git diff --stat 872d84c..HEAD -- backend/tests` is empty. |

Pre-Motion ships entirely from module-author code under
`examples/modules/pre_motion/` plus the dedicated integration test
file `backend/tests/test_phase9_pre_motion_vertical_slice.py`.

The open-core thesis is now empirically supported, not just
asserted.

---

## What landed

**`examples/modules/pre_motion/`** — four files, all
module-author surface:
- `module.json` — signed v2 manifest with one `draft_motion` skill + the workspace-scope provider
- `__init__.py` — Python entrypoint
- `capability.py` — `draft_motion` implementation following the canonical Phase 6 R2 order
- `README.md` — args documentation + extension guide

**`backend/tests/test_phase9_pre_motion_vertical_slice.py`** —
13 tests:
- 1 integration test walking install (via ceremony) → grant (via `/grants` endpoint) → invoke against existing Khan dismissal letter + witness statement → 2 artifacts + reconstruction
- 7 negative tests (posture block, missing read grant, missing write grant after model call, cross-matter grant, document-not-in-matter, empty document_ids, unknown claim_type)
- 5 unit tests on pure-functional helpers (parser × 3, prompt builder × 2)

---

## Architectural decisions, all six ratified by the build

The six decisions held without surfacing any redline-after-the-fact:

1. **One capability + two artifact kinds.** `draft_motion` writes `motion_draft` + `evidence_list` under one `invocation_id`. First real reference module to exercise Phase 6's `UNIQUE(invocation_id, kind)`.
2. **Same advice tier as Contract Review (`draft_advice`).** No tier transition substrate exercised.
3. **Multi-document input via existing capability string.** `matter.document.read` scaled to N documents without any host-side surface change.
4. **Multi-argument input** (`claim_type` enum + `document_ids` list). Args passed via the existing `args: dict` shape; module validates in code (`ValueError` on miss).
5. **Use existing Khan seed documents** — `khan-dismissal-letter.pdf` + `witness-statement-khan.docx`. No seed change. (Phase 9 v2 redline closed v1's wrong-premise plan.)
6. **No `args_schema` manifest field.** Module enforces in code, README documents. (Phase 9 v2 redline kept this honest.)

---

## Differences from Contract Review (the load-bearing reusability signals)

| Dimension | Contract Review | Pre-Motion |
| --- | --- | --- |
| Documents per invocation | 1 | N (≥1) |
| Artifacts per invocation | 1 (`findings_pack`) | 2 (`motion_draft` + `evidence_list`) |
| Args | `document_id` | `claim_type` + `document_ids` |
| Advice tier | `draft_advice` | `draft_advice` (same) |
| Gates | `privilege_posture` | `privilege_posture` (same) |
| Posture policy | applies | applies (same) |
| Audit shape | canonical | canonical (same) |

The first three rows are the reusability stress test. The bottom
four are identical by design — they're what made Pre-Motion easy
to write once Contract Review existed.

---

## Manifest re-use ledger

What an external author needs to write a third module, following
Pre-Motion as the template:

1. Copy `examples/modules/pre_motion/` to `examples/modules/<your_module>/`.
2. Edit `module.json` — id, name, version, capabilities. The
   capability shape is the same: `reads`, `writes`, `model_access`,
   `gates`, `ui`, `streaming_mode`, `advice_tier_max`,
   `audit_events`.
3. Edit `capability.py` — change `MODULE_ID`, `CAPABILITY_ID`, the
   business logic in the capability function. Keep the canonical
   order (posture → read grant → resolve → advice gate → audit
   invoked → provider → audit cost → parse → write grant → write
   artifact → audit completed).
4. Re-sign with `sign_example_module.py`.
5. Write an integration test in the same shape as Phase 9's.

Nothing else needs to change. No core file edits, no schema
changes, no new audit vocabulary, no new gates. That's the
substrate working.

---

## How to run

```bash
docker compose -f infra/docker-compose.yml up -d db backend

# Phase 9 only — 13 tests.
docker compose -f infra/docker-compose.yml exec -T \
  -e POSTGRES_DSN="postgresql+asyncpg://legalise:legalise@db:5432/legalise_test" \
  -e TEST_DATABASE_URL="postgresql+asyncpg://legalise:legalise@db:5432/legalise_test" \
  backend python -m pytest tests/test_phase9_pre_motion_vertical_slice.py

# Full sweep.
docker compose -f infra/docker-compose.yml exec -T \
  -e POSTGRES_DSN="postgresql+asyncpg://legalise:legalise@db:5432/legalise_test" \
  -e TEST_DATABASE_URL="postgresql+asyncpg://legalise:legalise@db:5432/legalise_test" \
  backend python -m pytest
```

To re-sign the Pre-Motion manifest after editing:

```bash
PYTHONPATH=backend python3 -m scripts.sign_example_module \
  examples/modules/pre_motion/module.json
```

---

## Out of scope at end of Phase 9

Per Andy's KISS rule, still parked:

- Higher advice tier (`supervised_legal_advice`) — Phase 10+ if real
- Multi-step orchestration (e.g. "first identify claim, then draft") — out
- Per-jurisdiction templates — out
- Procedural-compliance checks — out
- Output iteration loop — out
- Shared provider module across reference modules — Phase 10+ if pattern emerges
- HTTP invoke endpoint that wraps the capability call — next phase opportunity
- Async runtime — still parked
- Connector breadth — still parked
- Frontend wizard — Phase 12
- Sigstore real verification — Phase 11

---

## Hand-off line for Reviewer

> *Phase 9 (Pre-Motion, second brutal reference module) implemented end-to-end on `runtime-rewrite`. Full sweep green: 636 passed, 8 skipped. The substrate-reusability hypothesis is empirically confirmed — zero `core/api/models/alembic` edits, zero new vocabulary, zero edits to existing tests. 13 new tests; only changes outside `examples/modules/pre_motion/` are this handover + the build plan. The manifest signs verified through the existing Phase 3 verifier. The capability walks the Phase 6 R2 canonical order extended for multi-doc input + multi-artifact output. Ready for ratification.*

---

*End of Phase 9 handover.*
