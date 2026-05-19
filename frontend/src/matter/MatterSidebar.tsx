// MatterSidebar — Warp-shaped left TOC for the matter detail shell.
// Replaces the v0.2 horizontal tab bar + panel header strip combo.
// Numbered entries, active state via left ink border. Posture + status
// + model surface as eyebrow + value stacks below the nav.

import { TABS, type TabKey } from "./tabs/types";
import type { Matter } from "../lib/api";
import { PrivilegeControl } from "./PrivilegeControl";

const NUM_LABELS: Record<TabKey, string> = {
  overview: "01. Overview",
  documents: "02. Documents",
  reviews: "03. Reviews",
  research: "04. Research",
  chronology: "05. Chronology",
  premotion: "06. Pre-Motion",
  letters: "07. Letters",
  "contract-review": "08. Contract review",
  audit: "09. Audit",
  assistant: "10. Assistant",
};

export function MatterSidebar({
  matter,
  tab,
  onChange,
  onPostureChange,
}: {
  matter: Matter;
  tab: TabKey;
  onChange: (t: TabKey) => void;
  onPostureChange: (next: string) => void;
}) {
  return (
    <aside
      className="w-80 hidden lg:block sticky top-[80px] h-[calc(100vh-80px)] border-r border-rule p-10 overflow-y-auto"
      aria-label="Matter sections"
    >
      <div className="text-[10px] font-bold tracking-[0.2em] text-muted uppercase mb-8">
        Matter
      </div>
      <nav className="flex flex-col gap-1">
        {TABS.map((t) => {
          const active = t.key === tab;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => onChange(t.key)}
              className={
                "text-left py-2 border-l-2 pl-4 text-sm transition-all " +
                (active
                  ? "border-ink text-ink font-semibold"
                  : "border-transparent text-muted hover:text-ink")
              }
            >
              {NUM_LABELS[t.key]}
            </button>
          );
        })}
      </nav>

      <div className="mt-12 pt-8 border-t border-rule space-y-5">
        <div>
          <div className="text-[10px] font-bold tracking-[0.1em] text-muted uppercase mb-2">
            Posture
          </div>
          <PrivilegeControl value={matter.privilege_posture} onChange={onPostureChange} />
          <div className="text-xs text-muted mt-1">
            {postureBlurb(matter.privilege_posture)}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-bold tracking-[0.1em] text-muted uppercase mb-2">
            Status
          </div>
          <div className="text-sm font-semibold text-ink">{matter.status}</div>
        </div>
        <div>
          <div className="text-[10px] font-bold tracking-[0.1em] text-muted uppercase mb-2">
            Model
          </div>
          <div className="text-sm font-semibold font-mono text-ink">{matter.default_model_id}</div>
        </div>
      </div>
    </aside>
  );
}

function postureBlurb(p: string): string {
  switch (p) {
    case "A_cleared":
      return "Privileged material excluded. Cloud providers permitted.";
    case "B_mixed":
      return "Cloud providers opt-in per matter.";
    case "C_paused":
      return "Local models only. Cloud calls refused.";
    default:
      return "";
  }
}
