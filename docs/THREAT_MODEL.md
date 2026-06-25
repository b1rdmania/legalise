# Threat Model

This document states what Legalise protects, where its trust boundaries
are, what each class of attacker can and cannot do, and — explicitly —
what it does **not** defend against. Every control named here maps to a
file in this repository. Where a defence is partial or absent, it is
marked **Residual** or **Deferred** rather than dressed up.

The house rule of this product applies to its own security page: a
control is only claimed if the code implements it. "Deferred" and "not
protected against" are honest, first-class entries.

Scope: the open-source Legalise codebase and the single hosted
evaluation deployment (`legalise.dev`). Forks and third-party
deployments inherit the code-level controls but make their own
operational choices; those choices are out of scope.

---

## Assets to protect

| Asset | Where it lives | Why it matters |
| --- | --- | --- |
| Client / privileged documents | Postgres (`document_bodies`), Cloudflare R2 blobs | Legally privileged material; disclosure is the worst-case harm |
| User provider API keys | `user_api_keys` (encrypted at rest) | A leaked key is billable + impersonatable upstream |
| Audit-chain integrity | `audit_entries` + `audit_chain` | The register is the product; a silently-rewritten trail is fatal to its claim |
| Auth / session | session cookie, `users` table | Account takeover = access to all of a user's matters |
| Per-user matter isolation boundary | every matter-scoped route | One user reading another's matter is a privilege breach |

---

## Trust boundaries

1. **Browser ↔ backend.** Untrusted client input crosses into FastAPI.
   Authentication, per-IP throttling, ownership scoping, and capability
   enforcement all sit on this edge.
2. **Backend ↔ model provider (the single egress).** All LLM traffic
   leaves through one chokepoint — `backend/app/core/model_gateway.py`.
   No module calls a provider SDK directly; the gateway is the only
   place matter content crosses the network to a third party.
3. **Backend ↔ storage (Postgres / R2).** Matter rows, audit rows, and
   document blobs at rest. The backend holds the credentials to both.
4. **Self-host operator boundary.** Whoever runs the deployment holds
   the master encryption key and the database credentials. This is the
   outermost boundary and the honest limit of the model (see the
   insider row below — it applies to the hosted eval too).

```
  Browser ──auth/throttle/scoping──▶ Backend ──single egress──▶ Model provider
                                        │
                                        ├──▶ Postgres (matter + audit rows)
                                        └──▶ Cloudflare R2 (document blobs)
                                        ▲
                                operator holds master key + DB creds
```

---

## Actors and attacker capabilities

### 1. Unauthenticated internet attacker

**Mitigated**
- Per-IP sliding-window rate limiting on the unauthenticated auth
  surface (register / verify-token / forgot-password), recomputed from
  Postgres so it holds across instances and restarts —
  `backend/app/core/rate_limit.py`. Blocked attempts count too: the
  throttle is on attempts, not successes.
- Authentication required for every matter-scoped route; session
  security invariants are enforced at boot in production (non-default
  `SESSION_SECRET`, secure cookies, working email for verification) —
  `assert_auth_secrets_present` in `backend/app/core/encryption.py`.
- Fail-closed startup: production refuses to boot without the master
  encryption key — `assert_master_key_present` in
  `backend/app/core/encryption.py`.

**Residual**
- Client-IP resolution trusts proxy headers (`CF-Connecting-IP`,
  `Fly-Client-IP`, `X-Forwarded-For`). A client that can reach the
  origin directly could spoof these. The hosted deployment only exposes
  the origin via the Cloudflare→Fly chain, and the worst case is a
  throttle bypass — never an authz bypass
  (`backend/app/core/rate_limit.py`).

**Deferred**
- No WAF / managed bot-mitigation rules beyond the platform defaults.
- Denial-of-service resilience is not in scope for the eval.

### 2. Authenticated user attacking another user (cross-matter)

**Mitigated**
- Per-user slug scoping on every matter-scoped route. Matters are
  resolved by `(slug, created_by_id)`; a slug owned by another user (or
  archived) resolves to nothing —
  `backend/app/core/matter_access.py` (`resolve_owned_open_matter`).
- Cross-user, archived, and missing all return **404, not 403**, so the
  existence of another user's slug is never leaked
  (`backend/app/core/matter_access.py`).
- Capability grants are scoped to either workspace-broad or a specific
  matter, and the two never satisfy each other — a matter-scoped grant
  cannot be replayed against a different matter
  (`backend/app/core/capabilities.py`, `require_capability`).
- Every access path that mutates state writes an audit row
  unconditionally; audit emission is not gated by any capability
  (`backend/app/core/capabilities.py`).

**Residual**
- Isolation is enforced in application code (the `created_by_id`
  predicate), not by database row-level security. A query that forgets
  the predicate would bypass it; this is mitigated by routing all matter
  access through the shared resolver, not by the DB.

**Deferred**
- Postgres row-level security as a second, independent enforcement
  layer.

### 3. Malicious or compromised skill / module

