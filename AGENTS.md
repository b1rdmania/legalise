# Legalise — Agent Context (AGENTS.md)

> **This is the agent context file for Legalise.** Coding agents pick it up
> automatically when working in the repo; you can also drop it into any AI agent
> or paste it into a chat to talk about Legalise — what it is, how it's built,
> and what it does and does not claim.
> It is a self-contained snapshot synthesised from the project's own docs
> (`README.md`, `docs/ARCHITECTURE.md`, `docs/TRUST.md`, `docs/THREAT_MODEL.md`).
> The house rule throughout, the same one the codebase holds itself to: a
> capability is only described as live if the code implements it. Anything
> deferred, dormant, or unmounted is named as such.
>
> Repo: https://github.com/b1rdmania/legalise · Licence: Apache 2.0 · Status:
> open-source **evaluation release**, not for live client matters.

---

## 1. The one-paragraph version

Legalise is an open-source **governance layer for legal AI**: human sign-off
plus a tamper-evident audit trail for AI-assisted legal work, built for England
& Wales solicitor practice. It runs locally, you bring your own model key, and
it is an evaluation release — not a regulated legal service. The whole system
exists to make one loop legible:

> **draft → cite → sign-off → audit**

AI prepares an output inside a *matter*, cites the documents it used, a named
solicitor reviews and signs it (the signature pins the exact output by hash),
and every step writes to an audit log the application cannot edit or delete.
**AI is preparation, not the deliverable.** The audit trail makes the work
inspectable; the signature makes a human accountable. The thesis is deliberately
narrow: *the machine signs its own record; the human signs the work* — and the
two are kept separate everywhere.

It's an early-stage, mostly solo project shared in the open — a working
exploration of how this *could* be done, not a finished or proven product. Treat
the claims below as "this is what the code does today", not "this is solved".

## 2. What it's built to answer (the four questions)

A regulator, insurer, supervisor, or partner eventually asks four questions
about any AI tool used on a matter. Legalise is an attempt to make them
answerable from the record rather than from trust:

1. **What did it see?** Every matter has a spine — documents, chronology,
   parties, retention clock, privilege posture. The AI sees only what lives in
   the matter; cross-matter access is scoped in the application layer and every
   access is audited.
2. **Under what protection?** Every matter carries a *privilege posture*, read
   from the database before each model call (`A_cleared` / `B_mixed` /
   `C_paused`).
3. **What did it produce?** Prompt, response, model, tokens, latency, posture,
   and calling module are hashed and stored. Any interaction reconstructs from
   the audit row.
4. **Who stayed accountable?** A named human signs each output, and the record
   shows whether the signer was the author. Every model call, mutation,
   chronology entry, and denial writes one append-only audit row, mirrored into
   a hash chain.

**One caveat, stated plainly:** this is tamper-*evidence*, not tamper-*proofing*.
A database superuser can still rewrite and re-link history. External anchoring
would close that and is not built.

---

## 3. Stack (boring by design)

- **Backend:** FastAPI, async throughout. SQLAlchemy 2 (async) + Alembic.
- **Database:** PostgreSQL 16 + pgvector — one store for relational data, JSONB,
  full-text, and embeddings.
- **Auth:** `fastapi-users`, cookie transport (HttpOnly/Secure/SameSite=Lax),
  DB-backed access tokens (real revocation), email verification via Resend.
- **Frontend:** React 19 + Vite + Tailwind. TanStack Router, **path-based**
  (legacy `#/…` hash URLs are rewritten to path URLs on boot).
- **Document conversion / extraction:** Gotenberg (HTML→PDF), LibreOffice
  headless (DOCX), `pypdf` / `pdfplumber` / `python-docx`.
- **PII detection:** Microsoft Presidio + spaCy.
- **Local dev stack:** Postgres, MinIO, Redis, Gotenberg, FastAPI, React via
  docker-compose.
- **Hosting (single eval instance):** Cloudflare in front, Fly.io (lhr) backend,
  Neon (London) Postgres, Cloudflare R2 (EU) for blobs.

