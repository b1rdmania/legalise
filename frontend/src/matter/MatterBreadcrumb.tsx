// MatterBreadcrumb - slim path strip above the content column (v0.4).
// Replaces the v0.3.1 MatterHeader full metadata block. Single line:
// Matters / {matter title} / {tab label}. Posture lives in the
// sidebar matter card. Surfaces that need more metadata render it
// inline within the tab body.
//
// Mobile: a hamburger button sits at the left edge and toggles the
// MatterNav slide-out sheet (P19 mobile variant).

import type { Matter } from "../lib/api";
import { MATTER_TAB_LABELS, WORKFLOW_TABS, type TabKey } from "./tabs/types";

function labelFor(tab: TabKey): string {
  const workflow = WORKFLOW_TABS.find((t) => t.key === tab);
  if (workflow) return workflow.label;
  return MATTER_TAB_LABELS[tab] ?? "";
}

export function MatterBreadcrumb({
  matter,
  tab,
  onToggleMobileNav,
}: {
  matter: Matter;
  tab: TabKey;
  onToggleMobileNav?: () => void;
}) {
  const tabLabel = labelFor(tab);
  // For workflow surfaces, show Matters / title / Actions / surface
  const isWorkflowSurface = WORKFLOW_TABS.some((t) => t.key === tab);

  return (
    <div className="px-4 sm:px-6 lg:px-10 py-4 border-b border-rule flex items-center justify-between gap-4">
      <div className="flex items-center min-w-0 text-sm gap-1">
        {onToggleMobileNav && (
          <button
            type="button"
            onClick={onToggleMobileNav}
            aria-label="Open matter navigation"
            className="md:hidden min-h-[44px] min-w-[44px] -ml-2 flex items-center justify-center text-ink shrink-0"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M3 6h14M3 10h14M3 14h14" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </button>
        )}
        <a href="/matters" className="text-muted hover:text-ink transition-colors shrink-0">
          Matters
        </a>
        <span className="text-muted mx-2 shrink-0">/</span>
        <span className="font-semibold text-ink truncate" title={matter.title}>
          {matter.title}
        </span>
        {tabLabel && (
          <>
            <span className="text-muted mx-2 shrink-0">/</span>
            {isWorkflowSurface && (
              <>
                <a
                  href={`/matters/${matter.slug}/workflows`}
                  className="text-muted hover:text-ink transition-colors shrink-0"
                >
                  Actions
                </a>
                <span className="text-muted mx-2 shrink-0">/</span>
              </>
            )}
            <span className="text-prose truncate shrink-0">{tabLabel}</span>
          </>
        )}
      </div>
    </div>
  );
}
