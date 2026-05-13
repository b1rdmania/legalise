# Trust & Security

> Status: **v0.1 source of truth.** This document describes the system as it is
> built today, plus the items we have committed to land in v0.2. It is the file
> that backs `legalise.dev/trust` when that route exists.

Legalise is an open-source workspace for England & Wales solicitor work. Every
architectural decision documented here exists in service of three regulatory
constraints: legal professional privilege (LPP), the SRA Code of Conduct, and
UK GDPR. Where v0.1 cannot yet enforce a constraint, we say so plainly; we do
not paper over a gap with aspirational language.

This document is not legal advice. The firm using Legalise remains the
controller and accountable party.

---

## 1. What Legalise is

A matter-first AI workspace with a model gateway, a privilege-posture access
control, an audit log, and a plugin bridge to the `claude-for-uk-legal` skill
suite. Solicitors author and review; the system drafts and records.

## 2. What Legalise is not

- Not legal advice. Every artefact is a draft for solicitor review.
- Not a regulated reserved-activities provider. Solicitors using Legalise
  remain personally accountable to the SRA.
- Not a substitute for client KYC, conflict-checks, or money-laundering
  obligations under MLR 2017. Those remain the firm's responsibility.
- Not a court-filing platform. ET1 / N1 PDF rendering is on the v0.3 roadmap
  but does not file.
- **Not currently enforcing matter-level retention.** `retention_until` is a
  recorded field, not an active sweep. Retention enforcement lands v0.2.

---

## 3. Data flow

```
solicitor ──▶ Legalise frontend (browser)
                │
                ▼ HTTPS
              Legalise backend (Fly.io, region: lhr — London)
                │
                ├─▶ Postgres (Neon, region: London/lhr)              ── matter rows, audit rows, users
                ├─▶ Cloudflare R2 (jurisdiction: EU)                  ── document blobs (v0.2: binary uploads)
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

## 4. Sub-processors

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

## 5. Legal professional privilege (LPP)

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

## 6. CPR 31.22 implied undertaking

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

## 7. Audit trail

Every mutation on `/api/matters/*` produces at least two audit rows:

- A **semantic event** written by the router (`matter.create`,
  `document.upload`, `privilege.set`, `chronology.gate.confirmed`,
  `plugin.invoked`, `model.call`).
- An **HTTP forensic row** written by the audit middleware
  (`http.{method}` + path + status code).

Plugin invocations produce three rows (semantic + model-call + HTTP). Model
calls record `model_used`, `prompt_hash`, `response_hash`, `token_count`,
and `latency_ms` — the prompt and response themselves are **not** stored in
the audit row, only their SHA-256 hashes. Full content lives in the matter
materialisation and the standard matter resources.

The `audit_entries` table is append-only by convention in v0.1. WORM
enforcement (Postgres-level revocation of UPDATE/DELETE) lands v0.2.

---

## 8. Authentication

**v0.1 ships a single hardcoded solicitor user** for the demo deployment.
This is not production-ready and is documented as such throughout the
codebase. Real authentication via WorkOS or Stytch (SSO with Microsoft 365,
SAML, audit) is the v0.2 milestone.

Until then: do not run v0.1 in front of real client data on a public URL.
Run it locally, in your firm's network, or behind a VPN you trust.

---

## 9. Encryption

- **In transit:** TLS 1.2+ for all external connections. Fly.io and Neon
  terminate TLS; their internal hop is also encrypted.
- **At rest:** Postgres-at-rest encryption (Neon default, AES-256). R2
  objects encrypted at rest by Cloudflare. Matter materialisation on the
  Fly volume relies on Fly's underlying storage encryption.
- **Application-layer encryption** of stored prompts/responses is not yet
  implemented. Tracked for v0.2.

---

## 10. Compliance posture

We do not claim certifications we do not hold. As of v0.1:

| Framework | Status | Notes |
|---|---|---|
| **UK GDPR** | Compliant by design, DPIA owed | Per-matter scoping, processor agreements with all sub-processors, audit log of personal data processing. Public DPIA summary is a v0.2 deliverable |
| **SRA Code of Conduct** | Designed to support — does not certify | Audit trail supports solicitor accountability. Confidentiality (rule 6.3) supported via privilege posture. The user firm remains the regulated entity |
| **Cyber Essentials Plus** | Not yet certified — v0.2 target | Realistic UK floor for firm procurement |
| **ISO 27001** | Not certified — v0.3 target | The realistic ceiling for most UK firm procurement. Will pursue if/when revenue justifies the audit cost |
| **SOC 2 Type II** | Not certified — v0.4+ | US framework. Pursued only on US-firm GTM or US-firm-owned UK customer demand |
| **HIPAA** | Out of scope | Legalise is not designed for US healthcare workflows |

The order — Cyber Essentials Plus → ISO 27001 → SOC 2 — reflects UK-first
GTM. A US-first competitor would invert it.

---

## 11. Reporting a vulnerability

Until we have a dedicated security@legalise.dev:

- Email: `security@legalise.dev` (forwarded to maintainers)
- Encrypted disclosure: GitHub Security Advisories on `github.com/b1rdmania/legalise`
- Please give us **90 days** before public disclosure, longer for issues
  affecting deployed users

We do not have a paid bug bounty. We will name researchers in the changelog
unless they prefer anonymity.

---

## 12. Open questions / not yet resolved

We track our own outstanding items here rather than letting them go
unspoken:

- **Anthropic API call locality.** Anthropic's commercial API is US-served.
  We pass UK content into a US service contractually committed to no
  training, but the actual processing is on US infrastructure. Firms with
  data-residency policies that forbid US processing must run Ollama under
  `B_mixed` or `C_paused` on those matters.
- **R2 jurisdiction.** EU/Western Europe placement, not UK-specific. We
  state this explicitly rather than implying UK residency.
- **Retention enforcement.** Field exists, sweep does not. v0.2.
- **WORM on audit log.** Convention-only in v0.1. Postgres grants
  revoke UPDATE/DELETE in v0.2.
- **Insurance.** Solicitor PII policies increasingly carry AI-use exclusions.
  Firms must check their own cover. Legalise does not provide indemnity.

---

## 13. Change log

| Date | Change |
|---|---|
| 2026-05-13 | First draft (v0.1 source of truth) |

This file changes when the architecture changes. `git log docs/TRUST.md`
is the canonical history.
