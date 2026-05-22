# Handover — Pre-launch posture + P0 audit fixes

**For:** the reviewer agent (and Andy for context).
**As of:** 2026-05-21. Repo head: `c2089d8`. Pushed to `origin/master`.
**Prior handover:** [`HANDOVER_EXTERNAL_AUDIT.md`](./HANDOVER_EXTERNAL_AUDIT.md) at `8dc3cb5` (calibrated external-audit triage).
**Scope:** production model-key posture decision, P0.1–P0.3 from the external-audit handover, Andy's pending pre-launch work, open questions for review.

---

## 1. TL;DR

Five commits since the external-audit handover. Three of them are P0.1–P0.3 from that doc. Two are a production posture decision (no server-paid model fallback in prod) that landed before P0.1–P0.3 and is referenced by P0.2.

The doctrine from `HANDOVER_EXTERNAL_AUDIT.md` is honoured:
- P0.1–P0.4 are public-launch work. P0.1, P0.2, P0.3 are done. P0.4 (clean-clone smoke) is gated on Andy.
- V1–V5 stay in v0.4.1 (post-launch batch). Not opened as tasks.
- F1–F5 stay as firm-pilot gates. Not reclassified as launch blockers.

The teaser post is viral; the deploy is not done; the README still claims `legalise.dev shipping Friday`. That line is the only material public commitment currently at risk if the Friday deploy slips. Flagged for Andy.

---

## 2. Production posture decision (locked 2026-05-20)

Legalise must not provide model access in production. Users bring their own encrypted Anthropic / OpenAI keys via Settings; stub-echo handles the keyless demo state.

Rationale:
- Server-paid fallback reintroduces cost exposure and "Legalise provides model access" positioning ambiguity. The latter is load-bearing for the BYO posture: no provider reseller liability, no opaque token economics, no "is Legalise an AI vendor or a workspace?" confusion.
- Already structurally enforced at the gateway: `backend/app/core/model_gateway.py:392-394` requires `environment in _DEV_ENVIRONMENTS` AND `LEGALISE_ALLOW_SERVER_KEY_FALLBACK=true`. The fallback cannot fire in production regardless of flag value.

### Changes shipped under this decision

`296d520` — Production posture: BYO-keys-only by default
- `.env.example:27` flipped `LEGALISE_ALLOW_SERVER_KEY_FALLBACK` from `true` to `false`. First-clone operators now inherit a posture consistent with production.
- `backend/fly.toml:5` deploy comment dropped stale `ANTHROPIC_API_KEY` reference. Comment now states "do NOT set `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` in prod secrets — production posture is BYO user keys."

`ce0f575` — cloudflare.md: align with BYO-keys-only production posture
- Preflight step 2 dropped the stale `ANTHROPIC_API_KEY` env-var check, replaced with an `openssl` presence check (used to mint `SESSION_SECRET` and `LEGALISE_KEY_ENCRYPTION_SECRET` in step 4).
- `§Server-key posture` rewritten as a named subsection. Adds `OPENAI_API_KEY` alongside `ANTHROPIC_API_KEY` as deliberately absent in prod. Calls out `model_gateway.py:392-394` so future operators can find the structural guard.

Pre-flight rule: `fly secrets list --app legalise-backend` should not contain `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`.

---

## 3. P0 fixes from HANDOVER_EXTERNAL_AUDIT.md

### P0.1 — Pre-Motion audit module namespace (`c0a562a`)

Fixed three callsites that were writing `AuditEntry` rows with `module=NULL`:
- `backend/app/modules/pre_motion/pipeline.py` — `module.pre_motion.run.start` (line 250 region)
- `backend/app/modules/pre_motion/pipeline.py` — `module.pre_motion.run.complete` (line 370 region)
- `backend/app/modules/pre_motion/router.py` — `module.pre_motion.pdf.exported` (line 302) — **not in the external-audit handover**; found via AST walk

All three now pass `module="pre_motion"`.

**Test:** `backend/tests/test_audit_module_kwarg.py` is a new static-invariant test. AST-walks every `audit_api.log` call under `backend/app/modules/`, fails if any `module.*` action string is logged without a `module=` kwarg. Catches the bug class across all module callsites, not just the three Pre-Motion sites the audit named.

Local run: `pytest backend/tests/test_audit_module_kwarg.py` passes.

### P0.2 — Public disclosure honesty pass (`ef15a86`)

