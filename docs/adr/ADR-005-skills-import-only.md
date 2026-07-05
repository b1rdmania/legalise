# ADR-005 — Skills arrive only by import at a pinned SHA; no bundled skills

**Status:** Accepted. Native skill modules deleted (PR #175, −12,741 LOC);
filesystem plugin path deleted (PR #180, −4.1k LOC). Both deliberate.

## Context

Legalise once shipped five native Python skill modules (pre-motion, contract
review, tabular review, case law, letters) plus a filesystem plugin path that
cloned an external repo at boot. Both were killed on purpose:

- Bundled skills made Legalise a *content* product competing on skill quality
  (a losing lane) instead of a *governance* product.
- Native code modules widened the attack/liability surface (arbitrary Python
  in-process) and made the trust story incoherent: why ceremony-gate imported
  skills while shipping ungated native ones?
- The reframe (2026-06-11): Legalise is "the regulator and chambers for AI
  lawyers" — manifest = practising certificate, import ceremony = admission.
  A regulator that authors the practitioners is marking its own homework.

## Decision

- Skills arrive **only** via import, from two sources: the Lawve catalogue
  (`backend/app/core/lawve_import.py`, list + draft) and any public GitHub
  repo with a `SKILL.md` (`backend/app/core/github_import.py`). Every import
  is **pinned to a commit SHA** (`_resolve_ref` resolves branch/tag → SHA;
  the SHA lands in the manifest `source_url`). Updating a skill is a fresh
  import through the ceremony — a prompt change can never reach the runtime
  silently.
- Imported skills run as **prompt-runtime** modules
  (`backend/app/core/prompt_runtime.py`): the SKILL.md body becomes the system
  prompt; **no arbitrary code import**. The full governance seam runs on every
  invocation (posture gate → read grants → advice-boundary → invocation audit
  → provider call → model audit → write grants → artifact → completion audit).
- **Install ceremony = trust review** (`backend/app/core/trust_ceremony.py`):
  manifest → signature → publisher → permissions → data movement → gates →
  grant. Signature grades are honest: `verified` (real Ed25519 against a
  registered publisher key) vs `structure_verified` (shape-only; a
  well-formed forgery would pass — deliberately not called `verified`, and
  rendered in the UI as "structure checked"). The 3-step fast path is gated
  on cryptographic `verified` **only** (PR #255 — `structure_verified`
  previously qualified); everything else takes the full 7-step inspection.
  Since no publisher has a registered key yet, every install today takes the
  full path (first-party manifest signing is a tracked follow-up —
  `scripts/sign_manifest.py` exists, the release pipeline doesn't sign yet).
  Permission-expanding manifest updates force a re-ceremony.
- **Entrypoint-resolvability guard** (PR #249, after a prod incident where two
  legacy installed rows pointed at modules deleted in #175 and the model's
  tool calls died): `native_entrypoint_error`
  (`backend/app/core/runtime.py:183`, `find_spec`, no code execution) runs at
  install ceremony and module update (422 `entrypoint_unresolvable`), at chat
  tool-advertising time (skip + log), and in `doctor`
  (`modules.entrypoints_resolvable`).
- What remains in-repo: `examples/modules/{contract_review,pre_motion}` as
  *reference implementations of the governance order* — installable examples
  that tests, first-run e2e, and the demo fixture on. They are examples, not
  bundled product skills. Four internal native modules remain as substrate
  (`assistant`, `chronology`, `anonymisation`, `document_edit`) — these are
  platform plumbing, not legal skills.

## Consequences

- The catalogue is only as good as its sources (Lawve's public feed is frozen
  at 42 skills vs 194 on lawve.ai — stated honestly in the UI).
- Old installed rows referencing deleted code can linger in a database — the
  resolvability guard exists precisely for this class.

## What not to change, and why

- **Do not reintroduce bundled/native legal skills.** The −12.7k LOC deletion
  was a strategic decision, not tech debt cleanup. Bundling skills re-couples
  Legalise's credibility to skill content and breaks the regulator framing.
- **Do not add an unpinned import path** (floating branch, "latest", direct
  paste-without-provenance). SHA pinning IS the approval trail ("reviewing a
  skill means reviewing its SKILL.md at that SHA").
- **Do not bypass or streamline away the trust ceremony** for "known" sources,
  and do not soften the `structure_verified` label into something that sounds
  cryptographic. In particular, do not re-admit `structure_verified` to the
  fast path — a forged signature of the right shape passes the structure
  check; that is exactly why PR #255 removed it.
- **Do not remove the entrypoint guard** — it prevents a recurring prod
  failure class (install-clean, fail-on-dispatch).
- **Do not delete `examples/modules/`** without re-fixturing the governance
  tests, e2e golden loop, and demo that depend on them.
