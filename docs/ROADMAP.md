# Roadmap

What is shipped, planned, or out of scope.

## Current: evaluation release candidate

Open-source UK legal AI workspace in evaluation release. `legalise.dev` is a
static demo and documentation site. Its hosted backend is currently off.

Shipped surfaces:

- **Matter-first workspace** around the chat-led loop: Chat, Files, Skills, with Activity, signed outputs, and the working pack alongside.
- **Files** as first-class records: ingress, extraction, versions, optional anonymisation (Presidio + deterministic token map + detokenise), owner-only original-file retrieval with a `document.original.accessed` audit row.
- **Permission runtime.** Manifests declare what a skill needs; the runtime checks at every privileged boundary. Denied attempts emit a 403 + `*.blocked` audit row.
- **Privilege-aware model gateway** (Anthropic / OpenAI / Ollama) with advice-boundary and posture gates before every call.
- **BYO model keys**, AES-256-GCM-encrypted per user. Legalise does not provide model access.
- **Two module runtimes:** first-party native modules, and a `prompt` runtime for `SKILL.md` imports from the Lawve catalogue or any public GitHub repo.
- **Source anchors v1.** Server-known anchors for every loaded document, independent of the model; optional `quote_found_in_source` flag. Cited for review, not certified.
- **Professional Sign-Off.** Author records `signed` / `signed_with_observations` / `rejected`. Append-only; output pinned by hash, signature attaches to the hash.
- **Supervisor Review** — an optional firm-mode second pair of eyes; does not compete with author sign-off.
- **Export Gating v1.1.** Export ZIP carries documents, artifacts with `signoff_status` + `signoff_hash_matches`, `signoffs.json`, `reviews.json`, and a reconstruction timeline.
- **Audit reconstruction.** Ordered timeline merged from audit, state-machine, and advice-boundary sources.
- **Module catalogue + add-skill trust ceremony** with declared/granted capabilities and `module.json` validation. Skills arrive only by import at a pinned SHA.
- **Signed manifests.** ed25519 with two grades: `verified` (cryptographic check against a registered key) and `structure_verified` (shape-only). No registered key means no `verified`.
- **Hash-chained audit log** with a third-party verify endpoint that recomputes every link and reports the head plus any breaks.
- **Inline tracked changes** — AI-proposed edits accepted or rejected by a human.
- **Author/signer separation.** `SIGNOFF_AUTHOR_MUST_DIFFER` (off by default so a sole practitioner can sign their own work).
- **Object storage.** S3-compatible: MinIO local, Cloudflare R2 hosted. Fly filesystem is cache only, never source of truth.
- **Job runner.** arq + Redis with a `jobs` table as source of truth; runs survive disconnects and restarts.
- **Migration discipline.** Migrations run as a deploy release step, not at app boot.
- **Optional deployment limits** with a usage endpoint. **fastapi-users cookie sessions** + email verification. Smoke evals + real-DB E2E coverage across the workspace.

## Live-matter readiness: locked direction

Object storage, job recovery, migration discipline, and deployment limits are
implemented. Remaining:

- **Matter export / delete.** Owner-scoped, refuses while jobs run, records audit/retention consequences.
- **Audit WORM hardening.** Trigger guard and hash chain exist; remaining is operational — split migration/app roles, revoke update/delete for the app role, add external notary/anchoring.
- **Key rotation runbook** for `LEGALISE_KEY_ENCRYPTION_SECRET`.
- **Observability with scrubbing** — telemetry without prompts, responses, or document text.
- **Chronology-write capability wiring.** Unwired today (no module-driven write endpoint yet); v0.2 lands it gated on `chronology.write`.
- **Provider-native structured output and tool calling.** v0.2 moves the gateway to provider-native schemas with a helper fallback.
- **`audit_actions.py` constants module** — move the taxonomy off stringly-typed call sites.
- **`sse-starlette` swap** for the bespoke SSE frames.
- **Assistant prompt hardening** — prompt versioning, richer source selection.
- **Shared module discovery helper** to remove Skills-page/Assistant duplication.
- **Chronology extraction quality.** Plumbing is in; needs a real keyed run against synthetic legal packs before it's product-grade.

