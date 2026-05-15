# Handover — Day E (polish + evals + launch playbook)

Reviewer pass on the final pre-deploy commit. Day E closes the auth
build by tightening copy across the public surface (README, Landing,
TRUST.md, ROADMAP.md, HANDOVER_LAUNCH.md), shipping a new
`docs/AUTH.md` reference, adding the Day-D-specific signup-auto-seed
eval, and dropping a `PRE_FLIGHT.md` interactive checklist so Andy can
walk into Day 15 with every account / key / DNS line ready.

The R-Day-CD fixes (`3baf9b6`) closed Verify token loop + email copy
precision. Day C and Day D are now both signed off in code; this
handover finishes the documentation/eval surface around them.

After signoff: pre-flight (Andy, interactive) → Day 15 deploy → Day 16-17
polish → Day 18 paired HN launch.

---

## Where we are

Commits since the last signoff (`3baf9b6`):

- (this commit) — **Day E**. Five workstreams in one push:
  1. `evals/smoke_signup_auto_seed.py` + `evals/README.md` table row
  2. README, Landing, `docs/TRUST.md` copy pass
  3. `ROADMAP.md` shuffle (auth v0.2 → v0.1)
  4. `HANDOVER_LAUNCH.md` HN/X post drafts gain BYO-key wording
  5. `docs/AUTH.md` reference (signup flow, key storage, master key, sessions, env-var checklist, out-of-scope)
- Plus `PRE_FLIGHT.md` at repo root — Andy's interactive checklist.

Build green: 31 modules, 270 kB JS / 79 kB gzipped. App.tsx
unchanged in shape; only the Landing trust paragraph text edits.
Backend touched the eval folder only — no `app/` changes.

---

## How to orient yourself in 15 minutes

1. **`docs/AUTH.md`** — single source of truth for the new auth
   surface. Read end-to-end; this is the doc the reviewer is checking
   against.
2. **`evals/smoke_signup_auto_seed.py`** — six assertions: register
   both → Khan loads → docs seeded → chronology + CPR gate seeded →
   slug tenancy holds → anon 401. Reviewable as a static read.
3. **`evals/README.md`** — note the new table row + the run-against-
   prod caveat (auth-shaped evals need `ENVIRONMENT` in
   `{development, dev, local}` to drive the dev autoverify path).
4. **`docs/TRUST.md`** §3 and §10 — §3 dropped the "single hardcoded
   solicitor user" bullet and replaced with a self-host master-key
   warning. §10 rewritten end-to-end to cover what's wired.
5. **`README.md`** §"What v0.1 does not yet do" — auth bullet removed.
6. **`ROADMAP.md`** §v0.1 and §v0.2 — v0.1 now mentions the auth
   surface; v0.2 has WorkOS/Stytch as the enterprise SSO follow-up
   plus a multi-provider Gemini line.
7. **`HANDOVER_LAUNCH.md`** §3c (HN post 1) and §3e (X main) — BYO-key
   paragraph added to Andy's HN reply; X reply chain gains the BYO line.
8. **`PRE_FLIGHT.md`** — Andy's pre-deploy checklist. Reviewer doesn't
   action this, just sanity-reads the env-var list against
   `core/config.py` to confirm nothing is missing or stale.

---

## Yes/no signoffs

### Yes/no 1 — `docs/AUTH.md` matches what's wired

Spot-checks against the actual code:

- §2 signup flow narrative matches `core/auth.py` `UserManager.on_after_register` + `_post_verify`.
- §4 master key env var is `LEGALISE_KEY_ENCRYPTION_SECRET` (matches `core/encryption.py` line 3 + lines 75-95).
- §6 env-var table matches what `assert_auth_secrets_present()` and `assert_master_key_present()` check at boot.
- §7 "out of scope for v0.1" aligns with what we did NOT ship.

If anything in §1–§8 misrepresents the wiring, flag.

### Yes/no 2 — Cross-surface copy is consistent

The auth posture is now described in five places — they need to agree:

1. README §"What v0.1 does not yet do" (auth bullet removed)
2. Landing's trust paragraph (single-hardcoded-user line removed; replaced with retention + audit-by-convention + module-install limits)
3. TRUST.md §3 self-host master-key note
4. TRUST.md §10 auth + slug-tenancy + BYO-key narrative
5. ROADMAP.md v0.1 paragraph

Cross-read all five; the claim is: auth ships in v0.1 with BYO-key + per-user encryption + signup auto-seed; enterprise SSO is v0.2 via WorkOS/Stytch. Anything that contradicts that, push back.

### Yes/no 3 — `smoke_signup_auto_seed.py` covers the right invariants

Read the six assertions:

