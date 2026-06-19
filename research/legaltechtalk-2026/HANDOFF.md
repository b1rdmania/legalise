# Handoff — LegalTechTalk 2026 teardown

Context capsule so a fresh session can continue cold. The work lives in this
folder; treat it as the repo root once migrated to `b1rdmania/legaltech-teardown`.

## What this is
A first-hand, opinionated teardown of the LegalTechTalk 2026 exhibitor floor
(InterContinental O2, 17–18 June 2026). Andy walked the booths; this turns that
into a scored screen + a brutal-but-defensible POV + a deployable microsite.
Two output forks: **(A)** a public critical piece (Andy's voice) and **(B)** a
private Stella strategic-options memo.

## The framing (don't drift from this)
- **Hook:** "I walked the booths so you didn't have to. Most of it's shockingly bad and dead within a year."
- **Macro driver:** law flipping 80% human/20% AI → 80% AI/20% human. Everything is read against what survives the flip.
- **Spine (Thesis 1):** real = agentic, interoperable, lives where lawyers work. Front-end + proprietary data + no agent-to-agent = a wrapper with a countdown (acquihire at best).
- **Thesis 2:** already-regulated legal-services entities deploying accountable AI (the "be the regulated AI firm" model). Cohort = **Moritz** (flagship) + **Cicero** (adjacent, vendor-with-regulated-posture). Read on a firm-model lens, not the interop rubric.
- **Eye beats screen:** where judgment disagrees with the scorecard, judgment wins, annotated.
- **White space (the strategic payoff):** the governed guardrails/documentation layer — audit, privilege posture, supervised autonomy. Nobody owns it; the 80/20 flip is the forced buyer. Flagged via KomplyAI (company is a kill, the space is open): "kill the company, own the space."
- **Out of scope (deliberate):** the $500M+ Series B giants.
- **Legal shield:** every kill = disclosed, cited facts → honest opinion, clearly marked. Three source tiers (observed / vendor-claim / verified-with-URL). Never assert an unsourced fact.

## Files
- `README.md` — process/doctrine; `BRIEF.md` (canonical brief) + `methodology.md` (reproducible doctrine).
- `SCORECARD.md` + `dataset/scorecard.json` — the 33 scored (source of truth; the site renders from the JSON). Composite /35 = Uniqueness + Thesis-fit×2 + Investability + Defensibility + Interoperability + Team.
- `outputs/REPORT.md` — narrative front page. `outputs/REPORT-STRUCTURE.md` — the canonical skeleton. `outputs/OPINIONATED-READ.md` — the POV layer. `outputs/STELLA-OPTIONS-MEMO.md` — Fork B. `outputs/VERIFICATION-2026-06-18.md` — cited verification log.
- `dossiers/facts-*.json` — per-company fact dossiers.
- `site/` — the microsite (React + Vite + Tailwind, Legalise "Almond & Ink" design + Redaction font). `npm install && npm run build`. Page = Nav → Hero → thesis strip → Map (niche-browsable scorecard, links out) → Gems (game-theory cards) → White space → Kill-list → So-what → footer. Editorial narrative for gems lives in `site/src/data/gems.ts`; scorecard data in `site/public/data/scorecard.json` (copy of `dataset/scorecard.json`).

## Status
- ✅ 33 scored; low-confidence tier web-verified (6/8 upgraded low→medium; Augmetec + KomplyAI still provisional/rate-limited — re-run before publication).
- ✅ Two-thesis structure; Moritz/Cicero broken out.
- ✅ Stella memo drafted (Fork B).
- ✅ Microsite coherent, builds green, all 33 link to official domains.
- ⚠️ Build gotcha (fixed here, watch on re-derive): the legalise root `.gitignore` `data/` rule eats `site/src/data/` and `site/public/data/`. `site/.gitignore` re-includes them; keep that.

## Open threads (next work)
- **Premortems** on the three gems (DeepJudge = partner-absorption; Lawstronaut = no-one-builds-on-it; Syllo = incumbent-bolts-on-genAI).
- **Fork A — the critical piece** in Andy's voice (POV essay; Andy writes, agent scaffolds).
- **Re-verify** Augmetec + KomplyAI (rate-limited).
- **Get the Moonlit deck** (live raise) + backend dig — Andy.
- **Tyson memo** — no context captured yet; needs his lens (acquirer / operator / founder).
- **Confirm the GDPR/certificates booth** Andy liked (candidates: Awesome Compliance / KomplyAI / a benched booth) + his other "liked niches".
- **Deploy** the site (Cloudflare Pages / Vercel) when ready; flip the repo public at launch.

## Repo / migration
- Source of truth (for now): `b1rdmania/legalise`, branch `claude/legal-tech-talk-research-yut8mq`, folder `research/legaltechtalk-2026/`. **This is a public repo** — the teardown sits on a branch; migrating off it is the point.
- Deploy target: `b1rdmania/legaltech-teardown` (private until launch). It mirrors this folder at its root.
- Sync = re-extract this subtree over the teardown working tree (`git archive … | tar -x`), commit, push.
- Once the teardown holds everything and builds, the public legalise branch gets deleted (full handover), then it's safe to `git rm -r research/legaltechtalk-2026` from legalise.
