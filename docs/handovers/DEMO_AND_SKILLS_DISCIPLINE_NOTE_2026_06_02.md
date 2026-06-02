# Demo and Skills Discipline Note — 2026-06-02

This note captures the product decision from the June-demo discussion.

## Product Principle

Governance is enforced by the runtime, but it should not be the first thing a user sees.

The Skills surface must not turn capability plumbing into the product. If the primary screen leads with `partial`, `blocked`, `missing capabilities`, `chronology.read`, `matter.read`, or `model.invoke`, the product reads as infrastructure debugging rather than legal work.

The user path should be:

1. Open matter.
2. Chat.
3. Run skill.
4. Get output.
5. Sign.
6. See the matter Record.

Permissions and trust remain real, but they are disclosed at the point of setup, failure, or operator inspection.

## Demo Rule

The guided demo matter must run green.

For the demo path:

- skills should be installed
- required permissions should be granted
- provider/keyless readiness should be clear
- the user should not land on a wall of blocked or partial states

The demo should teach the governed loop by showing it working:

> drop/open document → ask/run skill → get output → see it recorded/signable

Permission failure is an insider demonstration, not the first experience. If we want to show enforcement, we can deliberately revoke a permission and show the refusal + Record row.

## Skills UI Rule

Primary states should be simple:

- Ready in this matter
- Available to enable
- Needs setup

Avoid leading with raw substrate states:

- partial
- grant
- missing capabilities
- raw capability ids
- raw provider/model plumbing

Capability details should live in:

- the enable ceremony
- a collapsed details section
- operator/admin inspection
- a run-blocked explanation when a skill genuinely cannot run

## Strategic Framing

Legalise does not need to prove market traction in this pass. It needs to be a credible June-room artifact for serious legal-tech conversations.

Near-term bar:

- chat works
- guided demo runs cleanly
- skills feel runnable, not knotty
- governance is visible quietly
- visual hierarchy is credible enough to share

Do not spend another fortnight adding infrastructure because the product feels uncertain. Get the core demo path clean, then put it in front of serious people for signal.

## Builder Guardrail

The Generic Skill Runner should simplify the skill experience.

If the runner exposes more capability plumbing on the primary surface, pause and redesign. Its job is to make skills feel like governed legal work actions, not to make users decode the permission system.