1. Both users register + cookie-login (status 201 register; 200/204 login)
2. Both see Khan at the shared slug (200, slug + matter_type + case_theory + pivot_fact non-empty)
3. Both have the two seeded documents, one tagged `from_disclosure=True`
4. Both have seven chronology events + the CPR 31.22 gate is pending (required=True, confirmed=False, tainted_event_count ≥ 1)
5. Cross-user write isolation: A flips posture, B's posture unchanged AND `body_b["id"] != body_a["id"]`
6. Anon can't read either user's Khan (401)

Is there an invariant I'm missing that would falsify "Day D signup auto-copy works end-to-end"? Likely additions if you want them: matter-FS materialisation on disk for both users (testable via a separate file-system check, currently out of scope for these HTTP smokes), CPR gate confirmation flow as a positive case.

---

## Judgment calls — push back on any

1. **TRUST.md §3 self-host bullet leads with the master-key warning.** Alternative framing: "auth is fastapi-users; the operator owns the master key" with the lose-it consequence as a sub-clause. Current phrasing prioritises the risk over the capability — push back if reviewer prefers capability-first.

2. **AUTH.md §4 explicitly tells operators what happens if they lose the master key.** This is operationally honest (user data unaffected; users re-paste keys) but might encourage casualness. Alternative: tighter wording stressing the irrecoverable side and pointing at 1Password / secrets-manager hygiene. Open to reframing.

3. **`smoke_signup_auto_seed.py` mutates state (creates two users).** Acceptable in dev / local environments. Marked as such in `evals/README.md`. Reviewer may want a teardown step; v0.1 dev DBs are throwaway so I skipped it. If you want a teardown, the eval can DELETE the two users after the asserts, but that's more code for marginal benefit.

4. **PRE_FLIGHT.md §1 Ollama is marked "optional".** Honest reading of what the demo needs vs what the docs promise. Push back if reviewer thinks the self-host story is too soft without Andy actually validating Ollama end-to-end before launch.

5. **HANDOVER_LAUNCH.md HN post-1 reply gained one BYO-key paragraph + adjusted v0.1-doesn't-do list (removed "users + settings", added nothing — list now reads cleaner). Reply length grew by ~50 words.** Could be tighter; could also be left as one of the strongest selling points. Reviewer to call.

6. **ROADMAP.md v0.2 mentions Gemini provider explicitly.** Per HANDOVER_AUTH.md §308. If you'd rather defer the provider name commitment and just say "multi-provider", easy edit.

7. **`docs/AUTH.md` §3 says cross-user reads return 404 not 403.** Backed by `smoke_cross_user.py` (signed off). But the AUTH.md page now publishes that as a deliberate design choice. If you'd rather keep that internal-only (lest someone read it as defensive obscurity), trim §3 to "scoped per user, cross-user data is segregated" and let the eval be the implementation detail.

---

## Smoke-test fragility — flagged

- **Live demo cross-user eval**: running `smoke_signup_auto_seed.py` against `https://api.legalise.dev/api` would mint two real users on the production DB. `evals/README.md` now flags this. If the reviewer wants a single-user variant that only checks "Khan is present after I register", easy to add — but the two-user version is the cross-user write-isolation check that makes Day D actually load-bearing.

- **Email-template render still untested in real clients.** Same caveat as Day D handover. Path forward: send one test from `_send` against a live Resend account once `RESEND_API_KEY` is set; visually inspect Gmail + Apple Mail; fix any inline-style breaks. This is a Day 15 pre-launch check, not a Day E blocker.

- **`PRE_FLIGHT.md` §2c R2 jurisdiction**: Cloudflare's R2 dashboard offers "EU (eu)" as a jurisdiction setting — verify the dropdown wording on the day. If they've renamed it to "European Union", PRE_FLIGHT needs a minor edit.

---

## What's NOT in this commit

- **Production deploy** — that's Day 15. PRE_FLIGHT.md is the runway to it; `infra/deploy/cloudflare.md` is the actual runbook. Not changed in this commit.
- **MFA / SSO** — explicitly v0.2 (per HANDOVER_AUTH.md §41 + AUTH.md §7).
- **Master-key rotation tooling** — v0.2 (AUTH.md §4 "Rotation" paragraph).
- **Per-prompt encryption at rest** — v0.2 trust workstream.
- **Status page / vulnerability disclosure programme** — v0.2 (TRUST.md §11 + ROADMAP.md v0.2 trust workstream).

---

## What I'd do next after signoff

1. **Andy works through PRE_FLIGHT.md** — accounts, DNS, secrets,
   Ollama (optional). Probably one sitting. Logs each green box.
2. **Day 15 deploy** per `infra/deploy/cloudflare.md`. Half day.
3. **Day 16-17 polish window**: visual smoke pass, any pre-launch
   fixes the deploy surfaces, T-24h pre-warm template per
   `HANDOVER_LAUNCH.md`.
4. **Day 18 paired HN launch.**

Approval pattern same as prior rounds: three yes/nos above, push back
on the seven judgment calls, propose any P1/P2 fixes inline.
