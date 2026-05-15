# Roadmap

## What's open source forever

The matter spine, audit log, privilege posture, module SDK, all v0.1 modules, the plugin bridge — Apache 2.0 in perpetuity. Self-host without limits. Fork without limits. Run any models, any storage, any deploy target. No core functionality is gated behind a commercial tier.

## What may become enterprise tier later

Items that require commercial economics to maintain at scale, all clearly distinct from the OSS core. None of these gate v0.1 functionality.

- Hosted multi-tenant SaaS for firms that want managed operations.
- E-signature, e-billing, and case-management connector contracts (DocuSign, Xero, Clio, LEAP, ActionStep).
- Compliance certifications (SOC 2 Type II, ISO 27001, Cyber Essentials Plus).
- Dedicated support, SLAs, and incident response.
- Custom firm-specific module development services.
- Hash-chain audit export with off-site immutable timestamping.
- White-label deployment for legal-tech vendors building on Legalise.

The OSS core is never gated. Enterprise tier exists for firms who want managed operations, not for paywalling functionality. Pattern reference: QuestDB.

---

## v0.1 (May 2026) — demo launch

One coherent sample-matter workflow, demo positioning, live at `legalise.dev`. v0.1 proves the matter spine, audit log, privilege posture, local/cloud model routing, Pre-Motion as the canonical demonstration of bespoke orchestration, one `claude-for-uk-legal` plugin invocation through the Letters bridge, and the auth surface: fastapi-users cookie sessions + email verification + per-user encrypted provider keys + signup-time Khan auto-seed. Chronology and contract review are visible roadmap surfaces, not end-to-end v0.1 commitments. Detailed in `BUILD_PLAN.md`, `SCOPE.md`, `HANDOVER_AUTH.md`, and `docs/AUTH.md`.

## v0.2 (target: July 2026)

Theme: **production-shaped infrastructure** + **trust posture published**. The workspace stays demo-class but the foundation hardens and the regulatory story becomes a first-class product surface.

- **Enterprise SSO** via WorkOS or Stytch (Microsoft 365, Google Workspace, SAML, SCIM provisioning, org-level audit). v0.1's direct fastapi-users signup remains for sole practitioners; enterprise tenants land through SSO.
- **Multi-provider model gateway**: Gemini provider alongside Anthropic + OpenAI, per-user defaults, model id allowlist per workspace.
- MCP-based plugin bridge replacing direct skill rendering
- Background job worker (Celery or RQ proper)
- Observability stack (Sentry for errors, OpenTelemetry traces, structured logs) — scoped to operational telemetry, no prompts/responses
- Vector search over matter documents (pgvector + ingest pipeline)
- Real audit-log export with hash chain; WORM enforcement (Postgres grants revoke UPDATE/DELETE on `audit_entries`)
- Live chronology extraction, SoF variant generation, and chronology diff view
- Contract review pipeline with markdown output and staged agent status
- CI/CD via GitHub Actions: lint, type-check, test, deploy preview per PR
- E-signature integration stub (DocuSign API surface)
- Settings UI for matter retention policies — and an actual retention sweep enforcing `retention_until`
- Hardened privilege gates: refuse to start an LLM call if posture/data combination is invalid

### Module lifecycle workstream (v0.2)

v0.1 ships Discovery (read-only `#/modules` over `PLUGINS_ROOT`) and documents Install/approval as a Git workflow (fork, PR-review, pin SHA). The lifecycle gaps listed in the README's "What v0.1 does not yet do" block are picked up here:

- **Install / enable toggles per workspace.** Skills under `PLUGINS_ROOT` are loadable today; v0.2 adds a per-workspace `enabled_skills` table and an enable/disable control on the `#/modules` page. The Git workflow stays the source of truth for *which* skills exist; this layer controls *which of those are surfaced*.
- **Per-workspace module policy.** Allowlists by `matter_type`, jurisdiction tag, or privilege posture. The catalogue declares what a skill targets; the workspace policy declares what's allowed. Both written; matter-time enforcement reads the intersection.
- **Module permissions.** SDK-level scoping — a module declares what it reads (matter, documents, audit) and writes (audit only, never directly to matter state). Today modules get the full `app.core.api` surface; v0.2 narrows to declared scope and refuses out-of-scope calls at the SDK boundary.
- **UI contracts for modules.** Manifest extensions that constrain markup (no `<script>`, no external network), theme tokens (Oxide only), and layout primitives. v0.2 ships a `modules/host` boundary component that enforces these at render time. A hostile or sloppy module can't escape the workspace shell.
- **Signed manifests / skill provenance attestation.** Manifest signatures (e.g. minisign or sigstore over the SKILL.md + manifest) so a firm can pin not just "this SHA in this repo" but "this skill signed by this author". Organisation-level trust roots — a firm allows skills signed by `b1rdmania` *or* its own internal signer. Today provenance is "the git SHA you pinned"; v0.2 adds cryptographic identity.

