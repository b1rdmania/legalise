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

import { useRef, type ReactNode } from "react";
import { BrandMark } from "./BrandMark";
import { FocusSentinel, useDrawerA11y } from "./drawerA11y";

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

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="px-3 pt-5 pb-2 text-[10px] font-semibold uppercase tracking-widest text-muted">
      {children}
    </div>
  );
}

function NavLink({ item }: { item: RailItem }) {
  const interactive = Boolean(item.href || item.onSelect);
  const className =
    "mx-2 flex items-center gap-3 min-h-[40px] px-3 rounded-item text-sm text-left transition-colors " +
    (item.active
      ? "bg-panel-sel text-ink font-semibold"
      : interactive
        ? "text-prose hover:bg-panel-hover hover:text-ink"
        : "text-prose");
  const inner = (
    <>
      {item.icon && <span className="shrink-0 opacity-70">{item.icon}</span>}
      <span className="truncate">{item.label}</span>
    </>
  );
  if (item.href) {
    return (
      <a href={item.href} data-testid={item.testid} className={className} aria-current={item.active ? "page" : undefined}>
        {inner}
      </a>
    );
  }
  if (item.onSelect) {
    return (
      <button type="button" onClick={item.onSelect} data-testid={item.testid} className={"w-[calc(100%-1rem)] " + className} aria-current={item.active ? "page" : undefined}>
        {inner}
      </button>
    );
  }
  // Neither a route nor a handler → a presentational progress indicator
  // (the guided demo rail reflects the current act but does not navigate).
  return (
    <div data-testid={item.testid} className={className} aria-current={item.active ? "page" : undefined}>
      {inner}
    </div>
  );
}

function UtilLink({ item }: { item: RailItem }) {
  const className =
    "flex-1 flex items-center justify-center gap-2 min-h-[40px] rounded-item text-sm text-prose hover:bg-panel-hover hover:text-ink transition-colors";
  const inner = (
    <>
      {item.icon && <span className="opacity-70">{item.icon}</span>}
      {item.label}
    </>
  );
  return item.href ? (
    <a href={item.href} className={className}>{inner}</a>
  ) : (
    <button type="button" onClick={item.onSelect} className={className}>{inner}</button>
  );
}

