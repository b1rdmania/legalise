# Handover — v0.4 Evaluation Launch vs v0.5 Live-Matter Gates

**For:** Andy, implementation agents, and reviewers.
**As of:** 2026-05-21.
**Purpose:** keep the launch bar honest. v0.4 can be public and useful without claiming live-client readiness or a finished supervisor-gate system; v0.5 starts closing live-matter foundations and the first real supervised-autonomy gate; v0.6 adds the two obvious "serious legal AI" answers: prompt shrouding and legal-quality evals.

---

## 1. TL;DR

Do not hold the public v0.4 launch until Legalise is live-client-ready.

Do make the live-client path explicit so reviewers cannot fairly say "you have not thought about deletion, WORM audit, durable jobs, file validation, key rotation, or dependency hygiene."

The posture:

- **v0.4:** open-source evaluation release. Demo matter, BYO keys, module/audit/capability substrate, CPR 31.22 chronology gate, supervised-autonomy thesis. Not for live client matters. Not a finished supervisor-gate implementation.
- **v0.5:** live-matter readiness foundations and the first real supervisor-gate primitive. Not "fully regulated law firm platform", but the first serious closure pass on the simple things a regulated-firm reviewer will ask about.
- **v0.6:** prompt shroud + legal-quality eval harness. This is the answer to "are you just sending client material to Claude?" and "how do you know the output is any good?"

Hard launch-copy rule:

> Do not say v0.4 has a reference gate for supervised autonomy in regulated practice. It has the matter/audit/capability substrate and one CPR 31.22 chronology acknowledgement gate. The supervisor-gate primitive lands in v0.5.

---

## 2. What v0.4 Must Prove

v0.4 does not need to prove "safe for live client matters".

It needs to prove:

- clone and compose path works;
- hosted demo path works;
- signup works;
- demo matter seeds;
- BYO key flow is clear;
- key-missing and provider-failure states are legible;
- upload validation blocks obvious bad inputs;
- modules/workflows can run or honestly gate;
- audit trail visibly accumulates;
- public copy says evaluation only, not live-client use.

### Claim-Parity Check

Before public posting, classify every launch claim:

| Claim | v0.4 status | Safe wording |
|---|---|---|
| Matter workspace | Implemented | "matter-first workspace" |
| BYO model keys | Implemented | "bring your own Anthropic/OpenAI key" |
| Module execution | Implemented for built-in modules; external install lifecycle is early | "installed legal modules" / "module substrate" |
| Runtime capability gates | Implemented at current boundaries | "capability-gated module operations" |
| CPR 31.22 gate | Implemented for chronology entries sourced from disclosed documents | "CPR 31.22 chronology gate" |
| Audit trail | Implemented, not WORM/tamper-proof | "application-level audit trail, not forensic WORM" |
| Supervised autonomy | Thesis + substrate only | "open substrate for supervised autonomy; supervisor gate lands v0.5" |
| Prompt shroud/anonymisation before cloud | Not global; v0.6 scope | "v0.6 adds configurable prompt shrouding" |
| Legal-quality hallucination evals | Not yet | "v0.6 adds grounding/citation/refusal evals" |

If a claim does not map to one of these rows, remove it or mark it future.

If these hold, the public launch is defensible.

---

## 3. What v0.5 Should Close

These are the "we have thought about it" gates. Some are quick wins; some are architecture.

### Quick Wins (likely 0.5-2 days each)

#### Q1 — Backend lockfile and dependency ceilings

Why it matters:

- makes production builds reproducible;
- closes the "cryptography installed below declared floor" audit concern if reproduced;
- prevents surprise major-version auth/provider regressions.

Likely shape:

- commit `uv.lock` or pinned requirements lock;
- add `fastapi-users[sqlalchemy]>=14.0.1,<15.0.0`;
- add `openai>=1.57.0,<2.0.0`;
- add CI check that the lockfile exists and the built env has `cryptography>=44.0.0`.

This is the best candidate to pull into pre-launch if there is spare capacity and CI stays calm.

#### Q2 — Magic-byte upload validation

Why it matters:

- current MIME allowlist trusts the client header;
- a fake `application/pdf` should not reach PDF/DOCX parsers unchecked.

Likely shape:

- inspect first bytes before accepting upload;
- PDF must start `%PDF-`;
- DOCX/Office zip must start `PK` and pass basic package sanity;
- TXT/MD/RTF handled explicitly;
- declared/inferred mismatch returns structured 415.

Small, useful, and easy to explain.

#### Q3 — Remove `python-frontmatter<1.2` cap

