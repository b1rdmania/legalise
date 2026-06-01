# Kramer → Legalise: demo-comprehension handover

**Written 1 Jun 2026** after Kramer vs Kramer vs AI shipped to divorce.broker as v0.1 public beta. Captures what Legalise should lift from the Kramer rebuild, and what it should explicitly leave behind.

## The load-bearing frame

**Use Kramer learnings to improve Legalise demo comprehension, not to change Legalise's architecture.**

Legalise is a supply-chain-aware capability runtime for legal work (see `docs/IMPLEMENTATION_PLAN_REWRITE.md`). Its architecture is locked. Kramer should not be used to retrofit decisions there.

What Kramer *did* prove is **how to make a supervised-autonomy product legible to a human in 60 seconds** — and Legalise's launch needs exactly that legibility.

Kramer was the narrative demo. Legalise stays the serious infrastructure product.

## Carry over (seven things)

### 1. Guided exhibit mode for Khan v Acme

Kramer's `/api/demo/seed` writes a full matter — case pack, parties, documents, gates, outputs, audit chain — in one SQL transaction with zero live LLM calls. Picker click → working Money Picture in under five seconds.

**For Legalise**: Khan needs the same shape. The developer OKR ("time to first audit row in under five minutes") is the same problem. A `legalise demo seed --case khan` (or web endpoint equivalent) that writes Khan into a runnable state with one reference module already executed against it is the public-repo product surface.

This is a demo-comprehension move, not architecture. The seed only writes data Legalise's own primitives already define. It does not invent runtime semantics.

Reference: `kramer-v-ai-build/backend/app/main.py:post_demo_seed`, `backend/app/demo_packs.py`.

### 2. Compact Trust and Review card

A small sidebar card with two facts: *Audit trail · verified · N steps* and *Human review · required before export*. One button: **View proof**.

**For Legalise**: this card belongs on every matter-shell surface where supervision is in scope. The full Audit tab still exists for serious inspection. The card just keeps trust visible without dominating the workbench.

Reference: `kramer-v-ai-build/frontend/src/components/TrustReview.tsx`.

### 3. Proof drawer answering four questions

Kramer's ProofDrawer is a slide-in modal with a hash-chained audit excerpt. The Legalise version should be tighter, structured around the four questions a regulator, auditor, or solicitor actually asks:

- **What did the module see?** (inputs, scope, document provenance)
- **Under what protection?** (privilege posture, redaction state, grant scope)
- **What did it produce?** (outputs, citations, omissions)
- **Who remained accountable?** (signing reviewer, sign-off type, override notes)

The four-question shape is sharper than Kramer's free-form drawer. Make it the standard.

Reference: `kramer-v-ai-build/frontend/src/components/ProofDrawer.tsx`.

### 4. Supervisor-gate UX from Kramer sign-off

Kramer's Agreement step is a one-button sign-off with a pre-filled reviewer name, pre-filled notes, and three options (Signed / Signed with notes / Rejected). It writes one audit row and auto-advances to the next stage. The user never sees "Export not yet available" — state and UI move together.

**For Legalise**: every gate (`required_signer_role: qualified_solicitor`, etc.) should ship with the same UX shape. One affordance, three decisions, auto-advance on success.

Reference: `kramer-v-ai-build/frontend/src/components/AgreementView.tsx`.

### 5. "Talk this output through" chat for module outputs

Kramer's Settlement Room is the only live LLM beat. Two-column: selected output summary on the left, streaming chat on the right. The user asks plain-English questions about the output. The agent has a character file, refuses to recommend, names the tradeoff, mentions solicitor review for legal mechanics.

**For Legalise**: every consequential module output (R3 reviewer outcome, Contract Review pack, Pre-Motion brief, Letters draft) should support a "Talk this output through" affordance. Scoped to **this output**, with **this matter's** inputs as context. Streams. Writes one audit row on completion.

The character file convention (`*_CHARACTER.md` sitting next to the agent) is the cleanest way to make module voices distinct without burying tone in Python strings.

Reference: `kramer-v-ai-build/frontend/src/components/SettlementRoom.tsx`, `kramer-v-ai-build/backend/app/agents/SETTLEMENT_ROOM_CHARACTER.md`.

### 6. Working-pack export

