/**
 * One-release compatibility shim for the pre-A0 hash-based URL scheme.
 *
 * Inbound URLs like `legalise.dev/#/matters/khan-v-acme-trading-2026`
 * (the shape every shipped marketing post / email link used) are
 * rewritten in-place via `history.replaceState` before TanStack Router
 * mounts. The user sees the canonical path-based URL in the address bar
 * and the router sees a normal path.
 *
 * Must run BEFORE `ReactDOM.createRoot(...).render(...)` so the router
 * never sees the hash form.
 *
 * Delete this shim one release after we're confident no inbound link
 * still uses `#/`. Until then it's load-bearing.
 */

export function redirectLegacyHash(): void {
  if (typeof window === "undefined") return;
  const hash = window.location.hash;
  if (!hash || !hash.startsWith("#/")) return;

  const target = hash.slice(1); // "#/foo" -> "/foo"
  window.history.replaceState(null, "", target || "/");
}