---

## 4. The core concepts

### 4.1 The matter is the unit of everything

A "matter" is the primitive. The unit of **isolation, authorisation, and audit**
is always one matter. Every matter-scoped route checks ownership
(`Matter.created_by_id == user.id`) — one user cannot read another's matter.
Capability grants, audit scope, privilege posture, and the audit hash chain are
all keyed per matter. The matter model carries slug, parties, matter type,
status, `privilege_posture`, `default_model_id`, and a JSONB facts blob.

The workspace is **matter-first and chat-led**: the assistant chat is the
primary surface, with documents, skills, activity, and approvals summoned as tabs
around it. The worked sample matter is **Khan v Acme**.

### 4.2 The audit substrate (the load-bearing part)

Two layers: a plain audit log, and a synchronous hash chain over it.

- **Audit entries.** Every consequential action writes a row to `audit_entries`.
  Read endpoints deliberately emit nothing. Three write paths:
  `audit.log` (semantic rows on the request session), `audit_failure`
  (independent committed transaction for rows that must survive an HTTP
  rollback), and `audit_phase1` (substrate primitives).
- **Hash chain (migration `0030_audit_hash_chain`).** A separate append-only
  `audit_chain` table holds exactly one chain row per audit row, written
  **synchronously by an `AFTER INSERT` trigger** — so every write path is
  covered with no application code to forget. Entry hash = SHA-256 of a canonical
  serialisation prefixed `audit-chain-entry-v1`; the exact field encoding lives
  in both Python (`backend/app/core/audit_chain.py`) and PL/pgSQL (the
  migration), mirrored byte-for-byte. Chains are linked **per scope** (`matter`
  or `system`), appends serialised with a `pg_advisory_xact_lock`. The
  `audit_chain` table is itself WORM (`BEFORE UPDATE OR DELETE` trigger raises).
