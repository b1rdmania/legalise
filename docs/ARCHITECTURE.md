# Architecture

How Legalise works **today**, in the open-source evaluation release at
`legalise.dev`. Every load-bearing claim cites a file (or `file:line`) —
follow the citation for detail. House rule: a capability is claimed live
only if the code implements it. Anything deferred, dormant, or unmounted
is named — see §8.

---

## 1. What Legalise is

A UK legal-AI workspace built on one primitive: the **matter**. A
solicitor opens a matter, uploads documents, and works through an AI
assistant that drafts and cites its sources as *artifacts*.

The core loop:

> **draft → cite → sign-off → audit**

The AI drafts and cites; a human signs off, pinned to the exact output
they saw; the sequence lands in a hash-chained register an outsider can
re-verify. The thesis is narrow: the machine signs its own *record*; the
human signs the *work*.

The workspace is **matter-first and chat-led**: isolation, authorisation,
and audit are always per matter; chat is the primary surface, with
documents, skills, activity, and approvals as tabs
(`frontend/src/matter/MatterDetail.tsx`,
`frontend/src/matter/tabs/AssistantTab.tsx`).

**What the assistant sees.** Context is assembled per turn, scoped to one
matter (it cannot read another): matter spine, capped chronology, recent
messages, audited retrieval hits — under a token budget that can truncate.
Retrieval is hybrid pgvector + full-text, with a keyless local embedding
backend in the default Docker image and a hash fallback for slim/offline
installs. Search writes `retrieval.search` to the audit log, so the
evidence path can be replayed, not inferred.

---

## 2. System shape

**Stack (boring by design):**

- **Backend:** FastAPI async, SQLAlchemy 2 (async) + Alembic.
- **Database:** PostgreSQL 16 + pgvector — relational, JSONB, full-text,
  and embeddings in one store.
- **Auth:** `fastapi-users`, cookie transport, DB-backed access tokens.
- **Frontend:** React 19 + Vite + Tailwind. **TanStack Router,
  path-based** (`frontend/src/router/index.tsx`); legacy `#/…` URLs
  rewritten on boot.
- **Conversion / extraction:** Gotenberg, LibreOffice headless, `pypdf` /
  `pdfplumber` / `python-docx`.
- **PII detection:** Microsoft Presidio + spaCy.
- **Hosting:** Cloudflare → Fly.io (lhr) → Neon (London) Postgres. The
  single hosted deployment is an evaluation instance, not a production
  product.

**The matter as the unit of isolation.** Every matter-scoped route checks
ownership (`Matter.created_by_id == user.id`). Grants, audit scope,
posture, and the hash chain are keyed per matter. The matter model
(`backend/app/models/matter.py`) carries slug, parties, type, status,
`privilege_posture`, `default_model_id`, and a JSONB facts blob.

**Module catalogue note.** The live UI is `frontend/src/modules-v2/`; the
older `frontend/src/modules/` is dormant.

---

## 3. The audit substrate

The load-bearing part of the system: a plain audit log, plus a
synchronous hash chain over it.

### Audit entries

Consequential actions write to `audit_entries` via `app.core.api.audit.log`
(request session), `audit_failure` (independent transaction, survives an
HTTP rollback), or `audit_phase1` (substrate primitives). Read endpoints
emit nothing. An exhaustive UI→audit emission map (every button → its
action, or an explicit `none` with a reason) is kept current with
`file:line` references.

### The hash chain (migration `0030_audit_hash_chain`)

`audit_chain` is an append-only table with one chain row per audit row,
written **synchronously by an `AFTER INSERT` trigger**
(`audit_entries_hash_chain_after_insert`), so every write path is covered.

- Entry hash: `SHA-256` over a canonical, `len:value`-encoded row
  serialisation (`audit-chain-entry-v1`) defined in
  `backend/app/core/audit_chain.py` and mirrored byte-for-byte in PL/pgSQL
  (`audit_chain_entry_canonical`).
- Rows link per **scope** — `matter` or `system` — committing
  `previous_chain_hash`, `scope_sequence`, `entry_hash`, `chain_hash`
  (`audit-chain-link-v1`); appends serialised per scope with a
  `pg_advisory_xact_lock`.
- `audit_chain` is WORM: a `BEFORE UPDATE OR DELETE` trigger
  (`enforce_audit_chain_worm`) raises on mutation; FK to `audit_entries`
  is `ON DELETE RESTRICT`.

