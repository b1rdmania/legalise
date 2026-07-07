/**
 * AuthGate — the real first-load gate for protected routes.
 *
 * `__authed.beforeLoad` runs once at navigation time and only knows what
 * `AuthSnapshot` says at that moment — which, on a cold direct-URL load,
 * is still `{ user: null, loading: true }`. A naive `<Outlet />` here
 * would mount the page (MatterList, Settings, etc.) and let it fire
 * `GET /api/matters` before `GET /auth/users/me` resolves the session.
 * The fetch races; if the page fetch loses the race it returns 401 and
 * the page renders an auth-error state for a user who actually *is*
 * authenticated. That's the bug P1 calls out.
 *
 * AuthGate sits between the router and the protected page:
 *   - loading  → render the loader, no <Outlet />, no fetches downstream
 *   - no user  → useEffect redirect, no <Outlet /> in the meantime
 *   - user     → render <Outlet />, downstream fetches are now safe
 *
 * AppShell still keeps a session-expiry watcher for the mid-session
 * authed → null transition, but that's belt-and-braces. The first-load
 * correctness sits here.
 */

import { useEffect } from "react";
import { Outlet } from "@tanstack/react-router";
import { useAuth } from "../auth/AuthProvider";
import { navigate } from "../lib/route";
import { HOSTED_ACCESS_WAITLIST } from "../lib/access";

export function AuthGate() {
  const auth = useAuth();

  // Once auth resolves to "no user", bounce. The effect runs after
  // render, so we ALSO render the loader (not <Outlet />) in this
  // branch — that prevents the protected page from mounting while
  // the redirect is in flight.
  useEffect(() => {
    if (auth.loading) return;
    if (auth.user) return;
    navigate(HOSTED_ACCESS_WAITLIST ? "/waitlist" : "/auth/login");
  }, [auth.loading, auth.user]);

  if (auth.loading || !auth.user) {
    return <AuthGateLoader />;
  }
  return <Outlet />;
}

function AuthGateLoader() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-muted text-sm">
      <span className="inline-flex items-center gap-2">
        <span
          className="inline-block h-3 w-3 rounded-full border-2 border-muted border-t-transparent animate-spin"
          aria-hidden="true"
        />
        Resolving session…
      </span>
    </div>
  );
}
