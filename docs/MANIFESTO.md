# Manifesto

Commitments that don't move.

## The wedge

UK legal AI sits under rules most products ignore. Heppner made it concrete. A firm using AI must show, later and on demand, what privileged material the AI saw, who held it, and under what protection.

The audit log is not a nice-to-have. It is the canonical record. Privilege posture is not a preference. It is a constraint on dispatch.

The market frames AI inside legal work as a chatbot problem. We frame it as a workspace problem. The matter is the unit of work. Every model call, every document mutation, every chronology entry exists inside one matter, owned by one user, governed by one privilege posture, written into one audit log.

Outside that frame, the legal use case stops being legal. It's a generic question that happens to mention the law.

## Supervised autonomy, not unsupervised automation

The interesting question is no longer only what AI can automate. It is what a firm would choose not to automate, where human judgement must remain named, and how the system proves that boundary held.

Legalise is not trying to make legal work unsupervised. It is trying to make supervision explicit, inspectable, and auditable.

The unit is not a prompt. It is a matter. The control points are not vibes. They are permissions, privilege posture, source evidence, review gates, and audit rows. Audit is not the product. Audit is the receipt.

## Matter-first, not prompt-first

The workspace organises around the matter. Documents, prompts, outputs, audit rows. All hang off a slug, a title, a parties record, a privilege posture, a retention clock.

AI tooling that operates outside the matter frame is fine for research. Not acceptable as the substrate for regulated practice.

## Audit as the canonical record

Every model call writes an audit row. Every matter mutation writes an audit row. Every disclosure-tainted chronology entry writes an audit row with the CPR 31.22 acknowledgement attached.

The audit log is what a solicitor uses to answer the questions a regulator, a client, or opposing counsel will eventually ask. What did your AI see. When did it see it. Under what protection. What did it produce.

## Why the audit trail

Professional liability is boring until it is existential.

If AI touches a matter, the solicitor remains accountable. The client may ask what happened. The insurer may ask what happened. The SRA may ask what happened. A partner may ask why a deadline, citation, disclosure decision, or letter went wrong.

A solicitor cannot responsibly supervise something if they cannot reconstruct what material the system saw, whether privileged material was involved, which model or module touched it, what it produced, who approved or relied on it, and what changed after human review.

Without that, supervised autonomy is just trust me, a lawyer was nearby.

Legalise records the path. The audit trail is not the product. It is the receipt.

## Privilege posture is a dispatch constraint

Three states. `A_cleared`, `B_mixed`, `C_paused`. Each matter carries one. The gateway reads the posture before every model call and decides which providers can serve it.

Cloud providers are commodities behind the gateway, not direct dependencies of any module. Local models (Ollama) exist from day one for `B_mixed` matters, where local-preferred routing keeps work in-tenant. `C_paused` permits no model call at all.

If the posture rules and the providers configured for a matter cannot serve a call, the gateway refuses it. The refusal is audited. Privilege is not a soft setting.

## Providers are commodity

Anthropic, OpenAI, Ollama, all behind one gateway interface. Models change. Providers come and go. The matter spine, the audit log, the privilege gate, the chronology surface. These survive any provider rotation.

No dependencies on provider-specific features unless the gateway can offer a clean fallback.

## Boring stack, ambitious composition

Python, FastAPI, Postgres, React 19, Tailwind. Nothing on this list surprises anyone in 2030.

The novelty is the composition. Privilege-aware gateway. Hash-chained audit trail. Audit-first model dispatch. A skill admission ceremony with pinned-SHA provenance. Matter folder represented as markdown on disk so it survives any future database migration. We optimise for the parts of the system that don't care which model you used in 2026 versus 2030.

## Human-in-the-loop, permanently

Every output is a draft. The product should make human review explicit, inspectable, and impossible to confuse with autonomous legal advice.

Drafts and accelerants, yes. Substitutes, no. A constraint on the product surface, not an aspiration.

## What this release is not

This is not a law firm. It is not legal advice. It is not for live client matters. The hosted site is a limited evaluation environment, and real model calls require the operator's own provider keys.

The current release proves the matter workspace, modules, privilege posture, capability gates, BYO keys, and audit trail. Firm-specific seniority gates are staged for real deployments, not required for the evaluator path.

Some hard problems are deliberately staged: durable job recovery, formal WORM database roles, richer evals, hallucination controls, prompt shrouding, and production-grade regulator reconstruction. Those are engineering gates, not ignored problems.

## UK-jurisdiction-aware, not US-shaped

England & Wales has its own procedural shape, its own statutory scaffolding, its own privilege model. Most legal AI is US-shaped because most legal AI capital is American.

Translating US patterns into Anglicised vocabulary produces software that breaks on the procedural details. We build for UK practice on UK rules.

## Self-host without limits

The core is Apache-2.0 forever. Self-host on any infrastructure. Run any models. Fork. Modify.

We do not gate the matter spine, audit log, skill import path (Lawve catalogue or any public GitHub repo at a pinned SHA), or any module behind a commercial tier. If a commercial tier ever exists, it sells managed operations and certifications. Not functionality.

## What we won't do

- Replace solicitor sign-off.
- Ship a chat surface that floats outside the matter file. Chat is the front door to a governed matter workspace, never a loose prompt window.
- Take dependencies on closed proprietary APIs without an open alternative.
- Ship a feature that breaks audit-row contract or privilege-posture dispatch.

Push back if we drift.
