# Phase 17 Frontend Screen Inventory (context, not spec)

Generated: 2026-05-27

This is a neutral inventory of three frontend screens in Legalise. It describes the current layout, component composition, and state management without proposing changes. The walkthrough findings in PHASE_17_COLD_WALKTHROUGH.md are the authoritative spec; this inventory provides the builder with legible context for reading them.

---

## 1. Matter Detail Screen — /matters/$slug (context, not spec)

**Route:** `/matters/$slug` and `/matters/$slug/$tab`  
**Entry component:** `/frontend/src/matter/MatterDetail.tsx`

### Layout Structure (context, not spec)

Three-column flex layout:
- **Left rail (220px, static at ≥md breakpoint):** `MatterNav` — compact sidebar with matter card (title, slug, posture dropdown) and five navigation buttons (Assistant, Documents, Chronology, Workflows, Audit).
- **Center column (flex-1):** Breadcrumb header + tab content area + right-rail toggle.
- **Right rail (340px, hidden at <lg, collapsible):** `RightRailAssistant` — persistent mini-assistant thread; collapses to 44px icon when not in Assistant or Workflows tabs.

Mobile (<md): left rail hidden; hamburger in breadcrumb toggles 280px slide-out sheet.

### Immediate Child Components (context, not spec)

- `MatterNav` — left sidebar navigation.
- `MatterBreadcrumb` — breadcrumb strip (Matters / {title} / {tab label}).
- Tab content (conditional rendering per `tab` state):
  - `AssistantTab` (tab="assistant")
  - `DocumentsTab` (tab="documents")
  - `ChronologyTab` (tab="chronology")
  - `WorkflowsTab` (tab="workflows")
  - `AuditTab` (tab="audit")
  - `PreMotionTab` (tab="premotion") — workflow surface
  - `LettersTab` (tab="letters") — workflow surface
  - `ContractReviewTab` (tab="contract-review") — workflow surface
  - `ReviewsTab` (tab="reviews") — workflow surface
  - `ResearchTab` (tab="research") — workflow surface
- `PostureBanner` — privilege posture warning (if privilege_posture not cleared).
- `RightRailAssistant` — persistent side-panel assistant.
- `GrantsPanel` — section below all tabs; lists runnable capabilities and current grants.

### State Management (context, not spec)

**Local useState:**
- `tab: TabKey` — current active tab; synced with URL path.
- `mobileNavOpen: boolean` — mobile nav sheet visibility.
- `matter: Matter | null` — loaded matter object.
- `docs: MatterDocument[] | null` — document list.
- `audit: AuditEntry[] | null` — recent audit entries (limit=30).
- `error: string | null` — page-level error banner.
- Individual error/loading states per workflow tab (premotion, letters, etc.): `premotionRunning`, `premotionError`, `letterDrafting`, etc.
- `rightRailCollapsed: boolean` — persisted to localStorage as `legalise.right-rail.collapsed`.

**TanStack Query:** None; all data fetches are direct Promise-based with manual state management.

**Context:** `DrawerContext` (from `useDrawer()`) — `setDrawerMatter`, `setDrawerTab` used to sync matter state with top-bar drawer widget.

**Auth context:** `useAuth()` — reads user role for `PostureBanner`.

### Initial Data Loads (context, not spec)

On component mount or slug change:
- `getMatter(slug)` → `matter` state + drawer sync.
- `listDocuments(slug)` → `docs` state.
- `listAudit(slug, 30)` → `audit` state.
- `getChronology(slug)` → `chron` state.
- `getLetterCatalogue(slug)` → `letterCat` state, pre-select default letter type.

All fetches are parallel; individual failures do not block others.

### API Endpoints Called (context, not spec)

- `GET /api/matters/{slug}`
- `GET /api/matters/{slug}/documents`
- `GET /api/matters/{slug}/audit?limit=30`
- `GET /api/matters/{slug}/chronology`
- `GET /api/matters/{slug}/letters/catalog`
- `GET /api/matters/{slug}/grants`
- `GET /api/matters/{slug}/workflows` (from WorkflowsTab)
- `GET /api/modules/v2` (from GrantsPanel)
- `GET /api/modules/installed` (from GrantsPanel)
- `POST /api/matters/{slug}/privilege` (posture change)
- `POST /api/matters/{slug}/documents` (document upload)
- `POST /api/matters/{slug}/pre-motion/run-stream` (pre-motion invocation)
- `POST /api/matters/{slug}/chronology/gate` (gate confirmation)
- `POST /api/matters/{slug}/letters/draft` (letter generation)
- `POST /api/matters/{slug}/letters/draft/docx` (letter docx export)
- `POST /api/matters/{slug}/pre-motion/docx` (premotion docx export)
- `POST /api/matters/{slug}/pre-motion/pdf` (premotion pdf export)

