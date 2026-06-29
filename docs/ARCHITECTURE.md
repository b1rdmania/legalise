# Architecture

This is the single, current architecture document for Legalise. It
describes how the system works **today**, in the open-source evaluation
release candidate hosted at `legalise.dev`. Every load-bearing claim
cites a file (or `file:line`) so a reviewer can check it against the
code rather than the prose.

The house rule throughout: a capability is only claimed live if the
code implements it. Anything deferred, dormant, or unmounted is named
as such — see §8.

---

## 1. What Legalise is

Legalise is a UK legal-AI workspace built around one primitive: the
**matter**. A solicitor opens a matter, uploads documents, and works
through an AI assistant that drafts, cites its sources, and produces
work products as *artifacts*. Nothing the AI generates is treated as
finished until a human signs it off, and every consequential step —
model calls, capability denials, privilege changes, sign-offs — is
written to a tamper-evident audit log.

The core loop the product exists to make legible is:

> **draft → cite → sign-off → audit**

The AI drafts an artifact and attaches citations to source documents
and chronology events; a human reviews and records a professional
sign-off pinned to the exact output they saw; the whole sequence lands
in a hash-chained register that an outsider can re-verify. The thesis
is deliberately narrow: the machine signs its own *record*; the human
signs the *work*. The two are kept separate everywhere in the system.

The workspace is **matter-first and chat-led**. The unit of isolation,
authorisation, and audit is always one matter; the assistant chat is
the primary surface, with documents, skills, activity, and approvals
summoned as tabs around it
(`frontend/src/matter/MatterDetail.tsx`, `frontend/src/matter/tabs/AssistantTab.tsx`).

**What the assistant actually sees.** Context for a chat turn is assembled, not
retrieved wholesale. The assistant is scoped to one matter and cannot read
another. Each turn assembles the matter spine, capped chronology context, recent
chat messages, and audited retrieval hits from indexed document chunks, all
under a token budget that can truncate. Retrieval is hybrid: pgvector embeddings
plus full-text search, with a keyless local embedding backend in the default
Docker image and a hash fallback for slim/offline installs. Search activity is
written to the audit log as `retrieval.search`, including hit counts and the
documents/chunks considered, so the assistant's evidence path can be replayed
instead of inferred.

---

## 2. System shape

**Stack (boring by design):**

- **Backend:** FastAPI, async throughout. SQLAlchemy 2 (async) + Alembic.
- **Database:** PostgreSQL 16 + pgvector — one store for relational data,
  JSONB, full-text, and embeddings.
- **Auth:** `fastapi-users` with cookie transport and DB-backed access
  tokens (register / verify / login / reset all upstream-standard).
- **Frontend:** React 19 + Vite + Tailwind. Routing is **TanStack Router,
  path-based** (`frontend/src/router/index.tsx`); legacy `#/…` hash URLs
  are rewritten to path URLs on boot.
- **Document conversion / extraction:** Gotenberg (HTML→PDF),
  LibreOffice headless (DOCX), `pypdf` / `pdfplumber` / `python-docx`.
- **PII detection:** Microsoft Presidio + spaCy.
- **Hosting:** Cloudflare in front, Fly.io (lhr) for the backend, Neon
  (London) for Postgres. The single hosted deployment is an evaluation
  instance, not a production product.

**The matter as the unit of isolation.** Every matter-scoped route
checks ownership (`Matter.created_by_id == user.id`); one user cannot
read another's matter. Capability grants, audit scope, privilege
posture, and the audit hash chain are all keyed per matter. The matter
model (`backend/app/models/matter.py`) carries the slug, parties,
matter type, status, `privilege_posture`, `default_model_id`, and a
JSONB facts blob.

**Module catalogue note.** The live skills/modules UI is
`frontend/src/modules-v2/`; the older `frontend/src/modules/` tree is
dormant.

---

## 3. The audit substrate

This is the load-bearing part of the system and the centre of the
"register" thesis. There are two layers: a plain audit log, and a
synchronous hash chain over it.

### Audit entries

