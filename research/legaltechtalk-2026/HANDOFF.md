# Handoff — LegalTechTalk 2026 teardown

Context capsule so a fresh session can continue cold. The work lives in this
folder; treat it as the repo root once migrated to `b1rdmania/legaltech-teardown`.

---

## 📌 SESSION 2026-06-19 — deployed live + editorial decisions (read this first)

This session: synced source → teardown mirror, **deployed the site live and public**,
re-ran the two rate-limited verifications, and **agreed an editorial re-cut** with Andy.
The re-cut and reframes are **DECIDED but NOT yet implemented** — left for the next
agent because research is being redone. Build them **in this source folder**, then
re-mirror + redeploy (commands at the bottom).

### State changes that already shipped
- **Mirror is current:** `b1rdmania/legaltech-teardown` `main` synced from this branch
  (build green, `npm run build` → `✓ built`).
- **DEPLOYED, LIVE, PUBLIC:** https://legaltech-teardown.pages.dev
  - Cloudflare Pages, account `andy@cherrygalore.com`, project `legaltech-teardown`,
    prod branch `main`. Deployed via `wrangler pages deploy dist` — **NOT git-connected**,
    so every redeploy is manual (rebuild `dist/` then `wrangler pages deploy`).
  - Repo `legaltech-teardown` is **PUBLIC**.
  - ⚠️ The site is fully public + search-indexable and **names real companies as kills**.
    Andy chose the public launch knowingly. This raises the bar on accuracy/legal — see
    the KomplyAI reframe below, which is now a live-site correctness + exposure issue.

### DECIDED editorial re-cut (implement in source, then re-mirror)
**1. Scorecard 33 → 20.** Andy: *"30 felt like filler; 20 feels editorial."* The cut falls
on a natural line — **composite ≥ 21.** Below that is early, thin-interop vertical apps.

**2. The 20 (composite ≥ 21):** DeepJudge, Lawstronaut, Syllo, Ankar, Moonlit, Airia,
Definely, Leah, August, Eudia, Vesence, Newcode, Pandektes, Kuberno, Wexler, Structureflow,
Orbital, Scissero, Truth Systems, Jigsaw.
(21 names sit at ≥21; **Cicero pulls OUT** into the Thesis-2 callout, landing the table on
exactly 20 — no arbitrary tie-break.)

**3. Featured OUTSIDE the table (story, not screen) — these are NOT cuts:**
- **Moritz + Cicero** → Thesis-2 firm-model callout ("be the regulated AI firm"); judged on
  the firm lens, not the interop rubric. (`THESIS2_IDS = {K56, S25}` already in
  `site/src/data/scorecard.ts`.)
- **KomplyAI** → white-space anchor, **REFRAMED** (see research below).
- **Awesome Compliance (ACT)** → Andy's eye-beats-screen keep: *"scores low, but I liked it
  on the floor."* Give it a named callout that says exactly that. (ACT is also Andy's
  candidate for the GDPR/compliance booth he rated — open thread.)

**4. "The rest of the floor" — parked footer (one-liner + placeholder link slot each):**
Crimson, Emma Legal, PhaseLaw, Aloi, **Augmetec**, LUPL, Casey, Mage Legal, Pivot.
This is the "further links" placeholder Andy asked for — a dignified parking lot, NOT the
kill-list (the kill-list narrative section stays separate).

**5. Suggested mechanism:** add a `tier` field to `dataset/scorecard.json` (+ the site copy
`site/public/data/scorecard.json`) — e.g. `"scorecard" | "featured" | "parked"` — and have
the site filter the Map to `tier==="scorecard"`, render featured ones in their sections, and
list parked ones in the footer. Keeps it data-driven; survives re-derive.

### Research re-run this session (the two rate-limited entries — both came back STRONGER)
- **Augmetec (A3): UPGRADE low → medium.** Real co. £2M+ seed, Fuel Ventures, Feb 2025
  (T3: Artificial Lawyer, Law360, Enterprise Times, LegalTechTalk). **LEIAA v2.0 shipping**;
  GCP-native, Gemini-core. Still: no named customers (confidential-investigations domain),
  integrations (Relativity/iManage/NetDocuments) **asserted but not technically documented**,
  **no public API/CLI/agentic** layer. New thread: **SAFEHAUS Group** is the G-Cloud supplier
  of record for LEIAA — corporate-structure question, footnote it. Drop the
  "[PROVISIONAL]/rate-limited" caveat. NOTE: lands in the parked footer at #26 on the 20-line
  *despite* the upgrade — Andy may choose to pull it up; flag the trade-off.
