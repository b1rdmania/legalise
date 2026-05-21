# Supervised Autonomy

**Status:** launch definition for Legalise v0.4.
**Date:** 2026-05-21.
**Scope:** product thesis and implementation boundary. This is not legal advice, regulatory approval, or a claim that v0.4 is suitable for live client matters.

---

## Definition

**Supervised autonomy** is legal AI that can advance work on a matter only inside a bounded supervisory system:

1. The matter file is the organising unit.
2. The AI can use only declared and granted capabilities.
3. Sensitive material is controlled by privilege and disclosure posture.
4. Outputs cite the matter material they rely on.
5. A qualified human approves named gates before high-consequence work leaves the workspace.
6. Every model call, module action, gate decision, and override is recorded in an audit trail.

The point is not "AI replaces the solicitor". The point is:

> AI can do more work only when the system makes supervision, provenance, permissions, and accountability first-class.

---

## What Legalise v0.4 Implements

v0.4 is the open-source substrate:

- matter-first workspace;
- demo matter;
- BYO model keys;
- module execution;
- runtime capability grants;
- privilege posture;
- CPR 31.22 chronology gate;
- application-level audit trail;
- provider failure and missing-key provenance;
- public documentation of the live-client gaps.

This is enough to evaluate the shape. It is not enough to run live client matters.

Safe launch wording:

> Legalise v0.4 is an open-source evaluation release. It demonstrates the matter workspace, BYO model keys, module execution, privilege posture, capability gates, a CPR 31.22 chronology gate, and an application-level audit trail. The supervisor-gate primitive lands in v0.5.

Unsafe launch wording:

> Legalise v0.4 has solved supervised autonomy for regulated practice.

---

## What v0.4 Does Not Implement

v0.4 does not yet have:

- a `Supervisor` identity model;
- SRA-linked supervisor identity or firm role verification;
- approval queues for generated legal work;
- approve / reject / request-changes / override gate decisions;
- evidence refs attached to gate decisions;
- WORM / DB-enforced audit;
- durable long-running jobs;
- automatic retention purge;
- a global cloud prompt shroud;
- legal-quality hallucination evals.

These are roadmap items, not hidden features.

---

## What v0.5 Should Add

v0.5 should make the supervisor gate concrete.

Minimum shape:

- `SupervisorIdentity`: name, role, regulated status, optional SRA ID / firm identifier, scope.
- `SupervisionGate`: matter, module/workflow, output hash, cited evidence refs, risk tier, required capability, status.
- `GateDecision`: approve, reject, request changes, override.
- Decision notes and evidence refs.
- Audit rows for requested / approved / rejected / overridden.
- UI panel for reviewing proposed output and cited sources before release.

This still would not make Legalise a regulated law firm. It would make the primitive inspectable.

---

## What v0.6 Should Add

v0.6 should address the two obvious technical objections:

1. **Prompt shroud:** configurable pseudonymisation before cloud dispatch, with matter-scoped encrypted token maps and audit rows recording policy/counts/map hash.
2. **Legal-quality evals:** seeded matter evals for grounding, citation integrity, refusal behaviour, unsupported facts, non-existent source IDs, and module-specific regressions.

Suggested wording:

> v0.6 adds a configurable cloud prompt shroud and legal-quality evals. These do not prove legal correctness; they catch unsupported claims, citation failures, and obvious regressions on seeded matters.

---

## Prior Art And Positioning

Do not claim that nobody else has shipped legal supervision.

Relevant public signals as of 2026-05-21:

- Flank describes supervised rollouts, task-level supervision, thresholds, a supervision cockpit, and approve/edit/escalate queues. It also names Simmons & Simmons as launch partner for partner-firm supervision.
- Flank's own category argument distinguishes assistants from systems where confidence/risk routes work into a supervision queue.
- The SRA's effective-supervision guidance stresses oversight while work is live, supervisor accountability, and checks of substantive legal quality, sign-off policies, ethics/regulatory issues, and file management.
- The SRA's Garfield AI approval note emphasises quality checks, confidentiality, conflicts, hallucination risk, client approval before steps, supervision/monitoring, and named regulated solicitors remaining accountable.
- The Law Society's 2026 AI commentary centres confidentiality, data security, accuracy, oversight, liability, and clearer practical guidance.

Legalise's defensible claim:

> Legalise is an open-source substrate for supervised autonomy in UK legal AI.

Not:

> Legalise is the first legal AI supervision system.

---

## Worked Example: Khan v Acme

The eventual supervised-autonomy flow should look like this:

1. Open the Khan matter.
2. Upload documents.
3. The system records provenance and extraction audit rows.
4. The chronology identifies a disclosure-tainted event.
5. The CPR 31.22 chronology gate requires acknowledgement before detail renders.
6. A module runs against matter material under declared capabilities.
7. The module produces an output with cited evidence refs.
8. A supervisor gate opens because the output is high-consequence.
9. The supervisor sees the output, cited sources, model/provider metadata, and risk flags.
10. The supervisor approves, rejects, requests changes, or overrides with notes.
11. The final output and every decision remain reconstructable from the audit trail.

v0.4 reaches steps 1-7 in evaluation form. v0.5 owns steps 8-11.

---

## Launch Copy Guard

Use:

> Open a matter. Ask the assistant. Install legal modules. Run them through capability and privilege gates. Keep the audit trail. v0.4 is the open substrate; the supervisor-gate primitive lands next.

Avoid:

> Legalise has solved supervised autonomy.

Avoid:

> Nobody in legal AI has shipped this.

Use:

> I have not seen these primitives made inspectable in an open UK legal AI workspace.

---

## Source Notes

- Flank product page: https://flank.ai/product
- Flank blog, "The ChatGPT Moment for Legal Agents": https://blog.flank.ai/the-chatgpt-moment-for-legal-agents/
- SRA effective supervision guidance: https://www.sra.org.uk/supervision-guidance
- SRA Garfield AI approval note: https://media.sra.org.uk/news/news/press/2025-press-releases/garfield-ai-authorised/
- Law Society AI and lawtech hub: https://www.lawsociety.org.uk/topics/ai-and-lawtech
- Law Society press note on AI risk guide: https://www.lawsociety.org.uk/Contact-or-visit-us/Press-office/Press-releases/Law-Society-publishes-new-guide-warning-over-AI-risks
