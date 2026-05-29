/**
 * Sidebar — Phase 17 IA shell.
 *
 * The single persistent navigation surface for the logged-in app.
 * Replaces the top-nav + hamburger-drawer model (the "user mess on
 * top") with one full-height left rail: brand at the top, workspace
 * surfaces grouped, settings/admin below, and the account pinned
 * bottom-left (Asana/Whop/Origin pattern). When a matter is open its
 * sub-sections nest in this same rail — no main-area tab strip
 * (ratified decision #2).
 *
 * Persistent on md+; collapses to an off-canvas drawer on mobile,
 * driven by `open`/`onClose` (reuses the shell's navOpen state).
 */

import { useEffect, useState } from "react";
import { navigate, type Route } from "../lib/route";
import type { CurrentUser, Matter } from "../lib/api";
import { useAuth } from "../auth/AuthProvider";
import { BrandMark } from "./BrandMark";
import { SIDEBAR_NAV, type TabKey } from "../matter/tabs/types";

type NavItem = { href: string; label: string; active: boolean };

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 pt-5 pb-2 text-[11px] font-semibold uppercase tracking-widest text-muted">
      {children}
    </div>
  );
}

function NavLink({
  href,
  label,
  active,
  indent,
  testid,
}: NavItem & { indent?: boolean; testid?: string }) {
  return (
    <a
      href={href}
      data-testid={testid}
      className={
        "flex items-center min-h-[40px] px-3 text-sm transition-colors " +
        (indent ? "pl-7 " : "") +
        (active
          ? "bg-wash text-ink font-medium border-l-2 border-seal"
          : "text-ink hover:bg-wash border-l-2 border-transparent")
      }
    >
      {label}
    </a>
  );
}

function AccountBlock({
  user,
  onSignOut,
}: {
  user: CurrentUser;
  onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest("[data-account-block]")) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("click", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const initial = (user.name || user.email).slice(0, 1).toUpperCase();
  const label = user.name || user.email;

  return (
    <div className="relative border-t border-rule" data-account-block>
      {open && (
        <div
          role="menu"
          className="absolute bottom-full left-2 right-2 mb-1 bg-paper border border-rule flex flex-col text-sm shadow-sm"
        >
          <div className="px-3 py-2 border-b border-rule">
            <div className="text-[11px] uppercase tracking-widest text-muted mb-0.5">
              Signed in as
            </div>
            <div className="text-ink truncate">{user.email}</div>
          </div>
          <a href="/settings/profile" className="px-3 py-2 text-ink hover:bg-wash" role="menuitem">
            Account settings
          </a>
          <button
            type="button"
            onClick={onSignOut}
            className="px-3 py-2 text-left text-seal hover:bg-wash"
            role="menuitem"
          >
            Sign out
          </button>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-3 hover:bg-wash transition-colors"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="w-7 h-7 bg-ink text-paper flex items-center justify-center font-mono text-xs font-semibold shrink-0">
          {initial}
        </span>
        <span className="text-sm text-ink truncate flex-1 text-left">{label}</span>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path d="M3 7l3-3 3 3" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>
    </div>
  );
}

export function Sidebar({
  route,
  matter,
  matterTab,
  open,
  onClose,
}: {
  route: Route;
  matter: Matter | null;
  matterTab: TabKey;
  open: boolean;
  onClose: () => void;
}) {
  const auth = useAuth();
  const isAdmin = route.name === "adminUsers" || route.name === "adminUserDetail";
  // The matter sub-nav must stay visible across every matter sub-route
  // (detail tabs, audit, artifacts) — not just `detail` — so the
  // workspace context doesn't vanish from the rail when you open the
  // audit trail or an artifact. Derive the slug from the route itself,
  // since the drawer-matter is cleared when MatterDetail unmounts.
  const matterSlug =
    route.name === "detail" ||
    route.name === "matterAudit" ||
    route.name === "matterArtifacts" ||
    route.name === "matterArtifactDetail" ||
    route.name === "matterDocumentDetail" ||
    route.name === "matterLifecycle"
      ? route.slug
      : null;
  const onMatterArea = matterSlug !== null;
  const onMatterArtifacts =
    route.name === "matterArtifacts" || route.name === "matterArtifactDetail";
  const onMatterDocumentDetail = route.name === "matterDocumentDetail";
  const onMatterLifecycle = route.name === "matterLifecycle";
  const onMatterAuditRoute = route.name === "matterAudit";
  // /admin/audit has no named case in the route shim; match on path.
  const path = typeof window === "undefined" ? "" : window.location.pathname;
  const onAudit = path.startsWith("/admin/audit");

  return (
    <>
      {/* mobile scrim */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-ink/20 md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <aside
        className={
          "fixed inset-y-0 left-0 z-50 w-64 bg-paper border-r border-rule flex flex-col " +
          "transition-transform md:translate-x-0 " +
          (open ? "translate-x-0" : "-translate-x-full md:translate-x-0")
        }
      >
        {/* brand */}
        <a href="/app" className="flex items-center gap-2 px-3 h-[64px] border-b border-rule shrink-0">
          <BrandMark />
          <span className="font-semibold text-lg tracking-tight2 text-ink">legalise</span>
        </a>

        <nav className="flex-1 overflow-y-auto py-2">
          <SectionLabel>Workspace</SectionLabel>
          <NavLink href="/app" label="Dashboard" active={route.name === "appHome"} />
          <NavLink
            href="/matters"
            label="Matters"
            active={route.name === "list" || route.name === "detail" || route.name === "new"}
          />
          {/* nested matter sub-sections (ratified decision #2) */}
          {onMatterArea && matterSlug && (
            <div className="py-1">
              <div className="px-3 pb-1 pl-7 text-[11px] uppercase tracking-widest text-muted truncate">
                {matter?.title || matterSlug}
              </div>
              {SIDEBAR_NAV.map((t) => (
                <NavLink
                  key={t.key}
                  href={`/matters/${matterSlug}/${t.key}`}
                  label={t.label}
                  active={
                    t.key === "audit"
                      ? onMatterAuditRoute ||
                        (route.name === "detail" && matterTab === "audit")
                      : t.key === "documents"
                        ? onMatterDocumentDetail ||
                          (route.name === "detail" && matterTab === "documents")
                        : route.name === "detail" && matterTab === t.key
                  }
                  indent
                />
              ))}
              <NavLink
                href={`/matters/${matterSlug}/artifacts`}
                label="Outputs"
                active={onMatterArtifacts}
                indent
              />
              <NavLink
                href={`/matters/${matterSlug}/lifecycle`}
                label="Export"
                active={onMatterLifecycle}
                indent
              />
            </div>
          )}
          <NavLink
            href="/modules"
            label="Modules"
            active={
              route.name === "modules" ||
              route.name === "moduleDetail" ||
              route.name === "moduleInstall" ||
              route.name === "createModule"
            }
          />
          <NavLink href="/admin/audit" label="Workspace audit" active={onAudit} />

          <SectionLabel>Account</SectionLabel>
          <NavLink
            href="/settings/profile"
            label="Settings"
            active={route.name === "settings"}
          />
          {auth.user?.is_superuser && (
            <NavLink href="/admin/users" label="Admin" active={isAdmin} testid="admin-nav-anchor" />
          )}
        </nav>

        {auth.user && (
          <AccountBlock
            user={auth.user}
            onSignOut={() => void auth.signOut().then(() => navigate("/"))}
          />
        )}
      </aside>
    </>
  );
}
