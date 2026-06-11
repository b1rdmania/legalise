/**
 * Module Standalone v1 — ModulesCatalog (integrations home) tests.
 *
 * Primary = v2 registry reference modules with workspace state; the
 * Lawve catalogue is the secondary browse + Review-&-add path. Mounts
 * the production router so the Links + auth context the page now
 * depends on resolve.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";

import { router as productionRouter } from "../router";
import { AuthProvider } from "../auth/AuthProvider";
import * as api from "../lib/api";
import type { V2ManifestEntry } from "../lib/api";

function refModule(over: Partial<V2ManifestEntry> = {}): V2ManifestEntry {
  return {
    module_id: "examples.contract-review",
    source_kind: "v2",
    manifest: {
      name: "Contract Review",
      publisher: "legalise",
      capabilities: [
        {
          id: "review",
          reads: ["document.body.read"],
          writes: ["matter.artifact.write"],
        },
      ],
    },
    is_valid: true,
    validation_errors: [],
    ...over,
  };
}

function mountAt(path = "/skills") {
  const router = createRouter({
    routeTree: productionRouter.routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  return render(
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>,
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  globalThis.fetch = vi.fn(() =>
    Promise.resolve(
      new Response(
        JSON.stringify({ status: "ok", version: "", database: "", environment: "test" }),
        { status: 200 },
      ),
    ),
  ) as never;
  vi.spyOn(api, "getCurrentUser").mockResolvedValue({
    id: "u-1",
    email: "u@example.com",
    name: "u",
    role: "solicitor",
    plan: "free",
    default_model_id: null,
    default_privilege_posture: null,
    is_active: true,
    is_verified: true,
    is_superuser: false,
  });
});
afterEach(() => cleanup());

describe("ModulesCatalog — integrations home", () => {
  it("shows reference skills with workspace state + Add skill actions", async () => {
    vi.spyOn(api, "getModulesV2").mockResolvedValue({
      modules: [refModule()],
      ui_slots: [],
    });
    vi.spyOn(api, "listInstalledModules").mockResolvedValue([
      {
        module_id: "examples.contract-review",
        version: "0.2.1",
        publisher: "legalise",
        visibility: "first_party",
        signature_status: "structure_verified",
        enabled: true,
        installed_at: "2026-01-01T00:00:00",
        installed_by_user_id: null,
      },
    ]);

    mountAt();
    await waitFor(() => {
      expect(screen.getByText("Contract Review")).toBeInTheDocument();
    });
    expect(
      screen.getByTestId("module-state-examples.contract-review"),
    ).toHaveTextContent(/added/i);
    expect(screen.getByText("document.body.read")).toBeInTheDocument();
    expect(screen.getByText("matter.artifact.write")).toBeInTheDocument();
    expect(screen.getByText("Add skill")).toBeInTheDocument();
    expect(screen.getByText("Create skill")).toBeInTheDocument();
  });

  it("filters reference modules by search and workspace state", async () => {
    vi.spyOn(api, "getModulesV2").mockResolvedValue({
      modules: [
        refModule(),
        refModule({
          module_id: "examples.pre-motion",
          manifest: {
            name: "Pre-Motion",
            publisher: "legalise",
            capabilities: [{ id: "analyse", reads: ["document.body.read"], writes: [] }],
          },
        }),
      ],
      ui_slots: [],
    });
    vi.spyOn(api, "listInstalledModules").mockResolvedValue([
      {
        module_id: "examples.contract-review",
        version: "0.2.1",
        publisher: "legalise",
        visibility: "first_party",
        signature_status: "structure_verified",
        enabled: true,
        installed_at: "2026-01-01T00:00:00",
        installed_by_user_id: null,
      },
    ]);

    mountAt();
    // PR 3 (blueprint §7) replaces the state dropdown with three tabs:
    // Added / Available / (Revoked, operator-only). Default lands
    // on Added; switching to Available exposes the not-yet-added
    // skills.
    await waitFor(() =>
      expect(screen.getByText("Contract Review")).toBeInTheDocument(),
    );
    expect(screen.queryByText("Pre-Motion")).toBeNull();

    fireEvent.click(screen.getByTestId("skills-tab-available"));
    expect(screen.getByText("Pre-Motion")).toBeInTheDocument();
    expect(screen.queryByText("Contract Review")).toBeNull();

    fireEvent.change(screen.getByLabelText("Search skills"), {
      target: { value: "zzzzz" },
    });
    expect(screen.getByText(/No skills match/)).toBeInTheDocument();
  });

  it("shows the demo path immediately without a sign-in wall", async () => {
    vi.spyOn(api, "getCurrentUser").mockRejectedValue(new Error("401"));
    vi.spyOn(api, "getModulesV2").mockResolvedValue({ modules: [], ui_slots: [] });
    vi.spyOn(api, "listInstalledModules").mockResolvedValue([]);

    mountAt();
    await waitFor(() => {
      expect(screen.getByText("Open demo")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("modules-signin-prompt")).toBeNull();
    expect(screen.getByText("1. Pick a skill")).toBeInTheDocument();
  });

  it("renders without the retired open-skill-library browse section", async () => {
    vi.spyOn(api, "getModulesV2").mockResolvedValue({ modules: [], ui_slots: [] });
    vi.spyOn(api, "listInstalledModules").mockResolvedValue([]);

    mountAt();
    await waitFor(() => {
      expect(screen.getByText("Add skill")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("toggle-skills")).toBeNull();
  });
});
