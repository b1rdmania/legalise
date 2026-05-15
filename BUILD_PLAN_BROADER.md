# Build Plan — Legalise broader scope (v0.1+)

A standalone, self-contained build plan for the work that extends Legalise from
its current "regulatory + skills" shape into a fuller open-source legal AI
workspace, peer to Mike and Stella, with the regulatory wedge and the
marketplace direction as the differentiating layer.

This document is written so a fresh agent (or human) can pick it up cold, read
it once, and execute. Strategic framing is up front so judgment calls in the
build map back to intent. Concrete acceptance criteria per surface follow.

**Current head:** `0670108` on `master` (Day E shipped; auth build complete in
code; pre-flight checklist drafted; reviewer signed off `3baf9b6` on Day C+D,
Day E awaiting yes/nos).

**Repo:** `https://github.com/b1rdmania/legalise`
**Local:** `/Users/andy/Cursor Projects 2026/legalise/`

---

## 1. Why this exists (the strategic frame)

The Legalise repo's primary purpose is to be **a credibility artifact for an AI
legal firm** Andy is preparing to propose to solicitors. Launch traction is
upside, not the thesis. Whether the Hacker News post gets 50 stars or 5,000,
the GitHub repo lives forever as the exhibit Andy walks into solicitor
partner meetings with: *"here's what I built, here's how I think about
regulator-shape legal AI, here's how it compares to the polished US/EU peers."*

This reframes every build decision:

- **Audience priority is solicitors and law-firm tech leads first**, OSS hackers second. HN and X are distribution to reach that audience, not the success metric.
- **The build target is "credible substance," not "viral feature parity."** Enough Harvey/Legora baseline that a solicitor doesn't bounce (*"OK but where's the redliner?"*), plus the distinctive regulatory wedge, plus the marketplace direction. That's a credibility threshold, not a feature race against Mike.
- **The OSS shape is itself the calling card.** A fork or a niche regulatory-only build won't anchor a firm conversation. An original, peer-credited, broader workspace will.

### Why clean-room, not fork

Andy considered forking Mike. Rejected for three reasons:

1. **Calling-card optics.** A fork makes you "the guy who forked Mike" in solicitor conversations. Original work that credits Mike and Stella as peers makes you "Andy, who built his own thing in the same space and is in conversation with the others." That's a meaningfully different positioning when walking into a partner meeting.
2. **License.** Mike is **AGPL-3.0**. Forking commits Legalise to AGPL forever, with the SaaS-trigger clause that requires any networked instance to expose source. Closes the door on any firm wanting a private fork. Apache 2.0 (current Legalise license) is the right posture for the firm play.
3. **Peer hygiene.** Will (Mike) and Jan (Stella) are real builder relationships, not abstract competitors. Forking Mike puts Andy in an awkward position with Will. Clean-room original work that openly cites both makes the peer relationship structurally healthier.

### Why broader, not narrow

Andy considered shipping the current narrow build (matter spine + 3 demo
modules + auth + audit) on Day 18 as planned. Rejected:

> "If we do something that's quite niche — the four modules and the
> regulatory stuff — that gets 10 likes, 5 stars on GitHub, and drops like a
> stone."

The narrow build doesn't meet the credibility threshold for the firm play, and
doesn't earn the peer-builder relationships either. A solicitor opens it,
sees three legal-tech-y demo modules, and says *"OK but where's the
redliner / tabular review / case-law lookup / track changes?"* The broader
build answers that question with substance and then *adds* the regulatory
shape on top.

---

## 2. The space — peer-builder map

Two adjacent open-source legal AI workspaces, both **collaborators in the
same space, not competitors**. Do not frame either as a rival in public
documents, GitHub copy, or launch posts.

### Stella

