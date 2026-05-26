/**
 * A0 smoke — hash → path redirect shim.
 *
 * Verifies pre-A0 inbound URLs (#/foo) get rewritten to canonical
 * path-based URLs before the router ever sees them.
 */

import { afterEach, describe, expect, it } from "vitest";
import { redirectLegacyHash } from "./legacyHashRedirect";

function setLocation(pathname: string, hash: string): void {
  window.history.replaceState(null, "", `${pathname}${hash}`);
}

afterEach(() => {
  // Reset to a clean slate between tests so window.location.hash is
  // empty and pathname is "/".
  window.history.replaceState(null, "", "/");
});

describe("redirectLegacyHash", () => {
  it("rewrites #/matters/khan to /matters/khan", () => {
    setLocation("/", "#/matters/khan-v-acme-trading-2026");
    redirectLegacyHash();
    expect(window.location.pathname).toBe("/matters/khan-v-acme-trading-2026");
    expect(window.location.hash).toBe("");
  });

  it("rewrites #/auth/reset?token=foo to /auth/reset?token=foo", () => {
    setLocation("/", "#/auth/reset?token=abc123");
    redirectLegacyHash();
    expect(window.location.pathname).toBe("/auth/reset");
    expect(window.location.search).toBe("?token=abc123");
  });

  it("rewrites #/ to /", () => {
    setLocation("/landing-page-noise", "#/");
    redirectLegacyHash();
    expect(window.location.pathname).toBe("/");
  });

  it("no-ops when there is no hash", () => {
    setLocation("/matters", "");
    redirectLegacyHash();
    expect(window.location.pathname).toBe("/matters");
    expect(window.location.hash).toBe("");
  });

  it("no-ops on non-route hash (e.g. plain anchor)", () => {
    setLocation("/", "#top");
    redirectLegacyHash();
    expect(window.location.pathname).toBe("/");
    expect(window.location.hash).toBe("#top");
  });
});
