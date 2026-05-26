/**
 * Phase 14 D — ArtifactDetail regressions.
 *
 * Pins the substrate-aligned deep-link to the Phase 14 E
 * reconstruction view: ?invocation_id=… is the query-param contract
 * that survives into E.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";

import { ArtifactDetail } from "./ArtifactDetail";
import * as api from "../lib/api";

function mountAt() {
  const root = createRootRoute({ component: () => <Outlet /> });
  const detailRoute = createRoute({
    getParentRoute: () => root,
    path: "/matters/$slug/artifacts/$artifactId",
    component: () => <ArtifactDetail slug="khan" artifactId="art-1" />,
  });
  const listStub = createRoute({
    getParentRoute: () => root,
    path: "/matters/$slug/artifacts",
    component: () => <div data-testid="list-stub" />,
  });
  const tree = root.addChildren([detailRoute, listStub]);
  const router = createRouter({
    routeTree: tree,
    history: createMemoryHistory({
      initialEntries: ["/matters/khan/artifacts/art-1"],
    }),
  });
  return render(<RouterProvider router={router} />);
}

beforeEach(() => {
  vi.restoreAllMocks();
});
afterEach(() => {
  cleanup();
});

describe("ArtifactDetail", () => {
  it("renders metadata + kind-aware preview for motion_draft", async () => {
    vi.spyOn(api, "readArtifact").mockResolvedValue({
      id: "art-1",
      matter_id: "m-1",
      module_id: "pre-motion",
      capability_id: "generate",
      invocation_id: "inv-7777",
      kind: "motion_draft",
      created_by_id: "u-1",
      created_at: "2026-05-26T12:00:00",
      size_bytes: 4321,
      payload: {
        markdown: "# Pre-motion brief\nClaim outline.",
        claim_summary: "Khan v Acme — unfair dismissal",
        claim_type: "unfair_dismissal",
      },
    });

    mountAt();
    await waitFor(() => {
      expect(screen.getByText("motion_draft")).toBeInTheDocument();
    });
    expect(screen.getByTestId("motion-draft-view")).toBeInTheDocument();
    // Audit deep-link carries invocation_id.
    const link = screen.getByRole("link", { name: /see audit trail/i });
    expect(link.getAttribute("href")).toBe(
      "/matters/khan/audit?invocation_id=inv-7777",
    );
  });

  it("falls back to JSON for an unknown kind", async () => {
    vi.spyOn(api, "readArtifact").mockResolvedValue({
      id: "art-1",
      matter_id: "m-1",
      module_id: "exp",
      capability_id: "exp",
      invocation_id: "inv-1",
      kind: "experimental_kind",
      created_by_id: "u-1",
      created_at: "2026-05-26T12:00:00",
      size_bytes: 10,
      payload: { wat: 42 },
    });

    mountAt();
    await waitFor(() => {
      expect(screen.getByText("experimental_kind")).toBeInTheDocument();
    });
    expect(screen.getByTestId("json-fallback")).toBeInTheDocument();
  });

  it("renders error state when artifact fetch fails", async () => {
    vi.spyOn(api, "readArtifact").mockRejectedValue(new Error("404 not found"));
    mountAt();
    await waitFor(() => {
      expect(screen.getByText(/Artifact not found/i)).toBeInTheDocument();
    });
  });
});
