# Trust & Security

> Status: **evaluation release source of truth.** This document describes the
> system as it is built today, plus the items we have committed to land before
> any live-client or firm-pilot posture. It is the file that backs
> `legalise.dev/trust` when that route exists.

Legalise is an open-source workspace for England & Wales solicitor work. Every
architectural decision documented here exists in service of three regulatory
constraints: legal professional privilege (LPP), the SRA Code of Conduct, and
UK GDPR. Where the evaluation release cannot yet enforce a constraint, we say
so plainly; we do not paper over a gap with aspirational language.

This document is not legal advice. The firm using Legalise remains the
controller and accountable party.

---

## 1. What Legalise is

A matter-first AI workspace with a model gateway, a privilege-posture access
control, an audit log, and a governed skill-import path (the Lawve
catalogue or any public GitHub repo with a `SKILL.md`). Solicitors author
and review; the system drafts and records.

The trust model is built around supervised autonomy, not unsupervised
automation. Legalise should make it clear what the AI saw, what it did, which
permission allowed it, which human remained accountable, and what record would
be available to a firm, insurer, client, or regulator afterwards. The audit log
is the receipt for that supervision model; it is not a claim that v0.1 is a
regulated practice system. Firms that need a four-eyes rule can deploy with
`SIGNOFF_AUTHOR_MUST_DIFFER` set, which blocks an author from signing their
own output (rejecting it stays allowed) — off by default so a sole
practitioner can still sign their own work as themselves.

## 2. What Legalise is not

- Not legal advice. Every artefact is a draft for solicitor review.
- Not a regulated reserved-activities provider. Solicitors using Legalise
  remain personally accountable to the SRA.
- Not a substitute for client KYC, conflict-checks, or money-laundering
  obligations under MLR 2017. Those remain the firm's responsibility.
- Not a court-filing platform. ET1 PDF rendering is on the v0.3 roadmap
  but does not file.
- **Not certified** against any framework today. No SOC 2, no ISO 27001, no
  Cyber Essentials. See Section 4 for the planned sequencing.

### Hosted demo and BYO model keys

Legalise is open source. The hosted site is a limited evaluation environment,
not a regulated legal service. Users must provide their own model provider
credentials to run real AI workflows. Legalise does not bundle, resell, or
intermediate model access. The hosted site should not be used for live client
matters.

## 3. What the evaluation release does not yet do (read this first)

We list gaps at the top, not the bottom. Anyone considering a procurement
conversation about the hosted evaluation environment should see them before
reading the architecture.

- **Self-hosted production use needs your own master encryption key.** The current release ships authentication (fastapi-users cookie sessions, email verification, AES-256-GCM per-user API key storage), but the self-host operator owns the master key. Lose it and stored provider keys become unrecoverable; share it and an operator can decrypt user keys offline.
- **Retention is recorded, not enforced.** Every matter has a
  `retention_until` field; nothing actively sweeps and deletes when that
  date passes.
- **Audit WORM is trigger-enforced, not yet role-enforced.** A Postgres
  trigger rejects UPDATE and DELETE on `audit_entries`, and every row is
  hash-chained so any out-of-band rewrite is detectable. The remaining
  work is operational: split the migration and application database
  roles so the REVOKE on the app role takes effect.
- **Application-layer encryption of stored prompts/responses is not yet
  implemented.** We rely on Neon/Fly/R2 at-rest encryption defaults.
- **One deployment is one workspace.** There is no organisation or
  multi-tenant model in the beta. Teams that need separation run one
  deployment each. This is deliberate scope, recorded in the README
  Status section and `OPERATIONS.md`.
- **UK residency is partial.** Backend (Fly `lhr`) and Postgres (Neon
  London) are in the UK. Cloudflare R2 placement is EU (Western Europe),
  not UK-specific. Anthropic and OpenAI commercial APIs are US-served
  under contractual no-training terms.
- **Anthropic / OpenAI UK addenda are not yet signed by us.** The standard
  commercial terms apply, which include the no-training-on-customer-data
  posture, but the UK IDTA paperwork is an open action.
- **DPIA is owed, not published.** A v0.2 deliverable.
- **No published vulnerability disclosure programme yet.** See Section 11
  for the interim channel.