Why it matters:

- unauthenticated module submission touches frontmatter parsing;
- cap exists because of a bytes/str incompatibility, not because 1.2 is conceptually unsupported.

Likely shape:

- fix submission path to write bytes to the buffer;
- lift `<1.2`;
- rerun submission tests.

This is probably a tiny patch.

#### Q4 — `core/module_catalogue.py` extraction

Why it matters:

- capability enforcement should not import API-layer helpers;
- makes module discovery a boring core service.

Likely shape:

- move `_plugins_root`, `_skill_paths`, `_module_json_for`, `_discover_skills` from `api/modules.py`;
- import from `core/module_catalogue.py` in both capabilities and API response code;
- keep existing module parity tests green.

Mechanical refactor, but must be done carefully.

#### Q5 — Architecture/doc honesty cleanup

Why it matters:

- live-matter gaps are not launch blockers if they are named;
- hidden gaps become gotchas.

Likely shape:

- final copy sweep says v0.4 evaluation only;
- ROADMAP names v0.5 live-matter readiness foundations;
- TRUST says which controls are present, which are not.

This belongs in the pre-launch copy sweep or immediately after.

### Medium Work (1-3 days each, depending on edge cases)

#### M0 — Supervisor-gate primitive

Why it matters:

- "supervised autonomy" cannot be substantiated by a boolean, a posture dropdown, or a free-text acknowledgement;
- Flank already markets supervision queues, partner-firm supervision, thresholds, and approve/edit/escalate workflows;
- Legalise's defensible distinction is open-source matter/audit/capability substrate plus a regulator-legible gate model, not "we invented supervision".

Likely shape:

- `Supervisor` or `SupervisorIdentity` model: name, role, regulated status, optional SRA ID / firm identifier, scope, created_by;
- `SupervisionGate` or `GateDecision` model: matter, module/workflow, resource/output hash, required capability, risk tier, status;
- sign-off artefact: approve / reject / request changes / override, with evidence refs, notes, actor, timestamp, prompt/response/output hashes;
- immutable audit rows for gate requested, approved, rejected, overridden;
- frontend review panel showing the proposed output, cited sources, risk flags, and exact decision buttons;
- no claim that this equals SRA approval. It is a reference primitive for firms to adapt.

This is the core v0.5 product work if the launch thesis remains "supervised autonomy".

#### M1 — Manual matter deletion/export path

Why it matters:

- real client data needs deletion/export/retention action;
- account deletion currently 409s if matters exist.

Likely shape:

- `DELETE /api/matters/{slug}` or archive/delete flow;
- owner/admin checks;
- explicit warnings about audit/retention consequences;
- tests for cross-user denial and audit row.

This is the most important live-matter gate that still feels bounded.

#### M2 — Encryption key rotation runbook

Why it matters:

- `LEGALISE_KEY_ENCRYPTION_SECRET` protects all stored user provider keys;
- compromise/rotation needs an operator path.

Likely shape:

- CLI re-encrypts `user_api_keys` from old secret to new secret;
- transaction or resumable process;
- runbook in TRUST/RUNBOOK docs.

Small surface area, but must be implemented carefully.

#### M3 — High-risk module logic tests

Why it matters:

- anonymisation and document-editing are high-consequence if used with real docs;
- current confidence is broader smoke/eval rather than dedicated logic tests.

Likely shape:

- anonymisation: detection round-trip, token map, detokenise identity, fallback path;
- document edit: clean anchor, ambiguous anchor, conflict/no-op, reject-all.

This can be phased. It should block those modules for real client docs until done.

### Larger Architecture (not a quick pre-launch pull-forward)

#### A1 — Audit WORM / tamper-resistance

Why it matters:

- v0.4 audit is application append-only, not DB-enforced;
- regulator-grade audit needs enforcement below the app layer.

Likely shape:

- insert-only app DB role;
- REVOKE UPDATE/DELETE on `audit_entries`;
- trigger guard if useful;
- optional hash chain later;
- audit export caveat until this exists.

This is a firm-pilot gate, not a public launch gate.

#### A2 — Durable jobs

Why it matters:

- long-running workflows over SSE cannot recover from client disconnect or instance restart;
- Pre-Motion and Contract Review can cost real model calls.

Likely shape:

- jobs table;
- Redis/arq worker;
- persisted stages/result/error;
- SSE becomes status transport, not the source of truth.

This is v0.5/v0.6 architecture. Do not cram it into v0.4.

---

## 4. Suggested Version Framing

### v0.4

Public evaluation release.

