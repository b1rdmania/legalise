// Matter shell taxonomy (v0.4 — compact left rail).
//
// SIDEBAR_NAV is the 5-item nav that renders in the left rail.
// WORKFLOW_TABS are the installed-module surfaces reached from the
// Workflows page; they keep their hash routes for deep-linking but
// do not surface as their own sidebar items.
//
// "overview" is retired in v0.4. Bare /matters/{slug} redirects
// to /matters/{slug}/assistant.

export type TabKey =
  | "assistant"
  | "documents"
  | "chronology"
  | "workflows"
  | "audit"
  // Workflow surfaces (reached via the Workflows page; sidebar shows
  // them as Workflows-active when one is open)
  | "premotion"
  | "letters"
  | "contract-review"
  | "reviews"
  | "research";

export const SIDEBAR_NAV: ReadonlyArray<{ key: TabKey; label: string }> = [
  { key: "assistant", label: "Assistant" },
  { key: "documents", label: "Documents" },
  { key: "chronology", label: "Chronology" },
  { key: "workflows", label: "Workflows" },
  { key: "audit", label: "Audit" },
];

export interface WorkflowTab {
  key: TabKey;
  label: string;
  blurb: string;
  // Plain-English description rendered on the Workflows catalogue card.
  // This is the human story; the schema slugs below stay as the source
  // of truth for the Modules catalogue.
  description: string;
  // Static descriptive metadata for the catalogue card (v0.1 - these are
  // descriptions of the workflow's contract, not live state).
  reads: string;
  writes: string;
  calls: number;
  // Capabilities declared by the module. Read-only display in the public
  // catalogue.
  capabilities: string[];
}

export const WORKFLOW_TABS: ReadonlyArray<WorkflowTab> = [
  {
    key: "premotion",
    label: "Pre-Motion",
    blurb:
      "Adversarial premortem. Nine model calls. Optimistic Analyst, Evidence Inspector, Premortem Adversary, Synthesiser.",
    description:
      "Stress-test a claim with nine model calls. Reads the matter documents and chronology. Logs every step to the audit; writes no other artefacts.",
    reads: "documents + chronology",
    writes: "audit only",
    calls: 9,
    capabilities: ["matter.read", "document.body.read", "chronology.read", "audit.write"],
  },
  {
    key: "letters",
    label: "Letters",
    blurb:
      "Routed by matter type. ET surfaces LBA drafter; civil surfaces CPR letter drafter.",
    description:
      "Draft a routing-aware letter (LBA for ET, CPR letter for civil). Reads matter metadata and the chronology. Outputs a draft document and an audit trail.",
    reads: "matter metadata + chronology",
    writes: "document.generated + audit",
    calls: 3,
    capabilities: ["matter.read", "chronology.read", "document.write", "audit.write"],
  },
  {
    key: "contract-review",
    label: "Contract review",
    blurb:
      "Four-stage UK-focused review. Parse, analyse (UCTA / CRA / UK GDPR / governing law / jurisdiction), redline, summarise.",
    description:
      "Run a four-stage UK-focused review: parse, analyse against UCTA/CRA/UK GDPR/governing law/jurisdiction, redline, summarise. Reads the contract; outputs a draft redline and an audit trail.",
    reads: "documents",
    writes: "document.generated + audit",
    calls: 4,
    capabilities: ["document.body.read", "document.write", "audit.write"],
  },
  {
    key: "reviews",
    label: "Tabular Review",
    blurb:
      "Run a structured column set across a document set. One row per document, one column per question. Cell answers cite back to the source passage.",
    description:
      "Apply a structured column set across a document set. One row per document, one column per question; every cell cites its source passage.",
    reads: "documents",
    writes: "review.table + audit",
    calls: 1,
    capabilities: ["document.body.read", "review.write", "audit.write"],
  },
  {
    key: "research",
    label: "Case law",
    blurb:
      "Search reported authorities and cite them into the matter. v0.2 swaps in Find Case Law via MCP.",
    description:
      "Search reported UK authorities and cite them into the matter. v0.2 swaps in the Find Case Law MCP.",
    reads: "matter metadata",
    writes: "citation + audit",
    calls: 2,
    capabilities: ["matter.read", "citation.write", "audit.write", "net.http"],
  },
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
