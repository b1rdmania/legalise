# Manifesto

Legalise is built around a small set of commitments that don't move.

## The wedge

Legal AI in the UK has a regulatory shape that most current products are
not built around. The Heppner ruling on legal professional privilege made
that shape concrete: privileged material has to be handled with provable
care, and the firm has to be able to reconstruct, after the fact, what was
disclosed to which provider under what protection. The audit log is not a
nice-to-have. It is the canonical record. Privilege posture is not a
preference. It is a constraint on dispatch.

The market frames AI inside legal work as a chatbot problem. We frame it
as a workspace problem. The matter is the unit of work. Every model call,
every document mutation, every chronology entry exists inside one matter,
owned by one user, governed by one privilege posture, written into one
audit log. Outside that frame, the legal use case stops being legal —
it's a generic question that happens to mention the law.

## Matter-first, not prompt-first

A workspace organises around the matter. Documents, prompts, outputs,
audit rows — all hang off a slug, a title, a parties record, a privilege
posture, a retention clock. AI tooling that operates outside the matter
frame is acceptable for research. It is not acceptable as the substrate
for regulated practice.

## Audit as the canonical record

Every model call writes an audit row. Every matter mutation writes an
audit row. Every disclosure-tainted chronology entry writes an audit row
with the CPR 31.22 acknowledgement attached. The audit log is what a
solicitor uses to answer the questions a regulator, a client, or
opposing counsel will eventually ask: what did your AI see, when did it
see it, under what protection, and what did it produce.

The audit row shape is bespoke and stable. The action taxonomy will
move to constants in v0.2 — that's the only structural change planned.

## Privilege posture is a dispatch constraint

Three states: `A_cleared`, `B_mixed`, `C_paused`. Each matter carries
one. The gateway reads the posture before every model call and decides
which providers can serve it. Cloud providers are commodities behind
the gateway, not direct dependencies of any module. Local models
(Ollama) exist from day one for `C_paused` matters.

If the posture rules and the providers configured for a matter cannot
serve a call, the call is refused. The refusal is audited. Privilege is
not a soft setting.

## Providers are commodity

Anthropic, OpenAI, Ollama all sit behind one gateway interface. Models
will change. Providers will come and go. The matter spine, the audit
log, the privilege gate, the chronology surface — these survive any
provider rotation. We refuse to take dependencies on provider-specific
features unless the gateway can offer a clean fallback. Provider-native
structured output is v0.2 gateway work for this reason.

## Boring stack, ambitious composition

Python, FastAPI, Postgres, React 19, Tailwind. Nothing on this list will
surprise anyone in 2030. The novelty is the composition: privilege-aware
gateway, adversarial premortem pipelines, audit-first model dispatch,
matter folder represented as markdown on disk so it survives any future
database migration. We optimise for the parts of the system that don't
care which model you used in 2026 versus 2030.

## Solicitor-in-the-loop, permanently

Every output is a draft. A qualified solicitor reviews, verifies, and
takes professional responsibility. We will not ship a feature whose
default mode is to replace a solicitor's judgement. Drafts and
accelerants — yes. Substitutes — no. This is not an aspiration. It is a
constraint on the product surface.

## UK-jurisdiction-aware, not US-shaped

England & Wales has its own procedural shape, its own statutory
scaffolding, its own privilege model. Most legal AI is US-shaped
because most legal AI capital is American. We build for UK practice on
UK rules. Translating US patterns into Anglicised vocabulary produces
software that breaks on the procedural details.

## Self-host without limits

The core is Apache-2.0 forever. Self-host on any infrastructure. Run any
models. Fork. Modify. We do not gate the matter spine, audit log,
plugin bridge, or any v0.1 module behind a commercial tier. If a
commercial tier ever exists, it sells managed operations and
certifications, not functionality.

## What we won't do

- Replace solicitor sign-off.
- Add a chatbot as the primary surface.
- Take dependencies on closed proprietary APIs without an open
  alternative.
- Ship a feature that breaks audit-row contract or privilege-posture
  dispatch.
- Position against the other open-source UK legal AI projects. Mike and
  Stella are peers, not competitors. See [`PEERS.md`](./PEERS.md).

Push back if we drift.
