/**
 * SidebarView — presentational matter-workspace rail (DESIGN.md P19 v0.5).
 *
 * One rail, two callers: the real app (`ui/Sidebar.tsx`, wires route + auth)
 * and the read-only demo (`demo/DemoMatter.tsx`, wires tab state). Both feed
 * this component resolved data so there is a single rail implementation —
 * the v0.5 reconcile that retired `MatterNav` / `MatterBreadcrumb`.
 *
 * Floating panel on md+ (bg-panel / rounded-panel / shadow-panel); off-canvas
 * drawer on mobile. Active = fill + semibold, no accent bar. Items render as
 * an <a href> (real routes) or a <button onClick> (demo tab switch).
 */

import { useEffect, useState, type ReactNode } from "react";
import { BrandMark } from "./BrandMark";

export type RailItem = {
  key: string;
  label: string;
  icon?: ReactNode;
  active?: boolean;
  href?: string;
  onSelect?: () => void;
  testid?: string;
};

export type RailPosture = { label: string; dot: string };

function SectionLabel({ children, collapsed }: { children: ReactNode; collapsed: boolean }) {
  if (collapsed) {
    return (
      <div className="px-3 pt-5 pb-2 text-[10px] font-semibold uppercase tracking-widest text-muted md:mx-4 md:my-3 md:border-t md:border-rule md:p-0 md:text-[0px]" aria-hidden="true">
        {children}
      </div>
    );
  }
  return (
    <div className="px-3 pt-5 pb-2 text-[10px] font-semibold uppercase tracking-widest text-muted">
      {children}
    </div>
  );
}

function NavLink({ item, collapsed }: { item: RailItem; collapsed: boolean }) {
  const className =
    "mx-2 flex items-center min-h-[40px] rounded-item text-sm text-left transition-colors " +
    (collapsed ? "md:justify-center md:px-0 md:gap-0 gap-3 px-3 " : "gap-3 px-3 ") +
    (item.active
      ? "bg-panel-sel text-ink font-semibold"
      : "text-prose hover:bg-panel-hover hover:text-ink");
  const inner = (
    <>
      {item.icon && <span className="shrink-0 opacity-70">{item.icon}</span>}
      <span className={collapsed ? "truncate md:sr-only" : "truncate"}>{item.label}</span>
    </>
  );
  if (item.href) {
    return (
      <a href={item.href} title={collapsed ? item.label : undefined} data-testid={item.testid} className={className} aria-current={item.active ? "page" : undefined}>
        {inner}
      </a>
    );
  }
  return (
    <button type="button" onClick={item.onSelect} title={collapsed ? item.label : undefined} data-testid={item.testid} className={"w-[calc(100%-1rem)] " + className} aria-current={item.active ? "page" : undefined}>
      {inner}
    </button>
  );
}

function UtilLink({ item, collapsed }: { item: RailItem; collapsed: boolean }) {
  const className =
    "flex items-center justify-center min-h-[40px] rounded-item text-sm text-prose hover:bg-panel-hover hover:text-ink transition-colors " +
    (collapsed ? "flex-1 gap-2 md:w-full md:flex-none md:gap-0" : "flex-1 gap-2");
  const inner = (
    <>
      {item.icon && <span className="opacity-70">{item.icon}</span>}
      <span className={collapsed ? "md:sr-only" : ""}>{item.label}</span>
    </>
  );
  return item.href ? (
    <a href={item.href} title={collapsed ? item.label : undefined} className={className}>{inner}</a>
  ) : (
    <button type="button" onClick={item.onSelect} title={collapsed ? item.label : undefined} className={className}>{inner}</button>
  );
}

