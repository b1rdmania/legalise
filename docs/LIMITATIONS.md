# Limitations

This is an evaluation workspace, not a production system. The governance
substrate is real and tested: human sign-off, hash-pinned outputs, append-only
audit, source anchors, posture and advice-boundary gates, owner-scoped matter
access. The operational and scale layer is not production-grade. This document
lists what a production fork must address. Read it before you build on top of
Legalise.

Each item: what the limitation is, why it is fine for evaluation, what a
production fork must do.

## 1. No real agent harness

The assistant is one model call with at most one tool round-trip, not a
planning agent. It assembles context, calls the model once, and if the model
asks for a tool it runs that single tool then calls the model once more for the
final reply (see `backend/app/modules/assistant/pipeline.py`,
`run_assistant_turn`). There is no multi-step planning, no self-correction or
retry loop, no step cap, no agent budget. Only the first tool call is honoured.

Fine for evaluation: the point is to show governed, inspectable single turns,
not autonomous task completion.

Production fork: build an actual agent loop with bounded steps, retries,
intermediate-state audit, and a hard stop. Every step must keep writing to the
audit trail.

## 2. No token or cost modelling

Context is assembled then truncated by a character budget, not a token count.
The budget is `tokens * 4` chars as a rough heuristic (see `pipeline.py`
`_truncate`, `_DEFAULT_CONTEXT_TOKEN_BUDGET`, `_CHARS_PER_TOKEN`). There is no
real token counting, no per-request token ceiling, no cost ceiling, no
rate-of-spend guard. Audit rows carry `token_count` and cost columns
(`app/core/audit_cost.py`), but nothing enforces a limit against them. The stub
provider reports token count only; cost stays null until a real provider plumbs
it through.

Fine for evaluation: a single keyed reviewer running a few turns will not run up
a bill.

Production fork: count real tokens, enforce per-request and per-matter budgets,
add a spend guard, and refuse calls that would exceed them.

## 3. Synchronous indexing

Document chunking and embedding run inline in the upload HTTP request. The
upload handler indexes the document in the same transaction after extraction
(see `app/api/matters.py` `upload_document`, calling `index_document` from
`app/core/indexing.py`). There is no background job. A large document, or a bulk
upload, blocks the request and can time out. Indexing failure is swallowed so
the upload still succeeds, but the document is then not searchable until
reindexed.

Fine for evaluation: sample matters are small and indexed at seed time.

Production fork: move chunking and embedding to a background worker with a
queue, status, and retry. The upload should return fast and index out of band.

## 4. Conversation memory cap

The assistant loads only the last 20 messages, chronological, with no rolling
summary (see `pipeline.py` `_HISTORY_MESSAGE_LIMIT`, `_load_history`). On
context overflow, history is the first section truncated. Long conversations
silently drop their earliest turns.

Fine for evaluation: evaluation threads are short.

Production fork: add a rolling summary or retrieval over older turns so long
conversations keep their earlier context instead of losing it without notice.

## 5. One chat thread per matter

Historically there is one flat conversation per matter: `assistant_messages`
has no `thread_id` or `conversation_id` column, so every turn lives in a single
ordered list keyed on `matter_id` (see `app/models/assistant.py`). Multi-thread
support is being added; until it lands, a matter holds one continuous thread.

Fine for evaluation: a reviewer runs one line of questioning per matter.

Production fork: confirm multi-thread support is in place, or add per-thread
scoping so separate lines of work do not share one history and one truncation
window.

## 6. BYO-key and the encryption secret are operational requirements

By design there is no shared server model key in production. Users bring their
own Anthropic or OpenAI key, stored AES-256-GCM encrypted at rest. The master
key comes from `LEGALISE_KEY_ENCRYPTION_SECRET` (see
`app/core/encryption.py`). In production the app refuses to boot without it. In
dev it generates a random per-process key, so anything encrypted under that key
will not decrypt after a restart.

Fine for evaluation: throwaway dev keys are acceptable for a local fork.

Production fork: set `LEGALISE_KEY_ENCRYPTION_SECRET` to a stable, securely
managed value before any real use. If it changes or is unset, every restart
rotates the key and orphans all stored user keys (they fail to decrypt and must
be re-added). Plan key custody and rotation.

## 7. Key validity is not verified

A stored key is checked for length only and saved (see `app/api/settings.py`
`upsert_key`, `min_length=8`; `app/core/user_keys.py`
`upsert_user_provider_key`). It is never test-called against the provider. A
wrong, revoked, or out-of-credit key is accepted at save time and only fails on
the first real model call.

Fine for evaluation: the reviewer notices on first use.

Production fork: validate the key with a cheap provider call at save time and
surface the result, so a bad key fails when entered, not mid-matter.

## 8. Other honest gaps

- **No org, team, or multi-user roles, no SSO.** One deployment is one
  workspace; the admin flag is the only privileged role; matters are
  owner-scoped. Single-workspace by design. A production fork that needs teams
  must build a tenancy and role model.
- **Retention is recorded, not enforced.** A matter carries `retention_until`,
  but nothing purges or expires data when it passes. A production fork must
  enforce the retention clock.
- **No certifications.** No SOC 2, no ISO 27001. A production fork pursuing
  regulated use owns that programme.
- **No production monitoring or incident runbook.** No metrics, alerting, or
  on-call process in the public repo. A production fork must add them.
- **Embeddings are local fastembed.** `BAAI/bge-small-en-v1.5` runs locally and
  keylessly, so privileged content never leaves the box for indexing. It is a
  general-purpose embedder, not tuned for legal text. A production fork wanting
  better retrieval quality must evaluate a domain-tuned embedder against the
  privilege story.

---

The other direction of honesty: the governance claims are real and tested.
Human sign-off pins each output by hash, the audit log is append-only (Postgres
trigger plus hash chain), source anchors are server-known and independent of
the model, and the posture and advice-boundary gates run before every model
call. What is not production-grade is the operational and scale layer above
them. See [`TRUST.md`](./TRUST.md) and [`THREAT_MODEL.md`](./THREAT_MODEL.md).