### Verification

`verify_audit_chain` (`backend/app/core/audit_chain.py:210`) re-computes
every hash in Python and compares against the stored chain, returning
structured issues (`count_mismatch`, `sequence_gap`,
`previous_hash_mismatch`, `entry_hash_mismatch`, `chain_hash_mismatch`).
Re-implementing in a second language lets CI catch trigger/verifier drift.
A reviewer reaches it two ways:

1. **`GET /api/matters/{slug}/audit/chain`**
   (`backend/app/api/matters.py:674`) returns `verified` plus the head
   `chain_hash` — the matter's fingerprint; export it and any later
   verification proves the trail was not rewritten.
2. **Matter export bundle** (`backend/app/core/exports.py`) ships the raw
   chain as `audit.json` with a README of "what a human still needs to
   verify".

**Honest limit (stated in the migration itself):** this is
tamper-*evidence*, not external anchoring. It detects edit / delete /
reorder of DB history while the chain table and triggers are present, but
a privileged operator who disables the triggers can rewrite unanchored
history. External anchoring (e.g. Rekor) is a later control, not built.
Per-entry Ed25519 *signing* of audit rows is specced and explicitly
**deferred** (GitHub issue): the hash chain carries the evaluation launch.

---

## 4. Privilege posture & the advice boundary

Two gates run before a capability executes, both enforced in code, not
the UI.

### Privilege posture gate

Each matter carries a `privilege_posture` (default `B_mixed`):

| Posture | Meaning | Effect |
| --- | --- | --- |
| `A_cleared` | Cleared for non-solicitor handling | `any_authenticated` may run capabilities |
| `B_mixed` | Privileged content present (default) | requires `qualified_solicitor` *when firm-role gates are on* |
| `C_paused` | Matter paused | **no capability runs; no cloud model call** |

`C_paused` is enforced twice: the **model gateway**
(`backend/app/core/model_gateway.py`, raising `PrivilegePaused`) and the
**posture gate** (`backend/app/core/posture_gate.py`), so even non-model
capabilities cannot run. The policy is a constant dict (`POSTURE_POLICY`),
changed by diff and migration, never runtime config. A block emits
`posture_gate.check.blocked` via `audit_failure`; a pass emits nothing.

**Important caveat — firm-role gates are dormant by default.** The
`qualified_solicitor` requirement on `B_mixed` only bites when
`LEGALISE_FIRM_ROLE_GATES_ENABLED` is true. It defaults to **false**
(`backend/app/core/config.py:77`), so on the hosted eval any
authenticated owner satisfies a non-paused posture. When dormant, the
gate records `required_role: any_authenticated` so the log stays truthful
about the *effective* requirement rather than faking a solicitor check.
`C_paused` is a hard stop regardless of the flag.

### Advice-boundary gate

A second gate classifies *how far* an output may go on a five-tier ladder
(`backend/app/core/advice_boundary/tiers.py`): 1. `factual_extraction` →
2. `legal_information` → 3. `draft_advice` → 4. `supervised_legal_advice`
→ 5. `approved_final_advice` (terminal).

The gate (`backend/app/core/advice_boundary/gate.py`) validates the tier
vocabulary, blocks exit from the terminal tier, enforces the
allowed-transition table and the role requirement (`role_satisfies`), and
honours any `declared_tier_max` ceiling. Initial tiers cap at
`draft_advice`, so a module cannot start at supervised/final and bypass
review. Outcomes emit
`advice_boundary.check.{completed|blocked|denied|failed}`, and **every
decision — pass or fail — writes a row to the WORM
`advice_boundary_decisions` table** (migration `0014`, append-only).

The gate is **live**, firing in the prompt-capability pipeline
(`backend/app/core/prompt_runtime.py`, after read grants, before
invocation). As with the posture gate, the *role* portion is dormant by
default (`LEGALISE_FIRM_ROLE_GATES_ENABLED=false`): tier-structure,
transition, and ceiling checks always run; the role requirement only
bites when firm-role gates are enabled.

---

## 5. Modules, skills & the import runtime

A "module" (skill) declares capabilities in a manifest, the workspace
grants them, the runtime enforces them. Two runtimes, one governance seam.

### Capability vocabulary & grants