export function SidebarView({
  newHref,
  onNew,
  globalItems,
  matterTitle,
  matterPosture,
  matterItems,
  adminItems,
  utilItems,
  account,
  closeButton,
  open,
  onClose,
}: {
  newHref?: string;
  onNew?: () => void;
  globalItems: RailItem[];
  matterTitle?: string;
  matterPosture?: RailPosture;
  matterItems?: RailItem[];
  adminItems?: RailItem[];
  utilItems: RailItem[];
  account?: ReactNode | ((collapsed: boolean) => ReactNode);
  closeButton?: ReactNode;
  open: boolean;
  onClose: () => void;
}) {
  const [desktopCollapsed, setDesktopCollapsed] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem("legalise.sidebar.collapsed") !== "false";
  });

  useEffect(() => {
    window.localStorage.setItem("legalise.sidebar.collapsed", desktopCollapsed ? "true" : "false");
  }, [desktopCollapsed]);

  const renderedAccount =
    typeof account === "function" ? account(desktopCollapsed) : account;

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-40 bg-ink/20 md:hidden" onClick={onClose} aria-hidden="true" />
      )}
      <aside
        className={
          "fixed inset-y-0 left-0 z-50 w-64 bg-panel flex flex-col transition-[transform,width] duration-200 " +
          "md:static md:z-auto md:h-full md:shrink-0 md:rounded-panel md:shadow-panel md:translate-x-0 " +
          (desktopCollapsed ? "md:w-16 " : "md:w-64 ") +
          (open ? "translate-x-0" : "-translate-x-full md:translate-x-0")
        }
        aria-label="Navigation"
        data-sidebar-collapsed={desktopCollapsed ? "true" : "false"}
      >
        {/* brand */}
        <div className={"flex items-center h-[64px] border-b border-rule shrink-0 " + (desktopCollapsed ? "md:justify-center md:px-0 gap-2.5 px-4" : "gap-2.5 px-4")}>
          <a href="/matters" className="shrink-0" aria-label="Legalise home">
            <BrandMark />
          </a>
          <span className={desktopCollapsed ? "font-redaction35 text-[21px] leading-none tracking-tight2 text-ink md:sr-only" : "font-redaction35 text-[21px] leading-none tracking-tight2 text-ink"}>Legalise.</span>
          <button
            type="button"
            onClick={() => setDesktopCollapsed((v) => !v)}
            className="ml-auto hidden h-8 w-8 items-center justify-center rounded-item text-muted hover:bg-panel-hover hover:text-ink md:inline-flex"
            aria-label={desktopCollapsed ? "Expand navigation" : "Collapse navigation"}
            aria-expanded={!desktopCollapsed}
            title={desktopCollapsed ? "Expand" : "Collapse"}
          >
            <ChevronIcon collapsed={desktopCollapsed} />
          </button>
          {closeButton && <span className="ml-auto">{closeButton}</span>}
        </div>

        {/* New CTA — top of rail */}
        {(newHref || onNew) && (
          newHref ? (
            <a href={newHref} title={desktopCollapsed ? "New matter" : undefined} className={"mx-3 mt-3 mb-1 flex items-center justify-center rounded-item bg-ink text-paper font-redaction20 text-[11px] font-bold uppercase tracking-track1 hover:bg-black transition-colors " + (desktopCollapsed ? "md:min-h-[40px] md:gap-0 gap-2 min-h-[40px]" : "gap-2 min-h-[40px]")}>
              <PlusIcon /> <span className={desktopCollapsed ? "md:sr-only" : ""}>New matter</span>
            </a>
          ) : (
            <button type="button" onClick={onNew} title={desktopCollapsed ? "New matter" : undefined} className={"mx-3 mt-3 mb-1 flex items-center justify-center rounded-item bg-ink text-paper font-redaction20 text-[11px] font-bold uppercase tracking-track1 hover:bg-black transition-colors " + (desktopCollapsed ? "md:min-h-[40px] md:gap-0 gap-2 min-h-[40px]" : "gap-2 min-h-[40px]")}>
              <PlusIcon /> <span className={desktopCollapsed ? "md:sr-only" : ""}>New matter</span>
            </button>
          )
        )}

        <nav className="flex-1 overflow-y-auto py-2" aria-label="Workspace sections">
          <SectionLabel collapsed={desktopCollapsed}>Workspace</SectionLabel>
          {globalItems.map((it) => (
            <NavLink key={it.key} item={it} collapsed={desktopCollapsed} />
          ))}

          {matterItems && matterItems.length > 0 && (
            <>
              <div className={desktopCollapsed ? "px-3 pt-5 pb-1.5 md:flex md:justify-center md:px-0" : "px-3 pt-5 pb-1.5"}>
                <div className={desktopCollapsed ? "text-[10px] font-semibold uppercase tracking-widest text-muted mb-1.5 md:sr-only" : "text-[10px] font-semibold uppercase tracking-widest text-muted mb-1.5"}>Matter</div>
                <div className={desktopCollapsed ? "flex items-center gap-2 flex-wrap md:justify-center md:gap-0" : "flex items-center gap-2 flex-wrap"}>
                  <span className={desktopCollapsed ? "text-sm font-semibold text-ink leading-snug break-words md:sr-only" : "text-sm font-semibold text-ink leading-snug break-words"}>{matterTitle}</span>
                  {matterPosture && (
                    <span className={desktopCollapsed ? "inline-flex h-8 w-8 items-center justify-center rounded-item border border-rule" : "inline-flex items-center gap-1.5 border border-rule rounded-item px-2 py-0.5 text-[9px] tech-token font-bold uppercase tracking-track1 text-ink"} title={`${matterTitle || "Matter"} · ${matterPosture.label}`}>
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: matterPosture.dot }} />
                      <span className={desktopCollapsed ? "sr-only" : ""}>{matterPosture.label}</span>
                    </span>
                  )}
                </div>
              </div>
              {matterItems.map((it) => (
                <NavLink key={it.key} item={it} collapsed={desktopCollapsed} />
              ))}
            </>
          )}

          {adminItems && adminItems.length > 0 && (
            <>
              <SectionLabel collapsed={desktopCollapsed}>Admin</SectionLabel>
              {adminItems.map((it) => (
                <NavLink key={it.key} item={it} collapsed={desktopCollapsed} />
              ))}
            </>
          )}
        </nav>

        {/* Utility footer */}
        {utilItems.length > 0 && (
          <div className={"gap-1 px-2 pt-1 pb-1 border-t border-rule " + (desktopCollapsed ? "flex md:flex-col" : "flex")}>
            {utilItems.map((it) => (
              <UtilLink key={it.key} item={it} collapsed={desktopCollapsed} />
            ))}
          </div>
        )}

        {renderedAccount}
      </aside>
    </>
  );
}

function ChevronIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {collapsed ? <path d="M6 3l5 5-5 5" /> : <path d="M10 3L5 8l5 5" />}
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M8 3v10M3 8h10" />
    </svg>
  );
}

// Shared rail icon set — keyed by nav key so both callers stay consistent.
export function NavIcon({ name }: { name: string }) {
  const c = {
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
  switch (name) {
    case "matters":
      return <svg {...c}><path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h3l1.5 2h4.5A1.5 1.5 0 0 1 14 6.5v5A1.5 1.5 0 0 1 12.5 13h-9A1.5 1.5 0 0 1 2 11.5z" /></svg>;
    case "library":
      return <svg {...c}><rect x="2.5" y="2.5" width="4.5" height="4.5" /><rect x="9" y="2.5" width="4.5" height="4.5" /><rect x="2.5" y="9" width="4.5" height="4.5" /><rect x="9" y="9" width="4.5" height="4.5" /></svg>;
    case "assistant":
      return <svg {...c}><path d="M3 3h10v7H6l-3 3V3z" /></svg>;
    case "documents":
      return <svg {...c}><path d="M4 2h5l3 3v9H4V2z" /><path d="M9 2v3h3" /></svg>;
    case "workflows":
      return <svg {...c}><path d="M8.5 2L4 9h3l-.5 5L11 7H8l.5-5z" /></svg>;
    case "audit":
      return <svg {...c}><path d="M3 4h10M3 8h10M3 12h6" /></svg>;
    case "artifacts":
      return <svg {...c}><path d="M4 2h6l2.5 2.5V14H4z" /><path d="M6 9.5l1.3 1.3L10 8" /></svg>;
    case "lifecycle":
      return <svg {...c}><path d="M2.5 4.5h11v8h-11z" /><path d="M2.5 4.5L8 8l5.5-3.5" /></svg>;
    case "settings":
      return <svg {...c}><circle cx="8" cy="8" r="2.5" /><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.3 3.3l1.4 1.4M11.3 11.3l1.4 1.4M12.7 3.3l-1.4 1.4M4.7 11.3l-1.4 1.4" /></svg>;
    case "help":
      return <svg {...c}><circle cx="8" cy="8" r="6.5" /><path d="M6.2 6a1.8 1.8 0 1 1 2.4 1.7c-.5.2-.6.5-.6 1" /><path d="M8 11h.01" /></svg>;
    case "admin":
      return <svg {...c}><path d="M8 2l5 2v4c0 3-2.2 5-5 6-2.8-1-5-3-5-6V4z" /></svg>;
    default:
      return null;
  }
}
