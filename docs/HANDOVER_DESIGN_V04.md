# Design handover — Legalise v0.4

**For:** the reviewer agent (and Andy for context).
**As of:** 2026-05-19. Updated after a reviewer pass — current master is past `22a323d`; the hardening commits that landed after the original handover are the response to those review notes. See `git log` for the live trail.

**v0.4 shell is FROZEN.** Chat surface redesign SHIPPED `1e683be`+`b535356`: 920px centered conversation column, 560px user bubble on `bg-wash`, citation chips as `Document · filename.ext` / `Event · 12 Mar 2026`, sticky composer width-matched, RightRailAssistant has explicit `disabled` state. All four backend TODOs from `BACKEND_TODOS.md` SHIPPED (`a5dca6d`, `bddca3d`, `1196599`, `4583f4b`). Product doctrine added at `docs/JOY.md` (`3e9b443`) and linked from DESIGN.md. JOY-doctrine pass SHIPPED `1ff2a75`+`1b83353`: Matter Pulse panel + Suggested Actions chips + Audit Confirmation in metadata line; raw HTTP errors prefixed with action-shaped context across 15 module/auth files; trust copy tightened on Modules and Workflows; dead chronology source link demoted.
**Scope:** every visual change shipped in this session, the doctrine behind them, what's settled, what's open. Read this before opening DESIGN.md; this is the short story, DESIGN.md is the long one.

---

## 1. TL;DR

v0.4 is a SaaS-LLM workspace, not a whitepaper. The matter surface has a compact 220px left rail (5 primitives), a slim breadcrumb instead of a header strip, a persistent right-rail Assistant on every non-Assistant surface, and a Workflows catalogue that nests installed modules behind one nav item. The Landing is the only surface that keeps the Warp whitepaper aesthetic — because it actually is a whitepaper.

Three flips in 24 hours got us here. Each was load-bearing; none was random; the doctrine now scopes Warp to the Landing and uses Mike / Claude.ai / Sana AI patterns for the workspace.

---

## 2. The flips (honest record)

| Version | Matter shell shape | Why retired |
|---|---|---|
| **v0.2** | Horizontal tab bar + dense panel header strip (HyperTrade Terminal lineage) | Felt like a legacy admin panel. Reviewer flagged terminal density on workspace surfaces. |
| **v0.3** | Whitepaper sidebar TOC + document hero (Warp lineage applied universally) | Read as "thesis document wrapped around a backend." Matter surfaces are discrete tools, not chapters of one scroll. |
| **v0.3.1** | Horizontal tab bar + MatterHeader (10 numbered tabs, 5-item metadata strip on every page) | Ten primitives across the top read as conceptually noisy. Mobbin pull on Bonsai / Asana / Square confirmed 4-6 items max for workspace nav. |
| **v0.4 (current)** | Compact left rail (5 items) + slim breadcrumb + persistent right-rail Assistant + Workflows catalogue | Settled. SaaS-LLM standard pattern; lifted from Mike / Claude.ai / Sana AI / Fibery / Mistral. |

DESIGN.md preserves the v0.3 changelog inside the v0.4 section so the doctrine evolution is on the record.

---

## 3. Doctrine — what's settled

**Two registers, scoped:**
- **Whitepaper register (Warp lineage).** Landing only. Sidebar TOC with scroll-spy, document hero, numbered sections, em-dash bullet lists (rendered as hyphens), wash-background pull quotes with thick ink left border.
- **Workspace register (Mike + Claude.ai lineage).** Everything inside the app: matter detail, settings, modules catalogue, matter list. Compact left rail, slim breadcrumb, no document hero, no sidebar TOC.

**Tokens.** Six named colours: paper `#FFFFFF`, ink `#181818`, wash `#F4F4F4`, rule `#E5E5E5`, muted `#9CA3AF`, prose `#4B5563`. Semantic state (text + border only, never fills in chrome): `#00A35C` green, `#D9304F` red (paired surface `#FEF2F2` + text `#B91C1C`), `#E67E22` amber, `#0066CC` info. No gradients, no shadows, no rounded corners anywhere. Type stack: Hanken Grotesk (body) + JetBrains Mono (data, eyebrows, citations).

**Anti-patterns codified in DESIGN.md** (do not reintroduce):
1. Coloured status fills (green OPEN, orange B_MIXED with coloured square)
2. Mixed font weights in a single value row
3. Pull quotes with internal eyebrow labels
4. Terminal density on workspace surfaces
5. Mono on values that sit next to sans-semibold values
6. Sidebar TOCs on workspace surfaces (Landing only)
7. Horizontal tab bars with more than ~6 items
8. Matter headers with full metadata strips
9. "Open demo" CTAs that route to signup
10. Marketing voice in chrome strings

---

## 4. Surface-by-surface — what to look at

