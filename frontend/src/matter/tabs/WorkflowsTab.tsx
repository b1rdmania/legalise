// WorkflowsTab - catalogue of installed legal modules (v0.4).
// Replaces the v0.3.1 top-level slots for Pre-Motion / Letters /
// Contract review / Tabular Review / Case law. Each module is a card
// linking to its surface; the surface keeps its hash route for deep
// linking, and the sidebar highlights "Workflows" when one is open.

import { WORKFLOW_TABS, type WorkflowTab } from "./types";

type Availability = { tone: "ok" | "limited" | "blocked"; label: string };

// TODO(workflow-state): no per-matter workflow status endpoint exists yet
// (no getMatterModules / listWorkflowStatus in lib/api.ts). Status + last
// run render as static placeholders until backend surfaces this.
function availabilityFor(workflow: WorkflowTab, posture?: string): Availability {
  // Cloud-bound workflows are blocked when the matter posture refuses
  // cloud calls. The posture vocabulary used elsewhere is C_paused
  // (cloud paused) and similar.
  const needsCloud = workflow.calls > 0;
  if (posture === "C_paused" && needsCloud) {
    return { tone: "blocked", label: "blocked under current posture" };
  }
  if (posture === "B_mixed" && needsCloud && workflow.capabilities.includes("net.http")) {
    return { tone: "limited", label: "limited under current posture" };
  }
  return { tone: "ok", label: "ok" };
}

function availabilityClasses(tone: Availability["tone"]): string {
  switch (tone) {
    case "blocked":
      return "text-[#D9304F]";
    case "limited":
      return "text-[#E67E22]";
    case "ok":
    default:
      return "text-[#00A35C]";
  }
}

export function WorkflowsTab({ slug, posture }: { slug: string; posture?: string }) {
  return (
    <div className="max-w-4xl">
      <p className="text-sm text-prose max-w-2xl leading-relaxed mb-8">
        Installed legal modules. Each operates on the matter through the
        privilege-aware gateway. Click to open.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {WORKFLOW_TABS.map((w) => {
          const avail = availabilityFor(w, posture);
          return (
            <a
              key={w.key}
              href={`#/matters/${slug}/${w.key}`}
              className="block border border-rule p-5 hover:border-ink hover:bg-wash transition-colors group"
            >
              <div className="text-sm font-semibold text-ink mb-2">{w.label}</div>
              <p className="text-xs text-prose leading-relaxed">
                {w.description}
              </p>

              <dl className="mt-4 grid grid-cols-[88px_1fr] gap-y-1 text-[11px] font-mono">
                <dt className="text-muted uppercase tracking-track2 text-[9px] self-center">Status</dt>
                <dd className="text-ink">installed</dd>
                <dt className="text-muted uppercase tracking-track2 text-[9px] self-center">Last run</dt>
                <dd className="text-prose">never</dd>
                <dt className="text-muted uppercase tracking-track2 text-[9px] self-center">Availability</dt>
                <dd className={availabilityClasses(avail.tone)}>{avail.label}</dd>
              </dl>

              <div className="mt-4 font-mono uppercase tracking-track2 text-[10px] text-muted group-hover:text-ink transition-colors">
                Open
              </div>
            </a>
          );
        })}
      </div>

      <p className="text-xs text-muted mt-8">
        Browse all available modules in the{" "}
        <a href="#/modules" className="text-[#0066CC] hover:underline">
          module catalogue
        </a>
        .
      </p>
    </div>
  );
}
