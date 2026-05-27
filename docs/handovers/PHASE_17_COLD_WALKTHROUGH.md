# Phase 17 — Cold Walkthrough Recording (TEMPLATE — NOT YET RUN)

**Status:** awaiting recorder commission by reviewer.

This file is the spec for the Phase 17 redesign. It is not a
preamble — every redesign decision in 17A / 17B / 17C must cite a
numbered finding from this doc.

## Recorder identity

- **Name / role:**
- **Profile category** (per plan §Step 0 — operator-proxy gate):
  CRM-heavy SaaS operator / founder / product person /
  YC-style evaluator / **Andy-fallback (NOT COLD)**
- **Cold or fallback?** [ ] Cold operator-proxy   [ ] Andy fallback
  (non-cold; surfaces obvious friction only; later cold findings
  override)
- **Pre-briefing on Legalise:** none beyond `README.md → Try it`.
  The recorder MUST NOT have prior substrate context (waived for
  Andy-fallback only).
- **Session date / time:**
- **Recording link:**
- **Local fork commit SHA used for the session:**

> **Solicitor / legal-ops walkthrough is a separate later artifact**
> (`PHASE_17_LAUNCH_READINESS_WALKTHROUGH.md` when the time comes),
> gating public launch / design-partner outreach — not Phase 17
> implementation. Do not conflate the two in this file.

## Method

1. Recorder is given access to a fresh local fork (already set up;
   doctor green; bootstrap done by operator before handover).
2. Recorder follows `docs/DEMO.md` end-to-end. No operator on the
   call, no Slack, no coaching.
3. Recorder thinks aloud throughout (recording captures audio).
4. Reviewer transcribes findings per screen below from the
   recording. Each finding gets a number, a P1/P2 priority, and a
   timestamp link into the recording.

## Per-screen findings

### Matter detail (`/matters/khan-v-acme-trading-2026`)

- Click count:
- Back-button count:
- "Where's…?" pause count (with timestamps):
- Expected vs observed:

#### Findings

| # | Priority | Finding | Timestamp |
| --- | --- | --- | --- |
| _MD-1_ | _P?_ | _to fill_ | _hh:mm:ss_ |

### Modules page (`/modules`)

- Click count:
- Back-button count:
- "Where's…?" pause count (with timestamps):
- Expected vs observed:

#### Findings

| # | Priority | Finding | Timestamp |
| --- | --- | --- | --- |
| _MOD-1_ | _P?_ | _to fill_ | _hh:mm:ss_ |

### Audit reconstruction (`/matters/…/audit` + `/admin/audit`)

- Click count:
- Back-button count:
- "Where's…?" pause count (with timestamps):
- Expected vs observed:

#### Findings

| # | Priority | Finding | Timestamp |
| --- | --- | --- | --- |
| _AUD-1_ | _P?_ | _to fill_ | _hh:mm:ss_ |

### Other screens encountered

If the recorder hits screens outside the three target screens
(admin/users, matters list, artifacts, settings, jobs, etc.),
log findings here. Per plan §Scope flex, these do not enter the
build scope unless reviewer swaps them in for one of the three
above.

| Screen | # | Priority | Finding | Timestamp |
| --- | --- | --- | --- | --- |

## Post-walkthrough debrief (recorded)

One paragraph from the recorder, in their own words, on whether
the screens "feel familiar" to someone with their CRM / legal /
operator background. Captured live in the recording.

## Substrate findings (forwarded to backlog)

Any finding that's caused by substrate behaviour, not UI, gets
mirrored into [`PHASE_17_SUBSTRATE_BACKLOG.md`](./PHASE_17_SUBSTRATE_BACKLOG.md)
with the finding number from this doc as the source.

## Reviewer signoff

Reviewer reads the filled-in doc, confirms the recorder profile
matches the plan, and tags this file as the Phase 17 spec.
After signoff, 17A/B/C ordering is locked or reordered per the
findings.

- **Reviewer signoff date:**
- **Phase 17 build order** (filled in by reviewer after signoff):
  1.
  2.
  3.
