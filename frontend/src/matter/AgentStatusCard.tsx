import { useState } from "react";
import { InlineSpinner } from "../ui/primitives";

export interface AgentStep {
  label: string;
  status: "pending" | "running" | "complete" | "error";
}

interface Props {
  status: "running" | "complete" | "error";
  steps: AgentStep[];
  reasoning?: string;
  defaultExpanded?: boolean;
}

// Expandable "Completed in N steps" status card for multi-step assistant
// runs. Presentational only; whatever uses it translates its own state into
// { status, steps, reasoning }.
export function AgentStatusCard({ status, steps, reasoning, defaultExpanded = false }: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const completedCount = steps.filter((s) => s.status === "complete").length;

  const headerLabel =
    status === "running"
      ? "Working..."
      : status === "complete"
      ? `Completed in ${completedCount || steps.length} step${(completedCount || steps.length) === 1 ? "" : "s"}`
      : `Error after ${completedCount} step${completedCount === 1 ? "" : "s"}`;

  return (
    <div className="border border-rule bg-paper">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-4 py-3 flex items-center justify-between text-sm text-ink hover:bg-wash transition-colors cursor-pointer text-left"
        aria-expanded={expanded}
      >
        <span className="flex items-center gap-2">
          {status === "running" && <InlineSpinner />}
          {status === "complete" && (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#00A35C" strokeWidth="2.5" strokeLinecap="square" strokeLinejoin="miter" aria-hidden>
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
          {status === "error" && (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#D9304F" strokeWidth="2.5" strokeLinecap="square" strokeLinejoin="miter" aria-hidden>
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          )}
          <span>{headerLabel}</span>
        </span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="square"
          strokeLinejoin="miter"
          aria-hidden
          style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 120ms" }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {expanded && (
        <div className="border-t border-rule p-4 space-y-2">
          {steps.map((s, i) => (
            <div key={i} className="flex items-start gap-3 text-xs">
              <StepDot status={s.status} />
              <span className="text-prose leading-relaxed">{s.label}</span>
            </div>
          ))}
          {reasoning && (
            <div className="mt-3 pt-3 border-t border-rule font-mono text-xs text-prose whitespace-pre-wrap">
              Thinking: {reasoning}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StepDot({ status }: { status: AgentStep["status"] }) {
  if (status === "complete") {
    return <span className="mt-1 inline-block w-2 h-2 bg-[#00A35C]" aria-hidden />;
  }
  if (status === "error") {
    return <span className="mt-1 inline-block w-2 h-2 bg-[#D9304F]" aria-hidden />;
  }
  if (status === "running") {
    return <span className="mt-1 inline-block w-2 h-2 bg-muted animate-pulse" aria-hidden />;
  }
  return <span className="mt-1 inline-block w-2 h-2 border border-rule" aria-hidden />;
}
