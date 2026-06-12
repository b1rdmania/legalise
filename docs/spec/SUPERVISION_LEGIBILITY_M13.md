# Supervision made legible (M12 + M13)

Date: 2026-06-12. The premise flaw this closes:
review effort is recorded but invisible, so shallow signing privately
dominates for any output needing more than ~40 minutes of real review.
The fix is not enforcement. It is legibility: make the cost of review
visible wherever a signature is shown, and flag the implausible.

## Data

- **Review window** = first open of the artifact's sign surface →
  sign-off decision. The open event lands as an audit row
  (`output.review.opened`, idempotent per signer+artifact: first open
  wins). The sign-off row already carries the decision timestamp; the
  delta is the review latency. No new tables: latency is derived from
  the two audit rows at read time, cached per signoff row if needed.
- **Implausible-speed threshold**: latency < max(120s, words/1000 ×
  10min × 0.25). One quarter of the economics baseline (~10 min per
  1,000 words) — generous to skim-and-reject, suspicious of
  skim-and-sign. Threshold lives in one constant with the rationale.

## Surfaces

1. **Sign-off page**: on submit, the confirmation line states the
   review duration plainly ("Reviewed for 14 minutes."). No judgement
   on the happy path.
2. **Implausible-speed flag**: a sign-off under threshold gets
   `implausible_speed: true` in the output.signed audit payload AND a
   visible marker wherever that signature renders (track record,
   artifact detail): a seal-toned "signed in 94s" note. Recorded, not
   blocked — the register testifies; it does not nanny.
3. **Per-skill track record** (extends P182's block): adds median
   review latency and the n. Sub-n=30 rows carry the honesty label
   ("n=4 — too few to mean much"). Demo's seeded records keep their
   existing "seeded demo record" label.
4. **The E2 diagnostic** (operator-facing, /admin/audit): rejection +
   with-observations rate and median latency per signer, queryable —
   the rubber-stamp detector the economics analysis specifies
   (healthy band 2–30%).

## Honesty rules

- Latency is evidence of attention, not proof of quality; copy never
  claims otherwise.
- A missing open-event (legacy sign-offs) renders "—", never 0.
- Thresholds and bands cite the economics analysis, not vibes.
