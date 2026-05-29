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
  // ArtifactsList now fetches sign-off status to render Draft/Signed.
  vi.spyOn(api, "listSignoffs").mockResolvedValue({ matter_id: "m-1", signoffs: [] });
});
afterEach(() => {
  cleanup();
});

describe("ArtifactsList", () => {
  it("renders rows with output / producer / Open link", async () => {
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
      expect(screen.getByText("Draft motion")).toBeInTheDocument();
    });
    expect(screen.getByText("motion_draft")).toBeInTheDocument();
    expect(screen.getByText("pre-motion")).toBeInTheDocument();
    expect(screen.getByText("generate")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /open/i });
    expect(link.getAttribute("href")).toBe("/matters/khan/artifacts/art-1");
  });

  it("labels artifacts Draft vs Signed from current sign-offs", async () => {
    vi.spyOn(api, "listArtifacts").mockResolvedValue([
      {
        id: "art-signed",
        matter_id: "m-1",
        module_id: "demo.guided-skill",
        capability_id: "summarise",
        invocation_id: "inv-1",
        kind: "skill_response",
        created_by_id: "u-1",
        created_at: "2026-05-29T12:00:00",
        size_bytes: 100,
      },
      {
        id: "art-draft",
        matter_id: "m-1",
        module_id: "demo.guided-skill",
        capability_id: "summarise",
        invocation_id: "inv-2",
        kind: "skill_response",
        created_by_id: "u-1",
        created_at: "2026-05-29T12:01:00",
        size_bytes: 100,
      },
    ]);
    vi.spyOn(api, "listSignoffs").mockResolvedValue({
      matter_id: "m-1",
      signoffs: [
        {
          id: "so-1",
          matter_id: "m-1",
          artifact_id: "art-signed",
          invocation_id: "inv-1",
          module_id: "demo.guided-skill",
          capability_id: "summarise",
          kind: "skill_response",
          artifact_hash: "a".repeat(64),
          decision: "signed",
          reasoning: null,
          signer_id: "u-1",
          signer_email: "s@example.com",
          signed_at: "2026-05-29T13:00:00",
          is_current: true,
        },
      ],
    });
    mountAt();
    await waitFor(() => expect(screen.getByTestId("signoff-badge-art-signed")).toBeInTheDocument());
    expect(screen.getByTestId("signoff-badge-art-signed")).toHaveTextContent(/signed/i);
    expect(screen.getByTestId("signoff-badge-art-draft")).toHaveTextContent(/draft/i);
  });

  it("renders empty state when no artifacts exist", async () => {
    vi.spyOn(api, "listArtifacts").mockResolvedValue([]);
    mountAt();
    await waitFor(() => {
      expect(screen.getByText(/No outputs yet/i)).toBeInTheDocument();
    });
  });

  it("renders error inline when fetch fails", async () => {
    vi.spyOn(api, "listArtifacts").mockRejectedValue(new Error("boom"));
    mountAt();
    await waitFor(() => {
      expect(screen.getByText(/Could not load outputs/i)).toBeInTheDocument();
    });
  });
});
