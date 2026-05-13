# Roadmap

## v0.1 (May 2026) — demo launch

One coherent sample-matter workflow, demo positioning, live at `legalise.dev`. v0.1 proves the matter spine, audit log, privilege posture, local/cloud model routing, Pre-Motion hero workflow, and one `claude-for-uk-legal` plugin invocation through the CPR-letter bridge. Chronology and contract review are visible roadmap surfaces, not end-to-end v0.1 commitments. Detailed in `BUILD_PLAN.md` and `SCOPE.md`.

## v0.2 (target: July 2026)

Theme: **production-shaped infrastructure**. The workspace stays demo but the foundation hardens.

- Real auth via WorkOS or Stytch (Microsoft 365 SSO, SAML, audit logs)
- MCP-based plugin bridge replacing direct skill rendering
- Background job worker (Celery or RQ proper)
- Observability stack (Sentry for errors, OpenTelemetry traces, structured logs)
- Vector search over matter documents (pgvector + ingest pipeline)
- Real audit-log export with hash chain
- Live chronology extraction, SoF variant generation, and chronology diff view
- Contract review pipeline with markdown output and staged agent status
- CI/CD via GitHub Actions: lint, type-check, test, deploy preview per PR
- E-signature integration stub (DocuSign API surface)
- Settings UI for matter retention policies
- Hardened privilege gates: refuse to start an LLM call if posture/data combination is invalid

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
