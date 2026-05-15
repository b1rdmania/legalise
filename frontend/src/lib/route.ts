// Minimal hash-based routing. TanStack Router lands when there are enough
// routes to justify the file-based routing setup (week 1, day 6+).
//
// Routes:
//   #/                          → landing
//   #/auth/signin               → signin
//   #/auth/signup               → signup
//   #/auth/forgot               → forgot-password
//   #/auth/reset?token=...      → reset-password
//   #/auth/verify-pending       → email verify pending
//   #/auth/verify?token=...     → email verify complete
//   #/modules                   → installed skill catalogue
//   #/matters                   → matters list
//   #/matters/new               → new matter form
//   #/matters/{slug}            → matter detail
//   #/matters/{slug}/documents  → matter detail · documents tab
//   #/settings/profile          → settings · profile
//   #/settings/keys             → settings · API keys
//   #/settings/preferences      → settings · preferences

import { useEffect, useState } from "react";

export type Route =
  | { name: "landing" }
  | { name: "signin" }
  | { name: "signup" }
  | { name: "forgot" }
  | { name: "reset"; token: string | null }
  | { name: "verifyPending" }
  | { name: "verify"; token: string | null }
  | { name: "modules" }
  | { name: "list" }
  | { name: "new" }
  | { name: "detail"; slug: string; tab?: string }
  | { name: "settings"; tab: "profile" | "keys" | "preferences" };

function parseQuery(s: string): URLSearchParams {
  const q = s.indexOf("?");
  if (q < 0) return new URLSearchParams();
  return new URLSearchParams(s.slice(q + 1));
}

function stripQuery(s: string): string {
  const q = s.indexOf("?");
  return q < 0 ? s : s.slice(0, q);
}

export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#/, "").replace(/^\//, "");
  const query = parseQuery(raw);
  const h = stripQuery(raw);

  if (h === "") return { name: "landing" };
  if (h === "auth/signin") return { name: "signin" };
  if (h === "auth/signup") return { name: "signup" };
  if (h === "auth/forgot") return { name: "forgot" };
  if (h === "auth/reset") return { name: "reset", token: query.get("token") };
  if (h === "auth/verify-pending") return { name: "verifyPending" };
  if (h === "auth/verify") return { name: "verify", token: query.get("token") };
  if (h === "modules") return { name: "modules" };
  if (h === "matters") return { name: "list" };
  if (h === "matters/new") return { name: "new" };
  if (h === "settings" || h === "settings/profile") return { name: "settings", tab: "profile" };
  if (h === "settings/keys") return { name: "settings", tab: "keys" };
  if (h === "settings/preferences") return { name: "settings", tab: "preferences" };
  const m = h.match(/^matters\/([^/]+)(?:\/(.+))?$/);
  if (m) return { name: "detail", slug: m[1], tab: m[2] };
  return { name: "landing" };
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}

export const navigate = (to: string) => {
  window.location.hash = to.startsWith("#") ? to : `#${to.startsWith("/") ? to : `/${to}`}`;
};

// Public routes — accessible without a session. Authenticated routes
// (matters, settings, detail) trigger a redirect to /auth/signin when
// the session is absent (see useAuth in App.tsx).
export const PUBLIC_ROUTE_NAMES = new Set<Route["name"]>([
  "landing",
  "signin",
  "signup",
  "forgot",
  "reset",
  "verifyPending",
  "verify",
  "modules", // catalogue is public per HANDOVER_AUTH §7 allowlist
]);

export const isPublicRoute = (route: Route): boolean =>
  PUBLIC_ROUTE_NAMES.has(route.name);
