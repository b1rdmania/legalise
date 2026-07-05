# ADR-004 — Matter-first, not a global assistant

**Status:** Accepted, repeatedly re-ratified (most recently 2026-07-02 against
the "chat window vs Harvey/Legora" question).

## Context

Every legal-AI incumbent ships a general chat assistant. Chat UX is a
commodity arms race Legalise cannot win and must not enter (recorded caution:
"do NOT get into a chat-UX arms race — the shell is commodity; the value is
what it invokes + the governance-on-the-card"). Legalise's differentiation is
that every AI action is *scoped, gated, and recorded against a matter* — the
unit a solicitor, regulator, or insurer actually reasons about.

## Decision

- **The matter is the unit of isolation.** Every matter-scoped route checks
  ownership; grants, audit scope, privilege posture, retention, and the hash
  chain are all keyed per matter (docs/ARCHITECTURE.md §2). Cross-user reads
  404 (not 403) so slugs don't leak.
- **Chat is scoped to one matter and cannot see others.** Context is assembled
  per turn: matter spine (document *index* — titles not bodies, capped),
  chronology digest, recent messages (rolling summary + cap), and audited
  retrieval hits (ADR-006), under a token budget. The system prompt forces the
  model to distinguish what it can SEE (index) from what it has READ (bodies).
- Chat is the primary *surface* (chat-led reshape, 2026-06-05: "chat IS the
  product"), but it is a window onto the matter, not a global assistant. There
  is deliberately no cross-matter or workspace-level chat.
- The turn loop is deliberately a **single governed turn** (one model call +
  one tool round-trip), not a multi-step agent harness. This was decided
  explicitly (2026-06-29): a planning/retry agent loop fights the
  "every turn governed and inspectable" thesis. It is documented as deliberate
  scope in docs/LIMITATIONS.md, not as debt.

## Consequences

- Answers are grounded and citable per matter; "what did the AI see" has a
  per-matter answer. This is the differentiation vs Harvey/Legora — they have
  citations; they don't have posture + sign-off + audit scope *per matter*.
- Users who want ChatGPT-at-work ergonomics (cross-matter questions, global
  memory) will find it constrained. That constraint is the product.

## What not to change, and why

- **Do not add a workspace-global or cross-matter chat.** It instantly breaks
  the isolation claim ("the assistant is scoped to one matter and can't see
  others" — README question 1), un-scopes the audit story, and moves the
  product into the commodity lane where it loses.
- **Do not replace the single governed turn with an autonomous agent loop**
  without redesigning the audit story first. Every additional autonomous hop
  is an unrecorded decision unless the substrate grows with it.
- **Do not un-scope retrieval or context assembly from the matter** (e.g. a
  "search all my matters" feature) — same reason.