### Empty/Loading/Error State Handling (context, not spec)

**Present:**
- Page-level error banner (`ErrorCallout`) if `matter` fails to load.
- Loading skeleton (`LoadingLine`) while matter loads.
- Per-tab error states (premotion error, letter error, etc.) render as inline text or banners.
- Tab content renders "Loading…" text or muted labels during async operations.
- Workflow tabs (premotion, letters) render `ProviderKeyMissingBanner` if an API key is missing.

**Absent/Inconsistent:**
- No skeleton loading for individual documents or chronology entries; text "Loading" only.
- Docx/PDF export states (`pdfBusy`, `docxBusy`) show spinner in button label only, not a separate loading state.
- Letter drafting does not show stage progress like pre-motion does; just pending flag.

### Shared vs Bespoke Components (context, not spec)

**From /ui/primitives:**
- `ErrorCallout` — red error banner.
- `LoadingLine` — gray loading label.
- `InlineSpinner` — small spinner icon.
- `ProviderKeyMissingBanner` — missing-key banner.
- `primaryBtn` — class constant for primary button styling.

**Bespoke to /matter:**
- `PostureBanner` — privilege posture banner (matter-specific).
- `MatterNav`, `MatterBreadcrumb`, `RightRailAssistant`, `GrantsPanel` — all local.
- All tab components (DocumentsTab, ChronologyTab, etc.) — local.
- `MessageBubble` — shared between AssistantTab and RightRailAssistant in compact mode.

### Inconsistencies with Other Screens (context, not spec)

- **Button labels:** "Load more" in AuditTab (pagination); no other screens paginate visibly.
- **Error presentation:** Page-level banners use `ErrorCallout` (red); inline tab errors use inline text or borders. No consistent secondary error state across workflows.
- **Table styling:** Grants table uses `bg-paper-sunken` for header; no other page uses this pattern for tables.
- **Spacing:** Right-rail has `px-4 py-3` header; MatterNav has `px-4 py-5` card. Inconsistent padding tokens.
- **Font scaling:** Breadcrumb uses `text-sm`; Matter card title uses `text-sm font-semibold`; no clear hierarchy tokens between them.

---

## 2. Modules Page — /modules (context, not spec)

**Route:** `/modules`  
**Entry component:** `/frontend/src/modules-v2/ModulesCatalog.tsx`  
**Unmounted legacy:** `/frontend/src/modules-page/Modules.tsx` (v1 skill enable/disable interface; retained in codebase for reference, not wired in router).

### Layout Structure (context, not spec)

Single-column centered layout:
- **Container:** `max-w-4xl mx-auto px-6 py-12`.
- **Header:** Eyebrow label ("Workspace") + large serif h1 ("Modules") + description paragraph.
- **Grid:** `grid-cols-1 gap-3 sm:grid-cols-2` of module cards (one column mobile, two columns tablet+).

### Immediate Child Components (context, not spec)

- `ModuleCard` (repeating, one per module) — renders as `<li>` in a `<ul>` grid.

Each `ModuleCard` contains:
- Module name + version badge.
- module_id (monospace).
- Description (clamped to 2 lines).
- Metadata row: publisher, visibility badge, capability count, installed-state badge.
- `<Link>` to `/modules/{moduleId}` for detail page.

### State Management (context, not spec)

**Local useState:**
- `q: CatalogQuery` — union type with `status: "loading" | "ready" | "error"` + `entries: V2ManifestEntry[]`.
- `installed: InstalledIndex | null` — `Map<string, InstalledModule>` for installed-state badges; gracefully degrades to `null` on fetch failure.

**Data fetches:** Parallel and independent:
- `getModulesV2()` → catalog entries.
- `listInstalledModules()` → installed state map.

Both are triggered once on mount; no refetch on user action.

