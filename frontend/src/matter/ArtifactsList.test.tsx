/**
 * Phase 14 D — ArtifactsList regressions.
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

import { ArtifactsList } from "./ArtifactsList";
import * as api from "../lib/api";

function mountAt() {
  const root = createRootRoute({ component: () => <Outlet /> });
  const listRoute = createRoute({
    getParentRoute: () => root,
    path: "/matters/$slug/artifacts",
    component: () => <ArtifactsList slug="khan" />,
  });
  const detailStub = createRoute({
    getParentRoute: () => root,
    path: "/matters/$slug/artifacts/$artifactId",
    component: () => <div data-testid="artifact-detail-stub" />,
  });
  const tree = root.addChildren([listRoute, detailStub]);
  const router = createRouter({
    routeTree: tree,
    history: createMemoryHistory({ initialEntries: ["/matters/khan/artifacts"] }),
  });
  return render(<RouterProvider router={router} />);
}

beforeEach(() => {
  vi.restoreAllMocks();
});
afterEach(() => {
  cleanup();
});

describe("ArtifactsList", () => {
  it("renders rows with kind / module / capability / Open link", async () => {
    vi.spyOn(api, "listArtifacts").mockResolvedValue([
      {
        id: "art-1",
        matter_id: "m-1",
        module_id: "pre-motion",
        capability_id: "generate",
        invocation_id: "inv-1234abcd",
        kind: "motion_draft",
        created_by_id: "u-1",
        created_at: "2026-05-26T12:00:00",
        size_bytes: 4321,
      },
    ]);

    mountAt();
    await waitFor(() => {
      expect(screen.getByText("motion_draft")).toBeInTheDocument();
    });
    expect(screen.getByText("pre-motion")).toBeInTheDocument();
    expect(screen.getByText("generate")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /open/i });
    expect(link.getAttribute("href")).toBe("/matters/khan/artifacts/art-1");
  });

  it("renders empty state when no artifacts exist", async () => {
    vi.spyOn(api, "listArtifacts").mockResolvedValue([]);
    mountAt();
    await waitFor(() => {
      expect(screen.getByText(/No artifacts yet/i)).toBeInTheDocument();
    });
  });

  it("renders error inline when fetch fails", async () => {
    vi.spyOn(api, "listArtifacts").mockRejectedValue(new Error("boom"));
    mountAt();
    await waitFor(() => {
      expect(screen.getByText(/Could not load artifacts/i)).toBeInTheDocument();
    });
  });
});
