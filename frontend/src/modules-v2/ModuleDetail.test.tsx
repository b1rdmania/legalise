/**
 * Phase 14 B — ModuleDetail regression tests.
 *
 * Coverage:
 *   - manifest + capabilities table render
 *   - Install CTA calls startInstall and navigates to the ceremony
 *   - Update + Revoke admin gating (only superuser sees them)
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

import { ModuleDetail } from "./ModuleDetail";
import { AuthProvider } from "../auth/AuthProvider";
import * as api from "../lib/api";

function mountAt(moduleId: string) {
  const root = createRootRoute({ component: () => <Outlet /> });
  const detailRoute = createRoute({
    getParentRoute: () => root,
    path: "/modules/$moduleId",
    component: () => <ModuleDetail moduleId={moduleId} />,
  });
  const ceremonyStub = createRoute({
    getParentRoute: () => root,
    path: "/modules/install/$ceremonyId",
    component: () => <div data-testid="ceremony-stub" />,
  });
  const tree = root.addChildren([detailRoute, ceremonyStub]);
  const router = createRouter({
    routeTree: tree,
    history: createMemoryHistory({
      initialEntries: [`/modules/${moduleId}`],
    }),
  });
  return render(
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>,
  );
}

const MANIFEST = {
  module_id: "contract-review",
  source_kind: "v2",
  manifest: {
    name: "Contract Review",
    version: "0.2.1",
    publisher: "legalise",
    visibility: "first_party",
    description: "Reviews contracts.",
    capabilities: [
      {
        id: "review",
        kind: "skill",
        scope: "matter",
        advice_tier_max: "tier_2",
        external_network: false,
      },
    ],
  },
  is_valid: true,
  validation_errors: [],
};

beforeEach(() => {
  vi.restoreAllMocks();
});
afterEach(() => {
  cleanup();
});

describe("ModuleDetail", () => {
  it("renders the manifest header + capabilities table", async () => {
    vi.spyOn(api, "getModuleV2").mockResolvedValue(MANIFEST);
    vi.spyOn(api, "getCurrentUser").mockResolvedValue(null);
    mountAt("contract-review");
    await waitFor(() => {
      expect(screen.getByText("Contract Review")).toBeInTheDocument();
    });
    expect(screen.getByText("v0.2.1")).toBeInTheDocument();
    expect(screen.getByText("by legalise")).toBeInTheDocument();
    expect(screen.getByText("first_party")).toBeInTheDocument();
    // Capabilities table row.
    expect(screen.getByText("review")).toBeInTheDocument();
    expect(screen.getByText("matter")).toBeInTheDocument();
    expect(screen.getByText("tier_2")).toBeInTheDocument();
  });

  it("Install CTA starts a ceremony and navigates to the stepper", async () => {
    vi.spyOn(api, "getModuleV2").mockResolvedValue(MANIFEST);
    vi.spyOn(api, "getCurrentUser").mockResolvedValue(null);
    const start = vi.spyOn(api, "startInstall").mockResolvedValue({
      ceremony_id: "cer-abc",
      module_id: "contract-review",
      state: "discovered",
      fast_path: false,
      is_terminal: false,
      permission_card: { module_id: "contract-review" },
      history: [],
    });

    mountAt("contract-review");
    await waitFor(() => {
      expect(screen.getByText("Install")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Install"));

    await waitFor(() => {
      expect(start).toHaveBeenCalledWith({
        source: "registry",
        module_id: "contract-review",
      });
    });
    await waitFor(() => {
      expect(screen.getByTestId("ceremony-stub")).toBeInTheDocument();
    });
  });

  it("hides Update + Revoke for non-admins", async () => {
    vi.spyOn(api, "getModuleV2").mockResolvedValue(MANIFEST);
    vi.spyOn(api, "getCurrentUser").mockResolvedValue({
      id: "u-1",
      email: "andy@example.com",
      role: "solicitor",
      is_superuser: false,
    } as never);
    mountAt("contract-review");
    await waitFor(() => {
      expect(screen.getByText("Install")).toBeInTheDocument();
    });
    expect(screen.queryByText("Update")).toBeNull();
    expect(screen.queryByText("Revoke")).toBeNull();
    // The non-admin explainer is present.
    expect(screen.getByText(/admin-only/i)).toBeInTheDocument();
  });

  it("shows Update + Revoke for superusers", async () => {
    vi.spyOn(api, "getModuleV2").mockResolvedValue(MANIFEST);
    vi.spyOn(api, "getCurrentUser").mockResolvedValue({
      id: "u-1",
      email: "andy@example.com",
      role: "qualified_solicitor",
      is_superuser: true,
    } as never);
    mountAt("contract-review");
    await waitFor(() => {
      expect(screen.getByText("Install")).toBeInTheDocument();
    });
    expect(screen.getByText("Update")).toBeInTheDocument();
    expect(screen.getByText("Revoke")).toBeInTheDocument();
  });
});