- **Verification.** `verify_audit_chain` **re-computes** every hash in Python and
  compares against the stored chain. Re-implementing the recipe in a second
  language is deliberate — CI catches drift between the trigger and the verifier.
  A reviewer reaches it two ways: `GET /api/matters/{slug}/audit/chain` (returns
  `verified` + head `chain_hash`, the matter's fingerprint), or the matter export
  bundle, which ships the raw chain as `audit.json` for offline checking.

**Honest limit:** tamper-*evidence*, not external anchoring. It detects
edit/delete/reorder of DB history while the chain and triggers are present, but a
privileged operator who disables the triggers can still rewrite unanchored
history. External anchoring (e.g. Rekor) and per-entry Ed25519 signing of audit
rows are specced and **deferred**.

### 4.3 Privilege posture & the advice boundary (two gates before execution)

Both gates are enforced in **code, not the UI**.

**Privilege posture gate.** Each matter carries a `privilege_posture` (default
`B_mixed`):

| Posture | Meaning | Effect |
| --- | --- | --- |
| `A_cleared` | Privilege waived/cleared | cloud providers permitted; `any_authenticated` may run capabilities |
| `B_mixed` | Privileged content present (**default**) | local Ollama preferred when reachable; frontier providers permitted under no-training terms; requires `qualified_solicitor` *only when firm-role gates are on* |
| `C_paused` | Matter paused / unresolved | **no capability runs; no cloud model call** — hard stop |

`C_paused` is enforced in two places: the model gateway refuses any LLM call
(`PrivilegePaused`), and the posture gate blocks even non-model capabilities. The
posture is read **at call time, in the same session** as the request — closing
the race where a caller reads `B_mixed`, an admin flips to `C_paused`, and the
stale value gets used. Policy is six lines of constant dict (`POSTURE_POLICY`) —
a change is a reviewable diff, never runtime config.

**Advice-boundary gate.** A second gate classifies *how far* an output may go on
a five-tier ladder: `factual_extraction` → `legal_information` → `draft_advice`
→ `supervised_legal_advice` → `approved_final_advice` (terminal). It validates
the tier vocabulary, blocks transitions out of the terminal tier, enforces the
allowed-transition table and any `declared_tier_max` ceiling. Initial tiers are
capped at `draft_advice` so a module cannot start at supervised/final and bypass
review. **Every decision — pass or fail — writes a row to the WORM
`advice_boundary_decisions` table.** It fires live inside the prompt-capability
pipeline.

> **Important — firm-role gates are dormant by default.** The
> `qualified_solicitor` / `workspace_admin` role requirements only bite when
> `LEGALISE_FIRM_ROLE_GATES_ENABLED=true` (defaults **false**). On the hosted
> eval, the tier/posture *structure* is enforced; the *role* requirement is not.
> The audit stays truthful — it records `required_role: any_authenticated` rather
> than faking a solicitor check. `C_paused` is a hard stop regardless of the flag.

### 4.4 Modules, skills & the import runtime

A "module" (skill) declares capabilities in a manifest, the workspace grants
them, the runtime enforces them.

- **Capability vocabulary** is the single source of truth
  (`backend/app/core/capabilities.py::CAPABILITY_VOCABULARY` — e.g.
  `matter.read`, `document.body.read`, `document.generated.write`,
  `model.invoke`, `chronology.read/write`, `citation.write`). `require_capability`
  denies any call lacking a matter-scoped grant with a structured 403 + a
  `module.capability.denied` audit row. Grants are created per declared capability
  when a module is enabled on a matter; a manifest update that *expands*
  permissions forces a re-ceremony.
- **The trust ceremony.** Installing a module runs a ceremony whose length
  depends on signature status: **verified publisher → fast path (3 steps)**;
  **everything else → full inspection (7 steps)**: inspect manifest → check
  signature → check publisher → review permissions → review data movement →
  review gates → explicit trust + grant.
- **Signing — two real tiers, five outcomes.** `verified` = publisher has a
  registered Ed25519 public key and the manifest signature cryptographically
  verifies over the canonical digest (real provenance).
  `structure_verified` = publisher is in the registry but has **no** registered
  key, so only shape is checked — deliberately *not* called `verified` because a
  correctly-shaped forgery would pass. Plus `unsigned`, `invalid`,
  `unknown_publisher`. The registry currently holds `legalise` and `example`,
  **neither carrying a key**, so manifests reach `structure_verified` in
  practice. The crypto path is implemented and tested, just not yet keyed.
- **Two runtimes, one governance seam.** *Native modules* (`assistant`,
  `chronology` mount HTTP routers; `anonymisation` and `document_edit` are
  internal substrate) live in `backend/app/modules/`. The richer reference
  modules (Contract Review, Pre-Motion) live under `examples/modules/` as
  reference implementations of the governance order. *Prompt runtime*: imported
  `SKILL.md` skills run as prompt-runtime modules (`runtime == "prompt"`),
  executing declared instructions as a system prompt against matter context — no
  arbitrary code import. The pipeline runs the full seam **in order**: posture
  gate → read grants → advice-boundary check → invocation audit → provider call
  → model audit → write grants → artifact write → completion audit.
- **Skills arrive by import** as drafts, from two sources: the
  [`awesome-legal-skills`](https://github.com/lawve-ai/awesome-legal-skills)
  (Lawve) catalogue, browsable in-app, and any public GitHub repo with a
  `SKILL.md` dropped in by URL (e.g.
  [`pre-motion`](https://github.com/b1rdmania/pre-motion)) at a **pinned commit
  SHA**. Each import becomes a governed draft, passes the trust ceremony, and
  runs under the same sign-off and source-anchor handling. (Lawve install is
  **draft-only** today; signed end-to-end catalogue install is the v0.2 finish
  line.)
- **External pack ingestion (live).** `external_pack.py` (mounted at
  `/api/external`) read-ingests an external workspace export (the Mike adapter
  first) into a `C_paused` read-only matter with WORM document artifacts — the
  cross-platform "supervise someone else's export" path.

### 4.5 Sign-off & review (the human half)

A signed-in user records one of three decisions over an artifact: `signed`,
`signed_with_observations`, or `rejected` (the two non-clean ones require
reasoning). Each sign-off:

- **Pins the exact output.** `artifact_hash` = SHA-256 of canonical JSON
  `{artifact_id, kind, payload}` — the *payload*, not rendered HTML — so a
  signature cannot silently come to mean something else.
- **Is append-only.** A new decision never mutates a prior one; the live decision
  is derived from the newest-by-timestamp row.
- **Emits a decision-class audit row** (`output.signed` etc.) that commits with
  the sign-off and surfaces in the Activity Trail.

**Author ≠ signer.** By default any user may sign — including the author —
because the design target is the sole-practitioner loop. The record never hides
it: `signer_is_author` is written into the audit payload. Deployments that need
four-eyes set `SIGNOFF_AUTHOR_MUST_DIFFER`, which blocks an author from *signing*
their own work while always allowing them to *reject* it.

**Supervision legibility (M13).** The first open of a sign surface writes an
idempotent `output.review.opened` row; review latency is derived (open →
decision), and an implausibly fast sign-off is flagged `implausible_speed`. This
is **recorded, not blocked** — the register testifies, it does not nanny.

### 4.6 Source anchors

An output carries the documents it cited. **Document anchors are server-known,
independent of the model.** Where the model supplied a quote, Legalise checks it
against the extracted body (`quote_found_in_source`): cited for review, not
certified.

### 4.7 Model gateway (the single egress)

All LLM traffic leaves through one chokepoint — `backend/app/core/model_gateway.py`.
No module calls a provider SDK directly; this is the only place matter content
crosses the network to a third party.

- **Providers:** Anthropic + OpenAI (keyed), Ollama (local, keyless), plus a
  deterministic `stub-echo` provider for smoke tests and the public demo.
- **BYO key, no server-paid keys in prod.** User keys are stored AES-256-GCM
  encrypted per user, decrypted into memory for a single call. A server fallback
  key is used **only** in a dev environment *and* when
  `LEGALISE_ALLOW_SERVER_KEY_FALLBACK=true` (default false). In production a
  missing user key raises `ProviderKeyMissing`; no server-paid key is ever used.
- **Posture-aware routing.** `C_paused` blocks every call. On `B_mixed`, if local
  Ollama is registered and a frontier model was requested, the gateway prefers
  the local model — keeping privileged content off third-party infrastructure
  where possible.
- **Audit.** A successful call emits `model.call` (prompt/response hashes only,
  token counts, latency, posture, provider); cost rows emit separately; upstream
  failures emit `model.call.error`.

### 4.8 CPR 31.22 disclosure gate

Documents obtained under disclosure may only be used for the proceedings in which
they were disclosed (the implied undertaking). Legalise treats every document
tagged `from_disclosure=True` as carrying it; any chronology event sourced from
such a document is 31.22-tainted. When a matter has ≥1 tainted event and the user
has no `chronology.gate.confirmed` audit row, the chronology endpoint **withholds
the description, source filenames, and proceedings references** — the user sees
that gated material exists but not what it says. Confirmation is a POST that
audits the acknowledgement; the next GET returns full detail. A forcing function,
not a substitute for the rule itself.

---

## 5. Code map (where to look)

```
backend/
  app/
    main.py                     # FastAPI app; mounts routers (assistant, chronology, external…)
    api/                        # HTTP routes; matters.py holds the audit/chain endpoint
    core/
      audit_chain.py            # hash-chain build + verify_audit_chain (Python recipe)
      model_gateway.py          # THE single LLM egress; posture-aware routing
      posture_gate.py           # privilege-posture enforcement
      advice_boundary/          # five-tier advice ladder: gate.py, tiers.py
      capabilities.py           # CAPABILITY_VOCABULARY (source of truth)
      grants_lifecycle.py       # per-matter capability grants + re-ceremony detection
      trust_ceremony.py         # 3-step / 7-step module install ceremony
      signing.py                # Ed25519 verify; verified vs structure_verified
      publishers.py             # in-memory publisher registry (legalise, example)
      prompt_runtime.py         # SKILL.md prompt-runtime governance pipeline
      runtime.py                # dispatch_capability — native vs prompt branch
      signoff.py                # professional sign-off, hash pinning, append-only
      exports.py                # matter ZIP bundle (audit.json + integrity flags)
      lawve_import.py           # Lawve catalogue import (list + draft)
      github_import.py          # GitHub SKILL.md → manifest-v2 draft (pinned SHA)
      external_pack.py          # external export ingestion (Mike adapter)
      user_keys.py              # AES-256-GCM per-user provider key storage
      config.py                 # feature flags + defaults (firm-role gates, fallback key)
      matter_context/           # typed matter-context store (mounted, live)
    models/                     # SQLAlchemy models; matter.py is central
    modules/                    # native modules: assistant, chronology, anonymisation, document_edit
    tools/                      # doctor (stack inspection), bootstrap_admin
  contrib/state_machine/        # DORMANT, unmounted — see §6
  alembic/versions/             # 35 migrations; 0030 = audit hash chain, 0014 = advice WORM

frontend/src/
  matter/MatterDetail.tsx       # matter shell; tabs/ holds AssistantTab etc.
  matter/SignOff.tsx            # sign-off page
  matter/ReconstructionView.tsx # /matters/{slug}/audit activity + reconstruction view
  modules-v2/                   # LIVE skills/modules UI (modules/ is dormant)
  router/index.tsx              # TanStack path-based router
  landing/ demo/ auth/ admin/   # public surface, guided demo, auth, admin

infra/
  docker-compose.yml            # local stack
  postgres-roles.sql            # WORM role split (app role loses UPDATE/DELETE on audit)
  verify-worm-role-split.sh     # CI assertion that the app role cannot mutate audit rows

schemas/                        # JSON schemas: matter, document, module(.v2), audit-entry
docs/                           # ARCHITECTURE, TRUST, THREAT_MODEL, EVALUATING, ROADMAP, ATTRIBUTIONS
examples/modules/               # reference modules: Contract Review, Pre-Motion (not installed)
```

---

## 6. Honest gaps — not live today

Named so an agent (or reviewer) is never misled:

- **State-machine primitive — dormant, unmounted.** Parked in
  `backend/contrib/state_machine/`, not mounted in `app.main`; the
  `app/core/state_machine/` package is empty. The `StateMachine*` tables remain
  (audit reconstruction reads them). Revival is the v0.2 output-lifecycle item.
- **Per-entry audit signing (Ed25519 on audit rows) — deferred.** Specced and
  costed, not built. The hash chain carries the eval today.
- **External / Rekor anchoring — not built.** The chain detects rewrites only
  while its triggers are intact.
- **Manifest `verified` (cryptographic) tier — implemented but unkeyed.** No live
  publisher has a registered key, so manifests reach `structure_verified`.
- **Firm-role gates — dormant by default** (`LEGALISE_FIRM_ROLE_GATES_ENABLED=false`).
  Tier *structure* enforced; *role* requirement not.
- **WORM role split — in CI, not yet on the hosted deployment.** The trigger +
  hash chain are live; the DB role split (app role loses UPDATE/DELETE by grant)
  is provisioned and asserted on every CI build but turning it on for the hosted
  stack is an operational switch.
- **Retention is recorded, not enforced.** Matters have `retention_until`;
  nothing sweeps and deletes.
- **Application-layer encryption of stored prompts/responses — not implemented.**
  Relies on Neon/Fly/R2 at-rest defaults. Only per-user provider keys get
  app-layer AES-256-GCM.
- **One deployment = one workspace.** No multi-tenant/org model. Teams that need
  separation run one deployment each.
- **Lawve catalogue install — draft only.** Listing + draft generation live; the
  signed end-to-end install is v0.2.
- **Durable long-running jobs.** A long Pre-Motion run holds the HTTP/SSE
  connection; an `arq`+Redis job table exists but broad durable-job coverage is
  later.
- **No certifications.** No SOC 2, ISO 27001, or Cyber Essentials. DPIA owed.

---

## 7. Trust boundaries & data flow

```
solicitor ──▶ Legalise frontend (browser)
                │  HTTPS
                ▼
              Legalise backend (Fly.io, lhr — London)
                │
                ├─▶ Postgres (Neon, London)        ── matter rows, audit rows, users
                ├─▶ Cloudflare R2 (EU)              ── document blobs
                ├─▶ Model gateway  (THE single egress)
                │     ├─ A_cleared / B_mixed
                │     │     ├─▶ Anthropic API (US, no-training terms)
                │     │     ├─▶ OpenAI API   (US, no-training terms)
                │     │     └─▶ Local Ollama (in-tenant, never leaves)
                │     └─ C_paused                   ── no LLM call possible
                └─▶ matter filesystem (Fly volume)  ── matter.md, history.md, chronology.md
```

**No customer data flows anywhere not on this diagram.** No analytics provider,
no error-tracking SaaS that ingests prompts, no third-party flag service that
sees matter content.

**Sub-processors (honest framing):** Anthropic, OpenAI, and Cloudflare are
US-headquartered. Anthropic + OpenAI contractually commit to no training on
customer data via the commercial APIs used. R2 placement is EU (Western Europe),
not UK-specific. Backend + database are UK-region. The project does **not** claim
"UK data residency end-to-end" because it is not literally true.

---

## 8. Running it locally

```bash
git clone https://github.com/b1rdmania/legalise
cd legalise
./scripts/quickstart.sh                 # copies .env, starts the compose stack
# or: LEGALISE_USE_PREBUILT_IMAGES=true ./scripts/quickstart.sh  (skip local builds)
```

Then open <http://localhost:3000> and sign up. In local dev the first user is
verified, seeded with Khan v Acme, and promoted to workspace admin automatically.
Run the loop: open Khan v Acme → Chat → **Skills → Add skill** to inspect a Lawve
skill, convert it to a governed draft, run the trust ceremony, enable it on the
matter, run it from chat.

Health check: `docker compose -f infra/docker-compose.yml exec backend python -m app.tools.doctor`
(verifies DB reachable, migrations current, MinIO responding, plugins mounted, v2
manifests valid). End-to-end: `./scripts/smoke.sh` (runs the same Playwright
first-run spec as CI; truncates the local DB).

**Hosted:** [legalise.dev](https://legalise.dev) hosts a guided demo + the
architecture write-up. Hosted sign-up is closed; the backend is request-only and
paused. To run the full workspace, fork and run it locally.

---

## 9. Key feature flags

| Flag | Default | Effect |
| --- | --- | --- |
| `LEGALISE_FIRM_ROLE_GATES_ENABLED` | `false` | When true, posture/advice gates enforce solicitor/admin roles |
| `LEGALISE_ALLOW_SERVER_KEY_FALLBACK` | `false` | Dev-only server model key; never in prod |
| `SIGNOFF_AUTHOR_MUST_DIFFER` | `false` | Four-eyes: author cannot sign own work (can still reject) |
| `LEGALISE_DEV_AUTO_ADMIN_FIRST_USER` | `true` (local) | First registered user → workspace admin |
| `LEGALISE_USE_PREBUILT_IMAGES` | `false` | Pull published GHCR images instead of building |
| `LEGALISE_KEY_ENCRYPTION_SECRET` | — | 32-byte hex master key for per-user AES-256-GCM key storage |

---

## 10. The standing caveat

Not legal advice, not a law firm, not for live client matters. Real regulated use
needs the firm's own supervision, policies, model-key posture, and professional
controls. Forks are independent deployments, not operated, reviewed, or endorsed
by the maintainer unless stated. Maintainer: [@b1rdmania](https://github.com/b1rdmania).

---

*This file is a point-in-time synthesis for agent context. The canonical,
code-cited sources are `docs/ARCHITECTURE.md` (how it works, cited to file:line),
`docs/TRUST.md` (privilege architecture, sub-processors, gaps — read first), and
`docs/THREAT_MODEL.md` (adversary model). When in doubt, the code wins.*
