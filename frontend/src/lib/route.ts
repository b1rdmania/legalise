/**
 * Route compatibility shim.
 *
 * Pre-A0 this file was a hand-rolled hash-based router. Phase 14 A0
 * replaced the router with TanStack Router (path-based, see
 * `src/router/index.tsx`). This file now provides a *compatibility
 * surface* so existing components that use `useRoute()` / `navigate()`
 * keep working unchanged.
 *
 * The Route discriminated union is reconstructed from the TanStack
 * location on every render. Components that just need `route.name` or
 * `route.slug` see the same shape they always did.
 *
 * New components should prefer TanStack's own hooks (`useRouterState`,
 * route-level `useParams`, `<Link>`) — this shim is a one-release bridge.
 */

import { useRouterState } from "@tanstack/react-router";
import { router } from "../router";

export type Route =
  | { name: "landing" }
  | { name: "manifesto" }
  | { name: "waitlist" }
  | { name: "signin" }
  | { name: "signup" }
  | { name: "forgot" }
  | { name: "reset"; token: string | null }
  | { name: "verifyPending" }
  | { name: "verify"; token: string | null }
  | { name: "modules" }
  | { name: "submitModule" }
  | { name: "demo"; tab?: string }
  | { name: "list" }
  | { name: "new" }
  | { name: "detail"; slug: string; tab?: string }
  | { name: "settings"; tab: "profile" | "keys" | "preferences" }
  // Phase 14 placeholder routes — present in the Route union so TopBar /
  // Drawer can pattern-match without crashing, but resolved to the
  // PlaceholderPage component until the relevant sub-step lands.
  | { name: "appHome" }
  | { name: "moduleDetail"; moduleId: string }
  | { name: "moduleInstall"; ceremonyId: string }
  | { name: "matterAudit"; slug: string }
  | { name: "matterArtifacts"; slug: string }
  | { name: "matterArtifactDetail"; slug: string; artifactId: string }
  | { name: "adminUsers" }
  | { name: "adminUserDetail"; userId: string };

function parseQuery(search: string): URLSearchParams {
  const q = search.indexOf("?");
  return new URLSearchParams(q < 0 ? "" : search.slice(q + 1));
}

export function routeFromPath(pathname: string, search: string): Route {
  const query = parseQuery(search);
  const path = pathname.replace(/\/$/, "") || "/";

  if (path === "/") return { name: "landing" };
  if (path === "/manifesto") return { name: "manifesto" };
  if (path === "/waitlist") return { name: "waitlist" };

  if (path === "/auth/signin") return { name: "signin" };
  if (path === "/auth/signup") return { name: "signup" };
  if (path === "/auth/forgot") return { name: "forgot" };
  if (path === "/auth/reset") return { name: "reset", token: query.get("token") };
  if (path === "/auth/verify-pending") return { name: "verifyPending" };
  if (path === "/auth/verify") return { name: "verify", token: query.get("token") };

  if (path === "/modules") return { name: "modules" };
  if (path === "/modules/submit") return { name: "submitModule" };

  if (path === "/demo") return { name: "demo" };
  const demoMatch = path.match(/^\/demo\/(.+)$/);
  if (demoMatch) return { name: "demo", tab: demoMatch[1] };

  if (path === "/matters") return { name: "list" };
  if (path === "/matters/new") return { name: "new" };

  if (path === "/settings" || path === "/settings/profile") {
    return { name: "settings", tab: "profile" };
  }
  if (path === "/settings/keys") return { name: "settings", tab: "keys" };
  if (path === "/settings/preferences") {
    return { name: "settings", tab: "preferences" };
  }

  if (path === "/app") return { name: "appHome" };
  if (path === "/admin/users") return { name: "adminUsers" };
  const adminUserMatch = path.match(/^\/admin\/users\/([^/]+)$/);
  if (adminUserMatch) return { name: "adminUserDetail", userId: adminUserMatch[1] };

  const moduleInstallMatch = path.match(/^\/modules\/install\/([^/]+)$/);
  if (moduleInstallMatch) {
    return { name: "moduleInstall", ceremonyId: moduleInstallMatch[1] };
  }
  const moduleDetailMatch = path.match(/^\/modules\/([^/]+)$/);
  if (moduleDetailMatch) {
    return { name: "moduleDetail", moduleId: moduleDetailMatch[1] };
  }

  const matterArtifactDetailMatch = path.match(
    /^\/matters\/([^/]+)\/artifacts\/([^/]+)$/,
  );
  if (matterArtifactDetailMatch) {
    return {
      name: "matterArtifactDetail",
      slug: matterArtifactDetailMatch[1],
      artifactId: matterArtifactDetailMatch[2],
    };
  }
  const matterArtifactsMatch = path.match(/^\/matters\/([^/]+)\/artifacts$/);
  if (matterArtifactsMatch) {
    return { name: "matterArtifacts", slug: matterArtifactsMatch[1] };
  }
  const matterAuditMatch = path.match(/^\/matters\/([^/]+)\/audit$/);
  if (matterAuditMatch) {
    return { name: "matterAudit", slug: matterAuditMatch[1] };
  }
  const matterDetailMatch = path.match(/^\/matters\/([^/]+)(?:\/(.+))?$/);
  if (matterDetailMatch) {
    return {
      name: "detail",
      slug: matterDetailMatch[1],
      tab: matterDetailMatch[2],
    };
  }

  return { name: "landing" };
}

export function useRoute(): Route {
  return useRouterState({
    select: (s) => routeFromPath(s.location.pathname, s.location.searchStr),
  });
}

/**
 * Programmatic navigation. Accepts the same string-path inputs the old
 * hash-based shim did (`"/matters"`, `"/auth/signin"`, etc.). Callers
 * MAY also pass a `#`-prefixed path — that's silently normalised so
 * any holdover hash literals still navigate correctly.
 */
export function navigate(to: string): void {
  let target = to;
  if (target.startsWith("#")) target = target.slice(1);
  if (!target.startsWith("/")) target = `/${target}`;
  void router.navigate({ to: target });
}

// Public routes — accessible without a session. Routing-level gating is
// now enforced by the __authed layout in src/router/index.tsx; this list
// is retained because TopBar / Drawer consume it for nav-visibility logic.
export const PUBLIC_ROUTE_NAMES = new Set<Route["name"]>([
  "landing",
  "manifesto",
  "waitlist",
  "signin",
  "signup",
  "forgot",
  "reset",
  "verifyPending",
  "verify",
  "modules",
  "submitModule",
  "demo",
  // /app is intentionally public — first-run (user_count=0) and
  // bootstrap-required states must render without a session.
  // AppHome owns its own auth gating once has_superuser=true.
  "appHome",
]);

export const isPublicRoute = (route: Route): boolean =>
  PUBLIC_ROUTE_NAMES.has(route.name);

/**
 * Pre-A0 had `parseHash()` for tests. Phase 14 A0 keeps the same
 * function name so any consumers still see a Route, but it now accepts
 * either `#/foo` or `/foo` and routes through routeFromPath.
 */
export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#/, "");
  const q = raw.indexOf("?");
  const path = q < 0 ? raw : raw.slice(0, q);
  const search = q < 0 ? "" : raw.slice(q);
  return routeFromPath(path || "/", search);
}