Also roadmapped: Enterprise SSO (WorkOS/Stytch — M365, Google Workspace, SAML, SCIM); MCP-runtime skills; audit-log export bundle carrying the chain head; WORM role enforcement on `audit_entries`; `status.legalise.dev`; Cyber Essentials Plus; published DPIA summary; signed Anthropic/OpenAI UK addenda; CPR 31.22 gate beyond chronology; audit-tab filter by `module`.

## v0.3+: publisher trust and portability

- **Matter export / import.** Two wire modes: `full_internal` (full audit + payloads + bodies, same-posture guard) and `shareable` (privilege-aware redaction; audit payloads stripped, hashes retained; disclosed bodies replaced with placeholders; `cpr_31_22_locked` flags preserved). Deferred from v0.1 — no second user/matter yet to pressure-test the format.
- **Publisher web of trust.** ed25519 signatures shipped; what remains is key distribution — firms register their own signers, keys move out of the in-repo registry, rotation gets a ceremony.
- **Additional modules:** discrimination quantum (Vento bands), settlement-agreement review, redlined `.docx` contract output, freezing-order drafting, possession claims (PD 55), pension-loss calculator, ET1 PDF generation.
- **Disclosure list** module with TAR / predictive-coding flags.
- **Review panels** — multi-perspective skill runs as named panels, not user-facing agents.

## v0.4+: additional verticals

`uk-property-legal` (conveyancing, lease, Land Registry); `uk-corporate-legal` (Companies Act, share issuance, directors' duties); `uk-privacy-legal` (DPA / UK GDPR, DPIA, ICO); multi-vertical matter support.

## v0.5+: practice-ready

- Named supervisor gates: SRA reference, scope of approval, evidence reviewed, override notes, immutable audit link.
- PI / liability evidence chain: show what was supervised, delegated, refused, and where solicitor judgement entered.
- Multi-tenant isolation; read-only client portal; conflict checks at intake; e-billing time recording (Xero, Clio, LEAP); e-disclosure connectors (Relativity, Everlaw, DISCO); court-form filing where APIs exist (CE-File, ET Portal); SOC 2 Type II / ISO 27001; customer-managed encryption keys.

## v0.6+: evaluation and shroud layer

- Legal-quality eval harnesses for grounding, citation integrity, refusal, disclosure, privilege posture, and module regressions.
- Hallucination controls at the product boundary: source-required answers, citation verification, refusal when sources are missing.
- Prompt shroud before cloud dispatch — configurable redaction before external calls where posture requires.
- Local/cloud routing policy explainable to a solicitor: what stays local, what may go to frontier providers, what was actually sent.
- A public claim boundary: evals are evidence of a tested posture, not proof the system gives legal advice.
- **Audit-entry signatures (Ed25519).** Out of scope for the evaluation launch, noted and costed. The hash-chain already gives tamper-evidence; signing would add authenticity + independent verifiability. ~half a day, reusing the existing canonical form. The machine signs its record; the human signs the work.

## Chat shape: shipped

The chat-led matter shell shipped. Chat is the default landing surface, with Files, Skills, Activity, and signed outputs alongside, and bespoke module tabs collapsed into the generic runner. Chat never floats outside the matter file: every conversation belongs to one matter, one posture, one audit log. The open question is layout, not direction.

## Permanently out of scope

US / Scotland / NI jurisdictions; criminal procedure; family procedure; generative court-form filing without human review; replacing solicitor sign-off.

## How items move

1. **Solicitor inbound** with a specific need pulls a module forward.
2. **Peer movement** — a load-bearing surface from Stella or Mike moves the mirroring work forward.
3. **Regulatory movement** — Heppner-shaped rulings or SRA guidance can force items earlier.

Quarterly review. Updates land here and surface in the README Status section.
