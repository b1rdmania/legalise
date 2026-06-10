/**
 * Module Standalone v1 — ModulesCatalog (integrations home) tests.
 *
 * Primary = v2 registry reference modules with workspace state; the
 * public skill library is a secondary, collapsed-by-default browse (not
 * an install path). Mounts the production router so the Links + auth
 * context the page now depends on resolve.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";

import { router as productionRouter } from "../router";
import { AuthProvider } from "../auth/AuthProvider";
import * as api from "../lib/api";
import type { PublicModuleSkill, V2ManifestEntry } from "../lib/api";

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

function skill(over: Partial<PublicModuleSkill> = {}): PublicModuleSkill {
  return {
    plugin: "uk-employment-legal",
    skill: "unfair-dismissal-screener",
    name: "Unfair Dismissal Screener",
    description: "Screens a dismissal against the s.94 ERA framework.",
    declared_capabilities: ["read", "model"],
    trust_posture: "first_party",
    source_url: "https://github.com/b1rdmania/claude-for-uk-legal/...",
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
  vi.spyOn(api, "getPublicModules").mockResolvedValue({
    source: { repo: "b1rdmania/claude-for-uk-legal", ref: "abc" },
    skills: [skill()],
    broken: [],
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
        signature_status: "verified",
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
    ).toHaveTextContent(/installed/i);
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
        signature_status: "verified",
        enabled: true,
        installed_at: "2026-01-01T00:00:00",
        installed_by_user_id: null,
      },
    ]);

    mountAt();
    // PR 3 (blueprint §7) replaces the state dropdown with three tabs:
    // Installed / Available / (Revoked, operator-only). Default lands
    // on Installed; switching to Available exposes the not-yet-installed
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

  it("shows the public skill library immediately without a sign-in wall", async () => {
    vi.spyOn(api, "getCurrentUser").mockRejectedValue(new Error("401"));
    vi.spyOn(api, "getModulesV2").mockResolvedValue({ modules: [], ui_slots: [] });
    vi.spyOn(api, "listInstalledModules").mockResolvedValue([]);

    mountAt();
    await waitFor(() => {
      expect(screen.getByText("Unfair Dismissal Screener")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("modules-signin-prompt")).toBeNull();
    expect(screen.getByText(/Browse legal skills/)).toBeInTheDocument();
    expect(screen.getByText("Open demo")).toBeInTheDocument();
  });

  it("keeps the public skill library secondary + collapsed for signed-in users", async () => {
    vi.spyOn(api, "getModulesV2").mockResolvedValue({ modules: [], ui_slots: [] });
    vi.spyOn(api, "listInstalledModules").mockResolvedValue([]);

    mountAt();
    await waitFor(() => {
      expect(screen.getByTestId("toggle-skills")).toBeInTheDocument();
    });
    expect(screen.queryByText("Unfair Dismissal Screener")).toBeNull();
    fireEvent.click(screen.getByTestId("toggle-skills"));
    expect(screen.getByText("Unfair Dismissal Screener")).toBeInTheDocument();
  });
});