Every consequential action writes a row to `audit_entries` via
`app.core.api.audit.log` (semantic rows on the request session),
`audit_failure` (independent committed transaction for rows that must
survive an HTTP rollback), or `audit_phase1` (substrate primitives).
Read endpoints deliberately emit nothing. The exhaustive UI→audit
contract — every button, the action string it emits or an explicit
`none` with a reason — is maintained as a canonical UI→audit emission
map, kept current with `file:line` references against the code.

### The hash chain (migration `0030_audit_hash_chain`)

A separate append-only table, `audit_chain`, holds exactly one chain
row per audit row. The chain row is written **synchronously by an
`AFTER INSERT` trigger** on `audit_entries`
(`audit_entries_hash_chain_after_insert`), so every write path —
middleware, semantic rows, independent `audit_failure` transactions —
is covered with no application code to forget.

- The entry hash is `SHA-256` of a canonical serialisation of the audit
  row, prefixed `audit-chain-entry-v1`. The exact field order and the
  length-prefixed `len:value` field encoding live in
  `backend/app/core/audit_chain.py` (Python) and are mirrored byte-for-byte
  in PL/pgSQL in the migration (`audit_chain_entry_canonical`).
- Chain rows are linked per **scope** — `matter` (one chain per matter)
  or `system` (matter-less rows) — each link committing its
  `previous_chain_hash`, `scope_sequence`, `entry_hash`, and
  `chain_hash` (`audit-chain-link-v1`). Appends are serialised per scope
  with a `pg_advisory_xact_lock`.
- `audit_chain` is itself WORM: a `BEFORE UPDATE OR DELETE` trigger
  (`enforce_audit_chain_worm`) raises on any mutation. The
  foreign key to `audit_entries` is `ON DELETE RESTRICT`.

### Verification and the third-party path

`verify_audit_chain` (`backend/app/core/audit_chain.py:210`)
**re-computes** every hash in Python and compares it against the stored
chain, returning structured issues (`count_mismatch`, `sequence_gap`,
`previous_hash_mismatch`, `entry_hash_mismatch`, `chain_hash_mismatch`,
etc.). Re-implementing the recipe in a second language is deliberate:
CI catches any drift between the PL/pgSQL trigger and the verifier.

A reviewer reaches this two ways:

1. **`GET /api/matters/{slug}/audit/chain`** (`backend/app/api/matters.py:674`)
   verifies the matter scope and returns `verified` plus the head
   `chain_hash` — the matter's fingerprint. Export the head, and any
   later verification proves the trail was not rewritten.
2. **Matter export bundle** (`backend/app/core/exports.py`) ships the
   raw audit chain as `audit.json` alongside a README listing "what a
   human still needs to verify", so the chain can be checked outside the
   running service.

**Honest limit (stated in the migration itself):** this is
tamper-*evidence*, not external anchoring. It detects edit / delete /
reorder of DB history while the chain table and triggers are present,
but a privileged operator who disables the triggers can still rewrite
unanchored history. External anchoring (e.g. Rekor) is a later control,
not built. Per-entry Ed25519 *signing* of audit rows — which would add
independent provenance to a skeptic holding only a public key — is
specced and explicitly **deferred** (tracked as a GitHub issue): the
hash chain already carries the evaluation launch.

---

## 4. Privilege posture & the advice boundary

Two distinct gates run before a capability executes. Both are enforced
in code, not in the UI.

### Privilege posture gate

Each matter carries a `privilege_posture` (default `B_mixed`):

| Posture | Meaning | Effect |
| --- | --- | --- |
| `A_cleared` | Cleared for non-solicitor handling | `any_authenticated` may run capabilities |
| `B_mixed` | Privileged content present (default) | requires `qualified_solicitor` *when firm-role gates are on* |
| `C_paused` | Matter paused | **no capability runs; no cloud model call** |