### 4.1 Landing `#/`
- Two-col hero on `lg`: text + CTAs left, splash artwork right (`/hero-splash.png`, 916 KB — compression follow-up flagged).
- "Built on" trust strip below the hero: `Anthropic Claude · OpenAI · FastAPI · Postgres + pgvector · Apache 2.0 · github.com/b1rdmania/legalise`. Centered, no logos, all-ink semibold.
- Sticky sidebar TOC + 6 numbered whitepaper sections below the fold. Scroll-spy active.
- H1 is exactly four sentences: *"Open a matter. Ask the assistant. Run a legal module. See the audit trail."*

### 4.2 Matter detail `#/matters/{slug}/{tab}`
- **Bare `/matters/{slug}` lands on Assistant.** No Overview tab.
- **Left rail (`MatterNav`, 220px, `hidden md:flex` static).** Matter card at top with title + slug (mono xs muted) + posture chip. Five nav items below with inline 16px SVG icons + label: Assistant, Documents, Chronology, Workflows, Audit. Active = `bg-wash text-ink font-semibold`. Workflow surfaces (Pre-Motion, Letters, Contract review, Tabular Review, Case law) highlight "Workflows" via `sidebarActiveFor()`.
- **Slim breadcrumb (`MatterBreadcrumb`) above content.** `Matters / Khan v Acme Trading Ltd / Assistant`. Mobile-only hamburger button at the left edge.
- **Mobile (`< md`) MatterNav as slide-out sheet.** 280px left-anchored, `bg-ink/40` backdrop, hamburger triggers, auto-closes on nav-tap or X button or backdrop click. Coexists with the global P18 drawer (different scope: P18 is global app nav; the matter sheet is matter-scoped).
- **Right-rail Assistant (`RightRailAssistant`, 340px expanded, 44px collapsed, `hidden lg:flex`).** Persists on every matter surface EXCEPT the Assistant tab itself and the Workflows catalogue page (no context to discuss on those). Collapse state persists to `localStorage` under `legalise.right-rail.collapsed`. Composer at bottom with placeholder context chips (Documents, model picker stub) — `Claude Sonnet 4.6 ▾` is text-only for now.

### 4.3 Matter tabs
- Assistant tab: full chat surface. Empty state renders a sample `AgentStatusCard` as a design preview (3 steps + reasoning). The card is presentational; backend doesn't yet surface real step data.
- Documents tab: 6-col table — Document / Type / Source / Extracted / Last action / Action. SHA / Size / Uploaded-at moved into the per-row expand drawer. EmptyState applied when empty.
- Chronology tab: dense significance-bar table; CPR 31.22 gate callout when applicable; EmptyState when empty.
- Workflows tab: 2-col card catalogue listing 5 installed workflows. Each card links to its workflow surface. Footer cross-link to `#/modules` (public catalogue).
- Pre-Motion / Letters / Contract review / Tabular Review / Case law: reached via Workflows; render inside the same shell with the right rail visible.
- Audit tab: filter row + dense audit table; bare empty state (EmptyState would break the filter-row chrome).
- **No inline tab header on any tab.** The breadcrumb + left rail carry identity. Removed the eyebrow + numbered H2 + lede block from all 9 tab files.

### 4.4 Settings `#/settings/{profile|keys|preferences}`
- H1 reads "Settings" (was "Account").
- Left sub-nav (Profile / API keys / Preferences) with active-state ink left border + bg-wash.
- Profile tab: per-field Save buttons (disabled when value equals persisted, enabled when dirty). Display name + Email (read-only). Below: Usage Plan section (shows `user.role`, with `TODO(plan)` for real billing wiring). Actions section with Sign Out. Danger Zone with Delete Account button (outlined red; calls `window.confirm` then logs a `TODO(delete-account)` — no backend endpoint exists yet).