A single vocabulary is the source of truth
(`backend/app/core/capabilities.py::CAPABILITY_VOCABULARY` — `matter.read`,
`document.body.read`, `document.generated.write`, `model.invoke`,
`chronology.read/write`, `citation.write`), with a v2 scope grammar for
nested resources. `require_capability` denies any ungranted call with a
403 and a `module.capability.denied` row. Grants are created per
capability when a module is enabled
(`backend/app/core/grants_lifecycle.py`); a manifest update that *expands*
permissions forces a re-ceremony.

### The trust ceremony (manifest signing)

Installing a module runs a trust ceremony
(`backend/app/core/trust_ceremony.py`): a manifest whose signature
cryptographically verifies against the publisher's registered ed25519 key
(`verified`) takes a 3-step fast path; everything else — including
`structure_verified`, which proves shape only — gets the 7-step inspection
(manifest → signature → publisher → permissions → data movement → gates →
trust + grant). Since no publisher has a registered key yet, every install
today takes the full path.

Signing (`backend/app/core/signing.py`) has two real tiers and five
outcomes:

- **`verified`** — registered Ed25519 key and the signature
  cryptographically verifies over the canonical manifest digest
  (signature-stripped, key-sorted, compact-JSON SHA-256).
- **`structure_verified`** — publisher in the registry but **no**
  registered key, so only shape is checked (signature present, `signed_by`
  matches publisher). Deliberately *not* `verified`: a correctly-shaped
  forgery would pass.
- Plus `unsigned`, `invalid`, `unknown_publisher`.

The publisher registry (`backend/app/core/publishers.py`) is a hardcoded
dict holding `legalise` and `example`, **neither carrying an Ed25519
key** — so manifests reach `structure_verified`, not `verified`, until a
key is registered. The cryptographic path is implemented and tested
(`tests/test_signing_ed25519.py`), just not yet keyed for a live publisher.

### Native modules (live)

`backend/app/modules/` ships four. `assistant` and `chronology` mount HTTP
routers (`backend/app/main.py:382-383`); `anonymisation` (Presidio + model
fallback) and `document_edit` are live internal substrate. The richer
reference modules (Contract Review, Pre-Motion) live under
`examples/modules/` as **reference implementations of the governance
order, not installed modules**.

### The prompt / SKILL.md import runtime (live)

Imported skills run as **prompt-runtime** modules, not native Python.
`backend/app/core/runtime.py::dispatch_capability` branches on the
manifest's `runtime` field; `runtime == "prompt"` calls
`run_prompt_capability` (`backend/app/core/prompt_runtime.py`), executing
the skill's declared instructions as the system prompt against matter
context — no arbitrary code import. The pipeline runs the full governance
seam: posture gate → read grants → advice-boundary check → invocation
audit → provider call → model audit → write grants → artifact write →
completion audit.

Skills import as **drafts** from two live sources: the Lawve catalogue
(`backend/app/core/lawve_import.py`, list + draft only) and GitHub repos
at a pinned ref (`backend/app/core/github_import.py`, parses `SKILL.md`
frontmatter into a manifest-v2 draft), then go through the trust ceremony.
A fully-wired signed-install of a catalogue skill is the v0.2 finish line;
draft generation and the ceremony exist today.

### External pack ingestion (live)

`backend/app/core/external_pack.py` (mounted at `/api/external`)
read-ingests an external workspace export (Mike adapter first) into a
`C_paused` (read-only) matter with WORM document artifacts and an
`external.pack.ingested` row — the cross-platform "supervise someone
else's export" path.

---

## 6. Sign-off & review

Professional sign-off (`backend/app/core/signoff.py`) is the human half of
the thesis. A user records `signed`, `signed_with_observations`, or
`rejected`; the two non-clean decisions require reasoning. Each sign-off:

- **Pins the exact output** — `artifact_hash` is the SHA-256 of canonical
  JSON `{artifact_id, kind, payload}` (the payload, not rendered HTML).
- **Is append-only** — `current_signoff_ids` derives the live decision
  from the newest-by-timestamp row; a new decision never mutates a prior.
- **Emits a decision-class audit row** (`output.signed` /
  `output.signed_with_observations` / `output.sign_rejected`) on the
  caller's session.

**Author ≠ signer.** By default any user may sign, including the author —
the design target is the sole-practitioner loop. The record never hides
it: `signer_is_author` (against `artifact.created_by_id`) is written into
the audit payload, so a self-signed output reads as exactly that in any
export. Deployments needing four-eyes set `SIGNOFF_AUTHOR_MUST_DIFFER`,
which blocks an author from *signing* their own work (`AuthorCannotSign`,
403) while always permitting them to *reject* it.

