# Legalise documentation

Legalise is an open-source UK legal-AI workspace in evaluation release.
`legalise.dev` is a static demo and documentation site. Its hosted backend is
currently off.

These are the main documents for evaluators, self-hosters, and reviewers.

## The set

| Document | What it covers |
|---|---|
| [**TRUST.md**](./TRUST.md) | Security, privilege, and regulatory posture — gaps listed first. The source of truth for what we do and do not yet enforce. |
| [**ARCHITECTURE.md**](./ARCHITECTURE.md) | How the system actually works today: the matter unit, the hash-chained audit substrate, privilege/advice gates, modules, sign-off, the model gateway. |
| [**EVALUATING.md**](./EVALUATING.md) | The hands-on walkthrough, the bar we hold before inviting evaluators, and the record of the gate runs we have walked. |
| [**THREAT_MODEL.md**](./THREAT_MODEL.md) | Adversary model and what we explicitly do not defend against. |
| [**LIMITATIONS.md**](./LIMITATIONS.md) | What is not production-grade and what a fork must build before going near a live matter. Read before building on top. |
| [**ROADMAP.md**](./ROADMAP.md) | What is shipped, planned, or out of scope. |
| [**adr/**](./adr/) | Architecture decision records — why the system is shaped this way and what not to refactor. |
| [**ATTRIBUTIONS.md**](./ATTRIBUTIONS.md) | Design-idea credits, runtime dependencies, and model-asset licences. |

For a running fork, `legalise doctor` diagnoses the stack and the demo
walkthrough in [`EVALUATING.md`](./EVALUATING.md) exercises the loop
end-to-end. Operator runbooks, contributor notes, and internal design specs
are maintained by the project outside this public repo; open an issue if
something you need to self-host isn't covered here.
