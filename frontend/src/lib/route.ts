/**
 * Route compatibility shim.
 *
 * The real router is TanStack Router (path-based, see
 * `src/router/index.tsx`). This file provides a *compatibility surface*
 * so existing components that use `useRoute()` / `navigate()` keep
 * working unchanged: the Route discriminated union is reconstructed from
 * the TanStack location on every render.
 *
 * New components should prefer TanStack's own hooks (`useRouterState`,
 * route-level `useParams`, `<Link>`) — this shim is a bridge for the
 * older hash-router call sites.
 */

import { useMemo } from "react";
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
  | { name: "createModule" }
  | { name: "lawveImport" }
  | { name: "demoLoop" }
  | { name: "demo"; tab?: string }
  | { name: "demoDocument"; documentId: string }
  | { name: "list" }
  | { name: "new" }
  | { name: "detail"; slug: string; tab?: string }
  | { name: "settings"; tab: "profile" | "keys" | "preferences" }
  // Product routes beyond the original matter list/detail shell. Kept
  // in this compatibility union so legacy consumers can keep matching
  // route.name while TanStack Router owns the actual route tree.
  | { name: "appHome" }
  | { name: "help" }
  | { name: "moduleDetail"; moduleId: string }
  | { name: "moduleInstall"; ceremonyId: string }
  | { name: "register" }
  | { name: "matterAudit"; slug: string }
  | { name: "matterArtifacts"; slug: string }
  | { name: "matterArtifactDetail"; slug: string; artifactId: string }
  | { name: "matterArtifactSign"; slug: string; artifactId: string }
  | { name: "matterSignoff"; slug: string; signoffId: string }
  | { name: "matterDocumentDetail"; slug: string; documentId: string }
  | { name: "matterLifecycle"; slug: string }
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

  // Canonical paths are /skills/*. The legacy /modules/* paths
  // resolve to the same route names via router-level redirect shims
  // so active-state logic keeps working for old deep links and
  // bookmarks.
  if (path === "/skills" || path === "/modules") return { name: "modules" };
  if (path === "/skills/create" || path === "/modules/create") return { name: "createModule" };
  if (path === "/skills/lawve" || path === "/modules/lawve") return { name: "lawveImport" };

  if (path === "/demo-loop") return { name: "demoLoop" };
  if (path === "/demo") return { name: "demo" };
  const demoDocumentMatch = path.match(/^\/demo\/documents\/([^/]+)$/);
  if (demoDocumentMatch) {
    return { name: "demoDocument", documentId: demoDocumentMatch[1] };
  }
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
  if (path === "/help") return { name: "help" };
  if (path === "/admin/users") return { name: "adminUsers" };
  const adminUserMatch = path.match(/^\/admin\/users\/([^/]+)$/);
  if (adminUserMatch) return { name: "adminUserDetail", userId: adminUserMatch[1] };

  const moduleInstallMatch = path.match(/^\/(?:skills|modules)\/install\/([^/]+)$/);
  if (moduleInstallMatch) {
    return { name: "moduleInstall", ceremonyId: moduleInstallMatch[1] };
  }
  if (path === "/register") return { name: "register" };
  const moduleDetailMatch = path.match(/^\/(?:skills|modules)\/([^/]+)$/);
  if (moduleDetailMatch) {
    return { name: "moduleDetail", moduleId: moduleDetailMatch[1] };
  }

  const matterArtifactSignMatch = path.match(
    /^\/matters\/([^/]+)\/artifacts\/([^/]+)\/sign$/,
  );
  if (matterArtifactSignMatch) {
    return {
      name: "matterArtifactSign",
      slug: matterArtifactSignMatch[1],
      artifactId: matterArtifactSignMatch[2],
    };
  }
  const matterSignoffMatch = path.match(/^\/matters\/([^/]+)\/signoffs\/([^/]+)$/);
  if (matterSignoffMatch) {
    return {
      name: "matterSignoff",
      slug: matterSignoffMatch[1],
      signoffId: matterSignoffMatch[2],
    };
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
  const matterLifecycleMatch = path.match(/^\/matters\/([^/]+)\/lifecycle$/);
  if (matterLifecycleMatch) {
    return { name: "matterLifecycle", slug: matterLifecycleMatch[1] };
  }
  const matterDocumentDetailMatch = path.match(
    /^\/matters\/([^/]+)\/documents\/([^/]+)$/,
  );
  if (matterDocumentDetailMatch) {
    return {
      name: "matterDocumentDetail",
      slug: matterDocumentDetailMatch[1],
      documentId: matterDocumentDetailMatch[2],
    };
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
  // Select PRIMITIVES, derive the Route in a memo. Selecting the derived
  // object directly meant a fresh identity on every router-state tick
  // (loading flags, etc.) — every useRoute consumer re-rendered, and
  // effects keyed on [route] re-fired into a nested-update cascade
  // ("Maximum update depth exceeded" on the matter chat page; caught by
  // the WebKit console audit, present in every engine).
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const searchStr = useRouterState({ select: (s) => s.location.searchStr });
  return useMemo(() => routeFromPath(pathname, searchStr), [pathname, searchStr]);
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
  "demo",
  "demoDocument",
  // /app is intentionally public — first-run (user_count=0) and
  // bootstrap-required states must render without a session.
  // AppHome owns its own auth gating once has_superuser=true.
  "appHome",
]);

export const isPublicRoute = (route: Route): boolean =>
  PUBLIC_ROUTE_NAMES.has(route.name);

/**
 * Compatibility helper for older tests that called `parseHash`. Accepts
 * either `#/foo` or `/foo` and routes through `routeFromPath`.
 */
export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#/, "");
  const q = raw.indexOf("?");
  const path = q < 0 ? raw : raw.slice(0, q);
  const search = q < 0 ? "" : raw.slice(q);
  return routeFromPath(path || "/", search);
}