`README.md` §When and §What did it produce both softened against the external audit's WORM critique.
- "Writes one row to an append-only audit log" replaced with "writes one row to an audit log that the application never updates or deletes." Added an inline paragraph: "Append-only is enforced by convention in v0.1 — the application never writes UPDATE or DELETE against `audit_entries`. Postgres-level WORM grants (REVOKE UPDATE/DELETE on the table for the app role) land v0.2; v0.1 audit is therefore not forensically tamper-resistant against a DB superuser." Linked to `docs/TRUST.md#8-audit-trail`.
- "Any AI interaction on the matter can be reconstructed forensically" replaced with "reconstructed from the audit row, subject to the v0.1 tamper-resistance caveat above."

`frontend/src/landing/Landing.tsx` §04 "What v0.1 is not" gained an explicit "Not for live client matters" bullet covering BYO-key requirement and self-host recommendation for anything approaching real client material. README and TRUST.md already carried this; landing was the surface a viral-teaser click-through lands on and was missing the line.

`docs/TRUST.md` not changed — §2 (Hosted demo and BYO model keys), §3 (gaps at top), and §8 (audit trail) already carry the honest framing.

### P0.3 — `app/agents/` architecture honesty (`c2089d8`)

External audit flagged `ARCHITECTURE.md` presenting `app/agents/` `BaseAgent` + `Orchestrator` as current runtime infrastructure. It isn't — the orchestrator raises `NotImplementedError` and no module imports from it. Verified: `from app.agents` does not appear in `app/modules/`. The `from .agents` imports in `pre_motion/contract_review/pipeline.py` are module-local sub-agent files, not the top-level placeholder.

`ARCHITECTURE.md` three sites fixed:
- Stack table "Multi-agent" row rewritten to name the actual runtime location (module-local pipelines) and explicitly flag `app/agents/` as a v0.2+ placeholder.
- §Module shape file layout swapped `agents.py` for `pipeline.py` (which is what the runtime modules actually use).
- §Multi-agent section renamed §Multi-stage pipelines (module-local), rewritten to describe actual Pre-Motion (four-stage adversarial premortem) and Contract Review (parser → analyst → redliner → summariser) pipeline shapes. `app/agents/` honestly framed as a never-wired scaffold kept as v0.2+ placeholder.

`backend/app/agents/{__init__.py,base.py,orchestrator.py}` docstrings updated so source-browsing matches the doc story. `NotImplementedError` message now points readers at `app/modules/<name>/pipeline.py`.

---

## 4. Andy's pending pre-launch work

### P0.4 — Clean-clone smoke walk

Cannot be automated. Sequence:
1. `rm -rf` the local working copy
2. Fresh `git clone https://github.com/b1rdmania/legalise`
3. `cp .env.example .env`
4. `docker compose -f infra/docker-compose.yml up --build`
5. Open frontend
6. Walk: signup → email verify (dev autoverify) → Khan auto-seed → add BYO Anthropic key in Settings → upload valid + invalid doc → run one workflow → trigger ProviderKeyMissing (remove key) → check audit row in Audit tab
7. Anything that breaks: either fix or document as an explicit README caveat

The defaults in `.env.example` are now production-posture (`LEGALISE_ALLOW_SERVER_KEY_FALLBACK=false`), so the smoke walk validates the right posture.

### Account-creation checklist (~30 min)

Order matters: domain DNS first because Cloudflare propagation can take an hour.

1. **Cloudflare account** — add `legalise.dev`, change registrar nameservers to Cloudflare's, wait for activation, generate scoped API token (Pages edit, R2 edit, DNS edit on `legalise.dev`)
2. **Neon Postgres** — project in London (UK) / `aws-eu-west-2`, `CREATE EXTENSION IF NOT EXISTS vector;`, rewrite DSN prefix from `postgres://` to `postgresql+psycopg://`, append `?sslmode=require`
3. **Cloudflare R2** — bucket `legalise-docs`, EU jurisdiction, location hint WEUR, CORS `https://legalise.dev`, S3-compatible token scoped to bucket
4. **Resend** — verify `legalise.dev` (DNS records in Cloudflare), API key scoped to legalise.dev sending
5. **Cloudflare Turnstile** — site for `legalise.dev`, Managed widget, capture site key + secret
6. **GitHub PAT** — fine-grained, scoped to `b1rdmania/claude-for-uk-legal`, permissions Contents (R+W), Pull requests (R+W), Metadata (R)
7. **Fly.io** — `fly auth login` confirmed; paid plan active

End state: secrets saved locally (e.g. `~/Desktop/legalise-deploy-secrets.env`, outside the repo) — never pasted in chat.

