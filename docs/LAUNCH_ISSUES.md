# Launch Issue Set

Compact issue set for launch. Keep this to 6-8 issues. More than that becomes project theatre.

---

## 1. Production smoke walk

Run `PRE_FLIGHT.md` end to end against the deployed hosted environment.

Acceptance:

- signup works.
- BYO key works.
- upload works.
- assistant/workflow path works.
- export/delete works.
- audit rows appear.
- no raw secret/content leaks in logs.

---

## 2. Deploy backend to Fly

Deploy backend and worker with production secrets.

Acceptance:

- release migrations run.
- API `/health` is green.
- worker processes an export job.
- no server-paid model keys are configured.

---

## 3. Deploy frontend to Cloudflare Pages

Promote current frontend bundle to `legalise.dev`.

Acceptance:

- `VITE_API_BASE_URL` points at production API.
- auth flow works.
- CORS works.
- no stale preview bundle is promoted.

---

## 4. Configure production infrastructure

Create/configure Neon, R2, Resend, Turnstile, Redis, DNS and secrets.

Acceptance:

- `docs/DEPLOYMENT_SECRETS.md` is fully checked off.
- R2 put/get/delete works.
- email verification sends.
- hosted limits are configured.

---

## 5. Review public claim boundary

Run README, landing page, trust docs, launch post, and social replies against `docs/CLAIM_BOUNDARY.md`.

Acceptance:

- no live-client readiness claim.
- no regulator-grade claim.
- no full WORM claim before role split.
- hosted site described as limited evaluation environment.
- BYO-key posture clear.

---

## 6. Launch copy and distribution

Prepare HN, X, LinkedIn, GitHub README/social card, and first-reply copy.

Acceptance:

- public copy links to repo and hosted evaluation environment.
- "what this is not" boundary is included or one click away.
- Mike/Stella/peers credited without comparison-table sniping.

---

## 7. v0.5 live-matter readiness gates

Track the serious gates that remain after v0.4 evaluation launch.

Acceptance:

- WORM role split.
- full export scope.
- deletion retry/sweeper if needed.
- durable job migration fully replaces inline long-running paths.
- deploy runbook proven.
- security disclosure path.

---

## 8. v0.6 evals and prompt shroud

Track hallucination-control and data-minimisation work.

Acceptance:

- prompt shroud design.
- legal-quality eval set.
- citation integrity eval.
- refusal behaviour eval.
- module regression eval.
- cloud-provider anonymisation posture documented honestly.