### API Endpoints Called (context, not spec)

- `GET /api/modules/v2`
- `GET /api/modules/installed`

### Empty/Loading/Error State Handling (context, not spec)

**Present:**
- "Loading modules…" text while `q.status === "loading"`.
- "Could not load modules: {message}" if `q.status === "error"`.
- "No modules discovered. Modules live under the workspace plugins root…" if catalog is empty.
- Installed-state badges absent if `listInstalledModules()` fails (catalog still renders; missing badges do not break the layout).

**Absent:**
- No skeleton UI or shimmer placeholders; text only.
- No retry button on error.

### Shared vs Bespoke Components (context, not spec)

All markup is inline; no child components extracted. `ModuleCard` is a local function component defined within the file.

Uses only core HTML (`<ul>`, `<li>`, `<div>`, `<p>`, `<span>`) + TanStack Router `<Link>` + Tailwind classes.

### Installed-State Badges (context, not spec)

Three states rendered as `<span>` badges:
1. **Installed + enabled:** `bg-ink/5 border-ink text-ink` — "Installed v{version}".
2. **Installed + disabled:** `bg-paper-sunken border-line text-muted` — "Installed (disabled)" with title tooltip.
3. **Not installed:** No badge; card links to detail page and default "Open" affordance.
4. **Manifest invalid:** `bg-seal/10 text-seal` — "manifest invalid".

### Inconsistencies with Other Screens (context, not spec)

- **Spacing:** Container `px-6` here; Matter detail uses `px-4 sm:px-6 lg:px-10`. Different horizontal padding tokens.
- **Typography:** h1 is serif; Matter detail h1 is serif (consistent). But "Workspace" eyebrow here is uppercase + tracking; MatterNav eyebrow is not explicitly styled (inherits from `.eyebrow` CSS class).
- **Grid gaps:** Module cards use `gap-3`; no other page uses explicit grid gaps.
- **Link styling:** Module card link is block-level `<Link>` wrapping the whole card content; no explicit underline or hover state visible (relies on card border hover).

---

## 3. Audit Reconstruction — /matters/$slug/audit and /admin/audit (context, not spec)

### 3.1 Matter Reconstruction — /matters/$slug/audit (context, not spec)

**Route:** `/matters/$slug/audit`  
**Entry component:** `/frontend/src/matter/ReconstructionView.tsx`

#### Layout Structure (context, not spec)

Single-column centered layout:
- **Container:** `max-w-4xl mx-auto px-6 py-12`.
- **Header:** Eyebrow ("Matter") + h1 ("Reconstruction") + matter slug (monospace).
- **Description paragraph.**
- **Filter chips row** (if any filters active): "Filtered by" label + removable filter chips.
- **Source chips row:** "Sources" label + three toggle buttons (Audit, State machine, Advice boundary).
- **Timeline:** `<ol>` of `TimelineRow` items (`space-y-3`) + "Load more" button if `nextCursor` exists.

#### Immediate Child Components (context, not spec)

- `TimelineRow` (repeating per entry) — list item with source pill, action code, timestamp, expandable payload block.
- `FilterChip` (repeating if filters active) — removable filter pill.
- `EmptyState` — conditional message if `visibleEntries.length === 0`.

#### State Management (context, not spec)

**Local useState:**
- `sources: ReconstructionSource[]` — active source filter; defaults to all three.
- `fetchState: FetchState` — union type with `status: "loading" | "ready" | "error"` + entries, pagination cursor, total estimate, loading flag.

**Query params (from router):**
- `invocation_id` — filters client is told to honor (server applies it server-side now).
- `action` — ditto.

**Data fetch:** Server-side filtered and paginated:
- `getReconstruction(slug, { include: sources, invocation_id, action, cursor })`

#### API Endpoints Called (context, not spec)

- `GET /api/matters/{slug}/audit/reconstruction?include={sources}&invocation_id={id}&action={action}&cursor={cursor}`

#### Empty/Loading/Error State Handling (context, not spec)

**Present:**
- "Loading timeline…" while fetching.
- "Could not load reconstruction: {message}" on error.
- `EmptyState` component distinguishes two messages:
  - With filters: "No timeline rows match the current filters."
  - Without filters: "No timeline rows recorded for this matter yet."
- Pagination: "Load more" button if `nextCursor` is non-null; button disabled during `loadingMore`.

