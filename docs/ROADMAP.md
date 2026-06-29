# Roadmap

What ships now, what's locked for live-matter readiness, what's parked for later. Honest about deferrals.

## Current: evaluation release candidate

Open-source UK legal AI workspace, regulator-shaped, hosted as a limited
evaluation environment. Legalise is open source; legalise.dev is a runnable
evaluation copy. The hosted site is not for live client matters.

Evaluator backend access is gated by
[`EVALUATING.md`](./EVALUATING.md): one automated
single-matter golden loop, one manual BYO-key run, and the operational
checks that must be true before serious legal users evaluate the
workspace.

Shipped surfaces:

- **Matter-first workspace** ordered around the chat-led loop: Chat, Files,
  Skills, with Activity, signed outputs, and the working pack reached from
  cards and contextual links.
- **Files** as first-class records: ingress, extraction, versions,
  optional anonymisation (Presidio detection + deterministic token map +
  detokenise round-trip), original-file retrieval through an owner-only
  backend proxy, `document.original.accessed` audit row on access.
- **Permission runtime.** Manifests declare what a skill needs; the
  workspace grants it on a matter; the runtime checks at every privileged
  boundary. Denied attempts emit structured 403 + canonical `*.blocked`
  audit row via the `audit_failure` helper.
- **Privilege-aware model gateway** (Anthropic / OpenAI / Ollama) with
  advice-boundary and posture gates before every call.
- **BYO model keys**, AES-256-GCM-encrypted per user. Legalise itself does
  not provide model access.
- **Two module runtimes:** first-party native modules (`examples.contract-review`,
  `examples.pre-motion`), and a `prompt` runtime for `SKILL.md` imports from
  the Lawve catalogue or any public GitHub repo (the generic importer at
  `backend/app/core/github_import.py`).
- **Source anchors v1** across both runtimes. Server-known anchors for every
  loaded document, independent of the model; optional `quote_found_in_source`
  flag for model-supplied quotes (normalised substring check against the
  extracted body). Cited for review, not certified.
- **Professional Sign-Off.** Author reads an AI-prepared output and records
  `signed` / `signed_with_observations` / `rejected`. Append-only history.
  Output payload pinned by hash; signature attaches to the hash.
- **Supervisor Review** as an optional separate review path (firm-mode
  second pair of eyes), does not compete with author sign-off.
- **Export Gating v1.1.** Matter export ZIP carries documents, artifacts
  with `signoff_status` + `signoff_hash_matches` integrity flag,
  `signoffs.json`, `reviews.json`, and a reconstruction timeline.
- **Audit reconstruction.** Ordered timeline merged from audit, state-machine,
  and advice-boundary sources, with decision events in the foreground lane.
- **Module catalogue + add-skill trust ceremony** with declared/granted capabilities,
  per-skill trust posture, `module.json` schema validation. Skills arrive
  only by import: the Lawve catalogue or a GitHub repo at a pinned SHA
  (the filesystem plugin path was removed 2026-06-11).
- **Signed manifests.** ed25519 manifest signatures with two honest grades:
  `verified` (cryptographic check against a registered publisher key) and
  `structure_verified` (shape-only). Publishers without a registered key
  cannot reach `verified`.
- **Hash-chained audit log** with a third-party verify endpoint
  (`GET /api/matters/{slug}/audit/chain`) that recomputes every link from
  the raw rows and reports the head plus any breaks.
- **Inline tracked changes.** AI-proposed edits render in the document
  editor as tracked changes: deletions struck, insertions marked, each
  accepted or rejected by a human.
- **Author and signer separation.** `SIGNOFF_AUTHOR_MUST_DIFFER` blocks an
  author from signing their own output (off by default so a sole
  practitioner can sign their own work).
- **Object storage.** S3-compatible storage abstraction is the default
  backend (`backend/app/core/storage.py`): MinIO in local compose,
  Cloudflare R2 hosted. Fly filesystem is cache and matter
  materialisation only, never source of truth.
- **Job runner.** arq + Redis with a `jobs` table as source of truth.
  Long-running module runs survive client disconnects and instance
  restarts; a dedicated worker process group runs alongside the HTTP app.
- **Migration discipline.** Migrations run as a deploy release step
  (`release_command = "alembic upgrade head"`), not at app boot.