- **Solicitor PII insurance increasingly carries AI-use exclusions.** This
  is the firm's policy, not ours, but it can block a pilot — firms must
  check their cover. Legalise does not provide indemnity.

If any of the above is a blocker for a given firm's procurement, the answer
today is "we are not the right tool for you yet."

---

## 4. Data flow

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

**No customer data flows anywhere not on the diagram above.** No analytics
provider, no error-tracking SaaS that ingests prompts, no third-party feature
flag service that sees matter content. Sentry / OpenTelemetry land v0.2 and
will be scoped to operational telemetry only (no prompts, no responses).

---

## 5. Sub-processors

| Sub-processor | Purpose | Region | UK transfer mechanism |
|---|---|---|---|
| Anthropic, PBC | LLM provider (frontier models) | US | UK IDTA addendum + Anthropic Commercial Terms (no training on customer data) |
| OpenAI, LLC | LLM provider (frontier models, optional) | US | UK IDTA addendum + OpenAI Business Terms (no training on customer data) |
| Ollama (self-hosted) | Local LLM provider | In-tenant — not a sub-processor when run locally | n/a |
| Fly.io, Inc. | Application hosting | lhr region (London) | UK IDTA addendum |
| Neon, Inc. | Managed Postgres | London (lhr) region | UK IDTA addendum |
| Cloudflare, Inc. | Object storage (R2), CDN, DNS | R2 jurisdiction: `eu` (Western Europe placement). CDN: edge | UK IDTA addendum + UK addendum to DPA |
| GitHub, Inc. (Microsoft) | Source code, CI/CD | US | UK IDTA addendum |

**Honest framing:** Anthropic, OpenAI and Cloudflare are US-headquartered.
Anthropic and OpenAI both contractually commit to no training on customer
data via the commercial APIs we use. R2 placement is EU (Western Europe),
not UK-specific. Backend and database are UK-region. We do not claim "UK
data residency end-to-end" because it is not literally true.

This list is maintained here. Any change to it is a change to this file,
visible in `git log`.

---

## 6. Legal professional privilege (LPP)

LPP exists in two forms relevant to Legalise:

- **Legal advice privilege** — communications between solicitor and client for
  the purpose of giving or receiving legal advice.
- **Litigation privilege** — communications with third parties where the
  dominant purpose is actual or contemplated litigation.

Privilege can be **waived by disclosure to a third party**. A cloud LLM
provider that can read or train on the content is a third party for this
purpose. Anthropic and OpenAI commercial APIs contract to neither read nor
train; that contractual posture is what makes the routing to these providers
defensible. **A local Ollama instance is not a third party at all.**

### The privilege-posture access control

Every matter carries one of three postures:

| Posture | Behaviour |
|---|---|
| `A_cleared` | All providers permitted. Used when privilege has been waived (e.g. material is in a public-record disclosure list) or the matter never carried privilege |
| `B_mixed` | **Default.** Local Ollama provider preferred when reachable. Frontier providers (Anthropic / OpenAI) permitted with their no-training contractual posture. The audit log records which provider served each call |
| `C_paused` | No LLM call permitted. The gateway raises `PrivilegePaused` before any network traffic. Used when material is highly sensitive or the firm is mid-conflict-check |

The posture is read from the database **at call time, in the same session as
the request**, not from a value the caller passes. This closes the race
where a caller reads `B_mixed`, an administrator flips to `C_paused`, and
the stale value is used for dispatch.

The change-of-posture event is itself audited.

---

## 7. CPR 31.22 implied undertaking

Documents obtained under disclosure (CPR Part 31) may only be used for the
proceedings in which they were disclosed. Using them for any other purpose
is contempt, subject to the carve-outs in CPR 31.22(1)(a)-(c) and 31.22(2).

Legalise treats every document tagged `from_disclosure=True` (with its
`disclosure_proceedings_ref`) as carrying the implied undertaking. Any
chronology event whose source document is so tagged is treated as
31.22-tainted.

### Server-side access gate

When a matter has ≥1 tainted chronology event and the requesting user has
no `chronology.gate.confirmed` audit row for that matter, the chronology
endpoint **withholds the event description, source filenames, and
proceedings references** in its response. The user sees that gated material
exists; they do not see what it says.