- **KomplyAI (K24): NOT a thin kill — REFRAME REQUIRED.** Current site calls it
  "vapour / thin backend." Research contradicts that: **MIT CSAIL case study** (real serverless
  GRC platform + years-curated global AI-law corpus), **Australian government contract**
  (govmarket.com.au), AWS / StartUs recognition; founder **Kristen Migliorini** (ex-IP
  litigator). Still genuinely weak on the THESIS (no API/agentic/interop, not "where lawyers
  work", no disclosed institutional funding, no named customers).
  **DECISION (Andy to give final yes, but pushed hard for it):** reframe from "thin kill /
  vapour" to *"KomplyAI is real — MIT-validated, a government contract, a serious regulatory
  corpus. But it's vertical GRC documentation tooling, not the embedded agentic guardrail layer
  the 80/20 flip demands. The space above it is still unowned."* Three reasons: (a) accuracy —
  the current line is confidently-wrong, the exact failure mode the methodology warns kills
  credibility; (b) **legal exposure** — a live public page calling a real, MIT/govt-validated
  company "vapour"; (c) it's a *stronger* white-space argument ("even the credible incumbent
  isn't the agentic layer" > "this one's vapour"). White-space play is unchanged; it never
  rested on this single company.

### Open decisions still needing Andy (carry these forward)
- **KomplyAI reframe** — final yes? (Strongly recommended; accuracy + legal.)
- **Augmetec** — leave parked at #26, or pull it up into the 20 / a featured slot?
- **The 20** — accept the composite-≥21 line as-is, or any manual swaps?

### How to ship it (next agent, cold-start runbook)
1. Do the redo-research pass, then edit **in this source folder** (`research/legaltechtalk-2026/`):
   `dataset/scorecard.json`, `site/public/data/scorecard.json`, `SCORECARD.md`,
   `outputs/*`, and the site (`site/src/data/*.ts`, `site/src/App.tsx`).
2. Commit + push this branch (`claude/legal-tech-talk-research-yut8mq`).
3. **Re-mirror** into the teardown clone:
   ```
   git clone --branch claude/legal-tech-talk-research-yut8mq \
     https://github.com/b1rdmania/legalise.git /tmp/legalise-src   # or pull if it exists
   cd /tmp/ltt-work/legaltech-teardown
   git rm -r --quiet .
   git -C /tmp/legalise-src archive claude/legal-tech-talk-research-yut8mq:research/legaltechtalk-2026 | tar -x
   git add -A && git commit -m "Sync from source: <summary>" && git push
   ```
   (macOS gotcha: the methodology case-collision is resolved upstream now — BRIEF.md +
   lowercase methodology.md, no METHODOLOGY.md. Don't reintroduce it.)
4. **Redeploy** (manual — Pages is not git-connected):
   ```
   cd /tmp/ltt-work/legaltech-teardown/site && npm install && npm run build
   wrangler pages deploy dist --project-name=legaltech-teardown --branch=main --commit-dirty=true
   ```
   Consider connecting the GitHub repo to the Pages project for push-to-deploy instead.

---

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
- **White space (the strategic payoff):** the governed guardrails/documentation layer — audit, privilege posture, supervised autonomy. Nobody owns it; the 80/20 flip is the forced buyer. Flagged via KomplyAI. **⚠️ 2026-06-19: reframe the KomplyAI line** — it is NOT "vapour/a kill"; it's a real, MIT/govt-validated GRC tool that simply isn't the *agentic* guardrail layer. New framing: "even the credible incumbent isn't the embedded agentic layer — the space above it is still unowned." (Accuracy + legal; the white-space play is unchanged.)
- **Out of scope (deliberate):** the $500M+ Series B giants.
- **Legal shield:** every kill = disclosed, cited facts → honest opinion, clearly marked. Three source tiers (observed / vendor-claim / verified-with-URL). Never assert an unsourced fact.

## Files
- `README.md` — process/doctrine; `BRIEF.md` (canonical brief) + `methodology.md` (reproducible doctrine).
- `SCORECARD.md` + `dataset/scorecard.json` — the 33 scored (source of truth; the site renders from the JSON). Composite /35 = Uniqueness + Thesis-fit×2 + Investability + Defensibility + Interoperability + Team.
- `outputs/REPORT.md` — narrative front page. `outputs/REPORT-STRUCTURE.md` — the canonical skeleton. `outputs/OPINIONATED-READ.md` — the POV layer. `outputs/STELLA-OPTIONS-MEMO.md` — Fork B. `outputs/VERIFICATION-2026-06-18.md` — cited verification log.
- `dossiers/facts-*.json` — per-company fact dossiers.
- `site/` — the microsite (React + Vite + Tailwind, Legalise "Almond & Ink" design + Redaction font). `npm install && npm run build`. Page = Nav → Hero → thesis strip → Map (niche-browsable scorecard, links out) → Gems (game-theory cards) → White space → Kill-list → So-what → footer. Editorial narrative for gems lives in `site/src/data/gems.ts`; scorecard data in `site/public/data/scorecard.json` (copy of `dataset/scorecard.json`).

## Status
- ✅ 33 scored; low-confidence tier web-verified. **2026-06-19: Augmetec + KomplyAI re-run
  (no longer rate-limited) — Augmetec upgraded low→medium; KomplyAI is NOT a thin kill, needs
  reframe. See the SESSION 2026-06-19 block at the top.**
- ⏳ **Editorial re-cut DECIDED, not yet implemented:** scorecard 33 → 20 (composite ≥ 21);
  Moritz/Cicero/KomplyAI/ACT featured outside the table; 9 parked in a "rest of the floor"
  footer. Top block has the full spec + runbook.
- ✅ Two-thesis structure; Moritz/Cicero broken out.
- ✅ Stella memo drafted (Fork B).
- ✅ Microsite coherent, builds green, all link to official domains.
- ✅ **DEPLOYED LIVE + PUBLIC** 2026-06-19: https://legaltech-teardown.pages.dev (Cloudflare
  Pages; manual redeploy, not git-connected). Repo `legaltech-teardown` is public.
- ⚠️ Build gotcha (watch on re-derive): the legalise root `.gitignore` `data/` rule eats
  `site/src/data/` and `site/public/data/`. `site/.gitignore` re-includes them; keep that.

## Open threads (next work)
- **Implement the 33→20 re-cut + KomplyAI reframe** (top block) — primary next task.
- **Premortems** on the three gems (DeepJudge = partner-absorption; Lawstronaut = no-one-builds-on-it; Syllo = incumbent-bolts-on-genAI).
- **Fork A — the critical piece** in Andy's voice (POV essay; Andy writes, agent scaffolds).
- ✅ ~~Re-verify Augmetec + KomplyAI~~ — done 2026-06-19 (see top block); fold results into the copy.
- **Get the Moonlit deck** (live raise) + backend dig — Andy.
- **Tyson memo** — no context captured yet; needs his lens (acquirer / operator / founder).
- **Confirm the GDPR/certificates booth** Andy liked (candidates: Awesome Compliance / KomplyAI / a benched booth) + his other "liked niches". (ACT is now a confirmed eye-beats-screen keep.)
- **Connect the repo to Cloudflare Pages** for push-to-deploy (currently manual `wrangler pages deploy`).

## Repo / migration
- Source of truth (for now): `b1rdmania/legalise`, branch `claude/legal-tech-talk-research-yut8mq`, folder `research/legaltechtalk-2026/`. **This is a public repo** — the teardown sits on a branch; migrating off it is the point.
- Deploy target: `b1rdmania/legaltech-teardown` (now **public**, deployed). It mirrors this folder at its root.
- Sync = re-extract this subtree over the teardown working tree (`git archive … | tar -x`), commit, push.
- Once the teardown holds everything and builds, the public legalise branch gets deleted (full handover), then it's safe to `git rm -r research/legaltechtalk-2026` from legalise.
