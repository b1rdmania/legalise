/**
 * Sidebar — real-app adapter over SidebarView (DESIGN.md P19 v0.5).
 *
 * Wires the live route + auth into the presentational rail. The visual
 * rail lives in SidebarView, shared with the read-only demo, so there is
 * one rail implementation (the v0.5 reconcile; MatterNav/MatterBreadcrumb
 * retired). Floating panel on md+, off-canvas drawer on mobile.
 */

import { useEffect, useState } from "react";
import { navigate, type Route } from "../lib/route";
import type { CurrentUser, Matter } from "../lib/api";
import { useAuth } from "../auth/AuthProvider";
import { SIDEBAR_NAV, type TabKey } from "../matter/tabs/types";
import { NavIcon, SidebarView, type RailItem, type RailPosture } from "./SidebarView";
import { postureDot, postureLabel } from "../lib/posture";

// Posture indicator — a semantic dot, not chrome colour. Two
// user-facing states (src/lib/posture.ts): Active green, Paused seal.
function posture(p: string): RailPosture {
  return { label: postureLabel(p), dot: postureDot(p) };
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
    <div className="relative border-t border-rule px-2 py-2" data-account-block>
      {open && (
        <div
          role="menu"
          className="absolute bottom-full left-2 right-2 mb-1 bg-paper border border-rule rounded-item flex flex-col text-sm shadow-panel overflow-hidden"
        >
          <div className="px-3 py-2 border-b border-rule">
            <div className="text-[10px] uppercase tracking-widest text-muted mb-0.5">Signed in as</div>
            <div className="text-ink truncate">{user.email}</div>
          </div>
          <a href="/settings/profile" className="px-3 py-2 text-ink hover:bg-panel-hover" role="menuitem">
            Account settings
          </a>
          <button type="button" onClick={onSignOut} className="px-3 py-2 text-left text-seal hover:bg-panel-hover" role="menuitem">
            Sign out
          </button>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-2 py-2 rounded-item hover:bg-panel-hover transition-colors"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="w-7 h-7 bg-ink text-paper rounded-full flex items-center justify-center tech-token text-xs font-semibold shrink-0">
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
  // The matter sub-nav stays visible across every matter sub-route (detail
  // tabs, audit, artifacts, lifecycle), derived from the route itself since
  // the drawer-matter clears on MatterDetail unmount.
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
  const onMatterDocumentDetail = route.name === "matterDocumentDetail";
  const path = typeof window === "undefined" ? "" : window.location.pathname;
  const onAudit = path.startsWith("/admin/audit");

  const globalItems: RailItem[] = [
    {
      key: "matters",
      label: "Matters",
      href: "/matters",
      icon: <NavIcon name="matters" />,
      active: !onMatterArea && (route.name === "list" || route.name === "new" || route.name === "appHome"),
    },
    {
      key: "library",
      label: "Skill library",
      href: "/skills",
      icon: <NavIcon name="library" />,
      active:
        !onMatterArea &&
        (route.name === "modules" ||
          route.name === "moduleDetail" ||
          route.name === "moduleInstall" ||
          route.name === "lawveImport" ||
          route.name === "createModule"),
    },
    {
      key: "register",
      label: "Register",
      href: "/register",
      icon: <NavIcon name="audit" />,
      active: !onMatterArea && route.name === "register",
    },
  ];

  const matterItems: RailItem[] | undefined =
    onMatterArea && matterSlug
      ? [
          ...SIDEBAR_NAV.map((t) => ({
            key: t.key,
            label: t.label,
            href: `/matters/${matterSlug}/${t.key}`,
            icon: <NavIcon name={t.key} />,
            active:
              t.key === "documents"
                  ? onMatterDocumentDetail || (route.name === "detail" && matterTab === "documents")
                  : route.name === "detail" && matterTab === t.key,
          })),
        ]
      : undefined;

  const adminItems: RailItem[] | undefined = auth.user?.is_superuser
    ? [
        { key: "users", label: "Users", href: "/admin/users", icon: <NavIcon name="admin" />, active: isAdmin, testid: "admin-nav-anchor" },
        { key: "audit", label: "Audit", href: "/admin/audit", icon: <NavIcon name="audit" />, active: onAudit },
      ]
    : undefined;

  const utilItems: RailItem[] = [
    { key: "settings", label: "Settings", href: "/settings/profile", icon: <NavIcon name="settings" />, active: route.name === "settings" },
    { key: "help", label: "Help", href: "/help", icon: <NavIcon name="help" />, active: route.name === "help" },
  ];

  return (
    <SidebarView
      brandHref="/matters"
      newHref="/matters/new"
      globalItems={globalItems}
      matterTitle={matter?.title || matterSlug || undefined}
      matterPosture={matter ? posture(matter.privilege_posture) : undefined}
      matterItems={matterItems}
      adminItems={adminItems}
      utilItems={utilItems}
      open={open}
      onClose={onClose}
      account={
        auth.user ? (
          <AccountBlock
            user={auth.user}
            onSignOut={() => {
              // Navigate to the public landing page BEFORE clearing the
              // session — the AppShell auth guard otherwise races the
              // post-signout navigate and bounces to /auth/signin.
              navigate("/");
              void auth.signOut();
            }}
          />
        ) : undefined
      }
    />
  );
}