`C_paused` is enforced in two places. The **model gateway** refuses any
LLM call on a paused matter (`backend/app/core/model_gateway.py`,
posture read authoritatively from the DB row, raising `PrivilegePaused`),
and the **posture gate** (`backend/app/core/posture_gate.py`) adds a
second layer so even non-model capabilities cannot run. The whole
policy is six lines of constant dict (`POSTURE_POLICY`) — a change is a
reviewable diff plus an audit-shape migration, never runtime config. A
block emits `posture_gate.check.blocked` via `audit_failure`; a pass
emits nothing.

**Important caveat — firm-role gates are dormant by default.** The
`qualified_solicitor` requirement on `B_mixed` only bites when
`LEGALISE_FIRM_ROLE_GATES_ENABLED` is true. It defaults to **false**
(`backend/app/core/config.py:77`), so on the hosted eval any
authenticated owner satisfies a non-paused posture. When dormant, the
gate records `required_role: any_authenticated` in the audit so the log
stays truthful about the *effective* requirement rather than faking a
solicitor check. `C_paused` is a hard stop regardless of the flag.

### Advice-boundary gate

A second gate classifies *how far* an output may go on a five-tier
ladder (`backend/app/core/advice_boundary/tiers.py`):

1. `factual_extraction` → 2. `legal_information` → 3. `draft_advice`
→ 4. `supervised_legal_advice` → 5. `approved_final_advice` (terminal).

The gate (`backend/app/core/advice_boundary/gate.py`) validates the
tier vocabulary, blocks transitions out of the terminal tier, enforces
the allowed-transition table, checks the role requirement for the
transition (`role_satisfies`), and enforces any declared `declared_tier_max`
ceiling. Initial tiers are capped at `draft_advice` so a module cannot
start at supervised/final and bypass review. Outcomes emit
`advice_boundary.check.{completed|blocked|denied|failed}`, and **every
decision — pass or fail — writes a row to the WORM
`advice_boundary_decisions` table** (migration `0014`, append-only via
trigger).

The gate is **live**: it fires inside the prompt-capability pipeline
(`backend/app/core/prompt_runtime.py`, after read grants, before
invocation). As with the posture gate, the *role* portion is dormant by
default (`LEGALISE_FIRM_ROLE_GATES_ENABLED=false`): tier-structure,
transition, and ceiling checks always run; the solicitor/admin role
requirement only bites when firm-role gates are enabled.

---

## 5. Modules, skills & the import runtime

A "module" (skill) declares capabilities in a manifest, the workspace
grants them, and the runtime enforces them. There are two runtimes and
one shared governance seam.

### Capability vocabulary & grants

A single vocabulary is the source of truth
(`backend/app/core/capabilities.py::CAPABILITY_VOCABULARY` — e.g.
`matter.read`, `document.body.read`, `document.generated.write`,
`model.invoke`, `chronology.read/write`, `citation.write`), with a v2
scope-grammar extension for nested resources. `require_capability`
denies any call lacking a matter-scoped (or workspace-scoped) grant
with a structured 403 and a `module.capability.denied` audit row.
Grants are created per declared capability when a module is enabled on
a matter (`backend/app/core/grants_lifecycle.py`), and a manifest update
that *expands* permissions is detected and forces a re-ceremony.

### The trust ceremony (manifest signing)

Installing a module runs a trust ceremony
(`backend/app/core/trust_ceremony.py`) whose length depends on the
manifest's signature status:

- **Verified publisher → fast path (3 steps).**
- **Everything else → full inspection path (7 steps):** inspect manifest
  → check signature → check publisher → review permissions → review
  data movement → review gates → explicit trust + grant.

Signing (`backend/app/core/signing.py`) has two real tiers and five
outcomes:

- **`verified`** — the publisher has a registered Ed25519 public key and
  the manifest's base64 signature cryptographically verifies over the
  canonical manifest digest (the raw 32-byte SHA-256 of the
  signature-stripped, key-sorted, compact-JSON manifest). Real
  provenance.
- **`structure_verified`** — the publisher is in the registry but has
  **no** registered key, so only shape is checked (signature present,
  `signed_by` matches publisher). Deliberately *not* called `verified`,
  because a correctly-shaped forgery would still pass. The name states
  exactly what was checked.