**Mitigated**
- Skills are never executed code. Imported skills become **governed
  module drafts**, never installed modules, and their scripts are never
  imported or run — `backend/app/core/github_import.py`
  (`build_github_draft`: "the importer never installs … scripts … are
  not imported or executed").
- Import pins the commit SHA for provenance: an unpinned ref is resolved
  to a concrete commit before fetch
  (`backend/app/core/github_import.py`, `_resolve_ref`).
- Admission goes through a trust ceremony state machine. Unverified
  publishers walk the full 7-step inspection path; `grant` is only valid
  from the `GRANTED` state, so an admin cannot skip inspection by
  POSTing `grant` directly — `backend/app/core/trust_ceremony.py`
  (`_next_state`, `advance_ceremony`).
- Signature admission is two-grade and names exactly what it proves:
  `VERIFIED` (real ed25519 verification against a registered publisher
  key) vs `STRUCTURE_VERIFIED` (shape + registry only, no provenance) —
  `backend/app/core/signing.py`, `backend/app/core/publishers.py`.
- Runtime capability enforcement: a model call or tool invocation
  attributed to a `(plugin, skill)` pair requires the matching grant
  (`model.invoke`, and write capabilities such as
  `document.generated.write`); a missing grant raises `CapabilityDenied`
  and writes a denial audit row — `backend/app/core/capabilities.py`,
  `backend/app/core/model_gateway.py` (`invoke_tool`, `call`).
- Posture gate fires before any capability runs: a `C_paused` matter
  blocks all capability execution; `B_mixed` requires the configured
  role when firm-role gates are enabled —
  `backend/app/core/posture_gate.py`.

**Residual**
- A skill admitted with broad capability grants can do whatever those
  grants allow. The ceremony surfaces the permission card and data-
  movement summary so the granting user sees the breadth
  (`backend/app/core/trust_ceremony.py`, `_aggregate_data_movement`),
  but a user who grants `model.invoke` + body-read has authorised the
  skill to send document bodies through the gateway. The control is
  informed consent at admission, not runtime sandboxing of an
  already-granted skill.
- The structural signature tier (`STRUCTURE_VERIFIED`) asserts shape and
  registry membership only — a forged signature with the correct shape
  passes. The status name says so; callers must not treat it as
  provenance (`backend/app/core/signing.py`).

**Deferred**
- Script execution sandboxing (skills carrying scripts are flagged for
  manual review, never run).
- DB-backed publisher registry / sigstore-rooted trust (the registry is
  hardcoded in-memory today — `backend/app/core/publishers.py`).

### 4. Compromised or curious model provider

**Mitigated**
- Bring-your-own provider keys: keyed providers (Anthropic, OpenAI) use
  the calling user's own key, resolved per call
  (`backend/app/core/model_gateway.py`, `_KEYED_PROVIDERS`;
  `backend/app/core/user_keys.py`).
- Keys are encrypted at rest with AES-256-GCM under a master key; the
  plaintext is decrypted only at call time, lives in memory for one
  call, and is never logged or serialised —
  `backend/app/core/encryption.py`, `backend/app/core/user_keys.py`.
- Fail-closed when no key is present and the dev-only server fallback is
  not permitted: the call raises `ProviderKeyMissing` and writes a
  key-missing audit row rather than silently degrading —
  `backend/app/core/model_gateway.py`.
- Local-model path: a matter in `B_mixed` posture routes to a registered
  Ollama provider when one exists, keeping the call on-premises
  (`backend/app/core/model_gateway.py`, `_select_provider`).
- Optional pseudonymisation before a document body is sent to a model:
  the anonymisation pipeline tokenises PII (UK postcodes, NI numbers,
  GBP amounts, plus NER) — `backend/app/modules/anonymisation/`
  (`presidio_engine.py`, `pipeline.py`). This is opt-in and best-effort,
  not a guarantee.
- No-training posture is contractual, documented per sub-processor in
  `docs/TRUST.md` (UK IDTA addenda; Anthropic / OpenAI no-training-on-
  customer-data terms).

**Residual — stated plainly**
- A provider sees the cleartext of any call you permitted. BYO keys,
  encryption at rest, and the no-training terms govern *retention and
  reuse*; they do not hide the content of a call in flight from the
  provider serving it. If a matter cannot tolerate that, use the
  local-Ollama path (`B_mixed`) or pause the matter (`C_paused`).
- Pseudonymisation recall is not perfect and Presidio is an optional
  install; absence of the extra means no pseudonymisation occurs
  (`backend/app/modules/anonymisation/presidio_engine.py` raises a clean
  503 when unavailable).

### 5. Malicious insider / self-host operator

**Mitigated**
- The audit chain is hash-linked and independently re-verifiable: the
  Python verifier recomputes every entry and link hash and cross-checks
  it against the PL/pgSQL-trigger-written chain, so CI catches drift
  between the two recipes — `backend/app/core/audit_chain.py`.
- A read-only verify endpoint exposes the chain head as a matter
  fingerprint; exporting it lets any later check prove the trail was not
  rewritten — `GET /api/matters/{slug}/audit/chain` in
  `backend/app/api/matters.py`.
- `audit_entries` is append-only at the database layer: a Postgres
  trigger (`enforce_audit_worm`) raises on any UPDATE or DELETE —
  `backend/alembic/versions/0011_audit_worm.py`,
  `backend/app/models/audit.py`.

**Residual — the honest limit (applies to the hosted eval too)**
- An operator with both the database and the master encryption key can
  read matter content and decrypt stored provider keys. This is the
  honest boundary of the model: the master key
  (`LEGALISE_KEY_ENCRYPTION_SECRET`) and the DB credentials are held by
  whoever runs the deployment, including the maintainer of the hosted
  eval. Encryption at rest defends against storage-media compromise, not
  against the key-holder (`backend/app/core/encryption.py`,
  `docs/TRUST.md` — "We rely on Neon/Fly/R2 at-rest encryption
  defaults").
- An operator with raw Postgres superuser access could disable the WORM
  trigger. The trigger defends against application bugs and the app
  role; it is not a defence against a DB superuser. The role split that
  would harden this is **not yet flipped on the hosted stack** (see
  Deferred, and the out-of-scope list).

**Deferred**
- Customer-managed / external KMS keys (no operator key custody) —
  `docs/TRUST.md` lists this as not in v1.
- Tamper-evident external anchoring of the audit-chain head (notary /
  transparency log).

### 6. Supply chain

**Mitigated**
- Skill/module imports pin a concrete commit SHA
  (`backend/app/core/github_import.py`).

**Deferred — these do NOT exist; do not read them as claims**
- **SBOM generation** — not produced.
- **Signed container images** (sigstore / cosign) — not produced.
- **SLSA provenance (any level)** — not produced.
- **SOC 2 / ISO 27001 control mappings** — not held.

These are listed to signal the target bar, not to claim attainment.
Fabricating supply-chain provenance on a security page is precisely the
failure this product exists to prevent.

---

## STRIDE summary

A condensed cross-check. Detail and file links are in the actor sections
above; this table is the index, not the argument.

| Category | Primary control | Where | Residual / Deferred |
| --- | --- | --- | --- |
| **S**poofing | Session auth; per-IP auth throttle; prod boot invariants | `rate_limit.py`, `encryption.py` (`assert_auth_secrets_present`) | Proxy-header IP spoofing → throttle bypass only |
| **T**ampering | WORM trigger on `audit_entries`; hash-linked chain | `0011_audit_worm.py`, `audit_chain.py` | DB superuser can disable trigger; role split not flipped |
| **R**epudiation | Hash-chained audit, append-only, re-verifiable; sign-off pins artifact payload hash | `audit_chain.py`, `signoff.py` | A signer can still rubber-stamp (out of scope) |
| **I**nfo disclosure | Per-user slug scoping (404 not 403); BYO keys encrypted at rest | `matter_access.py`, `encryption.py`, `user_keys.py` | App-code isolation, no DB RLS; operator holds the key |
| **D**oS | Per-IP rate limiting on auth surface | `rate_limit.py` | No WAF / dedicated DoS protection |
| **E**levation | Capability grants enforced at runtime; posture gate; ceremony `grant` only from `GRANTED` | `capabilities.py`, `posture_gate.py`, `trust_ceremony.py` | Broadly-granted skill acts within its grants |

---

## Explicitly out of scope / NOT protected against

- **A signer rubber-stamping output.** The sign-off records who signed,
  whether they authored it, and a review-latency / implausible-speed
  flag — it *testifies*, it does not *prevent*. A determined signer can
  approve unread work; the register makes that legible, not impossible
  (`backend/app/core/signoff.py`).
- **Multi-tenant isolation between organisations.** One deployment is
  one workspace. There is no cross-tenant isolation layer; do not run
  multiple untrusting organisations on a single deployment.
- **The WORM role split on the hosted stack.** The append-only trigger
  is live, but the database role split (separate app vs migration roles,
  `REVOKE UPDATE, DELETE` on the app role) is documented as a v0.6
  operator runbook and is a **no-op on the current single-role
  Fly + Neon stack** — it has not been flipped on the hosted eval
  (`backend/alembic/versions/0011_audit_worm.py`,
  `infra/postgres-roles.sql`).
- **End-to-end UK data residency.** Backend (Fly `lhr`) and Postgres
  (Neon London) are UK-region, but Cloudflare R2 object storage is
  EU-placed (Western Europe), and frontier model providers are US-based
  under contractual terms. Residency is therefore *partial*, documented
  honestly in `docs/TRUST.md` (§3, §5).
- **At-rest disk encryption of the database / object store beyond
  provider defaults.** We rely on Neon / Fly / R2 platform defaults; no
  application-layer envelope encryption of matter bodies is implemented
  (`docs/TRUST.md`).

---

## Maps to

- Trust narrative + sub-processor list + residency honesty: `docs/TRUST.md`
- Auth, gates, and model-gateway surface: `docs/ARCHITECTURE.md` (§4–5, §7)
- Forward-looking controls (KMS, anchoring, residency cert): `docs/ROADMAP.md`
- Vulnerability reporting + disclosure SLA: `SECURITY.md`
