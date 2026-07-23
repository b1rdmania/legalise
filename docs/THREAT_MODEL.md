# Threat Model

What Legalise protects, its trust boundaries, what each attacker can and
cannot do, and what it does **not** defend against. Every control maps to a
file. Partial or absent defences are marked **Residual** or **Deferred**. A
control is claimed only if the code implements it.

Scope: the open-source codebase and self-hosted deployments. `legalise.dev` is
a static site; its application backend is currently off. Operators inherit the
code-level controls but make their own infrastructure choices.

---

## Assets to protect

| Asset | Where it lives | Why it matters |
| --- | --- | --- |
| Client / privileged documents | Postgres (`document_bodies`), R2 blobs | Privileged material; disclosure is the worst harm |
| User provider API keys | `user_api_keys` (encrypted at rest) | A leaked key is billable + impersonatable upstream |
| Audit-chain integrity | `audit_entries` + `audit_chain` | The register is the product; a rewritten trail is fatal |
| Auth / session | session cookie, `users` table | Account takeover = all a user's matters |
| Per-user matter isolation | every matter-scoped route | One user reading another's matter is a breach |

---

## Trust boundaries

1. **Browser ↔ backend.** Untrusted input crosses into FastAPI; auth,
   throttling, ownership scoping, and capability enforcement sit here.
2. **Backend ↔ model provider (single egress).** All LLM traffic leaves
   through one chokepoint — `model_gateway.py`. No module calls a provider
   SDK directly.
3. **Backend ↔ storage (Postgres / R2).** Matter rows, audit rows, blobs at
   rest; the backend holds both credentials.
4. **Self-host operator boundary.** Whoever runs the deployment holds the
   master key and DB credentials — the outermost boundary and the
   limit of the model (see the insider row).

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
- Per-IP sliding-window throttle on the unauth auth surface, recomputed from
  Postgres (holds across instances); counts attempts — `rate_limit.py`.
- Auth on every matter route; session invariants enforced at prod boot —
  `assert_auth_secrets_present`, `encryption.py`.
- Fail-closed boot: no master key, no start — `assert_master_key_present`.

**Residual**
- Client-IP resolution trusts proxy headers (`CF-Connecting-IP`,
  `Fly-Client-IP`, `X-Forwarded-For`), spoofable by a client reaching the
  origin directly. The hosted origin is exposed only via Cloudflare→Fly, and
  the worst case is a throttle bypass, never an authz bypass —
  `rate_limit.py`.

**Deferred**
- No WAF / managed bot-mitigation beyond platform defaults.
- DoS resilience is out of scope for the eval.

### 2. Authenticated user attacking another user (cross-matter)

**Mitigated**
- Per-user slug scoping on every route: matters resolve by
  `(slug, created_by_id)` — `resolve_owned_open_matter`, `matter_access.py`.
- Cross-user, archived, and missing all return **404, not 403**, so another
  user's slug never leaks (same file).
- Capability grants are scoped workspace-broad or to one matter and never
  satisfy each other — `require_capability`, `capabilities.py`.
- Every state-mutating path writes an audit row unconditionally (same file).

**Residual**
- Isolation is enforced in app code (the `created_by_id` predicate), not by
  DB row-level security. A query forgetting the predicate would bypass it;
  mitigated by routing all access through the shared resolver.

**Deferred**
- Postgres row-level security as a second, independent layer.

### 3. Malicious or compromised skill / module

**Mitigated**
- Skills are never executed code; imports become **governed module drafts**,
  scripts never run, and the commit SHA is pinned (unpinned refs resolved
  before fetch) — `github_import.py`.
- Admission runs a trust-ceremony state machine; `grant` is valid only from
  `GRANTED`, so an admin cannot skip the 7-step inspection — `trust_ceremony.py`.
- Two-grade signatures named for what they prove: `VERIFIED` (real ed25519
  against a registered key) vs `STRUCTURE_VERIFIED` (shape + registry only) —
  `signing.py`, `publishers.py`.
- Runtime enforcement: a model call or tool invocation by a `(plugin, skill)`
  pair needs the matching grant; a missing one raises `CapabilityDenied` and
  writes a denial audit row — `capabilities.py`, `model_gateway.py`.
- Posture gate fires first: `C_paused` blocks all execution; `B_mixed`
  requires the configured role when firm-role gates are on — `posture_gate.py`.

**Residual**
- A skill with broad grants does whatever they allow. The ceremony surfaces
  the permission card and data-movement summary (`_aggregate_data_movement`),
  but granting `model.invoke` + body-read authorises sending document bodies
  through the gateway. The control is informed consent at admission, not
  runtime sandboxing.
- `STRUCTURE_VERIFIED` asserts shape and registry membership only — a forged
  signature of the right shape passes; callers must not treat it as
  provenance — `signing.py`.

**Deferred**
- Script-execution sandboxing (script-carrying skills are flagged for manual
  review, never run).
- DB-backed publisher registry / sigstore-rooted trust (registry is
  hardcoded in-memory today — `publishers.py`).

### 4. Compromised or curious model provider

**Mitigated**
- Bring-your-own keys: keyed providers (Anthropic, OpenAI) use the calling
  user's own key, encrypted at rest (AES-256-GCM), decrypted only at call
  time, held for one call, never logged — `model_gateway.py`, `user_keys.py`,
  `encryption.py`.
- Fail-closed when no key is present and the dev-only fallback is barred:
  raises `ProviderKeyMissing` and writes a key-missing audit row —
  `model_gateway.py`.
- Local-model path: a `B_mixed` matter routes to a registered Ollama
  provider when one exists, keeping the call on-premises — `_select_provider`.