- Plus `unsigned`, `invalid`, `unknown_publisher`.

The publisher registry (`backend/app/core/publishers.py`) is a hardcoded
in-memory dict. Today it holds `legalise` (first-party) and `example`
(dev/test), **neither of which currently carries an Ed25519 key** — so
in practice manifests reach `structure_verified`, not `verified`, until
a key is registered. The cryptographic path is implemented and tested
(`tests/test_signing_ed25519.py`); it is simply not yet keyed for a
live publisher.

### Native modules (live)

`backend/app/modules/` ships four native modules. `assistant` and
`chronology` mount HTTP routers (`backend/app/main.py:382-383`);
`anonymisation` (Presidio + model fallback) and `document_edit`
(tighten / rewrite / summarise / free-text / UK-jurisdiction sweep) are
live as internal substrate used by other surfaces. The richer reference
modules (Contract Review, Pre-Motion) live under `examples/modules/`
as **reference implementations of the governance order, not installed
modules**.

### The prompt / SKILL.md import runtime (live)

Imported skills run as **prompt-runtime** modules rather than native
Python. `backend/app/core/runtime.py::dispatch_capability` branches on
the manifest's `runtime` field: `runtime == "prompt"` calls
`run_prompt_capability` (`backend/app/core/prompt_runtime.py`), which
executes the skill's declared instructions as the system prompt against
matter context — no arbitrary code import. That pipeline runs the full
governance seam in order: posture gate → read grants → advice-boundary
check → invocation audit → provider call → model audit → write grants →
artifact write → completion audit.

Skills are imported as **drafts** from two sources, both live for
*draft building*: the Lawve catalogue (`backend/app/core/lawve_import.py`,
currently list + draft only) and arbitrary GitHub repos at a pinned ref
(`backend/app/core/github_import.py`, parses `SKILL.md` frontmatter into
a manifest-v2 draft). The draft then goes through the trust ceremony. A
fully-wired signed-install of a catalogue skill is the v0.2 finish line;
draft generation and the ceremony itself are present today.

### External pack ingestion (live)

`backend/app/core/external_pack.py` (mounted at `/api/external`)
read-ingests an external workspace export (the Mike adapter first),
normalising it into a `C_paused` (read-only) matter with WORM document
artifacts and an `external.pack.ingested` audit row. This is the
cross-platform "supervise someone else's export" path.

---

## 6. Sign-off & review

Professional sign-off (`backend/app/core/signoff.py`) is the human half
of the thesis. A signed-in user records one of three decisions over an
artifact: `signed`, `signed_with_observations`, or `rejected`. The two
non-clean decisions require reasoning. Each sign-off:

- **Pins the exact output.** `artifact_hash` is the SHA-256 of canonical
  JSON `{artifact_id, kind, payload}` — the *payload*, not rendered HTML
  — so a signature cannot silently come to mean something else.
- **Is append-only.** A new decision never mutates a prior one;
  `current_signoff_ids` derives the live decision per artifact from the
  newest-by-timestamp row.
- **Emits a decision-class audit row** (`output.signed` /
  `output.signed_with_observations` / `output.sign_rejected`) on the
  caller's session, so it commits with the sign-off and surfaces in the
  Activity Trail as a first-class event.

**Author ≠ signer.** By default any user may sign — including the
artifact's author — because the design target is the sole-practitioner
loop. The record never hides that: `signer_is_author` (computed against
`artifact.created_by_id`) is written into the audit payload, so a
self-signed output reads as exactly that in any export. Deployments that
require four-eyes set `SIGNOFF_AUTHOR_MUST_DIFFER`, which blocks an
author from *signing* their own work (`AuthorCannotSign`, 403) while
always permitting them to *reject* it.

**Supervision legibility (M13).** The first open of a sign surface
writes an idempotent `output.review.opened` row; review latency is
derived at read time (open → decision) and an implausibly fast sign-off
(below a generous words-per-second floor) is flagged `implausible_speed`
on the audit payload. This is **recorded, not blocked** — the register
testifies, it does not nanny.

