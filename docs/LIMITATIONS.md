# Limitations

This is an evaluation release, not a production system. Read this before you
build on top of Legalise.

It separates three things that are too often muddled together:

1. **Deliberate scope** — choices for an open-source evaluation release, not
   accidents or TODOs. A fork with different goals may revisit them.
2. **Not production-grade yet** — real gaps in the operational and scale layer
   that a production fork must close.
3. **What is real and tested** — the governance substrate, and the evals that
   check it.

The honest mismatch to avoid: this is an evaluation-complete technical release.
It is not built for a firm procurement committee, and does not pretend to be.

---

## 1. Deliberate scope — choices, not gaps

### Single governed turn, not an autonomous agent

The assistant is one model call with at most one tool round-trip — it assembles
context, calls the model once, and if the model asks for a tool it runs that
single tool then calls the model once more for the final reply (see
`backend/app/modules/assistant/pipeline.py`, `run_assistant_turn`). No
multi-step planning, no self-correction loop, no agent budget. Only the first
tool call is honoured.

This is the thesis, not a shortcut. Every turn is one governed, inspectable,
**signable** unit. A multi-step autonomous loop works against that — what would
a solicitor sign, and against which intermediate step? A fork that wants
autonomy can build a bounded, fully-audited agent loop, but that is a different
product with a different accountability story.

### Single workspace — no org, team, roles, or SSO

One deployment is one workspace; the admin flag is the only privileged role;
matters are owner-scoped (`backend/app/models/matter.py`,
`app/core/matter_access.py`). Multi-tenancy deserves its own design pass.
Self-hosters who need separation run one deployment per team. SSO / SAML / SCIM
is enterprise-fork territory, not part of an evaluation release.

### Bring-your-own-key — no shared server model key

By design there is no server-paid model key in production. Users bring their own
Anthropic or OpenAI key, stored AES-256-GCM encrypted at rest
(`app/core/encryption.py`). Privileged content is never sent through a key the
operator controls. The operational cost of that choice:
`LEGALISE_KEY_ENCRYPTION_SECRET` must be set to a stable, securely managed value
before any real use — in production the app refuses to boot without it; if it
changes or is unset, every restart rotates the master key and orphans all stored
user keys (they fail to decrypt and must be re-added). Plan key custody and
rotation.

### No certifications — a fork's programme, not an evaluation release's

No SOC 2, no ISO 27001, no Cyber Essentials. These belong to a fork pursuing
regulated production use, with its own controls, supervision, and PII cover. An
evaluation release does not carry them and makes no claim to. Stated plainly so
nobody mistakes the repo for a procurement-ready product.

---

## 2. Not production-grade yet — a fork must close these

Fine for a single reviewer running a local fork or a guided demo. Not fine for
live client matters.

### No token or cost modelling

Context is assembled then truncated by a character budget, not a token count
(`pipeline.py` `_truncate`, `_DEFAULT_CONTEXT_TOKEN_BUDGET`). No real token
counting, no per-request or per-matter ceiling, no rate-of-spend guard. Audit
rows carry `token_count` and cost columns (`app/core/audit_cost.py`) but nothing
enforces a limit against them. **Fork:** count real tokens, enforce budgets,
refuse calls that would exceed them.

### Conversation memory cap

The assistant loads only the last 20 messages of a thread, chronological, with
no rolling summary (`pipeline.py` `_HISTORY_MESSAGE_LIMIT`, `_load_history`); on
overflow, history truncates first. Long conversations silently drop their
earliest turns. **Fork:** add a rolling summary or retrieval over older turns.

### Retention enforcement is opt-in

A matter carries `retention_until` (`app/models/matter.py`). Enforcement runs as
a daily worker sweep that purges lapsed matters via the audited tombstone, but
it is **off by default** (`LEGALISE_RETENTION_SWEEP_ENABLED`) because it deletes
data — a deployment opts in, with a per-run blast-radius cap, after previewing
with the dry-run CLI (`python -m app.tools.retention_sweep`). **Fork:** enable
it, choose the cap/schedule, and rehearse it.

### No production monitoring or incident response

No metrics, alerting, on-call, or incident runbook in the public repo. **Fork:**
add them before any real use.

### Embeddings are a general-purpose model

`BAAI/bge-small-en-v1.5` runs locally and keylessly, so privileged content never
leaves the box for indexing — a privilege win, but it is not tuned for legal
text. **Fork:** evaluate a domain-tuned embedder against the privilege story.

---

## 3. What is real and tested

The governance substrate is not aspirational:

- **Human sign-off** pins each output by hash; the history is append-only.
- **Audit trail** is append-only — a Postgres trigger rejects UPDATE/DELETE and
  rows mirror into a hash chain. (Tamper-evident, not tamper-proof: a DB
  superuser can still rewrite and re-link. External anchoring would close that
  and is not built — see [`TRUST.md`](./TRUST.md#8-audit-trail).)
- **Source anchors** are server-known and independent of the model.
- **Posture and advice-boundary gates** run before every model call.
- **Matter access** is owner-scoped; the assistant cannot see other matters.

And the claims are checked, not just asserted. A deterministic evaluation
harness ([agent-kit](https://github.com/b1rdmania/agent-kit)) runs against the
**real production functions** — retrieval grounding (real citations from real
documents in the matter), posture refusal, the keyless document matcher, and
audit-chain integrity — as CI-gateable records that fail on regression. So
"where are your evals?" has a concrete answer: see
[`evals/agent-kit/`](../evals/agent-kit/) and run `just run`.

What is not production-grade is the operational and scale layer above the
substrate, listed in section 2. See [`TRUST.md`](./TRUST.md) and
[`THREAT_MODEL.md`](./THREAT_MODEL.md), gaps first.
