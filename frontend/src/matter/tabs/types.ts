// Matter shell taxonomy (V1 — compressed matter rail).
//
// SIDEBAR_NAV is the core nav that renders in the matter rail.
// Secondary surfaces (activity/audit, chronology, approvals) remain
// routable for deep links but do not compete with the main chat-led
// loop. The historical built-in skill surfaces (pre-motion, letters,
// contract review, tabular review, case law) were removed in the
// skills-as-plugins cut; skills now run from Chat via the generic
// runner.
//
// Bare /matters/{slug} lands on Documents (the documents key) — opening
// a matter shows what is in it first.
//
// User-facing tab labels (Chat / Documents / Skills / Activity)
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
  | "approvals";

// The matter loop. Chat is the product; files and skills are summoned
// when needed. URL keys stay stable (assistant/documents/workflows)
// for route compatibility.
export const SIDEBAR_NAV: ReadonlyArray<{ key: TabKey; label: string }> = [
  { key: "assistant", label: "Chat" },
  { key: "documents", label: "Documents" },
  { key: "workflows", label: "Skills" },
];

export const MATTER_TAB_LABELS: Readonly<Record<TabKey, string>> = {
  assistant: "Chat",
  documents: "Documents",
  chronology: "Chronology",
  workflows: "Skills",
  audit: "Activity",
  approvals: "Approvals",
};

const VALID_KEYS: ReadonlySet<string> = new Set<TabKey>([
  "assistant",
  "documents",
  "chronology",
  "workflows",
  "audit",
  "approvals",
]);

export function isTabKey(v: string): v is TabKey {
  return VALID_KEYS.has(v);
}

// Which sidebar item should highlight as active given the current tab.
export function sidebarActiveFor(tab: TabKey): TabKey {
  return tab;
}
