# LegalTechTalk 2026 — the opinionated read
*What's real, what's dead, who survives. Thesis: AI in law is only real if it's agentic, interoperable, and lives where lawyers work. Everything else is a wrapper with a countdown timer.*

*Companion to the 33-vendor scorecard. This is the POV layer — evidence is in the scorecard, the judgement is mine. Calls are provisional.*

> **Two theses.** This cut is written mainly against **Thesis 1 — the "interrupt"/infrastructure play** (agentic, interoperable, lives where lawyers work). A **second thesis — already-regulated legal-services entities deploying accountable AI** — runs alongside it. **Moritz** (the flagship) and **Cicero** (adjacent) are judged under Thesis 2, where they're on-thesis — they are *not* in the kill-list below. Scope is the actual exhibitor floor only: Garfield, Lawhive, Crosby were *not* at the show and are excluded.

## The one-line map
Three things are real. Most of the rest is an app that becomes a feature in someone else's product inside a year.
- **The rails win.** Infrastructure other people's agents plug into (knowledge retrieval, legal-data APIs, MCP layers) is the only moat that compounds. Apps come and go; the layer underneath stays.
- **The vertical apps are renting their moat.** "The AI associate for [X]" is a prompt and a logo. The good ones have real data or real integration. The rest are one frontier-model release from dead.
- **Services firms in a software costume don't count.** A law firm with an internal AI tool is a law firm, not a vendor. Off-thesis. *(See widening note — this is the boundary that Thesis 2 deliberately reopens.)*

## The gems, and the game-theory on each

**DeepJudge — the knowledge layer agents plug into.** Institutional-knowledge retrieval that Harvey, CoCounsel and MCP agents call into. Picks-and-shovels, not a wrapper. ~$52M raised, $300M val, real AmLaw logos.
*Game-theory:* the moat and the kill are the same thing — its biggest partners (Harvey, Thomson Reuters) are also its most obvious in-house substitutes. The day TR decides retrieval is core, DeepJudge is a feature. Endgame is binary: acquired by a partner at a premium, or absorbed for free. White space: nobody owns the *governed* version of this (audit + privilege posture on the retrieval layer). That's your lane.

**Lawstronaut — the legal-data API/MCP infra play.** The most thesis-pure thing here: RESTful legal-data API + explicit MCP server, 45M+ laws across 150+ jurisdictions, provenance in every response. A genuine platform-others-build-on.
*Game-theory:* if agents become the interface to law, someone owns the data-access layer they call — this is a bet to be it. But it's earliest and thinnest: bootstrapped, no funding, all metrics self-reported, a weird Amsterdam-ops/Dubai-entity split. High-variance — the pick of the bunch or vapour. The call hinges on distribution: infra wins on who builds on it, and there's no evidence yet anyone does.

**Syllo — agentic document review at AmLaw scale.** $30M Venrock, litigator-founded, multi-LLM agentic review proven at scale. Real supervised autonomy doing real work.
*Game-theory:* ediscovery is a real budget line with real pain — closer to revenue than the infra plays. The whole call hinges on one unknown: interop depth. Open agentic layer = defensible. Great closed app = exposed to Relativity bolting on genAI.

**Worth a deeper pass (next):** Ankar (IP, real), Moonlit (research), Definely (drafting, real logos). Same question each: real data/integration moat, or renting it from the model?

## The kill-list — what to avoid and why
Blunt. Evidence in the scorecard; this is the read.

- **Dead segment — the standalone vertical LLM app with no interop:** Crimson, Emma, PhaseLaw, Pivot, Mage. Pattern: 2024-25 founded, tiny raise, "AI [associate] for [vertical]," closed browser SaaS, no API/MCP, self-reported traction. Features, not companies — gone the moment a horizontal agent or incumbent ships the vertical. Avoid as bets; fine as acquihire fodder.
- **Dead-ish — diagramming-as-data:** Structureflow, Jigsaw. Nice tools, real logos, but closed surface, not agentic, niche-bound. Good businesses, capped ceilings. Not where the thesis points.
- **Crowded and thin — compliance/GRC:** KomplyAI (9/35, no funding, no agentic signal), Awesome Compliance. A graveyard of thin workflow tools on the same ground. Truth Systems is the only one to watch, and only if it goes deeper than browser-layer enforcement.
- **(Moved to Thesis 2, not killed):** Moritz. Under Thesis 1 it looked like a "services firm in software clothing" (13/35). It isn't a kill — it's the **Thesis-2 flagship**: the "be the regulated AI firm" model (the inverse of the infra plays, which arm the firms). Re-scored 19/35 under the right lens. See the Thesis-2 section in the scorecard.
- **Most exposed — horizontal agent-builders:** Airia, Eudia, Newcode, Wexler, Casey. "Spin up bespoke legal agents" is the most clonable shape there is, a frontier-model quarter from commoditised. Casey especially — solo founder, unconfirmed everything, severe name-collision. Watch, don't bet.

## What it means
- **The white space is governed infrastructure.** Everyone's building un-governed infra or governed apps. Nobody owns the governed *layer* — audit, privilege posture, regulator-ready, on the rails. That's the gap, and it's your thesis.
- **Acquire (Stella-shaped):** real-but-early infra before a partner absorbs it; high-confidence vertical apps with real logos as bolt-ons.
- **Build, don't buy:** the entire dead segment. "GPT + a vertical prompt + a closed app" is a build, not an acquisition.

## Handoff notes for the next pass
- **Premortem the three gems** — DeepJudge (partner-absorption), Lawstronaut (no-one-builds-on-it), Syllo (incumbent bolts on genAI). Assume each dead in 18 months, work back.
- **Deepen the four "worth a look"** (Ankar, Moonlit, Definely, +1) to gem-or-not.
- **Verify the low-confidence calls before anything's public** — Lawstronaut, Cicero, Scissero, Casey are all thin-evidence; verdicts provisional.
- **Then fork:** this critical-piece cut and the Stella strategic-options memo (acquire/partner/build, framed as their moves).
