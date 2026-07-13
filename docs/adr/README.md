# Architecture decision records

Handover documents. The sessions that made these decisions won't be available
to explain them. Each ADR states why the system is shaped the way it is and —
most importantly — what a future contributor or AI coding session must **not**
"helpfully refactor". Written for a smart engineer with zero project history;
claims verified against master as of 2026-07-05.

- [ADR-001](./ADR-001-byo-model-keys.md) — BYO model keys only; no server-paid keys in production
- [ADR-002](./ADR-002-audit-hash-chain-worm.md) — Append-only audit hash-chain + WORM posture, verified in CI
- [ADR-003](./ADR-003-author-signer-legibility.md) — Author ≠ signer: sign-off legibility as a product invariant
- [ADR-004](./ADR-004-matter-first.md) — Matter-first, not a global assistant
- [ADR-005](./ADR-005-skills-import-only.md) — Skills arrive only by import at a pinned SHA; no bundled skills
- [ADR-006](./ADR-006-hybrid-local-retrieval.md) — Hybrid local retrieval (pgvector + full-text), audited per search
- [ADR-007](./ADR-007-infrastructure-non-negotiables.md) — Infrastructure non-negotiables: Redis, Fly filesystem, Neon, key encryption
- [ADR-008](./ADR-008-register-sidecar-provenance.md) — The register sidecar: three-grade provenance for external exports
- [ADR-009](./ADR-009-model-gateway.md) — One model gateway: passthrough + audit-stamping contract
- [ADR-010](./ADR-010-fail-closed-deletes.md) — Fail-closed deletes and the tombstone lifecycle
- [ADR-011](./ADR-011-openrouter.md) — OpenRouter as a BYO-key provider
- [ADR-012](./ADR-012-social-and-magic-link-auth.md) — Social sign-in (Google/Microsoft/GitHub) and magic-link auth
- [ADR-013](./ADR-013-supervised-ai-standard-of-care.md) — Supervised AI built to the UKJT standard of care
