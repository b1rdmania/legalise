# Manifesto

Commitments that don't move.

## The wedge

Legal AI in the UK has a regulatory shape that most products are not built around. Heppner made that shape concrete. Privileged material has to be handled with provable care, and the firm has to be able to reconstruct, after the fact, what was disclosed to which provider under what protection.

The audit log is not a nice-to-have. It is the canonical record. Privilege posture is not a preference. It is a constraint on dispatch.

The market frames AI inside legal work as a chatbot problem. We frame it as a workspace problem. The matter is the unit of work. Every model call, every document mutation, every chronology entry exists inside one matter, owned by one user, governed by one privilege posture, written into one audit log.

Outside that frame, the legal use case stops being legal. It's a generic question that happens to mention the law.

## Matter-first, not prompt-first

The workspace organises around the matter. Documents, prompts, outputs, audit rows. All hang off a slug, a title, a parties record, a privilege posture, a retention clock.

AI tooling that operates outside the matter frame is fine for research. Not acceptable as the substrate for regulated practice.

## Audit as the canonical record

Every model call writes an audit row. Every matter mutation writes an audit row. Every disclosure-tainted chronology entry writes an audit row with the CPR 31.22 acknowledgement attached.

The audit log is what a solicitor uses to answer the questions a regulator, a client, or opposing counsel will eventually ask. What did your AI see. When did it see it. Under what protection. What did it produce.

## Privilege posture is a dispatch constraint

Three states. `A_cleared`, `B_mixed`, `C_paused`. Each matter carries one. The gateway reads the posture before every model call and decides which providers can serve it.

Cloud providers are commodities behind the gateway, not direct dependencies of any module. Local models (Ollama) exist from day one for `C_paused` matters.

If the posture rules and the providers configured for a matter cannot serve a call, the call is refused. The refusal is audited. Privilege is not a soft setting.

## Providers are commodity

Anthropic, OpenAI, Ollama, all behind one gateway interface. Models change. Providers come and go. The matter spine, the audit log, the privilege gate, the chronology surface. These survive any provider rotation.

No dependencies on provider-specific features unless the gateway can offer a clean fallback.

## Boring stack, ambitious composition

Python, FastAPI, Postgres, React 19, Tailwind. Nothing on this list surprises anyone in 2030.

The novelty is the composition. Privilege-aware gateway. Adversarial premortem pipelines. Audit-first model dispatch. Matter folder represented as markdown on disk so it survives any future database migration. We optimise for the parts of the system that don't care which model you used in 2026 versus 2030.

## Solicitor-in-the-loop, permanently

Every output is a draft. A qualified solicitor reviews, verifies, and takes professional responsibility.

Drafts and accelerants, yes. Substitutes, no. A constraint on the product surface, not an aspiration.

## UK-jurisdiction-aware, not US-shaped

England & Wales has its own procedural shape, its own statutory scaffolding, its own privilege model. Most legal AI is US-shaped because most legal AI capital is American.

Translating US patterns into Anglicised vocabulary produces software that breaks on the procedural details. We build for UK practice on UK rules.

## Self-host without limits

The core is Apache-2.0 forever. Self-host on any infrastructure. Run any models. Fork. Modify.

We do not gate the matter spine, audit log, plugin bridge, or any v0.1 module behind a commercial tier. If a commercial tier ever exists, it sells managed operations and certifications. Not functionality.

## What we won't do

- Replace solicitor sign-off.
- Add a chatbot as the primary surface.
- Take dependencies on closed proprietary APIs without an open alternative.
- Ship a feature that breaks audit-row contract or privilege-posture dispatch.

Push back if we drift.
