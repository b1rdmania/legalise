// Minimal hash-based routing. TanStack Router lands when there are enough
// routes to justify the file-based routing setup (week 1, day 6+).
//
// Routes:
//   #/                          → landing
//   #/modules                   → installed skill catalogue
//   #/matters                   → matters list
//   #/matters/new               → new matter form
//   #/matters/{slug}            → matter detail
//   #/matters/{slug}/documents  → matter detail · documents tab

import { useEffect, useState } from "react";

export type Route =
  | { name: "landing" }
  | { name: "modules" }
  | { name: "list" }
  | { name: "new" }
  | { name: "detail"; slug: string; tab?: string };

export function parseHash(hash: string): Route {
  const h = hash.replace(/^#/, "").replace(/^\//, "");
  if (h === "") return { name: "landing" };
  if (h === "modules") return { name: "modules" };
  if (h === "matters") return { name: "list" };
  if (h === "matters/new") return { name: "new" };
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
