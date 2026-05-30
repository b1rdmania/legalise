# Roadmap

What ships now, what's locked for live-matter readiness, what's parked for later. Honest about deferrals.

## Current: evaluation release candidate

Open-source UK legal AI workspace, regulator-shaped, hosted as a limited
evaluation environment. Legalise is open source; legalise.dev is a runnable
evaluation copy. The hosted site is not for live client matters.

Shipped surfaces:

- **Matter-first workspace**, four-tab compression: Matter desk, Documents,
  Actions, Activity Trail.
- **Documents** as first-class records: ingress, extraction, versions,
  optional anonymisation (Presidio detection + deterministic token map +
  detokenise round-trip), original-file retrieval through an owner-only
  backend proxy, `document.original.accessed` audit row on access.
- **Capability runtime.** Manifests declare what a module needs; the
  workspace grants it on a matter; the runtime checks at every privileged
  boundary. Denied attempts emit structured 403 + canonical `*.blocked`
  audit row via the `audit_failure` helper.
- **Privilege-aware model gateway** (Anthropic / OpenAI / Ollama) with
  advice-boundary and posture gates before every call.
- **BYO model keys**, AES-256-GCM-encrypted per user. Legalise itself does
  not provide model access.
- **Two module runtimes:** first-party native modules (`examples.contract-review`,
  `examples.pre-motion`), and a `prompt` runtime for Lawve `SKILL.md` imports.
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
- **Module catalogue + install ceremony** with declared/granted capabilities,
  per-skill trust posture, `module.json` schema validation, public submission
  flow that opens a draft PR against `claude-for-uk-legal`.
- **fastapi-users cookie sessions** + email verification.
- Smoke evals + real-DB E2E coverage across auth, chronology, modules,
  matters, documents, audit, letters, workspace skills, capabilities,
  sign-offs, reviews, export.

## Live-matter readiness: locked direction

Theme: serious backend substrate before broader public launch pressure.

The direction is fixed. Feature work should pause until these backend
foundations are either shipped or explicitly deferred by reviewer sign-off:

- **Real object storage.** Uploaded binaries and generated artefacts move
  to an S3-compatible storage abstraction. Local compose uses MinIO; hosted
  production uses Cloudflare R2. Fly filesystem becomes cache and matter
  materialisation only, never source of truth.
- **Job runner: `arq` + Redis + `jobs` table as source of truth.** No
  re-debate of Dramatiq / RQ. Long-running module runs move off
  router-local `asyncio.create_task` onto the job runner. Redis carries
  queue metadata; Postgres stores job state and result pointers.
- **Migration discipline.** Production app boot should not mutate schema.
  Migrations move to a deploy/release step. The app should fail fast if
  schema is behind.
- **Hosted evaluation limits.** legalise.dev gets generous free evaluation
  limits: matters, documents, total storage, daily workflow runs, active
  jobs, generated artefacts, and public module submissions. Self-hosting
  removes hosted limits.
- **Matter export / delete.** Export a matter with documents, generated
  artefacts, audit, and redaction mode. Delete/archive is owner-scoped,
  refuses while jobs run, and records audit/retention consequences.
- **Audit WORM groundwork.** Move toward DB-enforced append-only audit:
  split migration/app roles, revoke update/delete on `audit_entries` for
  the app role, and add trigger guard where practical.
- **Key rotation runbook.** CLI and operator guide for rotating
  `LEGALISE_KEY_ENCRYPTION_SECRET` across encrypted `user_api_keys`.
- **Observability with scrubbing.** Error and job telemetry without prompts,
  responses, or document text.
- **Chronology-write capability wiring.** v0.1 enforces capabilities at five boundaries (plugin bridge, model gateway, tool invocation, document body read, citation writes). The chronology-mutation boundary is unwired because no module-driven chronology write endpoint exists yet. v0.2 lands that endpoint and gates it on `chronology.write` via the same `plugin` + `skill` query-param pattern.
- **Provider-native structured output and tool calling.** v0.1 uses
  `backend/app/core/structured_output.py::parse_model_json` as an
  internal helper. v0.2 moves the gateway to provider-native schemas
  where available, with a fallback to the helper. Interacts with
  posture-aware provider selection. Not rushed.
- **`audit_actions.py` constants module.** Required. The audit action
  taxonomy moves from stringly-typed call sites to constants imported
  from `backend/app/core/audit_actions.py`.
- **Docx templates for Pre-Motion and Contract Review.** v0.1 ships
  LBA only. v0.2 brings the other two solicitor-facing artefacts onto
  templates.
- **`sse-starlette` swap.** Bespoke SSE frames replace with library
  inside the job-runner work.
- **Multi-instance Redis-backed rate limiter** for the submission flow.
  Current code uses an in-memory token bucket (single Fly instance is sufficient for evaluation).
- **GitHub App for the submission flow.** v0.1 uses a `b1rdmania`-scoped
  PAT. v0.2 replaces with an auto-rotating installation token.
- **Assistant prompt hardening.** v0.1 ships a conservative built-in
  system prompt. v0.2 can add prompt versioning, richer source selection,
  and provider-native structured responses.
- **Shared module discovery helper.** The Modules page and Assistant both
  discover installed skills. v0.1 accepts the duplication; v0.2 centralises
  discovery behind one helper before capability enforcement lands.

Other work already on the roadmap:

- Enterprise SSO via WorkOS or Stytch (Microsoft 365, Google Workspace, SAML, SCIM)
- MCP-based plugin bridge replacing direct skill rendering
- Vector search over matter documents (pgvector + ingest pipeline)
- Real audit-log export with hash chain; WORM enforcement on `audit_entries`
- Status page at `status.legalise.dev`
- Cyber Essentials Plus certification target
- DPIA summary published as a public artefact
- Anthropic / OpenAI UK addenda signed and referenced from the processor list
- CPR 31.22 gate coverage extended beyond chronology (Pre-Motion inputs, letter drafts, plugin invocations)
- Audit-tab UI filter by `module` column (or Phase E polish, whichever lands first)

## v0.3+

Theme: signed identity, submission infrastructure, and portability.

- **Matter export / import.** Two explicit modes on the wire:
  `full_internal` (full audit + payloads + bodies; same-posture guard)
  and `shareable` (privilege-aware redaction matrix; audit payloads
  stripped, hashes retained; disclosed-document bodies replaced with
  placeholders; `cpr_31_22_locked` flags preserved). Deferred from v0.1
  because at v0.1 there's no real second user or second matter to
  pressure-test the wire format against.
- **Signed module manifests.** Manifest signatures (minisign or
  sigstore over the SKILL.md + manifest). Firms allow skills signed
  by `b1rdmania` or by their own internal signer. Today provenance is
  the git SHA you pinned; v0.3 adds cryptographic identity.
- **GitHub-App-based submission flow** with installation tokens scoped
  per submitting firm.
- **Additional modules:** discrimination quantum (Vento bands),
  settlement-agreement review as a workspace module, contract-review
  redlined `.docx` output, interim relief / freezing-order drafting,
  possession claims (PD 55), pension-loss calculator, ET1 forms PDF
  generation.
- **Disclosure list** as a workspace module with TAR / predictive coding
  flags.

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
