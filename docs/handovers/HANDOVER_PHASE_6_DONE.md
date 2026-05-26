# Handover — Phase 6 Done (Contract Review vertical slice)

**Builder:** Claude
**Branch:** `runtime-rewrite`
**Sweep:** 583 passed, 8 skipped, 0 failed
**Plan:** `docs/handovers/PHASE_6_BUILD_PLAN.md`
**Parked siblings:** `docs/handovers/PHASE_7_ASYNC_RUNTIME_PLAN_PARKED.md`

---

## Acceptance bar (verbatim from the plan, met end-to-end)

> Install/enable module, grant capabilities, run against Khan NDA, hit any required gate, produce output/artifact, and reconstruct the full trail. No new breadth until that path is boring.

A single integration test —
`backend/tests/test_phase6_vertical_slice.py::test_contract_review_vertical_slice`
— walks the whole bar in one function against real Postgres:

1. Register user, promote to superuser, read seeded Khan NDA.
2. Install `examples.contract-review` v1.0.0 via trust ceremony.
3. Confirm `InstalledModule` row with `signature_status=verified`.
4. Insert the two per-user `WorkspaceSkillCapabilityGrant` rows the
   capability needs (`matter.document.read`, `matter.artifact.write`)
   — modelling the post-install per-user opt-in step.
5. Invoke `review_contract` against the NDA.
6. Confirm the advice-boundary decision row with `gate_state.matter_id`
   linkage.
7. Confirm `MatterArtifact` row + JSON file on disk + parses as
   `{findings: [...]}` with 2 findings.
8. Confirm `model.invoked` audit row carries all six cost columns
   (`tokens_in=1500, tokens_out=350, cost_micros=2_750_000,
   currency='GBP', provider='anthropic', model_id='claude-opus-4-7'`).
9. Pull the reconstruction view; assert canonical timeline contains
   `module.capability.invoked` + `model.invoked` + `advice_boundary.decision.completed`
   + `module.capability.completed` + `audit.reconstruction.viewed`.
10. Assert timeline order is monotonic by `occurred_at`.

---

## Deliverables ledger

| Step | Title | Status |
| --- | --- | --- |
| 1 | `scripts/sign_example_module.py` — manifest signer CLI | done |
| 2 | `examples/modules/contract_review/` — manifest + entrypoint + capability + README | done |
| 3 | Migration `0018_phase6_matter_artifacts.py` + WORM trigger + indexes + UNIQUE | done |
| 4 | `core/matter_artifacts.py` — `write_artifact` atomic-write helper | done |
| 5 | Contract Review capability implementation (`examples/modules/contract_review/capability.py`) | done |
| 6 | Khan v Acme NDA seed | already shipped at `core/seed.py`; verified |
| 7 | Vertical-slice integration test (`test_phase6_vertical_slice.py`) | done |
| 8 | 9 supporting unit tests | done |
| 9 | Full sweep green | 583 / 8 skipped / 0 failed |
| 10 | This handover | done |

---

## Architectural decisions requesting Reviewer ratification

All six v2 decisions from the build plan hold. Restating for the
ratification record:

**1. The module is a real signed manifest, not a stub.**

`examples/modules/contract_review/module.json` is a complete v2 manifest signed by `scripts/sign_example_module.py`. The signer computes the canonical SHA-256 hash of the unsigned manifest (signature + signed_by stripped), writes it back as the `signature` field, and sets `signed_by = publisher`. Phase 3's structural verifier accepts it as `VERIFIED`. Phase 11 swaps the signer for real sigstore + Rekor; the API surface — "the file has a stable signature that the verifier accepts" — does not change.

**2. Acceptance is end-to-end, scripted, rerunnable.**

The single integration test is THE contract. It runs against real Postgres, real Phase 1 substrate, real Phase 2 manifest validation, real Phase 3 install ceremony, real Phase 5 reconstruction view. The only test seam is the provider call, monkey-patched at the capability boundary — every other code path is production.

**3. No new infrastructure.**

The slice is synchronous over HTTP. No SSE. No async runtime. No new tables beyond `matter_artifacts`. The original async-runtime Phase 6 plan is parked at `PHASE_7_ASYNC_RUNTIME_PLAN_PARKED.md`; it reopens once a real long-running capability genuinely needs it.

**4. Artifact storage reuses the matter file store + new WORM `matter_artifacts` row.**

Files land at `{matter_dir}/artifacts/{capability_id}/{invocation_id}_{kind}.json`. The DB row is the authoritative reference; the file is the payload. Atomic-write contract: write to `.tmp`, fsync the file fd, `os.replace` to final path, fsync the parent dir. UNIQUE `(invocation_id, kind)` enforces "one artifact per (invocation, kind)" — multiple kinds per invocation allowed.

**5. Privilege / advice-boundary gate reuses Phase 1.**

The capability calls `app.core.advice_boundary.check()` with `from_tier=None, requested_tier=draft_advice`. The gate writes an `advice_boundary_decisions` row that the Phase 5 reconstruction view picks up. **One small extension to Phase 1:** `check()` now accepts an optional `matter_id` kwarg and injects it into the success `gate_state` so the reconstruction filter (`gate_state->>'matter_id' = ?`) catches the row. No new gate code beyond this two-line patch.

**6. Provider call is real in production, monkey-patched in tests.**

