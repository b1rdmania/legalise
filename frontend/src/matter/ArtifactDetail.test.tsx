/**
 * Phase 14 D — ArtifactDetail regressions.
 *
 * Pins the substrate-aligned deep-link to the Phase 14 E
 * reconstruction view: ?invocation_id=… is the query-param contract
 * that survives into E.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  // ArtifactDetail now loads sign-off status on mount; default to none.
  vi.spyOn(api, "listSignoffs").mockResolvedValue({ matter_id: "m-1", signoffs: [] });
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
      expect(screen.getByText("Draft motion")).toBeInTheDocument();
    });
    expect(screen.getByTestId("motion-draft-view")).toBeInTheDocument();
    // Audit deep-link carries invocation_id.
    const link = screen.getByRole("link", { name: /see activity/i });
    expect(link.getAttribute("href")).toBe(
      "/matters/khan/audit?invocation_id=inv-7777",
    );
  });

  it("shows Draft + a Review & sign CTA when the artifact is unsigned", async () => {
    vi.spyOn(api, "readArtifact").mockResolvedValue({
      id: "art-1",
      matter_id: "m-1",
      module_id: "demo.guided-skill",
      capability_id: "summarise",
      invocation_id: "inv-1",
      kind: "skill_response",
      created_by_id: "u-1",
      created_at: "2026-05-29T12:00:00",
      size_bytes: 100,
      payload: { output: "Summary.", model_id: "stub-echo" },
    });
    mountAt();
    await waitFor(() => expect(screen.getByTestId("signoff-status")).toBeInTheDocument());
    expect(screen.getByText(/not yet signed/i)).toBeInTheDocument();
    expect(screen.getByTestId("signoff-cta")).toHaveTextContent(/review & sign/i);
  });

  it("shows a signed status when the artifact has a current sign-off", async () => {
    vi.spyOn(api, "readArtifact").mockResolvedValue({
      id: "art-1",
      matter_id: "m-1",
      module_id: "demo.guided-skill",
      capability_id: "summarise",
      invocation_id: "inv-1",
      kind: "skill_response",
      created_by_id: "u-1",
      created_at: "2026-05-29T12:00:00",
      size_bytes: 100,
      payload: { output: "Summary.", model_id: "stub-echo" },
    });
    vi.spyOn(api, "listSignoffs").mockResolvedValue({
      matter_id: "m-1",
      signoffs: [
        {
          id: "so-1",
          matter_id: "m-1",
          artifact_id: "art-1",
          invocation_id: "inv-1",
          module_id: "demo.guided-skill",
          capability_id: "summarise",
          kind: "skill_response",
          artifact_hash: "a".repeat(64),
          decision: "signed",
          reasoning: null,
          signer_id: "u-1",
          signer_email: "solicitor@example.com",
          signed_at: "2026-05-29T13:00:00",
          is_current: true,
        },
      ],
    });
    mountAt();
    await waitFor(() => expect(screen.getByTestId("signoff-signed")).toBeInTheDocument());
    expect(screen.getByText(/solicitor@example.com/)).toBeInTheDocument();
  });

  it("offers Request review for a skill_response artifact (review-eligible)", async () => {
    vi.spyOn(api, "readArtifact").mockResolvedValue({
      id: "art-1",
      matter_id: "m-1",
      module_id: "lawve.contract-review",
      capability_id: "run",
      invocation_id: "inv-9",
      kind: "skill_response",
      created_by_id: "u-1",
      created_at: "2026-05-29T12:00:00",
      size_bytes: 200,
      payload: { output: "Summary.", model_id: "claude-opus-4-7", input: "Summarise." },
    });

    mountAt();
    await waitFor(() => {
      expect(screen.getByTestId("skill-response-view")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText(/Optional separate review/i));
    expect(
      screen.getByRole("button", { name: /request review/i }),
    ).toBeInTheDocument();
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
      expect(screen.getByText("experimental kind")).toBeInTheDocument();
    });
    expect(screen.getByTestId("json-fallback")).toBeInTheDocument();
  });

  it("renders error state when artifact fetch fails", async () => {
    vi.spyOn(api, "readArtifact").mockRejectedValue(new Error("404 not found"));
    mountAt();
    await waitFor(() => {
      expect(screen.getByText(/Output not found/i)).toBeInTheDocument();
    });
  });
});