Kramer's Solicitor Filing Pack pairs the JSON output with a UI **filing checklist** card: *"Your solicitor would still need to review or prepare: draft consent order, D81, conditional/final divorce order, pension sharing annexes, missing disclosure follow-up."* The pack is honestly described as a working pack — not a court filing.

**For Legalise**: every module that produces an end-of-line artefact should generate a working pack containing the module's output, cited sources, deliberate omissions, the reviewer decision + sign-off identity, and the audit proof for that run. Plus a UI checklist of what a human still needs to verify or prepare. Both honest and useful.

Reference: `kramer-v-ai-build/frontend/src/components/ExportView.tsx` (incl. `FilingChecklist`).

### 7. Clearer landing copy focused on supervised autonomy

Kramer's landing rewrite landed *"There is no view from nowhere..."*, *"The AI is a translator, not a judge. A solicitor stays at the gates."*, *"A settlement is not a number. It is the smallest shared reality both people can live inside."*

Legalise's landing leans on the public line *"Any tool. Any model. Any skill. Matter-scoped, permissioned, auditable."* That works for the infrastructure pitch but does not explain *why* supervised autonomy is the right primitive.

The Kramer pattern — short philosophical lines threaded through specific section copy — is the right technique. The lines will be different (legal-infrastructure, not divorce) but the move transfers: state a short principle, show it being honoured one screen later.

Reference: `kramer-v-ai-build/frontend/src/components/Landing.tsx`.

## Do NOT carry over

- **Divorce-specific philosophy.** "Smallest shared reality both people can live inside" / "end the war" / "small patch of shared ground" — Kramer-shaped. Legalise's philosophy is about capability runtime for legal work, not amicable divorce.
- **Parody styling.** Synthetic celebrity matter, Johnny Cochran, the divorce Telecaster, pet custody schedule. Kramer's recognisability was the point. Legalise stays clinically Khan-shaped.
- **Tertiary accent palette.** Pink / garden green / warm gold from the Nicole splash. Pure Kramer surface texture. Legalise stays strict Paper Ink + sealing wax per the locked brand seal doctrine.
- **Synthetic celebrity documents.** Marriage certificate, Oscar display schedule, jewellery loan register. Demo theatre, not infrastructure.
- **Hackathon shortcuts.** Fake Party B consent, auto-confirming synthetic counter-frame, single-LLM-call demo path. Legalise needs real dual-party flow + real consent + real LLM work across the matter. Don't ship Kramer's shortcuts into Legalise's substrate.

## Why this reframing matters

An earlier draft of this handover proposed lifting Kramer's *SSE streaming convention* and *one-transaction seed* as architectural conventions. That overreached. The corrected framing is sharper:

- **Kramer's job** was to show how a supervised-autonomy product feels in 60 seconds.
- **Legalise's job** is to be the right substrate for that product class.

The architectural decisions in `docs/IMPLEMENTATION_PLAN_REWRITE.md` (signed modules, sandboxed execution, manifest contract, grant lifecycle, MCP-first) are answers to different questions. They should be made on their own terms, not by importing whatever happened to ship in Kramer.

What Kramer earned the right to suggest is the *demo layer*: how Khan looks, how trust is surfaced, how outputs are explained, how packs are exported, how the landing reads.

## Where the Kramer reference files live

If you want to walk the original code, the Kramer repo is at `~/kramer-v-ai-build/` on Andy's machine. Public mirror at `github.com/b1rdmania/kramer-v-ai-build`.

Read order, when the demo-comprehension work begins:

1. `backend/app/agents/SETTLEMENT_ROOM_CHARACTER.md` — the character-as-doc convention. Lift the convention, not the divorce content.
2. `backend/app/main.py:post_demo_seed` — one-transaction seed shape. Adapt the technique to Khan, not the data.
3. `frontend/src/components/TrustReview.tsx` + `ProofDrawer.tsx` — sidebar card + slide-in drawer. Restructure the drawer around the four questions when ported.
4. `frontend/src/components/AgreementView.tsx` — supervisor-gate UX. Lift the one-button + auto-advance pattern.
5. `frontend/src/components/SettlementRoom.tsx` — "talk an output through" two-column streaming chat. Lift the shape, drop the divorce framing.
6. `frontend/src/components/ExportView.tsx` + the `FilingChecklist` inside it — working-pack pattern.
7. `frontend/src/components/Landing.tsx` — philosophical lines threaded through section copy. Technique only; Legalise needs its own lines.
