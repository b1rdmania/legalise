# Legalise IA Reset — Build Blueprint

**Date:** 2026-06-02
**Status:** Buildable spec. Authorised. No further review required before PR 1.
**Companion to:** `LEGALISE_IA_RESET_WHITEPAPER_2026_06_02.md`
**Supersedes:** any prior "PR 0 / UX Master Spec" framing. This document **is** PR 0.

---

## 0. How To Read This Document

This is not a white paper. This is the build booklet. Every section below is a
decision, not a suggestion. Build agents must implement against this spec and
not freestyle. If a section is ambiguous, raise it; do not interpret it.

Three reading rules:

1. **Locked** means do not relitigate. The decision has been made and the
   rationale is recorded for future reference, not for re-opening.
2. **Gate** means a PR cannot land until the listed acceptance criteria are
   demonstrably met. Green CI is not sufficient.
3. **Out of scope** means do not touch in this reset. Backend, substrate, and
   governance primitives are explicitly out of scope.

---

## 1. North Star (Locked)

> Legalise is a matter folder for solicitor-owned AI work.
>
> Open a matter. Add documents. Install a skill. Chat or run the skill.
> Sign the output. Keep the record.

Everything else is secondary. If a feature does not make this loop easier to
understand or faster to complete, it does not get first-class navigation.

**The product is not a control panel for a governance substrate. The product
is a place where a solicitor does AI-assisted legal work, with the governance
substrate quietly doing its job in the background and surfacing as proof at
the moment of sign-off.**

---

## 2. ELI15 (Locked)

The product must be explainable in ten sentences to a non-technical reader:

> Legalise is a folder for legal work where AI helps.
>
> You open a matter. That is your folder for one case or one piece of work.
> You add the documents that belong to the matter.
> You install a skill — a small specialised tool that knows how to do one
> kind of legal task.
> You ask a question or run the skill against the matter.
> The AI prepares an answer with sources pinned to the documents.
> You read it. You agree or you change it.
> You sign it off, which locks the record.
> You can export the matter as a sealed pack at any time.
> Legalise keeps the audit trail in the background, so anyone reviewing later
> can see exactly what happened.

If a product surface contradicts this ELI15, the surface is wrong.

---

## 3. Locked Vocabulary

The single source of truth for user-facing language. Build agents must use
exactly these words in the UI. Variants are not permitted.

### User-Facing Nouns

| Word | Meaning | Notes |
| --- | --- | --- |
| **Matter** | The folder. Contains documents, installed skills, chat, outputs, sign-offs, record. | Not "Project." Matter is the regulated legal noun and is the wedge. Workspace operators see "Matter" too. |
| **Document** | A file inside a matter. | Singular "Document," plural "Documents." Not "file," not "asset." |
| **Skill** | An installable, signed tool that can run inside a matter. | Not "module," not "action," not "agent," not "tool." User-facing word is Skill everywhere. |
| **Chat** | The primary work surface inside a matter. | Where the user asks and runs. Not "Matter desk." |
| **Record** | The sign-offable, exportable proof layer of a matter. | Not "Activity Trail," not "Audit," not "Proof drawer" in nav. Record contains all of those as sub-views. |
| **Sign-off** | The act of a solicitor approving an output. | Singular noun. Verb form: "Sign off." |
| **Export** | The act of producing a sealed working pack. | Action, never a navigation tab. |
| **Workspace** | The firm/operator scope above matters. | Where skills are trusted, providers are configured, admin lives. |

### Forbidden In User-Facing UI

These words exist in the substrate, in admin, in API, in docs, in tests. They
**must not appear** in primary user navigation, in matter shell labels, or in
default-visible UI strings.

- Module
- Action
- Activity Trail
- Workspace audit (as a tab — fine as an admin label)
- Capability
- Grant (as a tab — fine inside Record sub-views)
- Posture
- Invocation
- Output (as a noun for nav — fine inline)
- Manifest
- Substrate

