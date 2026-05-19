// WorkflowsTab - catalogue of installed legal modules (v0.4).
// Replaces the v0.3.1 top-level slots for Pre-Motion / Letters /
// Contract review / Tabular Review / Case law. Each module is a card
// linking to its surface; the surface keeps its hash route for deep
// linking, and the sidebar highlights "Workflows" when one is open.

import { WORKFLOW_TABS } from "./types";

export function WorkflowsTab({ slug }: { slug: string }) {
  return (
    <div className="max-w-4xl">
      <p className="text-sm text-prose max-w-2xl leading-relaxed mb-8">
        Installed legal modules. Each operates on the matter through the
        privilege-aware gateway. Click to open.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {WORKFLOW_TABS.map((w) => (
          <a
            key={w.key}
            href={`#/matters/${slug}/${w.key}`}
            className="block border border-rule p-5 hover:border-ink hover:bg-wash transition-colors group"
          >
            <div className="text-sm font-semibold text-ink mb-2">{w.label}</div>
            <p className="text-xs text-prose leading-relaxed">{w.blurb}</p>
            <div className="mt-4 font-mono uppercase tracking-track2 text-[10px] text-muted group-hover:text-ink transition-colors">
              Open
            </div>
          </a>
        ))}
      </div>

      <p className="text-xs text-muted mt-10 leading-relaxed">
        Install more modules from the{" "}
        <a href="#/modules" className="text-ink hover:underline">
          module catalogue
        </a>
        .
      </p>
    </div>
  );
}
