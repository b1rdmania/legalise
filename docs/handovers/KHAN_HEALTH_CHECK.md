# Khan Demo Health Check — Runbook

**Purpose:** non-destructive verification that the Khan v Acme canonical demo matter is in a working state before any Kramer demo-comprehension PR builds on top of it. Use before guided-exhibit work (Kramer carry-over #1), Trust & Review card work (#2), or proof drawer work (#3).

This runbook does not seed, reset, or migrate. It only reads. The `--create-bucket` flag is the one mutation `legalise doctor` supports; do not pass it for a health check.

## The check command

```sh
docker compose exec backend python -m app.tools.doctor
```

Exits `0` if every check is `ok` or `note`. Exits `1` if any check is `fail`.

## Checks relevant to Khan demo

The eight checks reported by `legalise doctor`:

- `db.reachable`
- `db.migrations_current`
- `db.audit_table_present`
- `khan.demo_present` — **load-bearing for demo-comprehension work**
- `manifests.valid`
- `plugins.root_mounted`
- `provider.mode`
- `redis.reachable`

`khan.demo_present` is stateful by design (see doctrine block at the top of `backend/app/tools/doctor.py`):

| Pre-condition | Expected result | Meaning |
|---|---|---|
| Zero users registered | `note: no users yet — seed lands on first signup` | Healthy clean install. Seed has not run; will run on first `/auth/signin`. |
| Users exist, Khan matter present, seed audit row present | `ok: khan-v-acme-trading-2026 + seed audit row present` | Fully seeded; safe to build demo work on top. |
| Users exist, Khan matter missing | `fail: users exist but Khan matter ({slug}) missing` | Seeder did not run on signup. Recovery: register a fresh user via `/auth/signin` — seeding runs on first signup. |
| Users exist, Khan matter present, no `SEED_ACTION_MATTER` audit row | `fail: Khan matter present but no seed audit row` | Partial seed. Recovery: delete the matter row and re-register, or inspect manually. |

`KHAN_SLUG` and `SEED_ACTION_MATTER` are defined in `backend/app/core/seed.py`.

## Gate

Treat any `fail` from `khan.demo_present` as a stop. Do not start a Kramer carry-over PR on top of a failed seed.

`note` is acceptable for fresh-install demo-comprehension work that includes a signup step (e.g. guided-exhibit PR2 begins with `/auth/signin`). If the PR assumes Khan is already seeded, register a user first and re-run the check until `ok`.

## What this runbook does not verify

- Document body extraction for every Khan document (covered by Source Anchors tests, not by `doctor`).
- Activity Trail rendering correctness (UI; out of scope for this check).
- Sign-off flow on Khan outputs (covered by `tests/test_signoff_api.py`).
- Module grants on Khan (separate concern; check via the matter UI after `ok`).

If a Kramer carry-over needs any of those guaranteed, add a targeted verification step to that PR, not to this runbook.

## References

- `backend/app/tools/doctor.py` — implementation (Phase 16 C)
- `backend/app/core/seed.py` — seed function + `KHAN_SLUG`
- `docs/handovers/PRE_FLIGHT.md` §7 — full browser smoke walk (out of scope here; this runbook is a 30-second pre-flight)
