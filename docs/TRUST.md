# Trust & Security

> Status: **evaluation release source of truth.** Describes the system as built
> today and lists controls not yet implemented.

Legalise is an open-source workspace for England & Wales solicitor work. Its
design considers legal professional privilege (LPP), the SRA Code of Conduct,
and UK GDPR. Controls that are not implemented are listed below.

This is not legal advice. The firm using Legalise is the controller and the
accountable party.

---

## 1. What Legalise is

A matter-first AI workspace with a model gateway, a privilege-posture access
control, an audit log, and a governed skill-import path (the Lawve catalogue or
any public GitHub repo with a `SKILL.md`). Solicitors author and review; the
system drafts and records.

Legalise records
what the AI saw, what it did, which permission allowed it, and which human stayed
accountable. The assistant is scoped to one matter and cannot see others, and
works under a token budget that can truncate. Retrieval is in-tenant and keyless
by default (`fastembed`), so indexing privileged documents does not send text to
a model provider. This does not make Legalise a regulated practice system.

Firms needing a four-eyes rule can set `SIGNOFF_AUTHOR_MUST_DIFFER`, blocking an
author from signing their own output (rejecting stays allowed). Off by default,
so a sole practitioner can sign their own work.

## 2. What Legalise is not

- Not legal advice. Every artefact is a draft for solicitor review.
- Not a regulated reserved-activities provider. Solicitors remain personally
  accountable to the SRA.
- Not a substitute for client KYC, conflict-checks, or money-laundering
  obligations under MLR 2017. Those remain the firm's.
- Not a court-filing platform. ET1 PDF rendering is on the v0.3 roadmap but does
  not file.
- **Not certified** against any framework today. No SOC 2, no ISO 27001, no
  Cyber Essentials. See Section 12.

### Public site and BYO model keys

`legalise.dev` is a static demo and documentation site. Its hosted backend is
currently off, so it has no accounts, model calls, or matter storage. A
self-hosted deployment requires users to supply their own model provider
credentials. Legalise does not bundle or resell model access. Do not use this
evaluation release for live client matters.

## 3. What the evaluation release does not yet do (read this first)

Review these gaps before evaluating or self-hosting the application.

- **Self-hosted production needs your own master encryption key.** The release
  ships authentication (fastapi-users cookie sessions, email verification,
  AES-256-GCM per-user API key storage), but the self-host operator owns the
  master key. Lose it and stored provider keys are unrecoverable; share it and an
  operator can decrypt user keys offline.
- **Retention is recorded, not enforced.** Every matter has a `retention_until`
  field; nothing sweeps and deletes when that date passes.
- **Application-layer encryption of stored prompts/responses is not yet
  implemented.** Self-hosters rely on the at-rest controls of their chosen
  database and object store.
- **One deployment is one workspace.** No organisation or multi-tenant model in
  the beta. Teams needing separation run one deployment each. Deliberate scope,
  recorded in the README.
- **Data residency depends on deployment.** Self-hosters choose the database,
  object store, and model provider. Cloud model providers may process data
  outside the UK.
- **Anthropic / OpenAI UK addenda are not yet signed by us.** Standard commercial
  terms apply (including no-training); the UK IDTA paperwork is an open action.
- **DPIA is owed, not published.** A v0.2 deliverable.
- **No published vulnerability disclosure programme yet.** See Section 13 for the
  interim channel.
- **Solicitor PII insurance increasingly carries AI-use exclusions.** The firm's
  policy, not ours, but it can block a pilot — firms must check their cover.
  Legalise does not provide indemnity.

These gaps rule out procurement or live-client use without further controls.

---

## 4. Reference data flow

The hosted backend is off. This diagram shows the previous reference deployment
and remains useful when assessing a similar self-hosted topology:

```
solicitor ──▶ Legalise frontend (browser)
                │
                ▼ HTTPS
              Legalise backend (Fly.io, region: lhr — London)
                │
                ├─▶ Postgres (Neon, region: London/lhr)              ── matter rows, audit rows, users
                ├─▶ Cloudflare R2 (jurisdiction: EU)                  ── document blobs
                ├─▶ Model gateway
                │     ├─ A_cleared / B_mixed posture
                │     │     ├─▶ Anthropic API (US, UK addendum)        ── if Anthropic model requested
                │     │     ├─▶ OpenAI API   (US, UK addendum)        ── if OpenAI model requested
                │     │     └─▶ Local Ollama (in-tenant, never leaves) ── B_mixed default when reachable
                │     └─ C_paused                                      ── no LLM call possible
                └─▶ matter filesystem materialisation (Fly volume, lhr) ── matter.md, history.md, chronology.md
```

The application code does not configure analytics, prompt-bearing error
tracking, or a third-party feature-flag service. Self-hosters are responsible
for any services they add.

---

## 5. Reference sub-processors

There are no application sub-processors for the static public site. The table
below records the previous hosted topology and common optional providers.

