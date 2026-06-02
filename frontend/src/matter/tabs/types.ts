// Matter shell taxonomy (V1 — compressed matter rail).
//
// SIDEBAR_NAV is the core nav that renders in the matter rail.
// Secondary/legacy surfaces (chronology, approvals, individual
// workflow pages) remain routable for deep links but do not compete
// with the main documents → skills → record loop.
// WORKFLOW_TABS are historical built-in skill surfaces reached from
// the Skills page; they keep their routes for deep-linking but
// do not surface as their own sidebar items.
//
// Bare /matters/{slug} lands on Documents.
//
// User-facing tab labels (Chat / Documents / Skills / Record)
// intentionally do not match the underlying URL keys
// (assistant / documents / workflows / audit). The keys are kept
// stable in this slice for route compatibility; they are rewired in
// a later slice that restructures the matter shell.

export type TabKey =
  | "assistant"
  | "documents"
  | "chronology"
  | "workflows"
  | "audit"
  | "approvals"
  // Built-in action surfaces (reached via Actions; sidebar highlights
  // Actions when one is open)
  | "premotion"
  | "letters"
  | "contract-review"
  | "reviews"
  | "research";

export const SIDEBAR_NAV: ReadonlyArray<{ key: TabKey; label: string }> = [
  { key: "assistant", label: "Chat" },
  { key: "documents", label: "Documents" },
  { key: "workflows", label: "Skills" },
  { key: "audit", label: "Record" },
];

export const MATTER_TAB_LABELS: Readonly<Record<TabKey, string>> = {
  assistant: "Chat",
  documents: "Documents",
  chronology: "Chronology",
  workflows: "Skills",
  audit: "Record",
  approvals: "Approvals",
  premotion: "Pre-Motion",
  letters: "Letters",
  "contract-review": "Contract review",
  reviews: "Tabular Review",
  research: "Case law",
};

// Frontend workflow taxonomy. Used by TopBar + MatterBreadcrumb to
// resolve a workflow tab key to its human label and to test "is this
// a workflow surface". The canonical workflow definitions (capabilities,
// audit modules, description, state derivation) live server-side in
// `backend/app/api/matters.py::WORKFLOW_DEFS` and are surfaced via
// `GET /api/matters/{slug}/workflows`. Do not duplicate that metadata
// here - the backend is the single source of truth.
export interface WorkflowTab {
  key: TabKey;
  label: string;
}

export const WORKFLOW_TABS: ReadonlyArray<WorkflowTab> = [
  { key: "premotion", label: "Pre-Motion" },
  { key: "letters", label: "Letters" },
  { key: "contract-review", label: "Contract review" },
  { key: "reviews", label: "Tabular Review" },
  { key: "research", label: "Case law" },
];

export type StageProgress = {
  index: number;
  stage: string;
  sub_agent_count: number;
  status: "running" | "done" | "error";
  duration_ms?: number;
  token_count?: number;
  errors?: string[];
};

const VALID_KEYS: ReadonlySet<string> = new Set<TabKey>([
  "assistant",
  "documents",
  "chronology",
  "workflows",
  "audit",
  "approvals",
  "premotion",
  "letters",
  "contract-review",
  "reviews",
  "research",
]);

export function isTabKey(v: string): v is TabKey {
  return VALID_KEYS.has(v);
}

// Which sidebar item should highlight as active given the current tab.
// Workflow surfaces (premotion / letters / etc.) highlight Workflows.
export function sidebarActiveFor(tab: TabKey): TabKey {
  if (tab === "premotion" || tab === "letters" || tab === "contract-review" || tab === "reviews" || tab === "research") {
    return "workflows";
  }
  return tab;
}
