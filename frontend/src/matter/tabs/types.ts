export type TabKey = "overview" | "documents" | "reviews" | "research" | "chronology" | "premotion" | "letters" | "contract-review" | "audit" | "assistant";

export const TABS: ReadonlyArray<{ key: TabKey; label: string }> = [
  { key: "overview", label: "Overview" },
  { key: "assistant", label: "Assistant" },
  { key: "documents", label: "Documents" },
  { key: "chronology", label: "Chronology" },
  { key: "reviews", label: "Reviews" },
  { key: "research", label: "Research" },
  { key: "premotion", label: "Pre-Motion" },
  { key: "letters", label: "Letters" },
  { key: "contract-review", label: "Contract review" },
  { key: "audit", label: "Audit" },
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

export function isTabKey(v: string): v is TabKey {
  return ["overview", "documents", "reviews", "research", "chronology", "premotion", "letters", "contract-review", "audit", "assistant"].includes(v);
}