| Sub-processor | Purpose | Region | UK transfer mechanism |
|---|---|---|---|
| Anthropic, PBC | LLM provider (frontier models) | US | UK IDTA addendum + Anthropic Commercial Terms (no training on customer data) |
| OpenAI, LLC | LLM provider (frontier models, optional) | US | UK IDTA addendum + OpenAI Business Terms (no training on customer data) |
| Ollama (self-hosted) | Local LLM provider | In-tenant — not a sub-processor when run locally | n/a |
| Fly.io, Inc. | Application hosting | lhr region (London) | UK IDTA addendum |
| Neon, Inc. | Managed Postgres | London (lhr) region | UK IDTA addendum |
| Cloudflare, Inc. | Object storage (R2), CDN, DNS | R2 jurisdiction: `eu` (Western Europe). CDN: edge | UK IDTA addendum + UK addendum to DPA |
| GitHub, Inc. (Microsoft) | Source code, CI/CD | US | UK IDTA addendum |

Anthropic, OpenAI and Cloudflare are US-headquartered.
Anthropic and OpenAI contractually commit to no training on customer data
through their commercial APIs. R2 placement is EU (Western Europe), not
UK-specific. A self-hosted operator must assess its own deployment and transfer
terms.

---

## 6. Legal professional privilege (LPP)

Two forms are relevant: **legal advice privilege** (solicitor–client
communications for legal advice) and **litigation privilege** (third-party
communications whose dominant purpose is actual or contemplated litigation).

Privilege can be **waived by disclosure to a third party**. A cloud LLM provider
that can read or train on the content is such a third party. Anthropic and OpenAI
commercial APIs contract to neither read nor train, which is what makes routing
to them defensible. **A local Ollama instance is not a third party at all.**

### The privilege-posture access control

Every matter carries one of three postures:

| Posture | Behaviour |
|---|---|
| `A_cleared` | All providers permitted. Used when privilege has been waived (e.g. material is in a public disclosure list) or never carried privilege |
| `B_mixed` | **Default.** Local Ollama preferred when reachable. Frontier providers permitted under their no-training posture. The audit log records which provider served each call |
| `C_paused` | No LLM call permitted. The gateway raises `PrivilegePaused` before any network traffic. Used for highly sensitive material or mid-conflict-check |

The posture is read from the database **at call time** — not from a value the
caller passes — closing the race where a stale `B_mixed` is used after an admin
flips to `C_paused`. The change-of-posture event is audited.

---

## 7. CPR 31.22 implied undertaking

Documents obtained under disclosure (CPR Part 31) may only be used for the
proceedings in which they were disclosed; other use is contempt, subject to the
carve-outs in CPR 31.22(1)(a)-(c) and 31.22(2).

Legalise treats every document tagged `from_disclosure=True` (with its
`disclosure_proceedings_ref`) as carrying the implied undertaking, and any
chronology event sourced from such a document as 31.22-tainted. When a matter has
≥1 tainted event and the user has no `chronology.gate.confirmed` audit row, the
chronology endpoint **withholds the event description, source filenames, and
proceedings references** — the user sees that gated material exists, not what it
says. Confirmation (a `POST` to `/api/matters/{slug}/chronology/gate` with the
acknowledgement text) is logged and unlocks full detail.

This forces conscious acknowledgement of CPR 31.22 before composing on disclosed
material. **It is not a substitute for the rule itself, which applies regardless
of acknowledgement.**

---

## 8. Audit trail

The audit shape depends on whether a request reached its semantic work.
Successful mutations write a **semantic row** (e.g. `matter.create`,
`privilege.set`) plus an **HTTP forensic row**. Model-backed runs add
`model.call` rows carrying `model_used`,
`prompt_hash`, `response_hash`, `token_count`, and `latency_ms` — the prompt and
response themselves are **not** stored, only their SHA-256 hashes. Requests
blocked before semantic work commits (a C_paused run, a validation rejection)
write **only the HTTP forensic row** with the failure status; they stay traceable
by path and status but write no semantic row. The trade-off is transactional
integrity: semantic rows commit only when the operation commits.

`audit_entries` is append-only by enforcement, in two independent layers: a
Postgres trigger that rejects UPDATE and DELETE on every row whatever the role,
and a role split (`infra/postgres-roles.sql`) that removes UPDATE/DELETE from the
application role by grant. The split is exercised in CI (the build fails if
`legalise_app` can mutate an audit row). A self-hosted operator must apply the
role definitions and verify them after deployment. The previous hosted
deployment passed that check on 2026-07-05.

**Third-party verification.** Every row is hash-chained via an append-only
`audit_chain` table, so the head hash commits to every entry beneath it.
Recording that head outside the deployment allows a later check to detect a
rewritten trail: if the trail changes, the head no longer recomputes. This is
tamper-evident, not tamper-proof. The verify endpoint
(`GET /api/matters/{slug}/audit/chain`)
recomputes every link and reports the head plus any breaks.

---

## 9. Skill provenance and approval

`SKILL.md` is the review unit: plain-text frontmatter (`name`, `description`,
optional `argument-hint`) and a prompt body, both exposed through the
installed-skills page so a firm's tech team can review what will run.