Confirmation is a `POST` to `/api/matters/{slug}/chronology/gate` with the
acknowledgement text. The audit log records the action, the user, the
matter, and the acknowledgement. The next `GET` returns full detail.

This is a forcing function so the solicitor consciously acknowledges
CPR 31.22 before composing anything that draws on disclosed material.
**It is not a substitute for the rule itself, which applies regardless of
acknowledgement.**

---

## 8. Audit trail

The audit shape depends on whether the request reached its semantic
work or was refused at the door:

- **Successful semantic mutations** produce a **semantic row** written
  by the router (`matter.create`, `document.upload`, `privilege.set`,
  `chronology.gate.confirmed`) plus an **HTTP forensic row** written
  by the audit middleware (`http.{method}` + path + status code).
- **Model-backed successful module runs** add `model.call` rows from
  the gateway, one per provider call (the example Pre-Motion skill
  makes one call per run). Each `model.call` carries
  `model_used`, `prompt_hash`, `response_hash`, `token_count`, and
  `latency_ms`. The prompt and response themselves are **not** stored
  in the audit row, only their SHA-256 hashes.
- **Requests blocked before semantic work commits** — for example a
  C_paused skill run or a validation rejection at the router
  boundary — produce **only the
  HTTP forensic row**, carrying the failure status (typically 409 or
  400). Blocked attempts are still traceable via the path and
  status, but they do not write a "started/blocked" semantic row.
  The trade-off is transactional integrity: semantic rows commit
  only when the semantic operation commits.

The `audit_entries` table is append-only by enforcement: a Postgres
trigger rejects UPDATE and DELETE on every row. The remaining hardening
is operational, not code: split the migration and application database
roles so the app role also loses UPDATE/DELETE by grant.

**Third-party verification.** Every audit row is hash-chained: an
append-only `audit_chain` table links each entry to the previous one
per matter, so the chain's head hash is the matter record's
fingerprint — it commits to every entry beneath it. Exporting that
head hash (or publishing it anywhere — an email, a filing, a public
log) lets anyone later prove the record was not rewritten: if the
trail changes, the head no longer recomputes. The verify endpoint
(`GET /api/matters/{slug}/audit/chain`) recomputes every link from the
raw audit rows and reports the head plus any breaks.

---

## 9. Skill provenance and approval

`SKILL.md` is the review unit. Every installed skill has plain-text
frontmatter (`name`, `description`, optional `argument-hint`) and a prompt
body. Legalise exposes both through the installed-skills discovery page so a
firm's internal tech team can review what will run before solicitors use it.

Git is the approval trail. Skills import from a source repository (the
Lawve catalogue or any public GitHub repo) at a **pinned commit SHA**
recorded in the installed manifest's `source_url`. Reviewing a skill means
reviewing its `SKILL.md` at that SHA; updating it is a fresh import through
the trust ceremony, so a prompt change can never reach the runtime
silently.

Runtime provenance is separate and audited. Every skill invocation records
`module.capability.invoked` plus the gateway's `model.call`, so "which
skills ran against which matters?" is answerable from the audit log.

Manifest signatures come in two honest grades. `verified` means the
manifest carries an ed25519 signature that cryptographically checks out
against the publisher's registered public key — only the holder of that
publisher's private key could have produced it. `structure_verified` means
shape-only: the signature is present and plausible, the publisher is in
the registry, and `signed_by` matches — but no cryptography was performed
and a well-formed forgery would pass. The status string says exactly which
check ran; publishers without a registered key can never reach `verified`.

What the current release does **not** yet cover: prompt-injection scanning, automated
`SKILL.md` linting, organisation-level skill allowlists,
or per-workspace enable/disable policy. Those are v0.2 concerns.

---

## 10. Authentication

The current release ships **fastapi-users** with cookie sessions (HttpOnly, Secure,
SameSite=Lax), email verification via Resend, and password reset via
one-time token. Sessions are backed by a server-side `access_token`
table — revocation is real, not just client-side.

**Bring-your-own provider keys.** Each user adds their Anthropic or
OpenAI key under Settings → API keys. The privilege-aware model gateway
reads the user's key for every call on their matters. Server-side keys
are stored AES-256-GCM-encrypted under a master key supplied to the
backend via env var (`LEGALISE_KEY_ENCRYPTION_SECRET`, 32-byte hex);
a key is decrypted only at call time and never logged.