### Verb Lock

| Action | Verb | Not |
| --- | --- | --- |
| Create a matter | "Open matter" | "Create project," "New case" |
| Put a skill into the workspace | "Install skill" | "Add module," "Enable capability" |
| Put a trusted skill into a matter | "Enable in matter" | "Grant," "Provision" |
| Run a skill | "Run skill" or "Ask" (chat) | "Invoke," "Execute" |
| Approve an output | "Sign off" | "Approve," "Accept," "Confirm" |
| Reject an output | "Reject" | "Decline," "Block" |
| Produce a sealed pack | "Export" | "Generate pack," "Download bundle" |

This list is the entire user-facing vocabulary. Build agents do not add words.
Adding a word requires a blueprint amendment.

---

## 4. Locked Visual Tokens

Hierarchy is structure, not polish. Visual tokens are decided here so PRs do
not drift into reinventing them. The brand seal (#8B0000) and existing
Legalise tokens remain canonical; this section locks how they are applied.

### Type Scale (locked)

Six steps. No agent introduces a seventh.

| Step | Use | Weight |
| --- | --- | --- |
| **Display** | Landing hero only | Serif, heavy |
| **H1** | Matter title, Workspace title | Serif, regular |
| **H2** | Section heading inside a matter (Chat / Documents / Skills / Record) | Sans, semibold |
| **H3** | Card title, document title in reader | Sans, semibold |
| **Body** | All running text, chat messages, descriptions | Sans, regular |
| **Caption** | Metadata, timestamps, source anchors, audit rows | Sans, regular, smaller |

### Spacing Scale (locked)

4 / 8 / 12 / 16 / 24 / 32 / 48 / 64. No intermediate values. Components use
these tokens; no agent introduces 14, 20, 28, etc.

### Density (locked)

Two densities only:

- **Comfortable** (default) — the matter shell, Chat, Documents, Record.
- **Compact** — admin tables, workspace audit, operator surfaces.

User does not toggle density. Density is determined by surface.

### Accent Usage (locked)

| Token | Use | Do not use for |
| --- | --- | --- |
| Brand seal `#8B0000` | Sign-off chrome, Record header, working-pack export seal | Buttons, links, default chrome |
| Primary | Default interactive chrome, primary CTAs | Sign-off (uses seal) |
| Muted | Captions, secondary metadata | Body text |
| Destructive | Reject, revoke, delete | Sign-off, export, anything affirmative |

The seal is reserved for the moments governance is **building trust**: signing,
recording, exporting. Using it elsewhere dilutes it.

### Empty States (locked pattern)

Every primary surface must define an empty state. The pattern is:

1. One sentence describing what lives here.
2. One primary action (the obvious next step).
3. One secondary link to docs if the action is non-obvious.

No empty state is allowed to be a blank panel. No empty state uses an
illustration unless the surface owns one in the design system.

### Component Reuse (locked)

The matter shell uses one card primitive (the existing Card component family).
Build agents do not invent new card variants. If a surface needs a variant,
the variant lands in the design system first via a separate PR.

---

## 5. Product Model (Locked)

Three user-facing objects. Nothing else has first-class status.

### 5.1 Matter

A matter is a folder. It contains:

- documents (the files);
- enabled skills (the tools allowed to run here);
- chat history (the conversation);
- outputs (what skills produced);
- sign-offs (what the solicitor approved);
- record (the audit trail, sources, grants — the proof layer);
- exports (sealed working packs produced from this matter).

A matter has a title, a status (active / signed / archived), and metadata
(client, opened date, type). Metadata is shown contextually, not as its own
tab.

### 5.2 Skill

A skill is an installable, signed tool. It has two lifecycle states:

- **Trusted at workspace level** — the firm/operator has reviewed the skill's
  signature, manifest, and required capabilities, and made it available to
  matters in this workspace.
- **Enabled in this matter** — a user has turned a trusted skill on inside a
  specific matter, accepting its scope (which documents it can read, which
  outputs it can produce).

These are two different surfaces and two different ceremonies. See §7.

### 5.3 Chat / Work

The primary work surface inside a matter. The user asks questions, the AI
answers with sources. The user runs skills, the skills produce outputs that
appear inline. Sign-off happens here, in context. The record is built as a
side effect.

Chat is not a chat product. Chat is the work surface for a matter. It happens
to use a conversational UI because that is the lowest-friction way to ask and
run.

---

## 6. User Journeys (Locked)

Five canonical journeys. Every PR is evaluated against them.

### 6.1 First Matter (New User, New Matter)

1. User signs in.
2. Lands on the Matters index. Empty state: "Open your first matter."
3. Clicks Open matter. Names it. Selects matter type (optional).
4. Lands inside the matter, on the **guided onboarding surface** (not chat).
5. Onboarding is three steps, inline, in one scroll:
   a. Add documents — drop or pick.
   b. Choose a skill — one suggested skill based on matter type; "Browse all"
      link.
   c. Run or ask — single CTA that opens Chat with the first run primed.
6. After the first run, Chat becomes the default surface for this matter on
   subsequent visits.

The guided onboarding carries the Kramer guided-exhibit learning. It exists
**only for matters with zero prior runs**. Once a matter has been worked, the
onboarding is replaced by Chat.

### 6.2 Returning Matter

1. User signs in.
2. Lands on Matters index. Recent matters at the top.
3. Clicks a matter.
4. Lands on **Chat**, with the most recent output visible inline at the top.
5. User asks a question or runs another skill.

### 6.3 Install A Skill

1. User clicks **Skills** in global nav.
2. Sees the workspace skill library: trusted skills, installable skills.
3. Clicks Install on a new skill.
4. Trust ceremony: manifest, signature, required capabilities shown plainly.
   Operator (or user with workspace permission) confirms.
5. Skill is now Trusted at workspace level.
6. User opens a matter. Goes to **Skills** tab inside the matter.
7. Sees trusted skills. Clicks **Enable in matter**.
8. Grant ceremony: which documents it may read, which outputs it may produce.
9. User confirms. Skill is now Enabled in this matter and appears in Chat.

### 6.4 Sign Off An Output

1. User runs a skill or asks a question in Chat.
2. Output appears inline as a Trust + Review card (the Kramer pattern):
   summary, sources (anchored to documents), confidence, four-question proof
   drawer accessible from the card.
3. User reviews. Two actions on the card: **Sign off** or **Reject**.
4. Sign-off uses the seal accent. Confirmation is one click; no modal unless
   the skill manifest requires one.
5. Signed output is locked. The card collapses to a signed-off state with the
   sign-off hash visible.
6. The signed output appears in Record automatically. No separate "publish"
   step.

### 6.5 Export The Matter

1. User opens **Record** inside a matter.
2. Sees the proof layer: signed outputs, source anchors, sign-off hashes,
   activity (chronological), grants.
3. Clicks **Export** in the Record header.
4. Working-pack export builds: documents + signed outputs + sources + audit +
   manifest + cover sheet. Seal applied to cover.
5. ZIP downloads. Export action is itself recorded in the Record.

Export is an action, not a destination. There is no Export tab.

---

## 7. Skill Lifecycle (Locked — The Critical Resolution)

This is the IA ambiguity the whitepaper flagged. Resolved here.

### Two Distinct Ceremonies

**Workspace Trust Ceremony** (operator surface, lives in global Skills):

- Discover a skill (marketplace or upload).
- Inspect manifest: name, version, author, signature, required capabilities.
- Inspect signature: who signed, when, against what hash.
- Operator confirms trust. Skill is now Trusted in this workspace.
- Trust can be revoked; revocation cascades to every matter that has enabled
  the skill (revocation is visible in each matter's Record).

**Matter Grant Ceremony** (user surface, lives in matter's Skills tab):

- A user with access to the matter sees trusted skills.
- Click Enable. See: which documents the skill will read, which outputs it
  will produce, which capabilities it needs.
- User confirms. Skill is now Enabled in this matter.
- Enable can be revoked at any time; the audit row is recorded.

### Why Two Surfaces

A firm trusts a skill once. A user decides whether a specific matter wants
that skill enabled. These are different decisions made by potentially
different people. Collapsing them into one surface either over-authorises (a
user grants a skill the firm has not vetted) or under-authorises (every
matter must re-run the trust ceremony).

### Global Skills Page (locked structure)

- Tab 1: **Installed** — trusted in this workspace, ready to enable in any
  matter.
- Tab 2: **Available** — marketplace, browse and install.
- Tab 3 (operator only): **Revoked** — previously trusted, now revoked, with
  reason and date.

### Matter Skills Tab (locked structure)

- Section 1: **Enabled in this matter** — actively available in Chat.
- Section 2: **Available to enable** — trusted in workspace but not yet
  enabled here. One-click enable opens grant ceremony.
- No marketplace inside a matter. Discovery and trust live at workspace
  level.

### Marketplace Compatibility Badge (locked)

Every skill card in the marketplace shows: **"Tested with Claude Sonnet 4.6+"**
(version pin per the V1 Provider Decision in the whitepaper). Skills without
this badge cannot be installed via the public path.

---

## 8. Route Hierarchy (Locked)

### Global Routes

```
/                           → Matters index (replaces dashboard)
/matters/:id                → Matter shell (default: Chat for worked matters,
                              Onboarding for fresh matters)
/matters/:id/chat           → Chat
/matters/:id/documents      → Documents
/matters/:id/documents/:id  → Document reader/redliner
/matters/:id/skills         → Skills (matter scope)
/matters/:id/record         → Record (matter proof layer)
/skills                     → Workspace skills (trust ceremony, marketplace)
/skills/:id                 → Skill detail (manifest, signature, install)
/settings                   → User and workspace settings
/admin                      → Operator surfaces (workspace audit, providers, roles)
```

### Routes That Move

| Current | New | Mechanism |
| --- | --- | --- |
| `/dashboard` | `/` (Matters index) | Redirect; old route stays mounted, redirects with 302 |
| `/matter-desk/:id` | `/matters/:id/chat` | Rename + redirect |
| `/matters/:id/actions` | `/matters/:id/skills` | Rename + redirect |
| `/matters/:id/outputs` | `/matters/:id/chat` (inline) and `/matters/:id/record` (archive) | Rename + redirect to Record |
| `/matters/:id/activity` | `/matters/:id/record` | Rename + redirect |
| `/matters/:id/export` | `/matters/:id/record` (export is an action) | Rename + redirect |
| `/modules` | `/skills` | Rename + redirect |
| `/workspace-audit` | `/admin/audit` | Move under admin |

**Route compatibility discipline:** old routes remain mounted with 302
redirects for the duration of the reset. Tests against old route names
continue to pass through redirect. Deletion happens only after PR 7 (post-
reset cleanup) and only with explicit approval.

### Navigation Surfaces

**Global nav (top bar / left rail, three items):**

- Matters
- Skills
- Settings

**Operator additional (visible only with operator role):**

- Admin

**Matter nav (inside a matter, four items):**

- Chat
- Documents
- Skills
- Record

**That is the entire navigation surface.** Six items maximum visible at any
time (three global + one operator + four matter, where the four matter items
are only visible inside a matter).

---

## 9. What Gets Hidden, Renamed, Merged

### Hidden From Default Nav

Hidden does not mean deleted. These remain reachable via deep link or admin.

- Workspace audit (moves under `/admin/audit`)
- Grant tables (move inside Record sub-view, "Grants" toggle)
- Posture internals (admin only)
- Module manifest details (Skill detail page, behind "Manifest" disclosure)
- Output metadata (Record sub-view, expandable)
- Export internals (inside the Export action drawer)
- Raw audit filters (Record advanced view)

### Renamed (UI Label Only — Routes Redirect)

- Dashboard → Matters
- Matter desk → Chat
- Actions → Skills (matter-scoped)
- Activity Trail → Record
- Outputs → (collapsed into Chat inline + Record archive)
- Workspace audit → Admin → Audit
- Modules → Skills (workspace-scoped)

### Merged

- Export tab → Record (Export becomes an action button in the Record header)
- Outputs tab → Chat (latest inline) + Record (archive list)
- Activity Trail + Workspace audit → one Audit surface under Admin; matter-
  level audit lives inside Record

### Stays Admin-Only

- `/admin/audit` (workspace audit)
- `/admin/providers` (model provider configuration)
- `/admin/roles` (user/operator roles)
- `/admin/skills/revoked` (operator-visible revocation log)

---

## 10. Backend Untouched Principle

**No backend changes are part of this reset.** The substrate is solid. The
substrate is also the source of Legalise's credibility. Touching it during a
UX reset risks introducing regressions that look like UX bugs and are
actually backend bugs, destroying the ability to debug either.

Allowed during the reset:

- Read-only consumption of existing endpoints.
- Composing existing endpoints differently in the frontend.
- Adding view-only frontend state.
- Adding redirects from old routes to new routes (frontend routing or thin
  shim).

Not allowed:

- New API endpoints.
- Schema changes.
- Audit logic changes.
- Sign-off logic changes.
- Grant logic changes.
- Provider logic changes.

**If a route lacks data:** the build agent must stop and demonstrate that no
existing endpoint composition can provide the data. Only then is a backend
change considered, and only with explicit approval from the human.

---

## 11. PR Sequence (Locked)

Seven PRs. Build in order. Each has a gate. The next PR does not start until
the previous PR's gate passes.

### PR 1 — Vocabulary Rename + Route Redirects

**Scope:** UI label changes only. Old routes mounted with 302 redirects to
new routes. No layout changes. No new surfaces.

**Deliverables:**

- Every UI string updated to locked vocabulary (§3).
- Route table updated per §8.
- Redirect shims for all renamed routes.
- Test suite passes against both old and new route names (via redirect).

**Gate:**

- Read every user-facing string in the app. Zero forbidden words present.
- All redirects work. Tests green.
- Visual diff shows label-only changes; no layout drift.

### PR 2 — Navigation Reset

**Scope:** Global nav becomes Matters / Skills / Settings (+ Admin for
operators). Matter nav becomes Chat / Documents / Skills / Record.

**Deliverables:**

- New global nav component.
- New matter nav component.
- Old nav items removed from the chrome (routes still reachable via redirect).
- Matters index becomes `/`.

**Gate:**

- 60-second comprehension test (§13) run against a fresh observer who has
  not seen prior versions. Observer can answer all five questions inside
  sixty seconds with no help.
- No regression in matter open/close, document list, chat history.

### PR 3 — Workspace Skills Surface

**Scope:** Global `/skills` becomes the workspace trust surface with
Installed / Available / Revoked tabs.

**Deliverables:**

- Workspace Skills page per §7.
- Skill detail page with manifest + signature + capabilities.
- Install flow (trust ceremony) using existing backend endpoints.
- Marketplace compatibility badge ("Tested with Claude Sonnet 4.6+") on
  every skill card.

**Gate:**

- A new operator can install a skill from the marketplace without
  explanation.
- Revocation cascades visibly to matters that have enabled the skill.

### PR 4 — Matter Skills Surface

**Scope:** Inside-matter `/skills` becomes the per-matter enable/grant
surface.

**Deliverables:**

- Matter Skills tab per §7.
- Enable-in-matter flow (grant ceremony) using existing backend endpoints.
- Enabled skills appear in Chat skill picker.

**Gate:**

- A user can enable a trusted skill in a matter and run it in Chat in
  under sixty seconds.
- Grant revocation produces a Record entry.

### PR 5 — Matter Chat Front Door + Guided Onboarding

**Scope:** Chat becomes the default route for a worked matter. Fresh matters
land on guided onboarding (§6.1).

**Deliverables:**

- Chat as `/matters/:id` default for matters with prior activity.
- Guided onboarding for fresh matters: three inline steps (add docs / choose
  skill / run).
- Trust + Review card pattern from Kramer applied to every output (summary,
  sources, four-question proof drawer, sign-off / reject).
- "Talk this output through" carry-over: every output has an inline chat
  follow-up.

**Gate:**

- A new user, given a fresh matter, completes their first signed output in
  under five minutes without external help.
- A returning user sees the most recent output inline within two seconds
  of opening the matter.

### PR 6 — Documents Reader / Redliner

**Scope:** Document reader becomes a first-class surface inside a matter.

**Deliverables:**

- Strong document reader: full-fidelity rendering, source anchors clickable
  from Chat into the reader at the exact location.
- Redline view: proposed changes from skills shown inline.
- Metadata behind a disclosure ("Details"), not as default chrome.
- Back-to-matter behaviour is one click and returns to the prior surface
  (Chat or Documents list), not always to Documents list.

**Gate:**

- A user clicks a source anchor in Chat and lands inside the document at the
  anchored location.
- A redline produced by a skill is reviewable and acceptable/rejectable
  inline.

### PR 7 — Record Compression

**Scope:** Activity Trail, Outputs archive, sign-offs, export, and matter-
level audit collapse into one Record surface.

**Deliverables:**

- Record view with sub-views: Timeline (default), Signed outputs, Sources,
  Grants, Audit (advanced).
- Export action in Record header. Export drawer with working-pack preview
  and checklist.
- Signed-off seal applied to the export cover sheet.
- Old `/activity`, `/outputs`, `/export` redirects continue to land here.

**Gate:**

- A user can answer "what happened in this matter?" using Record alone.
- A user can produce a working-pack export in under thirty seconds.
- A reviewer (not the matter owner) can reconstruct the matter's history
  from Record without external context.

### Post-Reset

- **Route deletion** (removing the 302 shims) is a separate PR, gated on
  three weeks of clean redirect traffic and explicit approval.
- **Visual polish** (icons, micro-interactions, transitions, illustration)
  is a separate PR, gated on the seven PRs above landing cleanly.
- **Backend changes** required by any PR above are separate PRs, scoped
  individually, and explicitly approved.

---

## 12. Per-PR Acceptance Criteria

Every PR ships with:

1. **Comprehension test result** — the 60-second test (§13) re-run by a
   fresh observer, recorded in the PR description.
2. **Vocabulary audit** — automated grep against forbidden words (§3) shows
   zero matches in user-facing strings.
3. **Visual diff** — screenshots before/after for every changed surface.
4. **Redirect proof** — old route names still reachable and arrive at the
   correct new surface.
5. **Backend untouched declaration** — PR description states explicitly
   which existing endpoints are consumed and confirms zero backend changes.
   If backend changes are present, they were pre-approved in a separate PR.
6. **Reviewer sign-off against this blueprint** — reviewer cites the
   blueprint section each change implements.

A PR that does not provide all six is not eligible to merge.

---

## 13. The 60-Second Comprehension Test (Canonical)

A fresh observer (someone who has not seen Legalise before, or has not seen
it since the prior PR) is shown the app, signed in, on the Matters index.
They are given no explanation. The test:

Within sixty seconds, the observer must answer all of the following without
prompting:

1. **Where am I?** — "I'm in Legalise. This is the list of my matters."
2. **What is a matter?** — "A folder for one piece of legal work."
3. **What document is here?** (after opening a matter) — names a document
   visible inside the matter.
4. **What skill can I run?** — names an enabled skill or finds the skill
   picker.
5. **What happens next?** — describes the chat/run flow.
6. **Where is the signed record?** — points to Record.

The test fails if the observer needs help on any question, or takes longer
than sixty seconds. Failing this test blocks the next PR. The reset is not
done until this test passes after PR 7 with a observer who has never used
Legalise before.

---

## 14. Non-Negotiables

These remain in force for the duration of the reset.

- No backend rewrite during the reset.
- No new governance primitives.
- No new top-level navigation items.
- No new product nouns beyond §3.
- No Kramer enthusiasm leaking into architecture. Specific Kramer
  *learnings* are carried explicitly (Trust + Review card, four-question
  proof drawer, guided onboarding, "Talk this output through," working-
  pack export with checklist, supervisor-gate UX, supervised-autonomy
  copy). Specific Kramer *aesthetic* (parody styling, divorce-specific
  copy, tertiary accent palette beyond the seal) is not carried.
- No CSS polish before §11 PRs land.
- No deletion of old routes until post-reset.
- No agent freestyle. Every change cites a blueprint section.
- No new demo paths. The product itself is the demo.
- No public copy changes during the reset.
- No skill marketplace changes beyond the compatibility badge.

---

## 15. Out Of Scope

Explicitly out of scope for this reset:

- Architecture rewrite work (capability runtime, signed modules at the
  substrate level beyond the existing implementation, sandboxed execution
  changes). The rewrite memo at `legalise-architecture-rewrite.md` is the
  next chapter; this reset prepares the IA so the rewrite has a clean
  surface to land into.
- Connector additions beyond what currently exists.
- New skill modules beyond what currently exists.
- Legal-quality evals.
- Pricing surfaces.
- Marketing site changes (the marketing site is a separate project; this
  is the app).
- YC application work.
- Provider configuration changes (Claude-first stance is locked per the
  whitepaper V1 Provider Decision; no provider-selector work here).

---

## 16. Decision Record

Decisions made in this blueprint that override or clarify the whitepaper:

| Decision | Source | Status |
| --- | --- | --- |
| **Matter, not Project**, in the UI | Blueprint §3 | Locked, overrides whitepaper Q1 |
| **Chat is front door for returning matters; guided onboarding for fresh** | Blueprint §6.1, §6.2 | Locked, clarifies whitepaper §"Chat as front door" |
| **Skill lifecycle = workspace trust + matter grant**, two ceremonies | Blueprint §7 | Locked, resolves whitepaper §"Skill lifecycle clarity" |
| **Visual tokens locked here, not deferred to a later polish PR** | Blueprint §4 | Locked, overrides agent's PR6 visual-pass plan |
| **PR sequence: vocab → nav → workspace skills → matter skills → chat → docs → record** | Blueprint §11 | Locked, overrides agent's earlier PR1-PR6 sequence |
| **Document reader/redliner has its own PR** | Blueprint §11 PR 6 | Locked, addresses whitepaper §"Document reader acknowledgement" |
| **Route compatibility = 302 redirect, no deletion during reset** | Blueprint §8, §10 | Locked, implements whitepaper §"Route compatibility discipline" |
| **60-second comprehension test is the gate, not green CI** | Blueprint §13 | Locked, addresses whitepaper §"60-second success test" |

---

## 17. Authority

This blueprint is the source of truth for the IA reset. Build agents:

- Cite the section number for every change.
- Do not amend the blueprint. Amendments require the human's explicit
  approval and produce a versioned successor document.
- Do not interpret. If a section is ambiguous, raise it; do not freestyle.
- Do not skip gates. Green CI is necessary but not sufficient.
- Do not introduce new nouns, new routes, new tabs, or new ceremonies.

Reviewers:

- Compare every change to the blueprint section it claims to implement.
- Block merges that lack the §12 acceptance criteria.
- Run the §13 comprehension test where applicable.

The human (Andy) is the only authority who can amend this blueprint. No
agent — including the agent that wrote it — has standing to relitigate
locked sections.

---

**End of blueprint.**
