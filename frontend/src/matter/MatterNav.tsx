// MatterNav - compact 220px left rail for the matter workspace (v0.4).
// Replaces the v0.3.1 horizontal MatterTabBar + MatterHeader strip.
// Pattern reference: Mike, Claude.ai, Sana AI, Mistral, Fibery.
// 5 primitives (Assistant / Documents / Chronology / Workflows / Audit);
// installed legal modules nest behind Workflows.

import type { Matter } from "../lib/api";
import { PrivilegeControl } from "./PrivilegeControl";
import { SIDEBAR_NAV, sidebarActiveFor, type TabKey } from "./tabs/types";

export function MatterNav({
  matter,
  tab,
  onChange,
  onPostureChange,
}: {
  matter: Matter;
  tab: TabKey;
  onChange: (next: TabKey) => void;
  onPostureChange: (next: string) => void;
}) {
  const activeKey = sidebarActiveFor(tab);

  return (
    <aside
      className="w-[220px] shrink-0 border-r border-rule bg-paper hidden md:flex md:flex-col sticky top-[64px] sm:top-[80px] h-[calc(100vh-64px)] sm:h-[calc(100vh-80px)] overflow-y-auto"
      aria-label="Matter navigation"
    >
      {/* Matter card */}
      <div className="px-4 py-5 border-b border-rule">
        <div className="eyebrow mb-2">Matter</div>
        <div className="text-sm font-semibold text-ink leading-snug break-words">
          {matter.title}
        </div>
        <div className="text-xs text-muted font-mono mt-1 truncate" title={matter.slug}>
          {matter.slug}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <span className="eyebrow">Posture</span>
          <span className="inline-flex items-center border border-rule px-1.5 py-0.5">
            <PrivilegeControlInline value={matter.privilege_posture} onChange={onPostureChange} />
          </span>
        </div>
      </div>

      {/* Nav list */}
      <nav className="px-2 py-3 flex flex-col gap-0.5" aria-label="Matter sections">
        {SIDEBAR_NAV.map((item) => {
          const active = activeKey === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onChange(item.key)}
              aria-current={active ? "page" : undefined}
              className={
                "w-full text-left px-3 py-2 flex items-center gap-3 text-sm transition-colors " +
                (active
                  ? "bg-wash text-ink font-semibold"
                  : "text-prose hover:text-ink hover:bg-wash")
              }
            >
              <NavIcon name={item.key} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Footer status */}
      <div className="mt-auto border-t border-rule px-4 py-3">
        <div className="text-[10px] font-mono uppercase tracking-track2 text-muted">
          {matter.status}
        </div>
      </div>
    </aside>
  );
}

// Inline posture control - identical behaviour to PrivilegeControl, but
// the surrounding rule-bordered chip provides the visual frame so we
// strip the default left margin and tighten the font to mono 11px.
function PrivilegeControlInline({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Privilege posture"
      className="bg-transparent text-[10px] font-mono font-bold uppercase tracking-track2 text-ink border-none outline-none cursor-pointer p-0 focus-visible:underline focus-visible:underline-offset-4"
    >
      <option value="A_cleared">A_cleared</option>
      <option value="B_mixed">B_mixed</option>
      <option value="C_paused">C_paused</option>
    </select>
  );
}

// Reference to the canonical PrivilegeControl so the import stays
// load-bearing (and so a future move back to the unwrapped version is
// one-line). The inline variant above is intentionally local: the chip
// frame around it lives in MatterNav, not in PrivilegeControl.
void PrivilegeControl;

function NavIcon({ name }: { name: TabKey }) {
  const common = {
    width: 16,
    height: 16,
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  if (name === "assistant") {
    return (
      <svg {...common}>
        <path d="M3 3h10v7H6l-3 3V3z" />
      </svg>
    );
  }
  if (name === "documents") {
    return (
      <svg {...common}>
        <path d="M4 2h5l3 3v9H4V2z" />
        <path d="M9 2v3h3" />
      </svg>
    );
  }
  if (name === "chronology") {
    return (
      <svg {...common}>
        <circle cx="8" cy="8" r="6" />
        <path d="M8 5v3l2 1.5" />
      </svg>
    );
  }
  if (name === "workflows") {
    return (
      <svg {...common}>
        <path d="M8.5 2L4 9h3l-.5 5L11 7H8l.5-5z" />
      </svg>
    );
  }
  if (name === "audit") {
    return (
      <svg {...common}>
        <path d="M3 4h10M3 8h10M3 12h6" />
      </svg>
    );
  }
  return null;
}
