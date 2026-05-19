// MatterTabBar - horizontal numbered tabs for the matter workspace shell.
// Replaces the v0.3 left sidebar TOC on matter surfaces. Sidebar TOC is
// reserved for the Landing whitepaper; matter tabs are discrete tools,
// not chapters of one document.

import { TABS, type TabKey } from "./tabs/types";

function numLabel(index: number, label: string): string {
  const n = String(index + 1).padStart(2, "0");
  return `${n} ${label}`;
}

export function MatterTabBar({
  tab,
  onChange,
}: {
  tab: TabKey;
  onChange: (t: TabKey) => void;
}) {
  return (
    <div className="border-b border-rule overflow-x-auto sticky top-[64px] sm:top-[80px] bg-paper z-30">
      <div className="max-w-page mx-auto px-4 sm:px-6 lg:px-10 flex gap-8">
        {TABS.map((t, i) => {
          const active = t.key === tab;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => onChange(t.key)}
              aria-current={active ? "page" : undefined}
              className={
                "pt-4 pb-3 -mb-px text-sm transition-all border-b-2 whitespace-nowrap " +
                (active
                  ? "border-ink text-ink font-semibold"
                  : "border-transparent text-muted hover:text-ink")
              }
            >
              {numLabel(i, t.label)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