### Deploy (driven from secrets, post-checklist)

Per [`infra/deploy/cloudflare.md`](../infra/deploy/cloudflare.md). Order:
1. `fly launch --no-deploy --copy-config` from `backend/`
2. `fly secrets set ...` (no `ANTHROPIC_API_KEY` / `OPENAI_API_KEY`)
3. `fly deploy`
4. Gotenberg sidecar in `lhr`, no public ingress, verify `fly ips list --app legalise-gotenberg` empty
5. `wrangler pages deploy` for frontend
6. DNS wiring for `legalise.dev`
7. Smoke curls per `infra/deploy/cloudflare.md` §7

### Production smoke walk

From cold open at legalise.dev: no-auth landing → demo path → signup → email verify → BYO key add → upload (valid + invalid) → run one workflow → trigger ProviderKeyMissing → trigger ProviderUpstreamError if easy → audit row count + shape via Audit drawer. Verify `fly secrets list` shows no model keys.

---

## 5. Open questions / reviewer asks

1. **README "shipping Friday" line.** Today is 2026-05-21 (Thursday). The README hero claims `legalise.dev shipping Friday`. If Friday's deploy slips, the README is wrong. Hold or soften?
2. **Were the three P0.1 callsites the right scope?** I added `module="pre_motion"` to the PDF-export row in `pre_motion/router.py:302` even though the external audit only named start/complete. The AST walk flagged it as the same bug class. Defensible, or scope creep?
3. **Is the source-side `NotImplementedError` rewrite in `backend/app/agents/orchestrator.py` enough?** The placeholder could alternatively be deleted entirely (option mentioned in the external audit's reviewer questions). Kept it because the docstring + error message now match the docs and a future v0.2 abstraction is plausible. If the reviewer prefers deletion, easy to do.
4. **Should V1 (backend lockfile + dependency ceilings) move from v0.4.1 into pre-launch?** Reviewer Q from the external-audit handover (§9 Q2). Andy directive was V1–V5 stay in v0.4.1; this is the reviewer's call to overrule.
5. **Public copy tidy sweep.** Andy directed that further README / public-copy polish (em-dash sweep, hero CTA copy, voice pass, the "shipping Friday" line, etc.) batches into a single pre-launch pass rather than ad-hoc edits. Reviewer should expect a dedicated copy sweep commit immediately before deploy.

---

## 6. What was deliberately NOT done

- **V1–V5** — backend lockfile, magic-byte upload validation, `python-frontmatter<1.2` cap removal, `module_catalogue` extract, dependency cleanup. Tracked as task #9 (v0.4.1 batch). Pick up immediately after public v0.4 launch lands.
- **F1–F5** — manual matter deletion/export, audit WORM enforcement, key rotation runbook, durable jobs, high-risk module logic tests. Tracked as task #10 (firm-pilot gates). Per directive, not reclassified as launch blockers without explicit reviewer approval.
- **Third-party guardrail layers** (Lakera, Guardrails AI, Patronus) — explicitly out of scope per the external-audit handover §7.
- **Module-system rewrite** — explicitly out of scope per the external-audit handover §7.
- **Unused-dependency cleanup** — V5, deferred to v0.4.1 unless it breaks CI or shows in scanner output that gets shared publicly.

---

## 7. Commit log (since `8dc3cb5`)

```
c2089d8 P0.3: architecture honesty — app/agents/ is a placeholder, not runtime
ef15a86 P0.2: public disclosure — audit + live-client caveats explicit
c0a562a P0.1: Pre-Motion audit rows now carry module="pre_motion"
8dc3cb5 Add calibrated external audit handover     ← prior handover commit
ce0f575 cloudflare.md: align with BYO-keys-only production posture
296d520 Production posture: BYO-keys-only by default
```

All pushed to `origin/master`. CI should be green on each — local test run on the new `test_audit_module_kwarg.py` passes; the other commits touch docs / `.env.example` / `fly.toml` only (not CI-gated).

---

## 8. Suggested reviewer hand-off line

> Read `docs/HANDOVER_PRE_LAUNCH.md`. Five commits since the external-audit handover: two locking the BYO-only production posture, three closing P0.1–P0.3 from `HANDOVER_EXTERNAL_AUDIT.md`. P0.4 (clean-clone smoke) and deploy are gated on Andy doing the account-creation checklist. Confirm the P0.1–P0.3 implementations land the audit's intent. Five open questions in §5 — particularly the "shipping Friday" README line and whether V1 should move forward from v0.4.1.