export function SidebarView({
  brandHref,
  newHref,
  onNew,
  globalItems,
  matterTitle,
  matterPosture,
  matterItems,
  matterGovernanceItems,
  matterFooter,
  adminItems,
  utilItems,
  account,
  closeButton,
  open,
  onClose,
}: {
  brandHref?: string;
  newHref?: string;
  onNew?: () => void;
  globalItems: RailItem[];
  matterTitle?: string;
  matterPosture?: RailPosture;
  matterItems?: RailItem[];
  // Governance lane (Outputs / Approvals / Activity) — rendered under a
  // "Governance" label after the primary matter items so the rail tells
  // the whole inspect → approve → sign loop. Optional: the demo caller
  // does not pass it.
  matterGovernanceItems?: RailItem[];
  matterFooter?: ReactNode;
  adminItems?: RailItem[];
  utilItems: RailItem[];
  account?: ReactNode;
  closeButton?: ReactNode;
  open: boolean;
  onClose: () => void;
}) {
  // Drawer a11y (WI-2): focus into the panel on open, restore to the
  // trigger on close, Escape closes, Tab trapped by the sentinels. The
  // hook is inert while `open` is false, so the static desktop rail is
  // unaffected.
  const panelRef = useRef<HTMLElement>(null);
  useDrawerA11y({ open, onClose, panelRef });

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-ink/20 transition-opacity duration-150 md:hidden"
          onClick={onClose}
          aria-hidden="true"
          data-testid="drawer-scrim"
        />
      )}
      <aside
        ref={panelRef}
        className={
          "fixed inset-y-0 left-0 z-50 w-64 bg-panel flex flex-col transition-transform " +
          "md:static md:z-auto md:h-full md:shrink-0 md:rounded-panel md:shadow-panel md:translate-x-0 " +
          (open ? "translate-x-0" : "-translate-x-full md:translate-x-0")
        }
        aria-label="Navigation"
        role={open ? "dialog" : undefined}
        aria-modal={open || undefined}
      >
        {open && <FocusSentinel panelRef={panelRef} edge="start" />}
        {/* brand — links to app home when the caller wires a brandHref */}
        <div className="flex items-center px-4 h-[64px] border-b border-rule shrink-0">
          {brandHref ? (
            <a href={brandHref} aria-label="Legalise" className="flex items-center gap-2.5 hover:opacity-70 transition-opacity">
              <BrandMark />
              <span className="font-redaction35 text-[26px] leading-none tracking-tight2 text-ink">Legalise.</span>
            </a>
          ) : (
            <span className="flex items-center gap-2.5">
              <BrandMark />
              <span className="font-redaction35 text-[26px] leading-none tracking-tight2 text-ink">Legalise.</span>
            </span>
          )}
          {closeButton && <span className="ml-auto">{closeButton}</span>}
        </div>

        {/* New CTA — top of rail */}
        {(newHref || onNew) && (
          newHref ? (
            <a href={newHref} className="mx-3 mt-4 mb-2 flex items-center justify-center gap-2 min-h-[40px] rounded-item bg-ink text-paper text-[13px] font-medium hover:bg-black transition-colors">
              <PlusIcon /> New matter
            </a>
          ) : (
            <button type="button" onClick={onNew} className="mx-3 mt-4 mb-2 flex items-center justify-center gap-2 min-h-[40px] rounded-item bg-ink text-paper text-[13px] font-medium hover:bg-black transition-colors">
              <PlusIcon /> New matter
            </button>
          )
        )}

        <nav className="flex-1 overflow-y-auto py-2" aria-label="Workspace sections">
          <div className="pt-3" aria-hidden="true" />
          {globalItems.map((it) => (
            <NavLink key={it.key} item={it} />
          ))}

          {matterItems && matterItems.length > 0 && (
            <>
              <div className="px-3 pt-7 pb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-ink leading-snug wrap-break-word">{matterTitle}</span>
                  {matterPosture && (
                    <span className="inline-flex items-center gap-1.5 border border-rule rounded-item px-2 py-0.5 text-[9px] tech-token font-bold uppercase tracking-track1 text-ink">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: matterPosture.dot }} />
                      {matterPosture.label}
                    </span>
                  )}
                </div>
              </div>
              {matterItems.map((it) => (
                <NavLink key={it.key} item={it} />
              ))}
              {matterGovernanceItems && matterGovernanceItems.length > 0 && (
                <>
                  <SectionLabel>Governance</SectionLabel>
                  {matterGovernanceItems.map((it) => (
                    <NavLink key={it.key} item={it} />
                  ))}
                </>
              )}
              {matterFooter}
            </>
          )}

          {adminItems && adminItems.length > 0 && (
            <>
              <SectionLabel>Admin</SectionLabel>
              {adminItems.map((it) => (
                <NavLink key={it.key} item={it} />
              ))}
            </>
          )}
        </nav>

        {/* Utility footer */}
        {utilItems.length > 0 && (
          <div className="flex gap-1 px-2 pt-1 pb-1 border-t border-rule">
            {utilItems.map((it) => (
              <UtilLink key={it.key} item={it} />
            ))}
          </div>
        )}

        {account}
        {open && <FocusSentinel panelRef={panelRef} edge="end" />}
      </aside>
    </>
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
    case "overview":
      return <svg {...c}><rect x="2.5" y="2.5" width="11" height="11" rx="1" /><path d="M2.5 6h11M6 6v7.5" /></svg>;
    case "assistant":
      return <svg {...c}><path d="M3 3h10v7H6l-3 3V3z" /></svg>;
    case "documents":
      return <svg {...c}><path d="M4 2h5l3 3v9H4V2z" /><path d="M9 2v3h3" /></svg>;
    case "workflows":
      return <svg {...c}><path d="M8.5 2L4 9h3l-.5 5L11 7H8l.5-5z" /></svg>;
    case "audit":
      return <svg {...c}><path d="M3 4h10M3 8h10M3 12h6" /></svg>;
    case "chronology":
      return <svg {...c}><circle cx="8" cy="8" r="6" /><path d="M8 4.5V8l2.5 1.5" /></svg>;
    case "approvals":
      return <svg {...c}><path d="M3 8.5l3 3 7-8" /></svg>;
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