`review_contract(provider_call=...)` takes the provider as a callable parameter. In production the host injects the real model gateway; in tests a deterministic `_stub_provider_call` returns a fixed `{findings: [...]}`. The cost columns get populated identically either way via `audit_emit_model_invoked`.

---

## Step-3 deliberate variance from the plan

The plan said "trust ceremony grants capabilities to the installing user." The current code separates install (admin) from grant (per-user). The vertical-slice test models this by writing the two grant rows explicitly post-install, as a Phase 7+ UI or `/grant` endpoint would. The `InstalledModule` row alone is what install produces.

This is a real shape gap — Phase 7+ needs to close it with a clear story for "post-install, who can run the capability and how do they get the grant." For now, the vertical slice shows the path works once the grants exist.

---

## Step-5 capability simplification

The plan named "privilege_posture" as the gate. Phase 1 didn't ship a posture-specific gate — the closest substrate is the advice-boundary tier check. The capability uses it: records the `None → draft_advice` transition with `matter.privilege_posture` referenceable via the matter object. A posture-aware gate (block when matter is `legally_privileged` and caller isn't `qualified_solicitor`) is a Phase 7+ extension. For Phase 6 the audit trail still contains the decision row + the matter's posture; reconstruction renders it.

---

## New / modified files

```
NEW
  backend/alembic/versions/0018_phase6_matter_artifacts.py
  backend/app/core/matter_artifacts.py
  backend/app/models/matter_artifact.py
  backend/scripts/__init__.py
  backend/scripts/sign_example_module.py
  examples/modules/contract_review/__init__.py
  examples/modules/contract_review/README.md
  examples/modules/contract_review/capability.py
  examples/modules/contract_review/module.json
  backend/tests/test_phase6_vertical_slice.py
  backend/tests/test_phase6_sign_example_module.py
  backend/tests/test_phase6_matter_artifacts.py

MODIFIED
  backend/app/models/__init__.py             — register MatterArtifact
  backend/app/core/advice_boundary/gate.py   — optional matter_id kwarg on check()
```

---

## Tests added (10 total)

| File | Tests | What it pins |
| --- | --- | --- |
| `test_phase6_vertical_slice.py` | 1 | End-to-end acceptance bar |
| `test_phase6_sign_example_module.py` | 4 | Signer idempotence, roundtrip through verifier, rejects missing publisher, rejects invalid JSON |
| `test_phase6_matter_artifacts.py` | 5 | write_artifact creates file + row, UNIQUE(invocation, kind), different kinds per invocation OK, WORM rejects UPDATE, WORM rejects DELETE |

---

## How to run

```bash
docker compose -f infra/docker-compose.yml up -d db backend

# Migrate to head (includes 0018).
docker compose -f infra/docker-compose.yml exec -T \
  -e POSTGRES_DSN="postgresql+psycopg://legalise:legalise@db:5432/legalise_test" \
  backend python -m alembic upgrade head

# Copy examples/ into the container if not mounted.
docker compose -f infra/docker-compose.yml cp examples backend:/app/examples

# Phase 6 only — 10 tests.
docker compose -f infra/docker-compose.yml exec -T \
  -e POSTGRES_DSN="postgresql+asyncpg://legalise:legalise@db:5432/legalise_test" \
  -e TEST_DATABASE_URL="postgresql+asyncpg://legalise:legalise@db:5432/legalise_test" \
  backend python -m pytest \
    tests/test_phase6_vertical_slice.py \
    tests/test_phase6_sign_example_module.py \
    tests/test_phase6_matter_artifacts.py

# Full sweep.
docker compose -f infra/docker-compose.yml exec -T \
  -e POSTGRES_DSN="postgresql+asyncpg://legalise:legalise@db:5432/legalise_test" \
  -e TEST_DATABASE_URL="postgresql+asyncpg://legalise:legalise@db:5432/legalise_test" \
  backend python -m pytest
```

To re-sign the manifest after editing it:

```bash
PYTHONPATH=backend python3 -m scripts.sign_example_module \
  examples/modules/contract_review/module.json
```

---

## What is explicitly out of scope at the end of Phase 6

(Per the build plan's "Out of scope (intentional)" section — flagging again so future builders don't drift.)

- Async runtime / SSE / background jobs → `PHASE_7_ASYNC_RUNTIME_PLAN_PARKED.md`
- Second reference module (Pre-Motion) → Phase 8+
- Marketplace UI, publisher economy → Phase 9+
- Connector breadth (Companies House, legislation.gov.uk) → Phase 10+
- Admin console / cross-matter view → later
- Frontend timeline UI → Phase 12
- Sigstore/Rekor real verification → Phase 11
- Posture-aware privilege gate (blocks on `legally_privileged` matter + non-solicitor caller) → Phase 7+
- `/grant` endpoint that turns install → per-user grants automatically → Phase 7+ (the gap noted under "Step-3 variance")

---

## Hand-off line for Reviewer

> *Phase 6 (Contract Review vertical slice) implemented end-to-end on `runtime-rewrite`. Full sweep green: 583 passed, 8 skipped. Single integration test (`test_phase6_vertical_slice.py`) walks the whole acceptance bar — install → grant → invoke → gate → artifact → reconstruction. Six architectural decisions request ratification; two deliberate variances from the plan documented (post-install grant separation; posture-aware gate deferred to Phase 7+). Phase 7+ artifacts already parked (async runtime). Ready for ratification.*

---

*End of Phase 6 handover.*