**Supervision legibility (M13).** The first open of a sign surface writes
an idempotent `output.review.opened` row; latency is derived at read time
(open → decision) and an implausibly fast sign-off is flagged
`implausible_speed` on the payload. This is **recorded, not blocked**.

The sign-off surface is a full page (`frontend/src/matter/SignOff.tsx`),
with the reconstruction view at `/matters/{slug}/audit`
(`frontend/src/matter/ReconstructionView.tsx`).

---

## 7. Model gateway

All LLM traffic leaves through one chokepoint —
`backend/app/core/model_gateway.py`. No module calls a provider SDK
directly; this is the only place matter content crosses to a third party
(the single egress in `docs/THREAT_MODEL.md`).

- **Providers:** Anthropic, OpenAI, and OpenRouter (keyed), Ollama
  (local, keyless), plus a deterministic `stub-echo` provider for smoke
  tests and the demo. OpenRouter (ADR-011) is BYO-key only, takes
  slash-form model ids ("anthropic/claude-sonnet-5"), and pins
  `provider.data_collection = "deny"` on every request.
- **BYO key, no server-paid keys in prod.** User keys are stored encrypted
  per user (`backend/app/core/user_keys.py`, AES-256-GCM), decrypted for a
  single call. A server fallback key is used **only** in a dev environment
  *and* when `LEGALISE_ALLOW_SERVER_KEY_FALLBACK` is true (default false,
  `backend/app/core/config.py:64`). In production a missing user key raises
  `ProviderKeyMissing` and emits `…model.key_missing`.
- **Posture-aware routing.** `C_paused` blocks every call
  (`PrivilegePaused`). On `B_mixed`, if a local Ollama provider is
  registered and a frontier model was requested, the gateway prefers the
  local model.
- **Audit.** A success emits `model.call` (prompt/response hashes, tokens,
  latency, posture, provider — `model_gateway.py:~496`); cost rows
  (`model.invoked`) come from `backend/app/core/audit_cost.py`; failures
  emit `model.call.error` via `audit_failure`.

The matter default is the recommended Anthropic model (currently
`claude-sonnet-5`, the reference model, in `config.py` / `matter.py`) —
per-matter, overridable, refreshed as model ids advance.

---

## 8. Not yet / deferred

Capabilities earlier design notes describe but that are **not live
today**. Named so a reviewer is not misled.

- **State-machine primitive — dormant, unmounted.** The
  runtime/registry/API are parked in `backend/contrib/state_machine/` and
  **not mounted** in `app.main`; the `app/core/state_machine/` package is
  empty. No live request path transitions through it. The `StateMachine*`
  model tables remain (audit reconstruction reads them directly). Revival
  is the v0.2 output-lifecycle item.
- **Per-entry audit signing (Ed25519 on audit rows) — deferred.** Specced
  and costed (GitHub issue), not built. The hash chain provides
  tamper-evidence today; signing would add outsider-verifiable provenance
  and is gated on a real diligence reviewer being in the loop.
- **External / Rekor anchoring — not built.** The chain detects rewrites
  only while its triggers are intact; anchoring outside the DB is a later
  control.
- **Manifest `verified` (cryptographic) tier — implemented but unkeyed.**
  The Ed25519 verify path works, but no live publisher has a registered
  key, so manifests reach `structure_verified` in practice today.
- **Firm-role gates — dormant by default.** The `qualified_solicitor` /
  `workspace_admin` hierarchy in the posture and advice-boundary gates is
  real code but off by default (`LEGALISE_FIRM_ROLE_GATES_ENABLED=false`).
  On the hosted eval, the tier *structure* is enforced; the *role*
  requirement is not.
- **Manifest v2 / matter-context store / sandbox strategy.** The
  matter-context store (`backend/app/core/matter_context/`) is mounted and
  live as a typed-store substrate, but the broader manifest-v2 and
  sandbox-strategy shapes are partially-realised design, not a complete
  live surface — direction, not current state.
- **Lawve catalogue install — draft only.** Listing and draft generation
  are live; end-to-end signed install of a catalogue skill is v0.2.
- **Durable long-running jobs.** A long Pre-Motion run currently holds the
  HTTP/SSE connection for the request lifecycle; an `arq`+Redis job table
  exists but broad durable-job coverage is a later step.
