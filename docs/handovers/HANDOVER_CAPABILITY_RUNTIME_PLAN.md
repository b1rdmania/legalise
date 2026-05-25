# Handover — Capability Runtime Rewrite Plan

**From:** Andy + Claude (planning conversation, 2026-05-25)
**To:** Reviewer
**Status:** Plan drafted, awaiting Reviewer acknowledgement + Phase 0 execution
**Date:** 2026-05-25

---

## TL;DR

Pre-launch architectural decision is locked: Legalise becomes a **supply-chain-aware capability runtime for legal work** (MCP-first, signed modules, sandboxed execution, regulator-legible audit). Full 16-phase implementation plan written at `docs/IMPLEMENTATION_PLAN_REWRITE.md`. Timing explicitly off the table per Andy's direction — first principles, best product, ship when ready. Open-source release is the gating event for the YC S26 late application.

This handover is the call to action: acknowledge the plan, resolve eight open calls, author the six Phase 0 docs. Then Phase 1 starts.

---

## What's decided (don't re-litigate)

1. **The reframe.** Legalise is no longer "app with modules." It is a supply-chain-aware capability runtime. Reference class is npm/pip/cargo (controlled execution of untrusted code against sensitive data), not WordPress plugins.

2. **Public positioning.** External line: *Any tool. Any model. Any skill. Matter-scoped, permissioned, auditable.* NOT "operating system." NOT "open-source Harvey." OS framing stays internal vocabulary only.

3. **Internal architecture (three layers):**
   - **Matter OS** — substrate (matter, documents, chronology, parties, notes, tasks, audit log, privilege posture, retention, users/roles, gates)
   - **Capability Runtime** — MCP-first host with Legalise-native primitives MCP doesn't provide (workflows, gates, audit, matter scoping, privilege posture)
   - **Extension Ecosystem** — native modules + MCP servers + first-party reference modules + community + firm-private

4. **Lexicon locked:**
   - **Module** = installable unit (one manifest, native binding or MCP server)
   - **Capability** = declared action surface inside a module (kind, scope, reads, writes, gates, model access, data movement, UI slot, audit semantics)
   - A module declares one or more capabilities

5. **Capability declarations:**
   - **Kinds:** `skill | tool | workflow | provider | gate`
   - **Scopes:** `matter | workspace | global`

6. **Supply-chain requirements (non-negotiable):**
   - Signed modules (sigstore)
   - Verified publisher registry (GitHub-based first)
   - Sandboxed execution (subprocess + seccomp/AppArmor)
   - Permission grant lifecycle (grant → revoke → re-prompt on expansion → matter-close auto-revoke)
   - Module versioning + dependency resolution (semver from day one)
   - Append-only failure semantics
   - Cost tracking on `model_access`
   - Streaming/async runtime support
   - Firm-private modules (`visibility: private`)
   - Regulator-legible audit reconstruction (nine-dimension filterable view)

7. **Trust ceremony (two modes):**
   - Verified publisher fast path (3 steps): show publisher → show permission card → enable
   - Unverified publisher full inspection (7 steps): inspect manifest → verify signature → show publisher / warning → show permissions → show data movement → show gates → explicit trust + grant

8. **First-party workflow migration discipline:**
   - **Two brutal reference ports first:** Contract Review (document/model/output) and Pre-Motion (multi-stage/audit-heavy/orchestration)
   - **Every remaining workflow** (Letters, Tabular Review, Case Law, Anonymisation, Chronology, Document Edit) needs a concrete `MIGRATION.md`. If you can't fill the template, the runtime abstraction is incomplete.

9. **Launch connector proof set (small, not sprawl):**
   - Companies House (UK official, free API)
   - legislation.gov.uk (UK official, free API)
   - One document reader (pick below)
   - Provider modules: Anthropic + OpenAI + Ollama (wrap existing `backend/app/providers/*` as `kind: provider`)
   - Wider connector slate is public roadmap (`docs/CONNECTORS.md` in Phase 15), built by community + later partnership tracks

10. **Kramer v AI = reference module, not side prototype.** Lawhive hackathon (30 May 2026) ships it as `examples/modules/reference/kramer-v-divorce/` exercising dual-party flow, Nash settlement bands, emotional-discovery gates, provider plurality, streaming.

11. **Developer OKR:** time-to-first-audit-row <5 minutes. Clone → run → install module → execute on Khan → see audit row.

---

## What Reviewer needs to do

### 1. Acknowledge the plan shape

Read `docs/IMPLEMENTATION_PLAN_REWRITE.md` (16 phases, sequencing, what's in / what's deferred). Yes / no / adjust.

### 2. Resolve 5 locked-but-not-formally-confirmed architectural calls

Andy's leanings noted; Reviewer to ratify or override:

| Call | Andy's leaning |
|------|----------------|
| Sandbox tech | subprocess + seccomp/AppArmor first; WASM later for compilable targets |
| Signing scheme | sigstore (not custom PKI, not raw GPG) |
| Publisher registry | GitHub-based first (verified-publisher = verified GitHub org); central registry later if scale demands |
| Audit storage | Postgres append-only table first; separate event-log service later if scale demands |
| Update mechanics | always re-prompt on permission expansion; manual updates at first (no auto-update) |

