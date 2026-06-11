/**
 * Phase 14 B — ModuleDetail regression tests.
 *
 * Coverage:
 *   - manifest + capabilities table render
 *   - Add CTA calls startInstall and navigates to the ceremony
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
    path: "/skills/$moduleId",
    component: () => <ModuleDetail moduleId={moduleId} />,
  });
  const ceremonyStub = createRoute({
    getParentRoute: () => root,
    path: "/skills/install/$ceremonyId",
    component: () => <div data-testid="ceremony-stub" />,
  });
  const tree = root.addChildren([detailRoute, ceremonyStub]);
  const router = createRouter({
    routeTree: tree,
    history: createMemoryHistory({
      initialEntries: [`/skills/${moduleId}`],
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
  // Phase 18-B — ModuleDetail now derives an add-status badge from
  // listInstalledModules. Default to "not added"; tests that assert
  // the added/disabled badge override this.
  vi.spyOn(api, "listInstalledModules").mockResolvedValue([]);
});
afterEach(() => {
  cleanup();
});

function installedRow(over: Partial<api.InstalledModule> = {}): api.InstalledModule {
  return {
    module_id: "contract-review",
    version: "0.2.1",
    publisher: "legalise",
    visibility: "first_party",
    signature_status: "structure_verified",
    enabled: true,
    installed_at: "2026-01-01T00:00:00",
    installed_by_user_id: null,
    ...over,
  };
}

describe("ModuleDetail", () => {
  it("renders the manifest header + capability permission summary", async () => {
    vi.spyOn(api, "getModuleV2").mockResolvedValue(MANIFEST);
    vi.spyOn(api, "getCurrentUser").mockResolvedValue({
      id: "u-1",
      email: "admin@example.com",
      role: "qualified_solicitor",
      is_superuser: true,
    } as never);
    mountAt("contract-review");
    await waitFor(() => {
      expect(screen.getByText("Contract Review")).toBeInTheDocument();
    });
    expect(screen.getByText("v0.2.1")).toBeInTheDocument();
    expect(screen.getByText("by legalise")).toBeInTheDocument();
    expect(screen.getByText("first_party")).toBeInTheDocument();
    // Capability permission card — raw identifiers stay visible.
    expect(screen.getByText("review")).toBeInTheDocument();
    expect(screen.getByText("matter")).toBeInTheDocument();
    expect(screen.getByText("tier_2")).toBeInTheDocument();
    // Human framing replaces the raw manifest table headers.
    expect(
      screen.getByText(/what this skill needs access to/i),
    ).toBeInTheDocument();
  });

  it("shows an Added badge when the module is added + enabled", async () => {
    vi.spyOn(api, "getModuleV2").mockResolvedValue(MANIFEST);
    vi.spyOn(api, "getCurrentUser").mockResolvedValue({
      id: "u-1",
      email: "admin@example.com",
      role: "qualified_solicitor",
      is_superuser: true,
    } as never);
    vi.spyOn(api, "listInstalledModules").mockResolvedValue([installedRow()]);
    mountAt("contract-review");
    await waitFor(() => {
      expect(screen.getByText("Added")).toBeInTheDocument();
    });
  });

  it("shows Added · disabled when the added row is disabled", async () => {
    vi.spyOn(api, "getModuleV2").mockResolvedValue(MANIFEST);
    vi.spyOn(api, "getCurrentUser").mockResolvedValue({
      id: "u-1",
      email: "admin@example.com",
      role: "qualified_solicitor",
      is_superuser: true,
    } as never);
    vi.spyOn(api, "listInstalledModules").mockResolvedValue([
      installedRow({ enabled: false }),
    ]);
    mountAt("contract-review");
    await waitFor(() => {
      expect(screen.getByText(/added · disabled/i)).toBeInTheDocument();
    });
  });

  it("shows Not added when no added row matches", async () => {
    vi.spyOn(api, "getModuleV2").mockResolvedValue(MANIFEST);
    vi.spyOn(api, "getCurrentUser").mockResolvedValue({
      id: "u-1",
      email: "admin@example.com",
      role: "qualified_solicitor",
      is_superuser: true,
    } as never);
    // default beforeEach mock -> empty installed list.
    mountAt("contract-review");
    await waitFor(() => {
      expect(screen.getByText("Not added")).toBeInTheDocument();
    });
  });

  it("admin: Add CTA starts a ceremony and navigates to the stepper", async () => {
    vi.spyOn(api, "getModuleV2").mockResolvedValue(MANIFEST);
    vi.spyOn(api, "getCurrentUser").mockResolvedValue({
      id: "u-1",
      email: "admin@example.com",
      role: "qualified_solicitor",
      is_superuser: true,
    } as never);
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
      expect(screen.getByText("Add skill")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Add skill"));

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

  it("non-admin: Add button is hidden and startInstall cannot be triggered", async () => {
    vi.spyOn(api, "getModuleV2").mockResolvedValue(MANIFEST);
    vi.spyOn(api, "getCurrentUser").mockResolvedValue({
      id: "u-1",
      email: "andy@example.com",
      role: "solicitor",
      is_superuser: false,
    } as never);
    const start = vi.spyOn(api, "startInstall");

    mountAt("contract-review");
    // Manifest header must still render — non-admins can read the
    // catalog detail, they just can't add skills.
    await waitFor(() => {
      expect(screen.getByText("Contract Review")).toBeInTheDocument();
    });
    // None of the admin-only CTAs are present.
    expect(screen.queryByText("Add skill")).toBeNull();
    expect(screen.queryByText("Update")).toBeNull();
    expect(screen.queryByText("Revoke")).toBeNull();
    // The substrate-truth explainer IS present, with an actionable
    // request path instead of a dead end.
    expect(screen.getByText(/administrator action/i)).toBeInTheDocument();
    expect(screen.getByTestId("request-skill")).toBeInTheDocument();
    // And the network is never poked — no smuggled authority.
    expect(start).not.toHaveBeenCalled();
  });

  it("non-admin: Request this skill posts the request and flips to a quiet confirmation", async () => {
    vi.spyOn(api, "getModuleV2").mockResolvedValue(MANIFEST);
    vi.spyOn(api, "getCurrentUser").mockResolvedValue({
      id: "u-1",
      email: "andy@example.com",
      role: "solicitor",
      is_superuser: false,
    } as never);
    const request = vi
      .spyOn(api, "requestModule")
      .mockResolvedValue({ ok: true });

    mountAt("contract-review");
    await waitFor(() => {
      expect(screen.getByTestId("request-skill")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("request-skill"));

    await waitFor(() => {
      expect(request).toHaveBeenCalledWith("contract-review", "registry");
    });
    await waitFor(() => {
      expect(
        screen.getByTestId("request-skill-confirmation"),
      ).toHaveTextContent(/requested — your administrator will see it/i);
    });
    // Button is gone — one request per visit, no spam affordance.
    expect(screen.queryByTestId("request-skill")).toBeNull();
  });

  it("admin: shows Add + Update + Revoke", async () => {
    vi.spyOn(api, "getModuleV2").mockResolvedValue(MANIFEST);
    vi.spyOn(api, "getCurrentUser").mockResolvedValue({
      id: "u-1",
      email: "andy@example.com",
      role: "qualified_solicitor",
      is_superuser: true,
    } as never);
    mountAt("contract-review");
    await waitFor(() => {
      expect(screen.getByText("Add skill")).toBeInTheDocument();
    });
    expect(screen.getByText("Update")).toBeInTheDocument();
    expect(screen.getByText("Revoke")).toBeInTheDocument();
  });
});