- **Hosted evaluation limits.** legalise.dev enforces generous free
  evaluation limits (matters, documents, storage, daily runs, active
  jobs) with a usage endpoint. Self-hosting removes hosted limits.
- **fastapi-users cookie sessions** + email verification.
- Smoke evals + real-DB E2E coverage across auth, chronology, modules,
  matters, documents, audit, workspace skills, capabilities,
  sign-offs, reviews, export.

## Live-matter readiness: locked direction

Theme: serious backend substrate before broader public launch pressure.

The direction is fixed. The object storage, job runner, migration
discipline, and hosted-limit foundations have shipped (see Shipped
surfaces above). What remains before live-matter posture:

- **Matter export / delete.** Export a matter with documents, generated
  artefacts, audit, and redaction mode. Delete/archive is owner-scoped,
  refuses while jobs run, and records audit/retention consequences.
- **Audit WORM hardening.** The trigger guard and audit hash chain exist.
  Remaining work is operational: split migration/app roles, revoke
  update/delete on `audit_entries` for the app role, and add external
  notary/anchoring where practical.
- **Key rotation runbook.** CLI and operator guide for rotating
  `LEGALISE_KEY_ENCRYPTION_SECRET` across encrypted `user_api_keys`.
- **Observability with scrubbing.** Error and job telemetry without prompts,
  responses, or document text.
- **Chronology-write capability wiring.** Capabilities are enforced at the model gateway, tool invocation, document body read, and citation-write boundaries. The chronology-mutation boundary is unwired because no module-driven chronology write endpoint exists yet. v0.2 lands that endpoint and gates it on `chronology.write` via the same `plugin` + `skill` query-param pattern.
- **Provider-native structured output and tool calling.** v0.1 uses
  `backend/app/core/structured_output.py::parse_model_json` as an
  internal helper. v0.2 moves the gateway to provider-native schemas
  where available, with a fallback to the helper. Interacts with
  posture-aware provider selection. Not rushed.
- **`audit_actions.py` constants module.** Required. The audit action
  taxonomy moves from stringly-typed call sites to constants imported
  from `backend/app/core/audit_actions.py`.
- **`sse-starlette` swap.** Bespoke SSE frames replace with library
  inside the job-runner work.
- **Assistant prompt hardening.** v0.1 ships a conservative built-in
  system prompt. v0.2 can add prompt versioning, richer source selection,
  and provider-native structured responses.
- **Shared module discovery helper.** The Skills page and Assistant both
  discover added skills. v0.1 accepts the duplication; v0.2 centralises
  discovery behind one helper before capability enforcement lands.
- **Chronology extraction quality.** The chronology auto-build plumbing is in
  place, but extraction quality still needs a real keyed run against synthetic
  legal packs before it should be presented as product-grade.

Other work already on the roadmap:

- Enterprise SSO via WorkOS or Stytch (Microsoft 365, Google Workspace, SAML, SCIM)
- MCP-runtime skills (imported skills exposing MCP servers)
- Audit-log export bundle carrying the chain head (the hash chain and
  third-party verify endpoint shipped; the export bundle remains)
- WORM role enforcement on `audit_entries`: revoke UPDATE/DELETE for a
  dedicated app role (the trigger guard is already live)
- Status page at `status.legalise.dev`
- Cyber Essentials Plus certification target
- DPIA summary published as a public artefact
- Anthropic / OpenAI UK addenda signed and referenced from the processor list
- CPR 31.22 gate coverage extended beyond chronology (skill inputs, imported-skill invocations)
- Audit-tab UI filter by `module` column (or Phase E polish, whichever lands first)

## v0.3+

Theme: publisher trust and portability.

- **Matter export / import.** Two explicit modes on the wire:
  `full_internal` (full audit + payloads + bodies; same-posture guard)
  and `shareable` (privilege-aware redaction matrix; audit payloads
  stripped, hashes retained; disclosed-document bodies replaced with
  placeholders; `cpr_31_22_locked` flags preserved). Deferred from v0.1
  because at v0.1 there's no real second user or second matter to
  pressure-test the wire format against.
- **Publisher web of trust.** ed25519 manifest signatures shipped early
  (VERIFIED / STRUCTURE_VERIFIED grades, `backend/app/core/signing.py`).
  What remains is key distribution: firms register their own internal
  signers, publisher keys move out of the in-repo registry, and key
  rotation gets a ceremony.