### 3. Resolve 3 new calls surfaced by the plan

- **Document reader pick** (Phase 10): Google Document AI vs AWS Textract vs Azure Document Intelligence. Local pdfplumber stays as fallback.
- **Practice management connector** for first community bidirectional demo (deferred to roadmap, but pick the target): Clio vs LEAP.
- **Frontend state pattern for plug-points** (Phase 11): extend existing React patterns or introduce new context/store for module-rendered slots?

### 4. Author the 6 Phase 0 docs in `docs/architecture/`

- `MANIFEST_V2_SCHEMA.md` — full capability declaration grammar
- `TRUST_CEREMONY.md` — verified vs unverified flows, state machine
- `SANDBOX_STRATEGY.md` — subprocess + seccomp/AppArmor profiles, future WASM path
- `SIGNING.md` — sigstore integration, publisher verification, key management
- `AUDIT_RECONSTRUCTION.md` — nine-dimension filter design, storage strategy
- `MIGRATION_TEMPLATE.md` — canonical `MIGRATION.md` template (skeleton already in the plan; this is the canonical home)

Once acknowledged + resolved + authored, **Phase 1 (manifest v2 + capability registry) starts.**

---

## Non-negotiables (still hold)

From `legalise-deploy.md` + production posture:
- No server-paid model keys in prod (BYO keys flow via `core/user_keys.py` stays)
- Redis never holds matter content
- Fly fs not source of truth
- Plugin pin is single-source in `backend/Dockerfile` (not also in `fly.toml`)
- Brand mark + wordmark stay ink (seal is state-bearing only)

New ones from this architecture decision:
- Trust ceremony is non-skippable; `legalise module add github.com/org/x` NEVER implies "download and run"
- No MCP server gets ambient filesystem or network access; everything via host bridge
- Capability scope enforcement at runtime, not just declarative
- Append-only audit; nothing disappears from audit even on failure
- Public copy frozen during the rewrite (no premature launch claims about runtime that doesn't exist yet)

---

## What this plan deliberately does NOT include

- Full module marketplace (post-launch)
- Hosted module submission flow (post-launch; manual PR to first-party `awesome-legal-skills`-style repo until then)
- Module monetisation (post-launch)
- Provider marketplace (post-launch)
- WASM sandbox (post-launch; subprocess + seccomp is V1)
- Automatic module updates (manual only; prompt on permission expansion)
- LexisNexis / Westlaw / Practical Law connectors (Tier 3, partnership-track, parallel to main build but not blocking launch)
- Multi-firm SaaS orchestration (post-launch; firms self-host or use hosted-eval at `legalise.dev`)
- Schema evolution + migration tooling for matter model (post-launch; freeze matter schema for V1)

---

## Context Reviewer should know before reading the plan

This decision sits on top of:

- **Hosted-eval live since 2026-05-23** at `https://legalise.dev` (Cloudflare Pages) + `https://api.legalise.dev` (Fly lhr). Substrate hardening track CLOSED at `63415d6` after 3 reviewer rounds. Head `5322e70` on master. Brand seal + signature Lottie + Warp 6-card grid landed.

- **Launch state:** soft X post shipped 22 May. Full LinkedIn thesis deferred from w/c 2 June 2026 — will slip with this rewrite. New draft will incorporate the supply-chain framing.

- **YC S26 late application planned** but gated on open-source release. Memory at `~/.claude/projects/-Users-andy/memory/yc-application-legalise.md` for context. Reframe makes the application narrative materially stronger ("governance layer for legal AI" is sharper than any W26 NewMod positioning).

- **Andy is the canonical product authority. Reviewer is the canonical architectural + execution authority** (per memory). This handover hands architecture + execution to Reviewer.

---

## Cross-references

- **Plan:** `docs/IMPLEMENTATION_PLAN_REWRITE.md` (this repo, this commit)
- **Architecture decision memory:** `~/.claude/projects/-Users-andy/memory/legalise-architecture-rewrite.md`
- **YC application context:** `~/.claude/projects/-Users-andy/memory/yc-application-legalise.md`
- **Launch state:** `~/.claude/projects/-Users-andy/memory/legalise-launch-state.md`
- **Deploy doctrine:** `~/.claude/projects/-Users-andy/memory/legalise-deploy.md`
- **Previous handovers:**
  - `docs/handovers/HANDOVER_R2_HARDENING_DONE.md`
  - `docs/handovers/HANDOVER_HOSTED_PROD_LIVE.md`
  - `docs/handovers/PRE_FLIGHT.md`

---

## Next action

Reviewer reads the plan. Reviewer acknowledges or adjusts. Reviewer resolves the eight open calls. Reviewer authors the six Phase 0 docs. Phase 1 starts.

If Reviewer wants Andy in the loop on any of the eight open calls before resolving, ping. Otherwise proceed.