Language:

> Legalise v0.4 is an open-source evaluation release. It demonstrates the matter workspace, BYO model keys, module execution, privilege posture, capability gates, a CPR 31.22 chronology gate, and an application-level audit trail. It is not for live client matters. The supervisor-gate primitive lands in v0.5.

### v0.5

Live-matter readiness foundations.

Language:

> v0.5 starts closing the live-matter gates: deletion/export, locked backend builds, stronger upload validation, key rotation, WORM audit groundwork, and dedicated tests for high-risk document workflows.

### Not Yet

Do not claim:

- production legal service;
- regulator-grade WORM audit;
- live-client readiness;
- managed model access;
- complete supervised-autonomy implementation.
- that nobody else has shipped legal supervision workflows.

---

## 5. v0.6: Prompt Shroud + Legal-Quality Evals

This is the next credibility layer after v0.5 foundations.

It should not block v0.4. It is a strong v0.6 launch story if v0.4 lands publicly first and v0.5 closes the obvious hardening gaps.

### S1 — Cloud Prompt Shroud

Do not claim "everything is anonymised before Claude" in v0.4. That is not true, and blanket anonymisation can damage legal analysis.

Instead, v0.6 should add a matter-level cloud prompt policy:

- `raw_allowed`
- `shroud_personal_data`
- `shroud_parties_and_personal_data`
- `local_only`

The shroud should sit inside `ModelGateway`, before Anthropic/OpenAI dispatch, so modules cannot bypass it.

Expected behaviour:

- Cloud model calls apply the matter's prompt policy.
- Personal/entity data is replaced with reversible tokens (`PERSON_1`, `ORG_1`, `ADDRESS_1`, `EMAIL_1`, etc.).
- Token maps are matter-scoped and encrypted.
- Audit rows record policy, counts, and map hash, not raw token maps.
- Responses can optionally be de-shrouded before display/export.
- Supervisor/preflight UI can show: documents included, entity count, shroud policy, cloud provider.

Important caveat:

Some legal facts should not be blindly hidden. Protected characteristics, dates, employers, locations, parties, and relationships can be legally material. This is why the shroud is policy-controlled, previewed, and audited, not globally forced.

Suggested public language:

> v0.6 adds a cloud prompt shroud: configurable, audited pseudonymisation before cloud model dispatch. It does not pretend blanket anonymisation is always legally safe.

### S2 — Legal-Quality Eval Harness

v0.4 has contract/smoke/security evals. It does not yet have strong legal-output quality evals.

v0.6 should add matter-shaped evals for:

- grounding;
- citation integrity;
- unsupported factual claims;
- fake/non-existent source IDs;
- refusal/uncertainty when facts are missing;
- module-specific known issue detection.

Suggested structure:

- `evals/legal_quality/` with YAML/JSON golden cases;
- golden matters: Khan employment matter, NDA contract matter, civil pre-action letter matter, poisoned/conflicting-facts matter;
- optional real-model mode using BYO key;
- default CI mode can run shape/fixture checks without paid model calls;
- report outputs JSON/Markdown for release notes.

Module-specific eval examples:

- **Assistant:** factual answers cite existing document/event IDs; no invented dates/names.
- **Pre-Motion:** identifies the known weakness in Khan and ranks it near the top.
- **Contract Review:** flags known bad NDA clauses.
- **Letters:** includes required facts and does not invent missing facts.
- **Anonymisation:** removes or tokens known entities and preserves legal meaning where expected.

Suggested public language:

> v0.6 adds legal-quality evals for grounding, citation integrity, refusal behaviour, and module-specific regressions. These do not prove legal correctness; they catch unsupported claims and obvious regressions on seeded matters.

### S3 — How To Answer The Flank

Flank is not a footnote. As of the 2026-05-21 pre-launch check, Flank's own product page describes:

- three supervision models: customer's lawyers, partner firm, or Flank's qualified counsel;
- Simmons & Simmons as launch partner for partner-firm supervision;
- supervised rollouts, task-level supervision, thresholds, and approve/edit/escalate queues;
- a supervision cockpit and correction loop.

Their blog also makes the same category distinction Legalise cares about: a plugin that produces legal output and lets the user review it is not the same as an architecture where confidence/risk determines whether work goes to a supervision queue.

Do not write "nobody has shipped supervision". The honest differentiation is:

> Legalise is an open-source substrate for supervised autonomy: matter file, capability gates, privilege posture, audit trail, and a planned public reference supervisor-gate model. Commercial tools are racing on hosted operational AI; Legalise is trying to make the primitives inspectable and forkable.

