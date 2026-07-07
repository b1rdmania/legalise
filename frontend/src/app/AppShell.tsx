/**
 * AppShell — root layout.
 *
 * Replaces the giant switch in the pre-A0 App.tsx. Renders TopBar +
 * Drawer + `<Outlet />`. Pages live in their own routes; the shell only
 * owns chrome.
 *
 * Drawer / TopBar still consume route info via lib/route's compatibility
 * shim (useRoute reconstructs the Route discriminated union from the
 * TanStack location).
 */

import { useEffect, useState } from "react";
import { Outlet } from "@tanstack/react-router";
import { BACKEND_ROOT, getMatter } from "../lib/api";
import { isPublicRoute, navigate, useRoute, type Route } from "../lib/route";
import { useAuth } from "../auth/AuthProvider";
import { HOSTED_ACCESS_WAITLIST } from "../lib/access";
import { TopBar } from "../ui/TopBar";
import { Drawer } from "../ui/Drawer";
import { Sidebar } from "../ui/Sidebar";
import { DrawerProvider, useDrawer } from "./DrawerContext";

// Marketing / auth routes render bare (they bring their own chrome).
// Everything else, for a logged-in user, renders inside the
// app shell (persistent Sidebar + main). Logged-out users on those
// routes are redirected by the auth guard below.
const CHROMELESS_ROUTES = new Set([
  "landing",
  "architecture",
  "about",
  "waitlist",
  "signin",
  "signup",
  "forgot",
  "reset",
  "verify",
  "verifyPending",
  "demo",
  "demoGuided",
]);

type HealthResponse = {
  status: string;
  version: string;
  database: string;
  environment: string;
};

export function AppShell() {
  // DrawerProvider has to wrap the entire shell so MatterDetail (inside
  // <Outlet />) and TopBar / Drawer (siblings of <Outlet />) all see the
  // same context.
  return (
    <DrawerProvider>
      <AppShellInner />
    </DrawerProvider>
  );
}

function AppShellInner() {
  const route = useRoute();
  const auth = useAuth();
  const drawer = useDrawer();
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    fetch(`${BACKEND_ROOT}/health`)
      .then((r) => r.json())
      .then((data: HealthResponse) => setHealth(data))
      .catch(() => setHealth(null));
  }, []);

  // Runtime auth guard. The __authed route's beforeLoad covers the
  // "navigated to a protected route while logged out" case at navigation
  // time, but it does NOT re-fire when auth state flips from authed →
  // logged-out while a protected route is mounted (e.g. session expiry).
  // This effect closes that gap.
  useEffect(() => {
    if (auth.loading) return;
    if (auth.user) return;
    if (isPublicRoute(route)) return;
    navigate(HOSTED_ACCESS_WAITLIST ? "/waitlist" : "/auth/login");
  }, [auth.loading, auth.user, route]);

  // body-scroll-lock + esc to close
  useEffect(() => {
    if (!navOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setNavOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [navOpen]);

  // Sync the drawer matter context to whatever matter-scoped route
  // we're on. Without this, only MatterDetail populated drawerMatter —
  // so Signed outputs (/matters/:slug/artifacts), Working pack
  // (/matters/:slug/lifecycle), and the other non-"detail" matter
  // routes rendered with matter=null and the Sidebar fell back to the
  // slug. Centralising the fetch here keeps the folder-feel intact
  // across the full /matters/:slug/* tree.
  const matterSlug = matterSlugFromRoute(route);
  useEffect(() => {
    if (!matterSlug) {
      drawer.setDrawerMatter(null);
      return;
    }
    if (drawer.drawerMatter?.slug === matterSlug) return;
    let cancelled = false;
    getMatter(matterSlug)
      .then((m) => {
        if (!cancelled) drawer.setDrawerMatter(m);
      })
      .catch(() => {
        // Non-fatal — the page that owns the matter view will surface
        // the real error. Sidebar gracefully falls back to the slug.
      });
    return () => {
      cancelled = true;
    };
  }, [matterSlug, drawer]);

  // IA shell: logged-in users on app routes get the
  // persistent Sidebar; marketing/auth routes (and logged-out users)
  // keep the legacy TopBar + Drawer chrome untouched.
  const useAppShell = !!auth.user && !CHROMELESS_ROUTES.has(route.name);

  if (useAppShell) {
    // v0.5: inset floating-panel shell (DESIGN.md P21). The canvas is the
    // page; the Sidebar and the content each float as a rounded, elevated
    // panel with a gap. Mobile keeps the off-canvas drawer + a slim top bar.
    return (
      <div className="min-h-screen md:h-screen bg-canvas text-ink md:flex md:gap-3 md:p-3 md:overflow-hidden">
        <Sidebar
          route={route}
          matter={drawer.drawerMatter}
          matterTab={drawer.drawerTab}
          open={navOpen}
          onClose={() => setNavOpen(false)}
        />
        {/* mobile top bar: just a menu button to open the sidebar drawer */}
        <div className="md:hidden sticky top-0 z-30 flex items-center h-[56px] px-4 bg-canvas border-b border-rule">
          <button
            type="button"
            onClick={() => setNavOpen(true)}
            aria-label="Open menu"
            className="min-h-[44px] min-w-[44px] -ml-2 flex items-center justify-center text-ink"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M3 6h14M3 10h14M3 14h14" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </button>
        </div>
        <main className="min-h-screen bg-panel md:min-h-0 md:flex-1 md:min-w-0 md:h-full md:rounded-panel md:shadow-panel md:overflow-y-auto">
          <Outlet />
        </main>
      </div>
    );
  }

  // The demo workspace (DemoMatter) brings its own full v0.5 panel shell —
  // render it bare, without the marketing TopBar/Drawer, which otherwise
  // stacked a second wordmark above the rail (the v0.5 double-header).
  if (route.name === "demo" || route.name === "demoDocument" || route.name === "demoGuided") {
    return <Outlet />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-paper text-ink pt-[64px] sm:pt-[80px]">
      <TopBar
        route={route}
        navOpen={navOpen}
        setNavOpen={setNavOpen}
        drawerMatter={drawer.drawerMatter}
        drawerTab={drawer.drawerTab}
      />
      <Drawer
        route={route}
        navOpen={navOpen}
        setNavOpen={setNavOpen}
        matter={drawer.drawerMatter}
        health={health}
      />
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}

// Extract the matter slug from any matter-scoped route. Mirrors the
// discriminant set Sidebar uses to decide whether to render the matter
// section.
function matterSlugFromRoute(route: Route): string | null {
  switch (route.name) {
    case "detail":
    case "matterAudit":
    case "matterArtifacts":
    case "matterArtifactDetail":
    case "matterArtifactSign":
    case "matterSignoff":
    case "matterDocumentDetail":
    case "matterLifecycle":
      return route.slug;
    default:
      return null;
  }
}