- Optional pseudonymisation before a body is sent: tokenises PII (UK
  postcodes, NI numbers, GBP amounts, plus NER) —
  `backend/app/modules/anonymisation/`. Opt-in, best-effort, not a guarantee.
- No-training posture is contractual, documented per sub-processor in
  `docs/TRUST.md` (UK IDTA addenda; Anthropic / OpenAI no-training terms).

**Residual — stated plainly**
- A provider sees the cleartext of any call you permit. BYO keys, encryption
  at rest, and no-training terms govern *retention and reuse*, not content in
  flight. If a matter cannot tolerate that, use local-Ollama (`B_mixed`) or
  pause it (`C_paused`).
- Pseudonymisation recall is imperfect and Presidio is an optional install;
  absent it, no pseudonymisation occurs (the engine raises a clean 503).

### 5. Malicious insider / self-host operator

**Mitigated**
- The audit chain is hash-linked and independently re-verifiable: a Python
  verifier recomputes every hash and cross-checks the PL/pgSQL-written chain,
  so CI catches drift — `audit_chain.py`.
- A read-only endpoint exposes the chain head as a matter fingerprint. A head
  recorded outside the deployment can later be used to detect a rewritten
  trail — `matters.py`.
- `audit_entries` is append-only: a Postgres trigger (`enforce_audit_worm`)
  raises on any UPDATE or DELETE — `0011_audit_worm.py`, `models/audit.py`.

**Residual — operator access**
- An operator holding both the database and the master key
  (`LEGALISE_KEY_ENCRYPTION_SECRET`) can read matter content and decrypt
  stored provider keys. Both are held by whoever runs the deployment.
  Encryption at rest defends against
  storage-media compromise, not the key-holder — `encryption.py`.
- An operator with raw Postgres superuser access could disable the WORM
  trigger; it defends against app bugs and the app role, not a DB superuser.
  The supplied role split connects the app as `legalise_app`, which does not
  own the audit tables and cannot disable the triggers. Self-hosters must apply
  and verify that split. The owner/superuser remains above it.

**Deferred**
- Customer-managed / external KMS keys (no operator key custody) — not in v1
  per `docs/TRUST.md`.
- Tamper-evident external anchoring of the audit-chain head (notary /
  transparency log).

### 6. Supply chain

**Mitigated**
- Skill/module imports pin a concrete commit SHA — `github_import.py`.

**Deferred — these do NOT exist; do not read them as claims**
- **SBOM generation** — not produced.
- **Signed container images** (sigstore / cosign) — not produced.
- **SLSA provenance (any level)** — not produced.
- **SOC 2 / ISO 27001 control mappings** — not held.

Listed to signal the target bar, not to claim attainment. Fabricating
supply-chain provenance is the failure this product exists to prevent.

---

## STRIDE summary

An index, not the argument — detail and file links are above.

| Category | Primary control | Where | Residual / Deferred |
| --- | --- | --- | --- |
| **S**poofing | Session auth; per-IP auth throttle; prod boot invariants | `rate_limit.py`, `encryption.py` | Proxy-header IP spoofing → throttle bypass only |
| **T**ampering | WORM trigger on `audit_entries`; hash-linked chain; supplied app/owner role split | `0011_audit_worm.py`, `audit_chain.py`, `infra/postgres-roles.sql` | Self-hosters must apply the split; DB owner/superuser can still disable trigger |
| **R**epudiation | Hash-chained, append-only, re-verifiable audit; sign-off pins payload hash | `audit_chain.py`, `signoff.py` | A signer can still rubber-stamp (out of scope) |
| **I**nfo disclosure | Per-user slug scoping (404 not 403); BYO keys encrypted at rest | `matter_access.py`, `encryption.py`, `user_keys.py` | App-code isolation, no DB RLS; operator holds the key |
| **D**oS | Per-IP rate limiting on auth surface | `rate_limit.py` | No WAF / dedicated DoS protection |
| **E**levation | Runtime capability grants; posture gate; ceremony `grant` only from `GRANTED` | `capabilities.py`, `posture_gate.py`, `trust_ceremony.py` | Broadly-granted skill acts within its grants |

---

## Explicitly out of scope / NOT protected against

- **A signer rubber-stamping output.** The sign-off records who signed,
  whether they authored it, and a review-latency / implausible-speed flag —
  it *testifies*, it does not *prevent*. A determined signer can approve
  unread work — `signoff.py`.
- **Multi-tenant isolation between organisations.** One deployment is one
  workspace; there is no cross-tenant layer. Do not run multiple untrusting
  organisations on one deployment.
- **A DB owner/superuser rewriting history.** The supplied WORM role split uses
  `legalise_app`, which cannot disable the audit triggers, but the table-owner
  role and database operator sit above it. Tamper-evident, not tamper-proof
  (`0011_audit_worm.py`, `infra/postgres-roles.sql`).
- **A fixed data-residency posture.** Self-hosters choose their infrastructure
  and model providers. Legalise does not certify end-to-end UK residency.
- **Application-layer encryption of matter bodies.** Stored matter content
  relies on the at-rest controls of the chosen database and object store —
  `docs/TRUST.md`.

---

## Maps to

- Trust boundaries, optional providers, and residency: `docs/TRUST.md`
- Auth, gates, model-gateway surface: `docs/ARCHITECTURE.md` (§4–5, §7)
- Forward-looking controls (KMS, anchoring, residency cert): `docs/ROADMAP.md`
- Vulnerability reporting + disclosure SLA: `SECURITY.md`