### 4.5 Matter list `#/matters`
- H1 "Matters" + one-line count.
- 6-col data table: Matter (title + mono slug) / Type / Status (monochrome bordered pill) / Posture (mono bordered pill) / Opened / Retention. Rows link to `#/matters/{slug}/assistant` (the matter's default landing).
- EmptyState when no matters.

### 4.6 Modules catalogue `#/modules`
- Public catalogue of installable modules. Unauth visitors get a designed banner (Sign in CTA + Open the demo CTA) — no raw 401 string anywhere.
- Master-detail sidebar (skill picker) on the left, selected skill body on the right.
- This is "Modules" (the catalogue); the matter sidebar's "Workflows" item is the matter-scoped installed list. Doctrine: **Modules are what you install. Workflows are what you run on a matter.**

### 4.7 TopBar + Drawer (global chrome)
- Authed: right-side nav is `Matters · Modules · Settings · Account` (Account = ProfileChip).
- Unauth: `Open the demo · Sign up free · Sign in`. No "Open demo matter" inside an authed session (that was the bug Andy caught).
- Drawer mirrors for mobile.

---

## 5. New / changed files (today)

**New:**
- `frontend/public/hero-splash.png` — Landing hero artwork
- `frontend/src/matter/MatterNav.tsx` — compact left rail
- `frontend/src/matter/MatterBreadcrumb.tsx` — slim breadcrumb
- `frontend/src/matter/RightRailAssistant.tsx` — persistent right-rail Assistant
- `frontend/src/matter/AgentStatusCard.tsx` — "Working/Thinking" multi-step card (preview)
- `frontend/src/matter/tabs/WorkflowsTab.tsx` — workflow catalogue page

**Deleted (retired with the flip):**
- `frontend/src/matter/MatterSidebar.tsx` (v0.3 whitepaper TOC)
- `frontend/src/matter/MatterHeader.tsx` (v0.3.1 full metadata strip)
- `frontend/src/matter/MatterTabBar.tsx` (v0.3.1 horizontal tab bar)
- `frontend/src/matter/tabs/OverviewTab.tsx` (v0.3.1 operational dashboard; superseded by Assistant-as-landing)

**Notable doctrine writes:**
- `docs/DESIGN.md` — v0.4 changelog, P9 marked RETIRED, P19 (compact left rail) added, P20 (slim breadcrumb) added, anti-patterns extended, surface map rewritten, Modules vs Workflows distinction documented.

---

## 6. Open TODOs (in priority order)

1. **`hero-splash.png` is 916 KB** — needs compression / WebP / AVIF conversion before launch. Above-the-fold LCP impact.
2. **`TODO(plan)`** in Settings — Usage Plan shows `user.role`. Wire a real `plan` field on `CurrentUser` when billing lands.
3. **`TODO(delete-account)`** in Settings — Delete button shows `window.confirm` and logs. No backend endpoint. Add `DELETE /users/me` + cascade behaviour before launch.
4. **AgentStatusCard is preview-only.** `AssistantMessage` type has no step / working / thinking primitive. Backend would need to surface real step data + frontend type extension.
5. **Provider-key launch posture decision** — what's the default on day 1 for BYOK gating? (Carried over from earlier handover, not addressed today.)
6. **PRE_FLIGHT §7 browser walk** — eyes-on QA checklist still owed before launch.

---

## 7. Specific review asks

When you (reviewer) look at this, the most useful sign-offs:

1. **Is v0.4 the right shape?** Three flips in 24 hours; this one is anchored to the SaaS-LLM standard pattern and a Mobbin pull of ~30 reference screens. If this is still wrong I want to know before launch, not after.
2. **Does DESIGN.md hold together end-to-end?** The doc had stale references after each flip; the v0.4 pass tried to settle the contradictions but six months of layered edits is risk territory.
3. **Right rail behaviour: does the `tab !== "assistant" && tab !== "workflows"` rule feel right?** Or should it also hide on Audit (pure data view) or appear on Assistant (so you can compose while reading another past chat)?
4. **AgentStatusCard preview placement** — is rendering a sample card in the empty state of the Assistant tab the right call, or should it wait for real backend step data?
5. **Modules vs Workflows distinction** — is "Modules = what you install / Workflows = what you run on a matter" legible to a solicitor, or does it just shift the confusion?

---

## 8. Suggested screenshots for the review

Andy will paste these alongside the doc when shared with you:

1. Landing hero with splash artwork (`/`)
2. Landing "Built on" trust strip + scroll-spy whitepaper sections
3. Matter detail, Assistant tab as default landing (left rail + breadcrumb visible)
4. Matter detail, Documents tab (right rail visible, table with new columns)
5. Right rail collapsed (44px strip)
6. Workflows catalogue page
7. Settings → Profile (per-field Saves + Usage Plan + Danger Zone)
8. Matter list as 6-col table
9. Modules unauth banner (no raw 401)
10. Mobile MatterNav sheet open with backdrop
11. AgentStatusCard preview in the Assistant tab empty state

---

## 9. Commit trail (today, in order)

```
e97b66b Landing copy tightening pass
c81f288 Warp whitepaper retoken — sidebar TOC, Hanken Grotesk, monochrome posture (v0.3)
b4f2328 Propagate Warp doctrine to matter tabs
3903c41 Module subcomponent retoken — Warp doctrine end-to-end
2114371 Reviewer pass — trust holes + matter shell flip + landing composite + Documents columns (v0.3.1)
7c4d7bf DESIGN.md coherence pass — surface map + P2/P8 scoped to Landing-only
d8746ad Landing hero — editorial splash artwork replaces product mock
0b77ef6 Matter tab taxonomy — SIDEBAR_NAV (5 items) + WORKFLOW_TABS
3bda32c v0.4 matter shell: compact left rail + slim breadcrumb (v0.4)
e5f358b Landing: add Built on trust strip below hero
e176b9d Merge v0.4 matter shell
6c9a041 Merge Landing: Built on trust strip
00efd3f feat(matter): persistent right-rail Assistant + AgentStatusCard
42e261c v0.4 polish: per-field Settings, Matters table, mobile MatterNav sheet
5d96ee8 Merge polish
22a323d Merge features (HEAD)
```

16 commits today. Push state at `22a323d`. Build clean (97 modules, 436 KB JS, 25.8 KB CSS).
