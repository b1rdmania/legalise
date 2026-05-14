# Handover — v0.1 launch playbook

This is a forward-looking handover, not a reviewer round. Whoever drives the
launch (Andy, or a fresh agent under Andy's supervision) executes this
top-to-bottom. Steps are interactive where they involve credentials or
external services; everything else is runnable from the repo.

**Repo head:** `f807b44` on `master`. R5 + R6 + R7 all signed off
cumulatively. Only blocker between here and HN Tuesday is the Day 15
interactive deploy.

---

## 0. Lock check before starting

- R5: audit-row contracts, matter-type policy strings, envelope-POST PDF — signed off in `HANDOVER_R5.md`.
- R6: ErrorCallout regex, Gotenberg sidecar (internal-only, always-on), landing narrative — signed off in `HANDOVER_R6.md`.
- R7: SKILL.md parser extension, "What v0.1 does not yet do" honesty list, load-bearing launch sentence — signed off after the `f807b44` fix batch.

If any reviewer round opens new findings between now and launch, fix-and-close before posting. Don't launch with a P1 open.

---

## 1. Day 15 — Live deploy (interactive)

Everything you need is already in `infra/deploy/cloudflare.md`. Don't re-derive.

### Preflight (verify all five green)

```bash
fly version && fly auth whoami
wrangler --version && wrangler whoami    # or skip — verify legalise.dev via CF dashboard
echo "${ANTHROPIC_API_KEY:?missing}" | head -c 12 ; echo
git ls-files frontend/package-lock.json | grep -q . && echo OK
# Manual: confirm legalise.dev added to your Cloudflare account
# Manual: Neon project exists in London region with pgvector
```

If any red, follow `infra/deploy/cloudflare.md` Preflight section.

### Setup sequence

Run `infra/deploy/cloudflare.md` steps 1 → 7 in order:

1. Cloudflare account + API token (Pages + DNS + R2)
2. Neon Postgres London + pgvector + connection string (rewrite `postgres://` → `postgresql+psycopg://`, append `?sslmode=require`)
3. Cloudflare R2 bucket (jurisdiction `eu`, location hint `WEUR`, CORS)
4. Backend deploy via Fly (`fly launch --no-deploy --copy-config`, then `fly secrets set` with the full block from §4, then `fly deploy`). Verify health.
5. Frontend deploy via Cloudflare Pages (build command `cd frontend && npm ci && npm run build`, env var `VITE_API_BASE_URL=https://api.legalise.dev/api`)
5b. Gotenberg sidecar Fly app — `fly apps create legalise-gotenberg`, deploy with the documented `fly.toml` (no `[[services]]` block, always-on `shared-cpu-1x`). Verify no public ingress with `fly ips list --app legalise-gotenberg` returning empty.
6. DNS wiring (`legalise.dev` → Pages, `api.legalise.dev` → Fly, both proxied)
7. Smoke — six numbered curl steps + manual click-through

**Don't skip the smoke.** Every line in §7 must return the expected output. Earlier failures cascade.

### Day 15 done state

- `curl https://api.legalise.dev/health` returns `status: ok, database: ok`.
- `curl https://legalise.dev/` returns 200.
- The bundle inlines `https://api.legalise.dev/api` (greppable in dist).
- `fly ips list --app legalise-gotenberg` returns empty.
- CORS preflight from `legalise.dev` origin returns 200.
- Manual click-through (Khan matter loads, Pre-Motion runs, PDF exports, Letters draft) all succeed.
- The seeded Khan matter is present (because `fly.toml` sets `ENVIRONMENT=demo`).

If any of those fail at smoke time, stop. Burn Anthropic tokens once on a working stack, not five times on a broken one.

---

## 2. Pre-launch polish (~half day, parallel-isable with Day 15)

These are launch assets the HN post and the README sample-matter walkthrough need. Day 17 in `BUILD_PLAN.md` already calls these out.

### 2a. Animated GIF of Pre-Motion end-to-end

Captures: matter context → four-stage adversarial pipeline running with parallel sub-agents → final brief with the brutal one-sentence verdict.

Tooling: `Kap` (macOS) or `Peek` (Linux), 1080p, ≤ 8MB, ≤ 30s, looped. Drop into `docs/assets/premotion-demo.gif`, reference from README.

### 2b. Screenshots

PNG, 1440px wide minimum, light + dark tested. Five required:

1. Matter workspace (Khan detail page, full scroll)
2. Pre-Motion brief (the final verdict card + stage strip + failure scenarios)
3. Audit log with the privilege-posture row visible (POSTURE change action, time, hashes)
4. Letters draft (lba selected, the catalogue showing other ET options)
5. `#/modules` Discovery page (grouped skill catalogue with one prompt body expanded)

Drop into `docs/assets/screenshots/` with descriptive filenames. Reference from README.

### 2c. Repo polish

```bash
gh repo edit b1rdmania/legalise \
  --description "Legalise turns reviewable legal skills into audited matter workflows." \
  --add-topic legal-tech \
  --add-topic legal-ai \
  --add-topic claude \
  --add-topic anthropic \
  --add-topic uk-law \
  --add-topic fastapi \
  --add-topic open-source \
  --add-topic skill-marketplace \
  --add-topic compliance

# Optional: social card. 1280x640 PNG, brand-coherent (Oxide dark palette).
# gh repo edit b1rdmania/legalise --homepage https://legalise.dev
```

Mirror the topics on `claude-for-uk-legal`:

```bash
gh repo edit b1rdmania/claude-for-uk-legal \
  --description "UK legal SKILL.md catalogue for Claude Code and Legalise." \
  --add-topic legal-tech \
  --add-topic claude \
  --add-topic claude-code \
  --add-topic skills \
  --add-topic uk-law \
  --add-topic open-source
```

### 2d. Quickstart clean-machine pass

On a Mac or Linux box that has *never* seen this repo:

```bash
git clone https://github.com/b1rdmania/legalise.git
cd legalise
cp .env.example .env   # add ANTHROPIC_API_KEY locally
docker compose -f infra/docker-compose.yml up --build
# Wait for healthchecks
open http://localhost:3000
```

Capture any friction. Fix it before launch.

### 2e. MANIFESTO sweep

Already done in R7 (clean — no "hero" references). Re-grep one more time post-launch-prep:

```bash
grep -in "hero\|installable\|marketplace UI\|plug-and-play" MANIFESTO.md README.md
```

If anything reads as overclaiming relative to the v0.1 reality, fix.

---

## 3. Day 18 — Launch sequence

UK time, Tuesday morning. HN's UK-time peak is roughly 11:00–13:00 BST (06:00–08:00 ET — start of US East Coast morning).

### 3a. T-24 hours

- Confirm `legalise.dev` is up and stable. One last smoke run.
- Confirm `claude-for-uk-legal` README is current and cross-links Legalise.
- Pre-warm contacts: 5–10 people who'd star + comment. Personal DMs only. Template:
  > Hey [name], shipping Legalise tomorrow morning UK time on HN — open-source legal AI workspace that runs Claude skills against matter context, with an audit log on every LLM call and matter mutation. If you find it interesting and feel like dropping a star + a thoughtful comment in the first hour, it makes a big difference to whether the post survives the new-page sort. No pressure. https://github.com/b1rdmania/legalise
- DM Stella maintainer separately:
  > Shipping Legalise tomorrow morning UK time. Matter schema is Stella-compatible — quick port path goes both ways. Worth a chat after launch?

### 3b. T-2 hours

- Final smoke: `curl https://api.legalise.dev/health`, `curl https://legalise.dev/`, click-through one matter.
- Drafts open in browser tabs: HN (Legalise), HN (claude-for-uk-legal), X main post, LinkedIn main post.
- Coffee. Phone notifications on. No meetings booked next 4 hours.

### 3c. T-zero: post HN

**Post 1 — Legalise**

Title (use the load-bearing sentence verbatim — survived R7 cold-reader test):

> Show HN: Legalise – turns reviewable legal skills into audited matter workflows

URL: `https://legalise.dev`

Body — first comment from Andy (HN convention; do not put it in the post body):

> Hi HN — Andy here.
>
> Legalise is an open-source UK legal AI workspace. The shape I've been building toward: legal AI work should be inspectable, composable, auditable, and run against matter-shaped context, not loose chat prompts.
>
> Mechanics:
> - Skills are `SKILL.md` files in a Git catalogue ([`claude-for-uk-legal`](https://github.com/b1rdmania/claude-for-uk-legal) is the seed catalogue, 15 skills covering ET, civil litigation, research)
> - The workspace renders that catalogue into matter-first surfaces (one matter per case, audit log per LLM call and matter mutation, privilege posture as a first-class property, CPR 31.22 implied-undertaking gate on chronology entries sourced from disclosed documents)
> - Install is Git: fork the catalogue repo, review skills by PR diff, point Legalise at your fork — approval is code review, provenance is git history
> - The four surfaces in v0.1 (matter spine, Pre-Motion, Letters, Chronology) are proof modules, not the project. The project is the execution substrate.
>
> What v0.1 doesn't do yet: install/enable toggles, per-workspace policy, module permissions, UI contracts, users + settings, signed manifests, lint gates for skills. README "What v0.1 does not yet do" section maps each gap to ROADMAP v0.2.
>
> Stack: Python 3.12 + FastAPI + SQLAlchemy 2 + Postgres + pgvector for the backend; React 19 + Vite + Tailwind on the front. Apache 2.0.
>
> Live demo: legalise.dev (seeded with an unfair-dismissal sample matter). Self-host: `docker compose up`.
>
> Happy to answer anything. Particularly interested in feedback on the Git-as-marketplace pattern and whether the trust posture in `docs/TRUST.md` reads as honest.

**Post 2 — claude-for-uk-legal**

Title:

> Show HN: claude-for-uk-legal – 15 reviewable legal skills for Claude Code

URL: `https://github.com/b1rdmania/claude-for-uk-legal`

Body — first comment:

> Hi HN — Andy here.
>
> Companion to the Legalise post going up at the same time. claude-for-uk-legal is a catalogue of `SKILL.md` files written for Claude Code. 15 skills covering Employment Tribunal (LBA, ACAS EC, ET1, Part 36, settlement review, unfair-dismissal screener), civil litigation (CPR letters, chronology, disclosure list, Pre-Motion, without-prejudice), and research.
>
> Each skill is a single `.md` file with YAML frontmatter (name, description, argument hint) + a prompt body that builds the legal artefact. Reviewable by anyone with a text editor. Use it directly in Claude Code, or render it into a matter workspace via [Legalise](https://github.com/b1rdmania/legalise).
>
> The repo is built to be forked. Internal law-firm tech teams: PR your fork, review the prompts, pin the SHA your firm has approved.
>
> Apache 2.0. PRs welcome — particularly from solicitors who've written prompts that work in their practice and want them in a shareable shape.

### 3d. Cross-link both posts

In post-1 reply: link to post-2. In post-2 reply: link to post-1.

Same for the X + LinkedIn posts.

### 3e. X main post

```
Open-sourced today: Legalise.

Turns reviewable legal AI skills (SKILL.md files in a Git catalogue) into matter-first workflows. Audit log on every LLM call and matter mutation, privilege posture as a first-class property, CPR 31.22 gate on chronology entries sourced from disclosed documents.

🇬🇧 UK legal-tech.

[link to legalise.dev]
```

Reply chain:
- Repo: `https://github.com/b1rdmania/legalise`
- Catalogue: `https://github.com/b1rdmania/claude-for-uk-legal`
- Live demo with seeded Khan v Acme matter: `https://legalise.dev`
- HN: [link to HN post]

### 3f. LinkedIn main post

```
I've open-sourced Legalise — a UK legal AI workspace that turns Claude skills into matter-first workflows.

Why this matters: legal AI work should be inspectable, composable, auditable, and run against matter-shaped context — not loose chat prompts.

What v0.1 ships:
• Matter spine with document register, audit log, privilege posture
• Pre-Motion: adversarial premortem pipeline (4 stages, 9 model calls, all audited)
• Letters: matter-type-aware drafting (ET → LBA default, civil → LBC)
• Chronology with CPR 31.22 implied-undertaking gate on entries sourced from disclosed documents
• Installed skill catalogue: 15 skills published as reviewable SKILL.md files
• Install via Git: fork, review, pin SHA. Approval is code review.

What v0.1 doesn't do: install toggles, per-workspace policy, module permissions, users/settings, signed manifests. All v0.2.

Live: legalise.dev
Repo: github.com/b1rdmania/legalise
Skill catalogue: github.com/b1rdmania/claude-for-uk-legal

Open to feedback — particularly from solicitors and legal-tech engineers.
```

### 3g. First 4 hours after posting

- Reply to every HN comment within 30 min if possible. Be terse, technical, no marketing.
- If someone asks "why not [thing]" — answer honestly with the trade-off. Don't argue past the question.
- If someone finds a bug — fix it live if you can, commit + push during the launch window. That visibility is good.
- Star count + comment count: aim for 30+ stars and 5+ comments in the first hour. Without that, the post slides off `/newest` before it gets traction.
- Cross-promotion: drop the X post link in the HN comments only if naturally relevant. Don't spam.

---

## 4. Post-launch (Day +1 to Day +7)

- **Day +1:** Reply to overnight comments. Fix any P1 issues people surfaced.
- **Day +2:** Write a short follow-up post explaining decisions HN questioned (if any patterns emerged). Don't pre-write it.
- **Day +3:** Reach out to the most thoughtful commenters with a personal DM offering deeper context.
- **Day +5:** Quantitative pass — stars, forks, issues, PRs, traffic. Note what people are doing with it.
- **Day +7:** Write the public retro. Honest. Goes on the README or a `/launch-retro` post on the blog if there is one.

---

## 5. Things explicitly NOT to do during launch week

- Don't add features. Fix bugs only. Anything bigger goes to v0.2 backlog.
- Don't argue with critics. Answer the technical question, move on.
- Don't oversell what v0.1 does. The "What v0.1 does not yet do" section is your shield against accusations of overclaiming.
- Don't engage with bait. Some HN comments are bait. Identify, ignore.
- Don't accept PRs that change architecture during launch week. Hold until the dust settles.
- Don't burn out — the post is up for 24-48 hours of attention, then the long tail. Pace yourself.

---

## 6. Pointers — files the launch playbook leans on

```
infra/deploy/cloudflare.md       — full deploy sequence with preflight + smoke
backend/fly.toml                 — Fly app config, committed
backend/Dockerfile               — image with vendored plugin catalogue
docs/TRUST.md                    — regulatory honesty doc, §9 covers skill provenance
README.md                        — the document that lands every cold reader
ROADMAP.md                       — what's v0.2, including the Module Lifecycle workstream
MANIFESTO.md                     — values + refusals
HANDOVER_R5.md                   — audit-row contracts, locked
HANDOVER_R6.md                   — Gotenberg sidecar plan, locked
HANDOVER_PIVOT.md                — the strategy reframe (history)
HANDOVER_PIVOT_DONE.md           — builder agent's pivot hand-back
HANDOVER_LAUNCH.md               — this file
```

---

The repo is in good shape. The launch motion is small. Don't gold-plate.
Don't add scope. Ship.
