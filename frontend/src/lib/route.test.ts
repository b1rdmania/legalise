/**
 * A0 smoke — Route discriminated union reconstruction from path + search.
 *
 * Pre-A0 had `parseHash(hash)`; A0's compatibility shim renames the
 * canonical entry point to `routeFromPath(pathname, search)` and keeps
 * `parseHash` as a thin wrapper for any holdout caller. Both must
 * stay in sync.
 */

import { describe, expect, it } from "vitest";
import { parseHash, routeFromPath } from "./route";

describe("routeFromPath", () => {
  it("/ → landing", () => {
    expect(routeFromPath("/", "")).toEqual({ name: "landing" });
  });

  it("/architecture → architecture (and /manifesto maps there pre-redirect)", () => {
    expect(routeFromPath("/architecture", "")).toEqual({ name: "architecture" });
    expect(routeFromPath("/manifesto", "")).toEqual({ name: "architecture" });
  });

  it("/about → about", () => {
    expect(routeFromPath("/about", "")).toEqual({ name: "about" });
  });

  it("/auth/signin → signin", () => {
    expect(routeFromPath("/auth/signin", "")).toEqual({ name: "signin" });
  });

  it("/auth/reset?token=foo → reset with token", () => {
    expect(routeFromPath("/auth/reset", "?token=foo")).toEqual({
      name: "reset",
      token: "foo",
    });
  });

  it("/auth/reset (no token) → reset with null", () => {
    expect(routeFromPath("/auth/reset", "")).toEqual({
      name: "reset",
      token: null,
    });
  });

  it("/matters → list", () => {
    expect(routeFromPath("/matters", "")).toEqual({ name: "list" });
  });

  it("/matters/new → new", () => {
    expect(routeFromPath("/matters/new", "")).toEqual({ name: "new" });
  });

  it("/matters/khan → detail", () => {
    expect(routeFromPath("/matters/khan-v-acme-trading-2026", "")).toEqual({
      name: "detail",
      slug: "khan-v-acme-trading-2026",
      tab: undefined,
    });
  });

  it("/matters/khan/documents → detail with tab", () => {
    expect(routeFromPath("/matters/khan/documents", "")).toEqual({
      name: "detail",
      slug: "khan",
      tab: "documents",
    });
  });

  it("/settings → settings/profile (default)", () => {
    expect(routeFromPath("/settings", "")).toEqual({
      name: "settings",
      tab: "profile",
    });
  });

  it("/settings/keys → settings/keys", () => {
    expect(routeFromPath("/settings/keys", "")).toEqual({
      name: "settings",
      tab: "keys",
    });
  });

  it("/app → appHome placeholder", () => {
    expect(routeFromPath("/app", "")).toEqual({ name: "appHome" });
  });

  it("/help → help", () => {
    expect(routeFromPath("/help", "")).toEqual({ name: "help" });
  });

  it("/demo/documents/{id} → public demo document", () => {
    expect(routeFromPath("/demo/documents/doc-1", "")).toEqual({
      name: "demoDocument",
      documentId: "doc-1",
    });
  });

  it("/modules/some-id → moduleDetail", () => {
    expect(routeFromPath("/modules/contract-review", "")).toEqual({
      name: "moduleDetail",
      moduleId: "contract-review",
    });
  });

  it("/modules/install/{id} → moduleInstall", () => {
    expect(routeFromPath("/modules/install/cer-abc-123", "")).toEqual({
      name: "moduleInstall",
      ceremonyId: "cer-abc-123",
    });
  });

  it("/matters/{slug}/audit → matterAudit", () => {
    expect(routeFromPath("/matters/khan/audit", "")).toEqual({
      name: "matterAudit",
      slug: "khan",
    });
  });

  it("/matters/{slug}/artifacts → matterArtifacts", () => {
    expect(routeFromPath("/matters/khan/artifacts", "")).toEqual({
      name: "matterArtifacts",
      slug: "khan",
    });
  });

  it("/matters/{slug}/artifacts/{id} → matterArtifactDetail", () => {
    expect(routeFromPath("/matters/khan/artifacts/art-1", "")).toEqual({
      name: "matterArtifactDetail",
      slug: "khan",
      artifactId: "art-1",
    });
  });

  it("/admin/users → adminUsers", () => {
    expect(routeFromPath("/admin/users", "")).toEqual({ name: "adminUsers" });
  });

  it("/admin/users/{id} → adminUserDetail", () => {
    expect(routeFromPath("/admin/users/u-1", "")).toEqual({
      name: "adminUserDetail",
      userId: "u-1",
    });
  });

  it("unknown path → landing fallback", () => {
    expect(routeFromPath("/this-path-does-not-exist", "")).toEqual({
      name: "landing",
    });
  });

  it("trailing slash is normalised", () => {
    expect(routeFromPath("/matters/", "")).toEqual({ name: "list" });
  });
});

describe("parseHash (compatibility wrapper)", () => {
  it("#/matters → list", () => {
    expect(parseHash("#/matters")).toEqual({ name: "list" });
  });

  it("/matters (no #) → list — accepts path-form too", () => {
    expect(parseHash("/matters")).toEqual({ name: "list" });
  });

  it("#/auth/verify?token=xyz preserves token", () => {
    expect(parseHash("#/auth/verify?token=xyz")).toEqual({
      name: "verify",
      token: "xyz",
    });
  });
});
