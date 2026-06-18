# Methodology

How the teardown is produced, so the verdicts are reproducible and the brutal
ones are defensible.

## Evidence tiers (recap)
- **T1 Observed** — Andy's first-hand booth observation.
- **T2 Vendor claim** — the company's own marketing.
- **T3 Verified** — independent third-party source + URL + access date.

Every factual sentence in the final report carries its tier. Funding /
valuation figures are **T3-only**: cite a named source (Crunchbase, PitchBook,
press release, regulatory filing) or write "no public valuation."

## Category taxonomy
Each exhibitor gets exactly one primary category:

- `drafting-redline` — contract drafting / redlining / markup
- `clm` — contract lifecycle management
- `research` — legal research / case law / search
- `ediscovery` — discovery, review, litigation data
- `practice-mgmt` — practice / matter / firm management
- `knowledge` — knowledge management / DMS / intranet
- `agentic-horizontal` — broad "AI lawyer" / agent platforms
- `ip` — IP, patents, trademarks
- `compliance-risk` — compliance, risk, regulatory
- `transcription-evidence` — transcription, evidence, court tech
- `billing-ops` — billing, spend, legal ops, procurement
- `services-consulting` — services / SI / advisory, not product
- `infra-platform` — dev infra, identity, signing, storage
- `other`

## Triage rubric — `kill` / `watch` / `deep-dive`

The thesis: *most document redliners and thin model wrappers have no
defensible moat and won't be here next year.* The rubric operationalises that.

### `kill` — strip it out (one-line rationale required)
Assign when **two or more** hold, or any one is decisive:
- **Thin wrapper:** core value is a prompt over a frontier model with no
  proprietary data, workflow lock-in, or distribution.
- **Redliner-in-a-crowd:** another me-too contract markup tool in a category
  with 15+ identical booths and no differentiator.
- **No moat:** nothing a well-resourced incumbent (or the model vendor)
  couldn't ship in a quarter.
- **Vapour:** booth is a logo and a waitlist; no shipped product, no named
  customers.
- **Reskinned services:** a consultancy wearing a product costume.

### `watch` — interesting but not a deep-dive
- Real product, real category, but undifferentiated or too early to rate.
- Strong incumbent whose model is well understood (note, don't dissect).
- Adjacent/infra play that matters to the ecosystem but isn't the story.

### `deep-dive` — earns Pass 2
Assign when **any** hold:
- **Defensible model:** proprietary data, real workflow integration, or
  distribution that's hard to copy.
- **Interesting-but-flawed:** a model worth dissecting precisely because it's
  clever *and* has a visible structural weakness (great teardown material).
- **Interoperability story:** genuinely plugs into the stack vs. walled garden
  — either as exemplar or cautionary tale.
- **Andy flagged it (T1):** first-hand "this one was actually good/strange."
- **Valuation tension:** a funding/valuation that looks interesting against
  what the product actually is.

## Triage discipline (anti-hallucination)
- Triage verdicts are **opinion grounded in category knowledge**, allowed at
  T1/T2 confidence. They are flagged `pre_verification: true` until Pass 2
  confirms the company is real and correctly identified.
- A company whose name cannot be verified online in Pass 2 is itself a signal
  (likely `kill` / vapour) — recorded, not invented around.
- No funding/valuation/customer claim appears in triage rationale unless T3.
- `deep-dive` set is capped at ~15; if more qualify, rank by teardown value
  (interesting-but-flawed > defensible > incumbent).