The sign-off surface is a full page in the matter UI
(`frontend/src/matter/SignOff.tsx`), with the activity / reconstruction
view at `/matters/{slug}/audit`
(`frontend/src/matter/ReconstructionView.tsx`).

---

## 7. Model gateway

All LLM traffic leaves through one chokepoint —
`backend/app/core/model_gateway.py`. No module calls a provider SDK
directly; this is the only place matter content crosses the network to
a third party (it is the single egress in `docs/THREAT_MODEL.md`).

- **Providers:** Anthropic and OpenAI (keyed), Ollama (local, keyless),
  plus a deterministic `stub-echo` provider for smoke tests and the
  public demo.
- **BYO key, no server-paid keys in prod.** User keys are stored
  encrypted per user (`backend/app/core/user_keys.py`, AES-256-GCM) and
  decrypted into memory for a single call. A server fallback key is used
  **only** when the environment is a dev environment *and*
  `LEGALISE_ALLOW_SERVER_KEY_FALLBACK` is true (default false,
  `backend/app/core/config.py:64`). In production, a missing user key
  raises `ProviderKeyMissing` and emits `…model.key_missing`; no
  server-paid key is ever used.
- **Posture-aware routing.** `C_paused` blocks every model call at the
  gateway (`PrivilegePaused`). On `B_mixed`, if a local Ollama provider
  is registered and a frontier model was requested, the gateway prefers
  the local model — keeping privileged content off third-party
  infrastructure where possible.
- **Audit.** A successful call emits `model.call` with prompt/response
  hashes, token counts, latency, posture, and provider
  (`model_gateway.py:~496`); cost rows (`model.invoked`) are emitted
  separately by `backend/app/core/audit_cost.py`; upstream failures emit
  `model.call.error` via `audit_failure`.

Note: the matter default model id in code is `claude-opus-4-7`
(`config.py:41`, `matter.py:54`) — a per-matter default, overridable,
and worth refreshing as model ids advance.

---

## 8. Not yet / deferred

Capabilities that earlier design notes describe but that are **not
live today**. Named here so a reviewer is not misled.

- **State-machine primitive — dormant, unmounted.** Despite the
  state-machine design notes, the runtime/registry/API
  are parked in `backend/contrib/state_machine/` and **not mounted** in
  `app.main`; the `app/core/state_machine/` package is empty. No live
  request path transitions through it. The `StateMachine*` model tables
  remain (audit reconstruction reads them directly). Revival is the v0.2
  output-lifecycle item.
- **Per-entry audit signing (Ed25519 on audit rows) — deferred.**
  Specced and costed (tracked as a GitHub issue), not built.
  The hash chain provides tamper-evidence today; signing would add
  outsider-verifiable provenance and is gated on a real diligence
  reviewer being in the loop.
- **External / Rekor anchoring — not built.** The chain detects rewrites
  only while its triggers are intact; anchoring outside the DB is a later
  control.
- **Manifest `verified` (cryptographic) tier — implemented but unkeyed.**
  The Ed25519 verify path works, but no live publisher has a registered
  key, so manifests reach `structure_verified` in practice today.
- **Firm-role gates — dormant by default.** The
  `qualified_solicitor` / `workspace_admin` hierarchy in the posture and
  advice-boundary gates is real code but off by default
  (`LEGALISE_FIRM_ROLE_GATES_ENABLED=false`). On the hosted eval, the
  tier *structure* is enforced; the *role* requirement is not.
- **Manifest v2 / matter-context store / sandbox strategy.** The
  matter-context store (`backend/app/core/matter_context/`) is mounted
  and live as a typed-store substrate, but the broader manifest-v2 and
  sandbox-strategy shapes are partially-realised design, not a complete
  live surface — treat them as direction, not current state.
- **Lawve catalogue install — draft only.** Listing and draft generation
  are live; the end-to-end signed install of a catalogue skill is v0.2.
- **Durable long-running jobs.** A long Pre-Motion run currently holds
  the HTTP/SSE connection for the request lifecycle; an `arq`+Redis job
  table exists but broad durable-job coverage is a later step.