Git is the approval trail. Skills import at a **pinned commit SHA** in the
manifest's `source_url`. Reviewing a skill means reviewing its `SKILL.md` at that
SHA; updating it is a fresh import through the trust ceremony, so a prompt change
can never reach the runtime silently. Every invocation is audited
(`module.capability.invoked` plus the gateway's `model.call`), so "which skills
ran against which matters?" is answerable from the log.

Manifest signatures come in two grades. `verified` means an ed25519
signature cryptographically checks out against the publisher's registered public
key. `structure_verified` means shape-only: signature present and plausible,
publisher in the registry, `signed_by` matches — but no cryptography was performed
and a well-formed forgery would pass. As of the evaluation release no publisher
key is registered (`backend/app/core/publishers.py`), so every imported skill
resolves to `structure_verified` today; `verified` is reachable only once a
publisher registers a public key.

The current release does **not** yet cover prompt-injection scanning, automated
`SKILL.md` linting, organisation-level skill allowlists, or per-workspace
enable/disable policy. Those are v0.2 concerns.

---

## 10. Authentication

The release ships **fastapi-users** with cookie sessions (HttpOnly, Secure,
SameSite=Lax), email verification via Resend, and password reset via one-time
token. Sessions are backed by a server-side `access_token` table — revocation is
real, not just client-side.

**Abuse throttling.** The unauthenticated auth surface is per-IP rate limited: 5
registrations and 10 verification-email / password-reset requests per IP per
hour, via a sliding window recomputed from Postgres (no Redis counter, so the
limit holds across instances). Throttled requests return 429; the first rejection
in a window writes an `auth.rate_limited` audit row.

**BYO provider keys.** Each user adds their Anthropic or OpenAI key under
Settings → API keys; the gateway reads it for every call on their matters. Keys
are stored AES-256-GCM-encrypted under a master key from env var
(`LEGALISE_KEY_ENCRYPTION_SECRET`, 32-byte hex), decrypted only at call time and
never logged.

**Slug tenancy.** Matter slugs are unique per user, not globally. Cross-user
reads return 404 (not 403) so user A cannot learn that user B holds a matter at a
given slug.

WorkOS / Stytch SSO with Microsoft 365 / SAML / org-level audit is the
enterprise-adoption milestone, not yet built. The current release covers the
sole-practitioner and small-firm case via direct signup.

---

## 11. Encryption

- **In transit:** production deployments must use TLS for external connections.
- **At rest:** self-hosters rely on the controls of their chosen Postgres,
  object-storage, and filesystem providers.
- **Application layer:** per-user provider API keys are AES-256-GCM-encrypted
  (Section 10). Stored prompts/responses are not yet application-layer encrypted —
  tracked for v0.2.

---

## 12. Compliance posture

We do not claim certifications we do not hold. **No certification has been awarded
against any framework as of the evaluation release.** The table is planned
sequencing, not achieved assurance.

| Framework | Where we are | Planned next |
|---|---|---|
| **UK GDPR / DPA 2018** | Designed against the principles (per-matter scoping, processor agreements, audit log of personal-data processing). The DPIA is owed, not published. ROPA (Art. 30) and a public DPIA summary are v0.2 deliverables. The firm is the controller and remains accountable | Author DPIA; publish ROPA |
| **SRA Code of Conduct** | Designed to support solicitor accountability (audit trail, confidentiality via privilege posture). Legalise is not the regulated entity — the firm is | A perpetual support obligation, not a target |
| **Cyber Essentials Plus** | Not certified. Planned after live-matter readiness foundations | Engage assessor; remediate; certificate |
| **ISO 27001** | Not certified. Not started | Open ISMS scope; implement controls |
| **SOC 2 Type II** | Not certified. Considered only on demand from US-owned firms. Not on the v0.2/v0.3 timeline | n/a until trigger |
| **HIPAA** | Out of scope. Legalise is not for US healthcare workflows | n/a |

None of these have been started. The ordering (Cyber Essentials Plus, then ISO
27001, then SOC 2) follows what UK firms ask for first.

---

## 13. Reporting a vulnerability

Reports should follow the root [`SECURITY.md`](../SECURITY.md):

- Email: `security@legalise.dev` (forwarded to maintainers)
- Encrypted disclosure: GitHub Security Advisories on
  `github.com/b1rdmania/legalise`
- Please give us **90 days** before public disclosure, longer for issues
  affecting deployed users

We have no paid bug bounty. We name researchers in the changelog unless they
prefer anonymity.

---

## 14. Change log

| Date | Change |
|---|---|
| 2026-05-13 | First draft (v0.1); gaps promoted to §3; compliance reframed as planned sequencing |
| 2026-05-14 | §9 skill provenance added (Git review as approval trail, SHA pinning) |
| 2026-06-11 | Filesystem plugin path removed; §1/§9 reframed around the import path |
| 2026-06-12 | Audit WORM trigger-enforced with hash chain; single-workspace scope added; WORM role split now exercised in CI |
| 2026-07-05 | WORM role split confirmed live on the hosted deployment (flipped 2026-06-30, verified read-only against production); removed from §3 gaps |

This file changes when the architecture changes; `git log docs/TRUST.md` is the
canonical history.
