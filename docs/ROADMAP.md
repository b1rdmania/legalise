# Roadmap

What ships in v0.1, what's locked for v0.2, what's parked for v0.3+. Honest about deferrals.

## v0.1: current

Open-source UK legal AI workspace, regulator-shaped, demo positioning.
Live at the demo URL with Khan v Acme sample matter auto-seeded on
signup.

Shipped surfaces:

- Matter spine — slug, title, parties, documents, audit, chronology, privilege posture
- Privilege-aware model gateway (Anthropic / OpenAI / Ollama)
- Audit middleware over every model call and matter mutation
- Pre-Motion (adversarial premortem, four stages, nine model calls)
- Contract Review (parser / analyst / redliner / summariser pipeline, SSE-streamed)
- Letters (procedural `.docx` generator across all letter types in v0.1; template-driven LBA returns in v0.2)
- Anonymisation (Presidio detection + deterministic token map + detokenise round-trip)
- Tracked-changes document editing with accept / reject and version timeline
- Tabular review across multiple documents
- Public module submission flow opens a draft PR against `claude-for-uk-legal`
- Read-only installed-skills view at `#/modules` with declared capabilities + trust posture per skill
- Module enable/disable enforcement at the `(plugin, skill)` layer
- `module.json` schema validation surfaces broken manifests in the UI
- fastapi-users cookie sessions, email verification, per-user AES-256-GCM-encrypted provider keys
- Four smoke evals: audit-row contract, posture routing, redline anchor resolution, NDA parse

## v0.2: locked direction

Theme: production-shaped infrastructure and runtime enforcement.

Locked (the direction is fixed; implementation lands in v0.2):

- **TanStack Router + Query migration.** Frontend architecture
  decision is fixed. Installed deps in v0.1 stay unused-but-installed
  until the migration lands.
- **Job runner: `arq` + Redis + `jobs` table as source of truth.** No
  re-debate of Dramatiq / RQ. Long-running module runs move off
  router-local `asyncio.create_task` onto the job runner. SSE-disconnect
  during Contract Review is the v0.1 Day-15 smoke that proves the
  brittleness this work resolves.
- **Runtime per-capability enforcement.** v0.1 declares capabilities
  and schema-validates them. v0.2 makes them enforceable policy at
  every call site — the gateway checks the calling skill's declared
  capability against the action it's attempting.
- **Provider-native structured output and tool calling.** v0.1 uses
  `backend/app/core/structured_output.py::parse_model_json` as an
  internal helper. v0.2 moves the gateway to provider-native schemas
  where available, with a fallback to the helper. Interacts with
  posture-aware provider selection — not rushed.
- **`audit_actions.py` constants module.** Required. The audit action
  taxonomy moves from stringly-typed call sites to constants imported
  from `backend/app/core/audit_actions.py`.
- **Docx templates for Pre-Motion and Contract Review.** v0.1 ships
  LBA only. v0.2 brings the other two solicitor-facing artefacts onto
  templates.
- **`sse-starlette` swap.** Bespoke SSE frames replace with library
  inside the job-runner work.
- **Multi-instance Redis-backed rate limiter** for the submission flow.
  v0.1 uses in-memory token bucket (single Fly instance is sufficient).
- **GitHub App for the submission flow.** v0.1 uses a `b1rdmania`-scoped
  PAT. v0.2 replaces with an auto-rotating installation token.

Other v0.2 work that was already on the roadmap:

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

- Multi-tenant isolation
- Client portal (read-only, scoped to specific matters)
- Conflict checks at matter intake
- Time recording integrated with e-billing (Xero, Clio, LEAP)
- E-disclosure platform connectors (Relativity, Everlaw, DISCO)
- Court-form filing where APIs exist (CE-File, ET Portal)
- SOC 2 Type II / ISO 27001 controls
- Encryption-at-rest with customer-managed keys

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
