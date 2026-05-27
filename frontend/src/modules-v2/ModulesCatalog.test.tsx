/**
 * Phase 14 B — ModulesCatalog regression tests.
 *
 * Asserts the catalog renders discovered modules + links to detail.
 * Reviewer-narrow: no installed-vs-available badge expectation (that's
 * blocked by BACKEND_GAP_AUDIT finding 14-B-#1 until the substrate
 * exposes installed state).
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

import { ModulesCatalog } from "./ModulesCatalog";
import * as api from "../lib/api";

function mountAt(path: string) {
  const root = createRootRoute({ component: () => <Outlet /> });
  const modulesRoute = createRoute({
    getParentRoute: () => root,
    path: "/modules",
    component: ModulesCatalog,
  });
  const moduleDetailRoute = createRoute({
    getParentRoute: () => root,
    path: "/modules/$moduleId",
    component: () => <div data-testid="detail-stub" />,
  });
  const tree = root.addChildren([modulesRoute, moduleDetailRoute]);
  const router = createRouter({
    routeTree: tree,
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  return render(<RouterProvider router={router} />);
}

beforeEach(() => {
  vi.restoreAllMocks();
  // Phase 14.5 B — every catalog mount fetches installed-modules.
  // Default-mock to empty; badge tests override.
  vi.spyOn(api, "listInstalledModules").mockResolvedValue([]);
});
afterEach(() => {
  cleanup();
});

describe("ModulesCatalog", () => {
  it("renders discovered modules with their headline fields", async () => {
    vi.spyOn(api, "getModulesV2").mockResolvedValue({
      modules: [
        {
          module_id: "contract-review",
          source_kind: "v2",
          manifest: {
            name: "Contract Review",
            version: "0.2.1",
            publisher: "legalise",
            visibility: "first_party",
            description: "Reviews uploaded contracts for risk + flags.",
            capabilities: [{ id: "cap-1" }, { id: "cap-2" }],
          },
          is_valid: true,
          validation_errors: [],
        },
      ],
      ui_slots: [],
    });

    mountAt("/modules");
    await waitFor(() => {
      expect(screen.getByText("Contract Review")).toBeInTheDocument();
    });
    expect(screen.getByText("contract-review")).toBeInTheDocument();
    expect(screen.getByText("v0.2.1")).toBeInTheDocument();
    expect(screen.getByText(/by legalise/)).toBeInTheDocument();
    expect(screen.getByText("first_party")).toBeInTheDocument();
    expect(screen.getByText(/2 capabilities/)).toBeInTheDocument();
    // The card is a link to the detail route.
    const link = screen.getByRole("link", { name: /contract review/i });
    expect(link).toHaveAttribute("href", "/modules/contract-review");
  });

  it("renders empty state when registry has no modules", async () => {
    vi.spyOn(api, "getModulesV2").mockResolvedValue({
      modules: [],
      ui_slots: [],
    });
    mountAt("/modules");
    await waitFor(() => {
      expect(screen.getByText(/no modules discovered/i)).toBeInTheDocument();
    });
  });

  it("flags invalid manifests", async () => {
    vi.spyOn(api, "getModulesV2").mockResolvedValue({
      modules: [
        {
          module_id: "broken",
          source_kind: "v2",
          manifest: { name: "Broken" },
          is_valid: false,
          validation_errors: [{ path: "/", message: "shim could not derive" }],
        },
      ],
      ui_slots: [],
    });
    mountAt("/modules");
    await waitFor(() => {
      expect(screen.getByText(/manifest invalid/i)).toBeInTheDocument();
    });
  });

  it("surfaces a fetch error", async () => {
    vi.spyOn(api, "getModulesV2").mockRejectedValue(new Error("backend down"));
    mountAt("/modules");
    await waitFor(() => {
      expect(screen.getByText(/could not load modules/i)).toBeInTheDocument();
    });
  });

  describe("Phase 14.5 B — installed badge", () => {
    const CATALOG_MOD = {
      module_id: "contract-review",
      source_kind: "v2",
      manifest: {
        name: "Contract Review",
        version: "0.2.1",
        publisher: "legalise",
        visibility: "first_party",
        description: "Reviews contracts.",
        capabilities: [{ id: "review" }],
      },
      is_valid: true,
      validation_errors: [],
    };

    it("renders 'Installed vX.Y' badge for an installed+enabled module", async () => {
      vi.spyOn(api, "getModulesV2").mockResolvedValue({
        modules: [CATALOG_MOD],
        ui_slots: [],
      });
      vi.spyOn(api, "listInstalledModules").mockResolvedValue([{
        module_id: "contract-review",
        version: "0.3.0",   // newer than manifest's discovery version
        publisher: "legalise",
        visibility: "first_party",
        signature_status: "verified",
        enabled: true,
        installed_at: "2026-01-01T00:00:00",
        installed_by_user_id: null,
      }]);
      mountAt("/modules");
      await waitFor(() => {
        expect(
          screen.getByTestId("installed-badge-contract-review"),
        ).toBeInTheDocument();
      });
      // Badge surfaces the installed version (which can differ from
      // the discovered manifest version after an update).
      expect(screen.getByText(/Installed v0\.3\.0/)).toBeInTheDocument();
    });

    it("renders 'Installed (disabled)' badge for a disabled installed module", async () => {
      vi.spyOn(api, "getModulesV2").mockResolvedValue({
        modules: [CATALOG_MOD],
        ui_slots: [],
      });
      vi.spyOn(api, "listInstalledModules").mockResolvedValue([{
        module_id: "contract-review",
        version: "0.3.0",
        publisher: "legalise",
        visibility: "first_party",
        signature_status: "verified",
        enabled: false,
        installed_at: "2026-01-01T00:00:00",
        installed_by_user_id: null,
      }]);
      mountAt("/modules");
      await waitFor(() => {
        expect(
          screen.getByTestId("installed-disabled-badge-contract-review"),
        ).toBeInTheDocument();
      });
      // The enabled-badge variant must NOT also be rendered.
      expect(
        screen.queryByTestId("installed-badge-contract-review"),
      ).toBeNull();
    });

    it("renders no badge when module is not installed", async () => {
      vi.spyOn(api, "getModulesV2").mockResolvedValue({
        modules: [CATALOG_MOD],
        ui_slots: [],
      });
      // Default empty list from beforeEach — nothing installed.
      mountAt("/modules");
      await waitFor(() => {
        expect(screen.getByText("Contract Review")).toBeInTheDocument();
      });
      expect(
        screen.queryByTestId("installed-badge-contract-review"),
      ).toBeNull();
      expect(
        screen.queryByTestId("installed-disabled-badge-contract-review"),
      ).toBeNull();
    });
  });
});