**Slug tenancy.** Matter slugs are unique per user, not globally.
Two users can each hold a matter at `khan-v-acme-trading-2026` without
collision. Cross-user reads return 404 (not 403) so user A cannot
learn that user B holds a matter at a particular slug.

**Signup auto-seed.** On email verification (or in dev, on register
via the autoverify path), the new user's workspace is seeded with the
Khan v Acme demo matter — same idempotent path as the dev-boot seed.

WorkOS / Stytch SSO with Microsoft 365 / SAML / org-level audit is
the enterprise-adoption milestone. The current release covers the
sole-practitioner and small-firm case via direct signup.

---

## 11. Encryption

- **In transit:** TLS 1.2+ for all external connections. Fly.io and Neon
  terminate TLS; their internal hop is also encrypted.
- **At rest:** Postgres-at-rest encryption (Neon default, AES-256). R2
  objects encrypted at rest by Cloudflare. Matter materialisation on the
  Fly volume relies on Fly's underlying storage encryption.
- **Application layer:** per-user provider API keys are stored
  AES-256-GCM-encrypted (Section 10). Stored prompts/responses are
  not yet application-layer encrypted — tracked for v0.2.

---

## 12. Compliance posture

We do not claim certifications we do not hold. As of the evaluation release:

**No certification has been awarded against any framework as of the evaluation release.**
The table below is planned sequencing, not achieved assurance.

| Framework | Where we are | Planned next |
|---|---|---|
| **UK GDPR / DPA 2018** | Designed against the principles (per-matter scoping, processor agreements with sub-processors, audit log of personal-data processing). The DPIA is owed, not published. Records of processing (Art. 30) and a public DPIA summary are v0.2 deliverables. The firm using Legalise is the controller and remains accountable | Author DPIA; publish ROPA |
| **SRA Code of Conduct** | Designed to support solicitor accountability (audit trail, confidentiality via privilege posture). Legalise is not the regulated entity — the firm is | No further action — this is a perpetual support obligation, not a target |
| **Cyber Essentials Plus** | Not certified. Planned after the live-matter readiness foundations | Engage assessor; remediation work; certificate |
| **ISO 27001** | Not certified. Planned start v0.3 if revenue justifies the audit cost | Open ISMS scope; controls implementation |
| **SOC 2 Type II** | Not certified. Considered only on US-firm GTM or US-firm-owned UK customer demand. Not on the v0.2/v0.3 timeline | n/a until trigger |
| **HIPAA** | Out of scope. Legalise is not designed for US healthcare workflows | n/a |

The Cyber Essentials Plus → ISO 27001 → SOC 2 order reflects UK-first GTM
(firm floor → firm ceiling → US-firm gate). A US-first competitor would
invert it. None of these have been started.

---

## 13. Reporting a vulnerability

Security reports should follow the root [`SECURITY.md`](../SECURITY.md). In
summary:

- Email: `security@legalise.dev` (forwarded to maintainers)
- Encrypted disclosure: GitHub Security Advisories on `github.com/b1rdmania/legalise`
- Please give us **90 days** before public disclosure, longer for issues
  affecting deployed users

We do not have a paid bug bounty. We will name researchers in the changelog
unless they prefer anonymity.

---

## 14. Change log

| Date | Change |
|---|---|
| 2026-05-13 | First draft (v0.1 source of truth) |
| 2026-05-13 | Sweep: "Compliant by design" → "Designed against principles"; gaps promoted to §3 (read this first); compliance table reframed as planned sequencing, not achieved assurance; insurance note added |
| 2026-05-14 | Added §9 skill provenance and approval: Git review as approval trail, `PLUGINS_REPO_REF` pinning, and `plugin.invoked` audit provenance |
| 2026-06-11 | Filesystem plugin path removed; §1/§9 reframed around the import path (Lawve + GitHub) — pinned-SHA provenance, trust ceremony as the only install route |
| 2026-06-12 | Currency pass: audit WORM recorded as trigger-enforced with hash chain (role split remains); object storage and durable jobs removed from §3 gaps (shipped); single-workspace scope added to §3; Pre-Motion audit-row count corrected; R2 v0.2 marker dropped |

This file changes when the architecture changes. `git log docs/TRUST.md`
is the canonical history.