- **Additional modules:** discrimination quantum (Vento bands),
  settlement-agreement review as a workspace module, contract-review
  redlined `.docx` output, interim relief / freezing-order drafting,
  possession claims (PD 55), pension-loss calculator, ET1 forms PDF
  generation.
- **Disclosure list** as a workspace module with TAR / predictive coding
  flags.
- **Review panels.** Multi-perspective skill runs should be exposed as
  named review panels, not user-facing agents.

## v0.4+: additional verticals

- `uk-property-legal` plugin and module (conveyancing, lease review, Land Registry)
- `uk-corporate-legal` plugin and module (Companies Act compliance, share issuance, directors' duties)
- `uk-privacy-legal` plugin and module (DPA / UK GDPR, DPIA, ICO interactions)
- Multi-vertical matter support

## v0.5+: practice-ready

- Named supervisor gates beyond the current Supervisor Review path: SRA
  reference where applicable, scope of approval, evidence reviewed,
  override notes, immutable audit link.
- PI / liability evidence chain. The system should help a firm show what was
  supervised, what was delegated, what was refused, and where solicitor
  judgement entered the workflow. (V1 reconstruction view + Professional
  Sign-Off are the substrate; this is the firm-facing surface on top.)
- Multi-tenant isolation
- Client portal (read-only, scoped to specific matters)
- Conflict checks at matter intake
- Time recording integrated with e-billing (Xero, Clio, LEAP)
- E-disclosure platform connectors (Relativity, Everlaw, DISCO)
- Court-form filing where APIs exist (CE-File, ET Portal)
- SOC 2 Type II / ISO 27001 controls
- Encryption-at-rest with customer-managed keys

## v0.6+: evaluation and shroud layer

- Legal-quality eval harnesses for grounding, citation integrity, refusal
  behaviour, disclosure handling, privilege posture, and module regressions.
- Hallucination controls at the product boundary: source-required answers,
  citation verification, refusal when sources are missing, and regression
  fixtures per module.
- Prompt shroud before cloud dispatch. Configurable redaction/anonymisation
  policies should remove or transform sensitive values before external model
  calls where the matter posture requires it.
- Local/cloud routing policy that is explainable to a solicitor: what must stay
  local, what may go to frontier providers, and what was actually sent.
- A public claim boundary for evals. Evals are evidence of a tested posture, not
  proof that the system gives legal advice.
- **Audit-entry signatures (Ed25519).** Deliberately out of scope for the
  evaluation launch, noted and costed. The hash-chain (migration 0030) already
  gives tamper-evidence; signing would add authenticity + independent
  verifiability (verify with the public key, no trust in our DB). ~half a day,
  reusing the existing `audit-chain-entry-v1` canonical form and the ed25519 in
  `app/core/signing.py`. Build trigger and full box tracked in a GitHub issue:
  a technical reviewer in the loop who will verify a signature themselves. Not the
  human sign-off thesis — the machine signs its record, the human signs the work.

## Chat shape: shipped

The chat-led matter shell shipped. Chat is the default landing surface
inside the matter frame, with Files, Skills, Activity, and signed outputs
alongside, and the bespoke module tabs collapsed into the generic runner.
Chat never floats outside the matter file: every conversation belongs to
one matter, one posture, one audit log. The remaining open question is
layout, not direction: a docked assistant co-visible with the document
under review (NotebookLM's Sources · Chat · Output shape) stays a
candidate refinement for the review-and-sign loop, not a committed cut.

## Permanently out of scope

- US, Scotland, NI jurisdictions (separate projects, not this codebase)
- Criminal procedure
- Family procedure
- Generative court-form filing without human review
- Replacing solicitor sign-off

## How items move

Three things shift items between versions:

1. **Solicitor inbound with a specific need.** If a real solicitor wants
   module X for matter Y, X gets pulled forward.
2. **Peer movement.** If Stella or Mike ships a surface that's load-bearing
   for cross-tool interop, the mirroring work moves forward.
3. **Regulatory movement.** Heppner-shaped rulings or SRA guidance can
   force items earlier.

Quarterly review. Updates land in this file and surface in the README
Status section.
