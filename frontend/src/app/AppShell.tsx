/**
 * AppShell — Phase 14 A0 root layout.
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
import { BACKEND_ROOT } from "../lib/api";
import { isPublicRoute, navigate, useRoute } from "../lib/route";
import { useAuth } from "../auth/AuthProvider";
import { HOSTED_ACCESS_WAITLIST } from "../lib/access";
import { TopBar } from "../ui/TopBar";
import { Drawer } from "../ui/Drawer";
import { DrawerProvider, useDrawer } from "./DrawerContext";

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
    navigate(HOSTED_ACCESS_WAITLIST ? "/waitlist" : "/auth/signin");
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

  // reset drawer matter scope when leaving a detail route
  useEffect(() => {
    if (route.name !== "detail") drawer.setDrawerMatter(null);
  }, [route, drawer]);

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