These five are the half of the README "What v0.1 does not yet do" list that isn't lint / retention / signed-audit-export — those three are picked up elsewhere in this v0.2 section. (Auth itself moved to v0.1.)

### Trust & security workstream (v0.2)

The single biggest credibility lever after the workflow modules. See `docs/TRUST.md` for the v0.1 source of truth — the v0.2 work makes it real:

- **Publish `legalise.dev/trust`** rendered from `docs/TRUST.md`. Live data flow diagram, current processor list, current gaps, change log.
- **DPIA summary** as a public artefact, linked from /trust.
- **Vulnerability disclosure** via `security@legalise.dev` + GitHub Security Advisories. 90-day responsible disclosure.
- **Status page** at `status.legalise.dev` (instatus.com or equivalent) — uptime, incident history.
- **Cyber Essentials Plus** certification target — the realistic UK floor for firm procurement. Vanta or equivalent to manage controls.
- **ISO 27001** opened as a target for v0.3 if revenue justifies the audit cost.
- **Anthropic / OpenAI UK addenda** signed and referenced from the processor list.
- **CPR 31.22 gate coverage extended** beyond the chronology surface — any place disclosed material flows (Pre-Motion inputs, letter drafts, plugin invocations) must respect the same access boundary.
- **Application-layer encryption** evaluation for stored prompts/responses (likely AES-GCM with a Fly Secrets-managed key).

## v0.3 (target: September 2026)

Theme: **additional modules**. The workspace breadth grows.

- Discrimination quantum analysis module (Vento bands, injury-to-feelings calibration)
- Settlement agreement review as a workspace module (currently plugin-only)
- Contract review redlined .docx output
- Interim relief / freezing-order drafting
- Possession claims (PD 55)
- Pension-loss calculator integrating Tribunals' simplified-approach tables
- ET1 forms PDF generation (court-form rendering)
- Disclosure list as a workspace module with TAR / predictive coding flags
- Time-recording + matter-cost tracking (basic, no e-billing)

## v0.4 (target: November 2026)

Theme: **additional verticals**. New plugins + workspace surfaces.

- `uk-property-legal` plugin and module (conveyancing, lease review, Land Registry integration)
- `uk-corporate-legal` plugin and module (Companies Act compliance, share issuance, directors' duties)
- `uk-privacy-legal` plugin and module (DPA / UK GDPR, DPIA, ICO interactions)
- Multi-vertical matter support (a corporate transaction matter draws on corporate + property + employment plugins)

## v0.5+ (2027 horizon)

Theme: **practice-ready**. The workspace becomes something a regulated ABS could actually use.

- Multi-tenant isolation
- Client portal (read-only, scoped to specific matters)
- Conflict checks at matter intake (cross-matter party search)
- Time recording integrated with e-billing (Xero, Clio, LEAP API)
- Document management with retention enforcement
- E-disclosure platform connectors (Relativity, Everlaw, DISCO)
- Court-form filing integration where APIs exist (CE-File, ET Portal)
- SOC 2 Type II / ISO 27001 controls
- Encryption-at-rest with customer-managed keys

## Strategic alignment

The roadmap is sequenced to support the broader project trajectory:

- **v0.1–v0.2** generate visibility and developer engagement. The workspace as calling card.
- **v0.3–v0.4** expand the legal substance. The workspace as a credibility prop for solicitor co-founder conversations.
- **v0.5+** turn the workspace from demo to production. Aligned with ABS / Bird Legal regulatory launch (separately tracked).

## What stays out of the roadmap

Permanently:

- US, Scotland, NI jurisdictions (separate projects, not this codebase)
- Criminal procedure
- Family procedure
- Generative court-form filing without human review
- Replacing solicitor sign-off

## How the roadmap can shift

Three things can move items between versions:

1. **Solicitor inbound with specific need.** If a real solicitor wants module X for matter Y, X gets pulled forward.
2. **Funded co-founder situation.** If Bird Legal ABS gets set up faster than expected, v0.5+ items move forward.
3. **Anthropic / Stella roadmap movement.** If `claude-for-legal` adds a US analog that the UK side should mirror, that mirroring moves forward.

Quarterly review of the roadmap. Updates go to the README.

## Anti-roadmap

Things people will ask for that should be politely declined:

- "Can it write the brief for me?" — no, drafts only, solicitor signs.
- "Can it advise my client directly?" — no, regulated activity, requires SRA-authorised entity.
- "Can it integrate with [proprietary platform with no public API]?" — no, unless API exists.
- "Can it run on my Windows server?" — Docker Compose only in v0.1; Windows support is a v0.5+ topic.
- "Can it work without internet?" — local-model toggle works for inference, but document conversion and most workflows assume Postgres + MinIO running.