**Absent:**
- No skeleton placeholders.
- No entry count estimates shown except as "X of Y loaded · ~Z in window" text.

#### Inconsistencies with Other Screens (context, not spec)

- **Source pill styling:** `bg-ink/10 text-ink` for audit, `bg-amber-500/15 text-amber-700` for state_machine, `bg-seal/10 text-seal` for advice_boundary. These color tokens are unique to this screen.
- **Filter chip styling:** `border-line bg-paper-sunken` for removable chips; different from Matter detail's posture badge (`border-rule` + no background).
- **Expanded block (payload/refs):** Renders raw JSON in a `<pre>` with `bg-paper border-line` and `max-h-[40vh] overflow-auto`. No other screen renders JSON this way.
- **Pagination button:** Uses border-line styling and explicit "Load more" label; no other screen implements visible pagination.

---

### 3.2 Admin Audit — /admin/audit (context, not spec)

**Route:** `/admin/audit`  
**Entry component:** `/frontend/src/admin/AdminAuditView.tsx`

#### Layout Structure (context, not spec)

Structurally mirrors `/matters/$slug/audit`:
- **Container:** `max-w-4xl mx-auto px-6 py-12`.
- **Header:** Eyebrow ("Admin") + h1 ("Workspace audit") + description.
- **Filter chips row** (if active).
- **Source chips row** — three buttons, but two are **disabled and struck-through** (state_machine, advice_boundary) because workspace scope does not include them per substrate constraint.
- **Timeline:** `<ol>` of `TimelineRow` items (reuses same component as matter reconstruction) + "Load more" button.

#### Immediate Child Components (context, not spec)

- `TimelineRow` (reused from matter reconstruction).
- `FilterChip` (reused).
- `AdminRequiredShell` — conditional gate if user is not superuser.

#### State Management (context, not spec)

**Local useState:**
- `sources: ReconstructionSource[]` — defaults to `["audit"]` only; state_machine and advice_boundary cannot be toggled (button onClick is a no-op for them).
- `fetchState: FetchState` — same as matter reconstruction, plus `status: "admin_required"`.

**Auth check:**
- `useAuth()` — redirects if not superuser; `AdminRequiredShell` rendered instead of timeline.

**Data fetch:**
- `getAdminReconstruction({ include: sources, invocation_id, action, cursor })`

#### API Endpoints Called (context, not spec)

- `GET /api/admin/audit/reconstruction?include={sources}&invocation_id={id}&action={action}&cursor={cursor}`

#### Empty/Loading/Error State Handling (context, not spec)

**Present:**
- Same loading, error, and empty states as matter reconstruction.
- Additional gate: `AdminRequiredShell` if user is not superuser (belt-and-braces with substrate 403).

**Absent:**
- Same as matter reconstruction (no skeletons).

#### Source Chip Disable UX (context, not spec)

Disabled buttons for matter-bound sources:
- `cursor-not-allowed` class.
- `line-through` text.
- `text-muted/60` (dimmed).
- `title` tooltip: "{Source name} rows are matter-bound by substrate design and don't appear in workspace scope".

#### Inconsistencies with Other Screens (context, not spec)

- **Admin gate:** Only this screen gates on superuser before fetching. No other matter-scoped screen has a role check in the UI (role checks are substrate-side).
- **Source chip disabled state:** Unique styling (strikethrough + cursor-not-allowed). Other disabled buttons (e.g., in GrantsPanel) use `disabled:opacity-50` only.
- **TimelineRow structure:** Matter reconstruction shows module_id and capability_id in row metadata; admin reconstruction does not (these fields are null for workspace events). No visual comment explaining this difference.

---

## What This Inventory Is NOT (context, not spec)

This file does **not**:
- Propose any redesign, refactoring, or reorganization of these screens.
- Lock the build order for Phase 17A, B, or C.
- Recommend changes to component composition, state management, or layout primitives.
- Evaluate the usability or visual consistency of the screens against a design system.
- Quantify the work required to implement any changes.

This inventory is **subordinate to** the cold-walkthrough findings in `PHASE_17_COLD_WALKTHROUGH.md`. The walkthrough is the authoritative spec; this inventory exists to make the current state legible for the builder reading the walkthrough tomorrow.

---

**End of inventory**