If someone asks "where are the evals?":

> Correct. v0.4 has endpoint, audit, capability, provider-error, and smoke evals. v0.6 adds legal-quality evals: grounding, citation integrity, golden matters, and refusal checks.

If someone asks "is everything anonymised before Claude?":

> No. v0.4 gates cloud use through BYO keys and privilege posture. v0.6 adds a configurable prompt shroud before cloud dispatch. Blanket anonymisation is not always legally safe.

---

## 6. Practical Recommendation

If there is spare capacity before v0.4 launch, pull forward only one or two of the quick wins:

1. Backend lockfile and ceilings, if CI stays green.
2. Magic-byte upload validation, if the implementation remains small.

Do **not** pull forward durable jobs, WORM audit, or matter deletion unless the clean-clone/deploy path is already green. Those are v0.5 gates.

Do **not** pull forward prompt shroud or legal-quality evals unless v0.4 launch and v0.5 foundations are already stable. They are ideal v0.6 narrative work.

Launch risk is still first-run coherence, not live-client completeness.

## 6A. Tuesday Launch Hygiene

Do these before the public post:

- [ ] Verify the current gate surface and keep "supervisor gate" future-tense unless v0.5 lands.
- [ ] Read Flank's product and blog pages; do not claim novelty over their supervision model.
- [ ] Read current SRA supervision guidance and Law Society AI notes.
- [ ] Prime one credible legal/academic/legal-engineering reviewer to engage within 48 hours of launch.
- [ ] Publish or link `docs/SUPERVISED_AUTONOMY.md` as the definition page.
- [ ] DM 5-10 strategic targets with the repo and the specific claim being made.

Current external-source read:

- SRA supervision guidance stresses live oversight at key stages, supervisor accountability, effective systems, and checks of substantive legal quality, policies/sign-off, ethical/regulatory considerations, and file management.
- The SRA's Garfield approval note stresses quality checks, confidentiality, conflicts, hallucination risk, client approval before steps, supervision/monitoring, and named regulated solicitors remaining accountable.
- The Law Society's 2026 AI commentary repeatedly centres confidentiality, accuracy/unreliable outputs, oversight, liability, data security, and the need for clearer practical guidance.
- Flank already owns a strong hosted-product supervision story; Legalise must position as open-source substrate and reference primitives, not as first mover on supervision itself.

---

## 7. GitHub Workflow Posture

The current commit history is acceptable for the pre-launch sprint. Lots of small direct-to-`master` commits are not amateur if:

- `master` stays green;
- commit messages are specific;
- public docs are coherent at release time;
- a release tag marks the launch state.

Do not rewrite history just to make the pre-launch sprint look neater.

### Before v0.4 launch

Minimum public-shape work:

- ensure `master` is green;
- tag `v0.4.0` as the public evaluation release;
- create a GitHub Release with the same evaluation / not-live-client framing as the README;
- open issues for the v0.5 live-matter gates;
- use milestones: `v0.4 launch`, `v0.4.1 polish`, `v0.5 live-matter readiness foundations`.

Suggested v0.5 issues:

- `v0.5: backend lockfile and dependency ceilings`
- `v0.5: magic-byte upload validation`
- `v0.5: matter deletion/export path`
- `v0.5: audit WORM groundwork`
- `v0.5: durable job runner for long workflows`
- `v0.5: encryption key rotation runbook`
- `v0.5: extract core/module_catalogue.py`
- `good first issue: dependency attribution cleanup`
- `good first issue: clean-clone quickstart improvements`

### After v0.4 launch

Switch material changes to PRs:

- one issue per material change;
- one PR per issue or coherent fix;
- CI required before merge;
- labels for `bug`, `trust`, `security`, `docs`, `good first issue`, `v0.5`;
- no new feature work directly on `master` unless it is an urgent launch fix.

Suggested public note if needed:

> Development before v0.4 moved quickly on `master`. After v0.4, material changes land through issues and PRs against milestones.

This is honest and normal. The amateur smell is not "many commits"; it is broken master, unclear roadmap, and undocumented known gaps.

---

## 8. Hand-Off Line

> Read `docs/HANDOVER_V0_4_TO_V0_5_GATES.md`. v0.4 should launch as an honest evaluation release, not wait for live-client readiness. If there is spare capacity, consider pulling forward backend lockfile and/or magic-byte upload validation. v0.5 owns live-matter foundations. v0.6 owns prompt shroud and legal-quality evals/hallucination controls unless the reviewer explicitly reclassifies them.
