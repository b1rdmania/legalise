# Legalise documentation

Legalise is an open-source UK legal-AI workspace, currently an **evaluation
release candidate**. The hosted site at legalise.dev is a limited evaluation
environment, not a live-client legal service.

This folder is deliberately small. These are the documents that earn a place
on the front door — the ones a solicitor, evaluator, or technical reviewer
should read.

## The set

| Document | What it covers |
|---|---|
| [**TRUST.md**](./TRUST.md) | Security, privilege, and regulatory posture — gaps listed first. The source of truth for what we do and do not yet enforce. |
| [**ARCHITECTURE.md**](./ARCHITECTURE.md) | How the system actually works today: the matter unit, the hash-chained audit substrate, privilege/advice gates, modules, sign-off, the model gateway. |
| [**EVALUATING.md**](./EVALUATING.md) | The hands-on walkthrough, the bar we hold before inviting evaluators, and the record of the gate runs we have walked. |
| [**THREAT_MODEL.md**](./THREAT_MODEL.md) | Adversary model and what we explicitly do not defend against. |
| [**LIMITATIONS.md**](./LIMITATIONS.md) | What is not production-grade and what a fork must build before going near a live matter. Read before building on top. |
| [**ROADMAP.md**](./ROADMAP.md) | What ships now, what's locked for live-matter readiness, what's parked — honest about deferrals. |
| [**adr/**](./adr/) | Architecture decision records — why the system is shaped this way and what not to refactor. |
| [**ATTRIBUTIONS.md**](./ATTRIBUTIONS.md) | Design-idea credits, runtime dependencies, and model-asset licences. |

For a running fork, `legalise doctor` diagnoses the stack and the demo
walkthrough in [`EVALUATING.md`](./EVALUATING.md) exercises the loop
end-to-end. Operator runbooks, contributor notes, and internal design specs
are maintained by the project outside this public repo; open an issue if
something you need to self-host isn't covered here.
