# Phase 17 — Substrate Backlog (Phase 18 candidates)

**Status:** empty until the cold walkthrough surfaces entries.

This file catches friction the cold walkthrough finds that turns out
to be a substrate gap, not a UI gap. Phase 17 does **not** fix
substrate (per plan §Substrate-gap discipline). Items logged here
become Phase 18 candidates.

## Entry shape

Each entry:

- Source finding number (from `PHASE_17_COLD_WALKTHROUGH.md`).
- One-line description of the substrate gap.
- The screen the walkthrough was on when it surfaced.
- Reviewer note on why it's substrate, not UI.
- (Optional) the smallest substrate change that would close it.

## Entries

| # | Source finding | Substrate gap | Screen | Reviewer note |
| --- | --- | --- | --- | --- |
| _S-1_ | _MD-?_ | _to fill_ | _matter detail_ | _to fill_ |

## Phase 17 tripwire

Reminder for sub-step builders: if a redesign PR would close one
of these backlog items, the right move is to **leave it logged
here** and ship the UI without closing it. Trying to fix the
substrate inside a Phase 17 sub-step is the failure mode the
tripwire exists to catch.

Reviewer enforces by file-list scan: any sub-step PR that touches
`backend/app/**`, `backend/alembic/**`, `schemas/**`, or
`examples/modules/**` is auto-out-of-scope, regardless of
intention.
