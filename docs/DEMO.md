# Demo runbook — Khan v Acme walkthrough

This is the evaluator-facing walkthrough. It assumes you have followed
[`README.md` → Try it](../README.md#try-it) and are signed in as a
superuser. If `legalise doctor` is green and `khan.demo_present` is
`ok`, you are in the right place.

The walkthrough drives the same end-to-end path that the Phase 15
Playwright `first-run` spec drives in CI. The audit-row coverage split
is recorded in [`docs/spec/AUDIT_COVERAGE_MATRIX.md`](./spec/AUDIT_COVERAGE_MATRIX.md):
rows marked **e2e-covered** are asserted by name by the Phase 15 spec;
rows marked **pytest-covered** are substrate-tested but not asserted
by name in the e2e run — they still land on the matter timeline
because the same substrate emits them. Nothing here is invented.

## What this proves

By the end of the walkthrough you will have:

- Installed a real module through the trust ceremony state machine.
- Granted that module a capability on a real matter.
- Run the module deterministically (via the keyless `stub-echo`
  model — no provider key required).
- Read back the matter Audit tab and seen the substrate rows the run
  emitted.

That sequence is the smallest end-to-end demonstration of
[supervised autonomy](./SUPERVISED_AUTONOMY.md): a capability declared
in a manifest, granted on install, enforced at runtime, and recorded
in an audit trail you can reconstruct.

## 1 — Install Contract Review via the trust ceremony

1. Navigate to <http://localhost:3000/modules>.
2. Find **Contract Review** (`examples.contract-review`) in the
   catalog and click **Install**.
3. Walk through each step of the trust ceremony until the module shows
   as **Enabled**. Each advance is a real state-machine transition;
   nothing here is a UI fast-path.

Audit rows the install emits (workspace scope — visible to a superuser
in the admin reconstruction view at <http://localhost:3000/admin/audit>):

| Action | Coverage | Where it comes from |
| --- | --- | --- |
| `module.enabled` | e2e-covered | Ceremony completion, terminal state |

## 2 — Grant Contract Review on the Khan v Acme matter

1. Navigate to <http://localhost:3000/matters/khan-v-acme-trading-2026>.
2. In the Grants panel, grant the Contract Review **`review`**
   capability on the matter.

Audit row this emits (matter scope — visible on the matter's own
Audit tab):

| Action | Coverage | Where it comes from |
| --- | --- | --- |
| `module.grant.created` | e2e-covered | The grant write |

The grant is matter-scoped per the doctrine in
[`README.md`](../README.md#trust-mechanics):
*manifest requests capabilities, workspace grants capabilities,
runtime enforces capabilities.*

## 3 — Run Contract Review

1. From the Khan v Acme matter page, click the **Run** button for the
   review capability.
2. Watch the result panel render. The default model is `stub-echo` for
   the demo so the output is deterministic — no provider key needed.
3. The result panel renders the invocation id alongside a **See audit
   trail for this invocation** link that jumps straight to the
   filtered timeline. (If you want to inspect the URL manually,
   the displayed id is selectable.)

Audit rows this emits (matter scope):

| Action | Coverage | Where it comes from |
| --- | --- | --- |
| `module.capability.invoked` | e2e-covered | Run is dispatched |
| `model.call` | e2e-covered | Gateway dispatched the call to `stub-echo` |
| `model.invoked` | pytest-covered | `audit_cost` helper emits per model call; reconstruction source |
| `advice_boundary.decision.completed` | pytest-covered | Substrate gate decision for matters at posture `B_mixed` / `C_paused`; reconstruction source |
| `module.capability.completed` | e2e-covered | Result returned to the UI |

`model.invoked` and `advice_boundary.decision.completed` are not
asserted by name in the Phase 15 e2e run — pytest covers them
directly — but they land on the matter timeline because the same
substrate emits them. Khan v Acme defaults to `B_mixed` so the
advice-boundary row is the expected shape.

## 4 — Read the Audit tab

1. Use the **See audit trail for this invocation** link from step 3,
   or navigate to
   <http://localhost:3000/matters/khan-v-acme-trading-2026/audit>
   and paste the invocation id into the `invocation_id` filter.
2. You should see the matter-scope rows from step 3, plus an
   `audit.reconstruction.viewed` row that the substrate emits when
   the timeline is read.

The reconstruction view pulls from three substrate sources — the
`audit_entries` table, `state_machine_transitions`, and
`advice_boundary_decisions` — and reconstructs the timeline across all
three. This is what the regulator-facing record looks like.

## 5 — Pre-Motion (same loop, second module)

Pre-Motion (`examples.pre-motion`) is the second reference module and
exercises the same install → grant → run → audit loop:

1. <http://localhost:3000/modules> → Pre-Motion → Install → walk
   through the ceremony.
2. Khan v Acme → grant the Pre-Motion `draft_motion` capability.
3. Run it from the matter page.
4. The matter Audit tab shows a fresh run with the same five rows
   the Contract Review run produced:
   `module.capability.invoked` (e2e-covered), `model.call`
   (e2e-covered), `model.invoked` (pytest-covered),
   `advice_boundary.decision.completed` (pytest-covered, posture
   `B_mixed`), `module.capability.completed` (e2e-covered).

Two modules, two grants, two invocations. Same substrate, same
contract, same receipts.

## If something looks wrong

- Doctor first: `docker compose -f infra/docker-compose.yml exec
  backend python -m app.tools.doctor`.
- Common setup errors and their fixes:
  [`docs/TROUBLESHOOTING.md`](./TROUBLESHOOTING.md).
- Audit row names and emission sites:
  [`docs/spec/AUDIT_EMISSION_MAP.md`](./spec/AUDIT_EMISSION_MAP.md).