- **Repo:** `https://github.com/stella/stella`
- **Maintainer:** Jan Kubica
- **License:** Apache-2.0
- **Shape:** Production-grade TypeScript monorepo. Bun + Elysia + React/Vite + Turbo. Six apps (api, web, desktop, landing, docs, playground), 15 `@stll/*` packages including `anonymize-chat`, `case-law`, `docx-core`, `folio` (tabular review), `skills`, `template-conditions`.
- **Built for:** Magic Circle scale (CLAUDE.md mandates SOC 2 + ISO 27001 posture from day one). European, jurisdiction-pluralist by construction. Czech maintainer; `infosoud` package suggests Czech court-data integration.
- **Velocity:** Real product-company velocity. 752 commits from Jan, daily shipping, bot-augmented (`stella-lingo`, `stella-provenance-updater`, CLA bot).
- **Active surfaces:** Matters, document storage with FTS + versioning, Folio (tabular review), `anonymize-chat` (document anonymisation shipped recently), case-law package.
- **Relationship:** Andy is in informal contact with Jan on X. Out-of-band only — nothing in repo confirms the contact yet.

### Mike

- **Repo:** `https://github.com/willchen96/mike`
- **Maintainer:** Will Chen (`willchen96` / `cosimoastrada`)
- **License:** AGPL-3.0
- **Shape:** Next.js (App Router) frontend + Express backend + Supabase (auth + Postgres) + Cloudflare R2. ~16 days old, ~3k stars, ~870 forks. Self-described "OSS AI Legal Platform."
- **Built for:** *"Anyone priced out by Harvey/Legora"* (Will's Artificial Lawyer interview framing). Small/mid law firms. Jurisdiction-blank by inheritance — the built-in workflows are finance/M&A-flavoured (Credit Agreement Summary, Shareholder Agreement Summary, Generate CP Checklist), but jurisdiction-untagged.
- **Velocity:** Heavy. ~34 PRs, ~45 issues in 16 days. Will is shipping mostly his own PRs.
- **Active surfaces:** Projects (matter equivalent), assistant chat (global + per-project), document editing with **track changes** (`document_edits` + `document_versions` tables, accept/reject diffs in-UI — this is the headline UX), **tabular reviews** (`tabular_reviews` with `columns_config` JSONB), **workflows** (prompt templates + builtins), BYO Anthropic/Gemini/OpenAI keys (`user_api_keys` table, encrypted at rest), `generate_docx` tool, signed-URL document downloads.
- **Notable open issues we are structurally answering:**
  - **#3** — "Is Mike aimed at any specific territory?" — closed without commitment. Mike is territory-agnostic by accident.
  - **#33** + PR **#34** — "Externalize built-in workflows into declarative workflow packs" — proposes YAML/JSON pack format with `jurisdiction`, `language`, `version` fields. Unmerged.
  - **#32** + **#36** — "feat(mcp): add Connectors — URL+headers and OAuth 2.1" + roadmap question. Both unresponded.
  - **#55** — `punyaslokdutta`'s "Deployment gaps blocking law firm adoption: privilege, sovereignty, DMS" — explicitly raises US v. Heppner privilege exposure, iManage/NetDocuments integration, data sovereignty. **No maintainer response.**
- **Notable gaps in Mike:** No audit log table. No privilege flag on documents. No retention policy. No jurisdiction tagging. No DMS connectors. No real multi-tenancy beyond `shared_with` JSONB. RLS only landed in PR #13. Most `user_id` columns are still `text`, not UUID-with-FK.
- **Relationship:** Andy is in conversation with Will.

### How Legalise fits

- **Jurisdictional spectrum.** Stella is jurisdiction-pluralist (i18n runtime, no hardcoded jurisdiction). Mike is jurisdiction-blank (inherited from upstream). Legalise is **England & Wales, deliberately and exclusively.** CPR 31.22 gate, Part 36 letters, ET1 drafter, claude-for-uk-legal are all E&W-specific.
- **Regulatory shape.** Stella mandates SOC 2 / ISO 27001 posture in CLAUDE.md but ships generic isolation primitives. Mike has neither audit log nor privilege flag. **Legalise is the only one with privilege posture, audit-by-default, CPR-31.22-as-a-server-side-gate, and retention as first-class.** This is the wedge.
- **Marketplace shape.** Mike has open community PRs for declarative workflow packs (#33/#34) and MCP connectors (#32/#36), neither merged. Stella's `skills` package is internal. **Legalise has the most-developed skills-as-Git-marketplace shape** (`claude-for-uk-legal` rendered into the workspace, PR-review approval workflow, pinned-SHA provenance). The broader build extends this with public submission + in-app install lifecycle.
- **License compatibility.** Apache↔Apache between Legalise and Stella — code flows freely both ways. AGPL (Mike) is one-way friction — Mike can absorb our code; we cannot absorb theirs without going AGPL. So **clean-room rebuild is the only legal path for the Mike-shaped surfaces.**

---

## 3. License posture (load-bearing)

**Legalise stays Apache-2.0.** All work in this build plan is **clean-room** —
read Mike's README, observe the surfaces, replicate the *idea* in our own code.
Do not copy code, schema definitions, prompt strings, or markup verbatim from
Mike's repo. The trigger is "substantial similarity in expression"; we want
"same product idea, independent implementation."

Stella is Apache-2.0; in principle code can flow. In practice Stella is
TypeScript/Bun/Elysia and Legalise is Python/FastAPI, so a direct port is
also rebuild work. Where we lift an *idea* from Stella (Folio shape,
anonymisation flow), credit them; where we genuinely port (e.g. UI patterns
from their design system), credit + retain Apache notices.

---

## 4. Scope to build

What ships on top of the current `master` (head `0670108`). Each item has a
self-contained acceptance bar so the executing agent can mark them done
without ambiguity.

### 4a. Document tracked-changes editor

The Mike headline UX. Solicitors expect this; without it the calling card has
a hole.

**Backend:**
- `document_versions` table: `id`, `document_id`, `version_number`,
  `kind` (enum: `upload | assistant_edit | user_accept | user_reject | generated`), `created_by_id`, `created_at`, `storage_uri`, `notes`.
- `document_edits` table: `id`, `document_version_id`, `change_id`,
  `deleted_text`, `inserted_text`, `context_before`, `context_after`,
  `status` (enum: `pending | accepted | rejected`), `created_at`,
  `resolved_at`, `resolved_by_id`.
- Audit middleware: every accept/reject writes a `document.edit.accepted`
  or `document.edit.rejected` row.
- Model tools exposed via the gateway: `replicate_document(document_id) → new_version`, `edit_document(version_id, changes[]) → pending_edits`.

**Frontend:**
- Document detail surface: side-by-side diff view of latest version vs. the user's working copy. Each change is an inline pill with Accept / Reject buttons. Bulk accept-all / reject-all per session.
- Version timeline: list of versions with kind + author + timestamp.

**Acceptance:**
- A user can ask the assistant "tighten the indemnity clause" via the chat surface. Assistant calls `edit_document` with structured changes. UI renders pending diffs. User accepts two, rejects one, edits one manually. Final version has correct text, audit log shows accept/reject rows with `prompt_hash` and `model_used`.

**Note on shape:** Mike's `document_edits` schema is reasonable — see `backend/schema.sql` in their repo for the column shape. Read it for inspiration, do not copy.

### 4b. Tabular review

Spreadsheet over documents. Each row is a document; each column is an
extracted/answered field. Stella has Folio; Mike has tabular reviews. Same
idea, two implementations.

**Backend:**
- `tabular_reviews` table: `id`, `matter_id`, `title`, `created_by_id`,
  `columns_config` (JSONB — array of `{key, label, prompt, type}`),
  `created_at`, `updated_at`.
- `tabular_review_rows` table: `review_id`, `document_id`, `extracted_values` (JSONB), `last_run_at`.
- Endpoint to run a review (`POST /api/matters/{slug}/reviews/{id}/run`) — for each (doc, column) pair, dispatch through the model gateway with the column prompt + document text, collect into the row.
- `.docx` export endpoint (landscape, per-column).

**Frontend:**
- New tab in MatterDetail: **Reviews** (sits between Documents and Chronology).
- Spreadsheet UI: column editor (add/remove/edit columns), row list bound to documents in the matter, run button per column or whole review, status indicator while running, .docx export button.

**Acceptance:**
- User on Khan v Acme creates a review titled "Acme correspondence — disclosure relevance," adds two columns ("Date sent", "Mentions s.94 ERA?"), runs it across the two seeded documents, gets results in cells, exports landscape .docx. Audit log has `module.tabular_review.column.run` rows per call.

### 4c. `generate_docx` tool

A model-callable tool that produces a `.docx` artifact from structured input
(markdown or templated). Mike has this. Useful for Letters output (currently
markdown only), Tabular Reviews export, and Pre-Motion synthesis export
(currently PDF only).

**Backend:**
- Tool exposed in the gateway: `generate_docx(title, body_markdown, options)`. Wraps Gotenberg (already in our stack) or a Python docx library (`python-docx`) — pick the lighter dep.
- Outputs land in matter file storage, with a `document.generated` audit row.

**Frontend:**
- Wired into Letters tab: "Download as .docx" alongside the existing markdown view.
- Wired into Pre-Motion tab: "Download as .docx" alongside the existing PDF.

**Acceptance:**
- User drafts an LBA via Letters, clicks "Download .docx", gets a valid Word document. Audit log has `document.generated` with `format=docx`.

### 4d. Document anonymisation

Stella ships this in `@stll/anonymize-chat`. Same shape: detect entities
(parties, addresses, dates, monetary amounts), replace with placeholders,
store original separately, provide a toggle in the UI.

**Backend:**
- New module under `backend/app/modules/anonymisation/`. Pipeline:
  detect entities via a model call (use Claude with a structured-output
  prompt; spec the entity types), replace with `[PARTY_1]` / `[ADDRESS_2]`
  / `[DATE_3]` tokens, store mapping.
- Each document gains an `anonymised_version_id` pointer.
- Audit row `module.anonymisation.run` per invocation.

**Frontend:**
- Documents tab: per-row "Anonymise" button. Toggle in the document detail view to switch between original and anonymised. Mapping visible only to the matter owner.

**Acceptance:**
- User anonymises Khan's dismissal letter. UI shows tokenised version. Toggle back to original works. Mapping is correct (party names → `[PARTY_n]`, dates → `[DATE_n]`).

### 4e. Case-law lookup surface

`claude-for-uk-legal/uk-research-legal/find-case-law` exists as a skill;
expose it as a workspace surface, not just a Modules-page entry.

**Frontend:**
- New tab in MatterDetail: **Research** (after Reviews, before Chronology).
- Search box + result cards. Result card has: case name, citation, summary, "cite into matter" action (adds to a `matter_citations` collection).
- Optionally: a sidebar showing previously-cited authorities for the matter.

**Backend:**
- Light: just invoke the skill via the existing plugin bridge with the search query. Stash returned citations in `matter_citations` table on user action.

**Acceptance:**
- User searches "unfair dismissal Burchell test" within Khan. Gets back 3-5 case cards. Clicks "cite into matter" on one. Citation persists; appears in Pre-Motion synthesis prompt as available authority.

### 4f. Counsel-mvp redliner port

The four-agent contract review pipeline (Parser → Analyst → Redliner →
Summariser) lives in `/Users/andy/counsel-mvp/`. Port the orchestration
into Legalise as a new module under `backend/app/modules/contract_review/`,
exposed under the existing Contract Review v0.2 callout in OverviewTab.

**Backend:**
- New module mirroring the Pre-Motion pipeline shape: SSE streaming endpoint, per-stage audit rows, structured envelope output.
- Reuse the gateway, audit middleware, privilege posture gate.

**Frontend:**
- Promote the Overview Roadmap-callout for Contract Review v0.2 into an actual tab: **Contract review**. Same shape as Pre-Motion (run button, stage strip, result panel, .docx export via the new generate_docx tool).

**Acceptance:**
- User on Khan uploads a contract (synthetic, fixture), runs contract review, sees four-stage progress, gets redline output. Audit log has stage rows + .docx export row.

**Note on UK-shaping:** counsel-mvp's redliner is jurisdiction-light. Add an
analyst-stage system prompt that surfaces UK-specific issues (UCTA,
Consumer Rights Act, GDPR clauses, governing law / jurisdiction clauses,
arbitration). That's where the wedge appears vs. Mike's generic shape.

### 4g. Matter wire-format spec (public RFC)

The schema at `schemas/matter.json` exists today; the broader build elevates
it to a community proposal.

**Doc:**
- New file `docs/MATTER_SCHEMA_RFC.md` — explainer for the schema's design intent (portable across workspaces, Apache-licensed, minimal core + jurisdiction extensions).
- Open a GitHub Discussion on the Legalise repo titled *"Community matter wire format — RFC for peer-builder workspaces"* linking the spec.
- Open a corresponding Issue (not PR) on `stella/stella` and `willchen96/mike` repos: *"Cross-workspace matter portability — RFC at <link>. Welcoming counter-proposals."* Tag respectfully.

**Code:**
- Loosen `schemas/matter.json` `additionalProperties: false` → allow extension fields (jurisdiction packs). Document the extension mechanism in the RFC.
- Add an importer/exporter pair: `POST /api/matters/import` accepts a matter.json + folder; `GET /api/matters/{slug}/export` returns the same shape.

**Acceptance:**
- Public RFC visible at the GitHub Discussion URL. Importer can round-trip the seeded Khan matter to a tarball and re-import to a fresh user (eval written for this in `evals/smoke_matter_portability.py`).
- Outreach issues filed on both peer repos. (Outreach action belongs to Andy, not the executing agent. Surface the draft text for him to send.)

### 4h. Public module submission flow

Pre-login surface where someone can propose a new module to the
`claude-for-uk-legal` catalogue. Submissions land as draft PRs on the
catalogue repo, not as in-app DB rows. Keeps the Git-as-marketplace shape
intact.

**Frontend:**
- New unauthenticated route `#/modules/submit`. Form: name, plugin (employment / litigation / research), description, prompt body (markdown), argument hint, contact email.
- Preview + submit. On submit, the form serialises into a SKILL.md template and POSTs to the backend.

**Backend:**
- New endpoint `POST /api/modules/submissions`. Validates the SKILL.md shape, uses a service-account GitHub token (stored as a Fly secret `GITHUB_SUBMISSION_TOKEN`) to: fork `claude-for-uk-legal`, create a branch, commit the SKILL.md under the right plugin directory, open a draft PR titled `[submission] {name}` with the submitter's email in the body, return the PR URL.
- Spam control: simple Cloudflare Turnstile or hCaptcha on the submission form. Rate-limit by IP.

**Frontend confirmation:**
- After submit, show the PR URL: *"Your submission is up at {url}. The maintainer reviews submissions weekly. You'll be CC'd as the proposer."*

**Acceptance:**
- Unauthenticated visitor submits a module. PR appears on `claude-for-uk-legal` as `[submission] {name}` with the SKILL.md content. Submitter sees the PR URL.

### 4i. In-app module install lifecycle

Currently the `#/modules` surface is read-only over `PLUGINS_ROOT`. Add a
workspace-level enable/disable per skill.

**Backend:**
- New table `workspace_enabled_skills`: `user_id`, `plugin`, `skill`, `enabled_at`.
- Defaults: all skills enabled at signup. Disable toggle removes the row; surface filters disabled skills from Letters catalogue / Pre-Motion / etc.

**Frontend:**
- On `#/modules` (authenticated view only), each skill gets an Enable/Disable toggle. Workspace-scoped.
- Disabled skills still appear in the catalogue (greyed) so users can see what's available but switched off.

**Acceptance:**
- User disables `lba-drafter` in their workspace. Letters tab no longer offers it. Re-enabling restores it. Toggling writes to audit log.

### 4j. Polish + new evals + launch positioning rewrite

**Evals:**
- `evals/smoke_matter_portability.py` — export + re-import round-trip
- `evals/smoke_tracked_changes.py` — replicate → edit → accept/reject → version history
- `evals/smoke_tabular_review.py` — create review → run → export .docx
- `evals/smoke_anonymisation.py` — detect → tokenise → re-detoken
- `evals/smoke_contract_review.py` — four-stage pipeline rows

**Documentation:**
- `README.md` rewrite: solicitor-first framing. Lead with "open-source UK legal AI workspace, regulator-shaped, peer to Stella and Mike." Link both repos in a "Adjacent open-source projects" section above the install instructions. Drop developer-shaped phrasings like "audited execution layer" from the hero — they read narrow. Keep them in body for the readers who want them.
- `docs/PEERS.md` — new file. Honest one-page on Stella + Mike: what each is, what shape they're optimised for, why all three exist, license matrix, schema overlap. Links explicit.
- `MANIFESTO.md` review — does it still read solicitor-first? Adjust.
- `HANDOVER_LAUNCH.md` rewrite: solicitor-audience HN/X copy. Cite Stella + Mike by name in the first comment. Draft outreach DMs to both maintainers with a peer-launch nod request.
- `ROADMAP.md`: tracked-changes / tabular / anonymisation / case-law / contract-review move into "v0.1 — Q3 2026" (now). Marketplace + interop tooling stays v0.2. Enterprise SSO + multi-provider stay v0.2.

**Launch posture:**
- Solicitors and law-firm tech leads are primary. OSS hackers are distribution.
- Peer-credited: Stella and Mike named in the HN first comment, in README adjacent-projects section, in PEERS.md.
- Andy's relationships with Will and Jan are an asset: soft-pre-pitch both before launch, ideally land a co-published blog or X reply chain on launch day.

---

## 5. Sequencing

Five phases. Each phase ends in a green build + an evals run + a reviewer
handover for Codex. Codex review rounds happen between phases. Phases can
be ordered as below; deviating is allowed if the executing agent surfaces
why.

### Phase A — Foundation (~1-2 days)

Add the schema + tool plumbing that other surfaces depend on.

- `document_versions` + `document_edits` tables + Alembic migration
- `tabular_reviews` + `tabular_review_rows` tables
- `workspace_enabled_skills` table
- `matter_citations` table
- Tool plumbing in `app/core/model_gateway.py`: register `generate_docx`, `edit_document`, `replicate_document` as gateway-known tools with structured-output schemas

Handover at end of Phase A: `HANDOVER_BROADER_A.md`.

### Phase B — Mike-baseline surfaces (~2-3 days)

- Tracked-changes editor (4a)
- Tabular review (4b)
- `generate_docx` UI wiring (4c)

Handover: `HANDOVER_BROADER_B.md`.

### Phase C — Stella-baseline + counsel-mvp port (~2-3 days)

- Document anonymisation (4d)
- Case-law lookup surface (4e)
- Counsel-mvp redliner port (4f)

Handover: `HANDOVER_BROADER_C.md`.

### Phase D — Marketplace + interop (~2 days)

- Matter wire-format RFC + importer/exporter (4g)
- Public module submission flow (4h)
- In-app install lifecycle (4i)

Handover: `HANDOVER_BROADER_D.md`.

### Phase E — Launch positioning + deploy (~1-2 days)

- New evals (4j)
- README + PEERS.md + ROADMAP.md + HANDOVER_LAUNCH.md rewrite (4j)
- Andy works through `PRE_FLIGHT.md`
- Day 15-style deploy per `infra/deploy/cloudflare.md`
- Soft-pre-pitch to Will + Jan (Andy action — agent surfaces draft DM text)
- Day 18-equivalent launch

Total honest estimate at current velocity: **8-12 working days** for the
build, plus pre-flight + deploy + launch around it. Launch realistically
lands late May / early June 2026.

---

## 6. Acceptance bar — peer-builder hygiene

Every public-facing artifact (README, MANIFESTO, ROADMAP, PEERS.md, HN post,
launch blog, X drafts) must:

- **Name Stella and Mike as peers in the same open-source space.** Link both repos.
- **Credit influence honestly.** "Tracked-changes editing draws on the surface idea Mike popularised; tabular review is a parallel implementation of Stella's Folio shape." Not "we improved on Mike" or "we have what Mike lacks."
- **Avoid competitor framing entirely.** No comparison tables that imply rivalry. PEERS.md is the closest thing to comparison and should read as map, not ranking.
- **Be honest about what Legalise doesn't ship.** Stella's anonymisation is more polished. Mike's track-changes UX is more mature. Don't oversell parity; sell the regulator-shape wedge.

Internal docs (`HANDOVER_*`, BUILD_PLAN_*, EXECUTIVE_SUMMARY) can be more
direct about competitive positioning, since they don't ship publicly.

---

## 7. License hygiene during the build

- **No code copied from Mike.** Read their repo for shape understanding; implement independently. If you find yourself typing something that looks identical to Mike's `document_edits` columns or `tabular_reviews` JSONB shape, deliberately diverge — different column names, different schema choices, our own conventions.
- **Stella code can be referenced.** Apache-2.0 compatible. If a Stella package gives you a useful prompt or pattern (entity detection for anonymisation, e.g.), credit them in a code comment and an `ATTRIBUTIONS.md` file. Don't import their TS into our Python (different runtime anyway).
- **claude-for-uk-legal is ours** — fair game for any internal reuse.
- **counsel-mvp is ours** — also fair game.

---

## 8. Open questions for Andy (not blockers for Phase A start)

1. **Anonymisation entity model.** Use Claude with structured-output for entity detection (slow but accurate, costs tokens per page), or use a deterministic Python NER library (`spacy` or `presidio` — Microsoft's PII tool)? Recommendation: Presidio for v0.1 (deterministic, no token cost, runs locally; reserve Claude for hard cases). Confirm before Phase C.

2. **Module submission spam control.** Cloudflare Turnstile (recommended — same vendor as DNS), hCaptcha, or rate-limit-only? Recommendation: Turnstile.

3. **Tabular review pricing communication.** Each column × document = one model call. A 20-doc, 5-column review = 100 calls. Surface a cost estimate in the UI before running? Or just run? Recommendation: surface estimate (token count × current provider rate from the user's stored key), require confirm above 50 calls.

4. **Tracked-changes diff library.** Hand-roll diff visualisation in React, or use `diff-match-patch` (Google's library, BSD-licensed)? Recommendation: diff-match-patch — battle-tested, small, BSD-compatible with Apache.

5. **Outreach DM drafts to Will + Jan.** Should the agent draft these as part of Phase E, or does Andy want to write them himself? Recommendation: agent drafts, Andy edits + sends.

---

## 9. What's deliberately *not* in this plan

- **Enterprise SSO (WorkOS / Stytch).** Stays v0.2. Sole-practitioner signup covers v0.1 audience.
- **Multi-provider Gemini.** Stays v0.2. Anthropic + OpenAI covers v0.1.
- **MFA / TOTP.** v0.2 with SSO.
- **Master-key rotation tooling.** v0.2 (`docs/AUTH.md` §4 already flags this).
- **Org / team objects.** v0.2.
- **DMS integrations (iManage, NetDocuments).** v0.3. Mike's #55 asks for this; we'll get there with a partner firm.
- **Status page / vulnerability disclosure programme.** v0.2 trust workstream.

---

## 10. How a fresh agent should use this doc

1. Read it once, end to end, in the order written. Strategic frame in §1 is load-bearing — every code decision in the build should reflect it.
2. Read the current repo state: `README.md`, `MANIFESTO.md`, `ROADMAP.md`, `docs/TRUST.md`, `docs/AUTH.md`, `BUILD_PLAN.md`, `HANDOVER_LAUNCH.md`, `HANDOVER_DAY_E.md`, `frontend/src/App.tsx` skim, `backend/app/main.py`.
3. Read Mike (`https://github.com/willchen96/mike`) and Stella (`https://github.com/stella/stella`) — README + schema + one or two surface files in each. **Do not copy their code.**
4. Spawn a Plan agent for Phase A and produce a per-table / per-tool delta sheet before writing code.
5. Execute Phase A. Build green at the end. Write `HANDOVER_BROADER_A.md` for Codex.
6. Wait for reviewer signoff. Address findings.
7. Move to Phase B. Repeat.
8. Surface the open questions in §8 to Andy at the right phase boundary, not earlier — he's running multiple projects and doesn't need decision noise upfront.

---

## 11. Why this plan exists in this shape

Andy stepped back and reframed the project. The previous build path was
optimised for "ship the regulatory-shape layer on Day 18 and see what
happens." The new path optimises for **building a credible open-source
artifact for an AI legal firm play**, in conversation with two peer
builders (Will at Mike, Jan at Stella), within current AI-pair-programming
velocity (the kind of velocity where 18 days of solo work compresses to
~24 hours of agent-assisted work).

The plan is broader than the original v0.1 but not slower in absolute
terms — current velocity means ~8-12 working days of build, not weeks. The
calling-card thesis means the bigger artifact is worth the extra days, even
if launch traction is modest, because the repo lives forever as a firm-
pitch exhibit.

Mike and Stella are peers, not competitors. Treat the relationship that
way at every level — in code (no AGPL contamination, peer-credited
attribution), in docs (named, linked, mapped, not ranked), in launch
(co-pitched, mutually credited), and in posture (Andy's relationships with
Will and Jan are an asset; protect them).

---

**Repo head when this plan was written:** `0670108` on `master`.

**Next concrete action for the executing agent:** read §1–§3 once more,
then spawn a Plan agent to scope Phase A schema + tool plumbing in
`backend/app/models/` and `backend/app/core/model_gateway.py`. Execute
Phase A. Hand over.
