# Regulatory Plumbing

What the workspace builds in v1 to demonstrate UK regulatory awareness, and what it does not.

## Why this exists

A solicitor evaluating an AI workspace asks two questions:

1. Does this person understand the regulatory environment I work in?
2. Has the workspace been designed with that environment in mind, or bolted on later?

A legal-tech demo without regulatory plumbing answers both questions the wrong way. A demo *with* regulatory plumbing — even at demo grade — answers them the right way and creates the credibility prop the broader project needs.

The plumbing in v1 is demonstrative, not certified. It is the shape of what production would look like. It is not, on its own, sufficient for SRA inspection.

## The eight pieces of plumbing in v1

### 1. Audit log

**What it is.** Every matter mutation, document interaction, and LLM call creates an `AuditEntry` row with: actor, matter, action, resource type/id, prompt hash, response hash, model used, token count, latency, timestamp.

**Why it matters.** SRA inspections and client complaints both require the firm to reconstruct what happened. Audit logs are how. Cloud-based AI work that doesn't produce its own audit trail forces firms to rely on the provider's logs — bad for inspection, worse for privilege.

**v1 implementation.** Postgres table + middleware on every FastAPI route + hook in `model_gateway`. Exposed as a matter tab in the UI. Exportable as CSV / JSONL.

**Not in v1.** Hash chain (each entry hashing the previous), tamper evidence, off-site immutable storage. These come in v0.2.

### 2. Privilege posture

**What it is.** Each matter has a `privilege_posture` field with three states:

- A — cleared (all sources counsel-screened, cloud models OK)
- B — mixed or unscreened (default; entries get privilege flags; local models recommended for sensitive matters)
- C — paused (refuse extraction and LLM calls until counsel posture is set)

The posture flows through the chronology and contract review modules and influences the model gateway's default routing.

**Why it matters.** Legal advice privilege, litigation privilege, common-interest privilege, and joint-defence privilege are real and waivable. Extracting privileged content into AI-assisted outputs that get shared can risk waiver depending on what's distributed and to whom. A workspace that treats privilege as a property rather than an afterthought makes the waiver analysis tractable.

**v1 implementation.** Matter form has the posture selector. Each module's behaviour is documented in `docs/ARCHITECTURE.md` §4. Posture changes create audit entries.

**Not in v1.** Refusal to start an LLM call where posture/data combination is invalid (currently a soft warning). Hardened in v0.2.

### 3. CPR 31.22 implied undertaking gate

**What it is.** Documents in English & Welsh civil proceedings are subject to the implied undertaking: documents obtained through disclosure may only be used for the proceedings in which they were disclosed (with three exceptions: read in open court, court permission, or party consent). Misuse is contempt.

The workspace captures whether a document came from disclosure (and which proceedings) on upload. The chronology module refuses to extract from documents flagged `from_disclosure=true` unless the matter slug matches the proceedings reference.

**Why it matters.** It is the most-violated UK procedural rule in litigation AI work. A US-trained system has no concept of it. A UK-aware system enforces it.

**v1 implementation.** Document upload form has the `from_disclosure` checkbox + proceedings-ref text field. Chronology module checks the flag and either proceeds, warns, or refuses based on matter context.

**Not in v1.** Document-level redaction tied to use restrictions. Cross-matter conflicts checks. v0.2.

### 4. Local model toggle

**What it is.** Each matter has a `default_model_id` that can point at Anthropic, OpenAI, or a local Ollama model. The model gateway respects the choice. The UI shows a "running locally — no cloud egress" badge when a matter is set to local.

**Why it matters.** Some matters cannot tolerate cloud LLM use. Highly privileged communications, M&A diligence in regulated industries, matters with foreign data-protection constraints (EU GDPR, Swiss FADP, etc.), or matters involving the regulator itself. The workspace must have a local-model option or it cannot be used for those matters at all.

**v1 implementation.** Ollama in the Docker Compose stack (not in the live demo deployment). Sample matter pre-configured to local mode so visitors see the badge.

**Not in v1.** Hardware acceleration tuning. Custom fine-tuned local models. v0.5+.

### 5. UK data residency

**What it is.** Live demo runs with the backend on Fly.io `lhr` (London, UK) and the database on Neon London. Frontend on Cloudflare Pages and storage on Cloudflare R2 with jurisdiction `eu` and location hint `WEUR`. README documents the deployment region honestly: UK-region database and backend; edge CDN and object storage at EU / Western Europe placement. Self-host instructions assume the operator chooses their own region.

**Why it matters.** UK firms generally require UK data residency for client data. EU data residency is acceptable for some firms, US is generally not.

**v1 implementation.** Hosting target documented, deploy configuration in `infra/deploy/`.

**Not in v1.** Customer-managed encryption keys, regional failover, formal data residency certification. v0.5+.

### 6. Retention policy

**What it is.** Each matter has `closed_at` and `retention_until` fields. SRA Accounts Rules require records to be kept for 6 years from the end of the matter (longer in some categories). The workspace records the policy.

**Why it matters.** Solicitors face SRA sanctions for retention failures. A workspace that records the policy on each matter makes retention enforceable.

**v1 implementation.** Fields exist on the Matter model. UI shows the retention-until date on the matter detail page.

**Not in v1.** Background job that enforces retention (deletes / archives after retention-until passes). Implementation is a v0.2 worker task; the surface exists in v1.

### 7. Document hashing on ingest

**What it is.** Every uploaded document gets a SHA-256 hash computed at upload time and stored in the `Document.sha256` field. The hash is logged in the audit trail.

**Why it matters.** Provenance. If a document is later challenged ("this isn't what we sent you") the hash can establish whether the file received matches the file received originally.

**v1 implementation.** Hash computed in the upload handler, stored alongside the storage URI.

**Not in v1.** Notary timestamping, third-party trusted hashing (Eidas-compliant). v0.5+ if needed.

### 8. Solicitor-in-the-loop framing throughout

**What it is.** Every output is labelled as a draft for solicitor review. The UI does not use language that suggests legal advice. The README, plugin descriptions, and skill outputs all frame outputs as drafts.

**Why it matters.** Section 12 of the Legal Services Act 2007 reserves certain activities (advocacy in reserved instances, conducting litigation, reserved instrument activities, probate, notarial, oaths) to authorised persons. AI workflows that suggest unreserved access to legal advice may not be reserved-activity violations, but the framing matters for both SRA position and consumer protection.

**v1 implementation.** Output templates carry the "draft for solicitor review" framing. UI uses "draft" and "preliminary" labels. Disclaimers in README and plugin descriptions.

**Not in v1.** Active enforcement (the workspace doesn't refuse to be used by non-solicitors). The framing is in language, not in access control. Real access control comes with v0.2 auth.

## What is NOT in v1 — and why

- **Real SRA compliance.** v1 is a demo. No firm should run it on live matters. The plumbing demonstrates the shape, not the substance, of compliance.
- **Real GDPR controller/processor analysis.** Documented at a conceptual level. Actual DPAs, Article 28 contracts, DPIAs are deployment work, not workspace work.
- **Real bias / fairness audit of the LLM outputs.** Evals exist but they are not bias audits.
- **Real client portal with scoped access.** Client portal is v0.5+.
- **Real conflict checking.** Cross-matter party search is v0.5+.
- **Real e-disclosure compliance for large productions.** v0.3+.

## Who this section is for

This document is a reference for:

- Reviewers stress-testing the plan: is the regulatory plumbing defensible as demo, or theatrical?
- Solicitors looking under the hood: this is what supervised autonomy looks like in the workspace.
- Contributors and operators: the list of things to harden when moving v0.2 → v0.5+.
