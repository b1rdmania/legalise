/**
 * MatterSkillsTab — enable-truth regression.
 *
 * Pins the contract that the matter Skills surface only posts grants
 * for capabilities the runtime will accept at matter scope. Any
 * workspace / provider / other-scope capability declared by the
 * manifest must not be sent; the runtime would reject those with
 * 422 and the modal would close as "enabled" while the skill is
 * still half-granted.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { MatterSkillsTab } from "./MatterSkillsTab";
import * as api from "../lib/api";

function mountAt(slug: string) {
  const root = createRootRoute({ component: () => <Outlet /> });
  const tabRoute = createRoute({
    getParentRoute: () => root,
    path: "/matters/$slug/$tab",
    component: () => <MatterSkillsTab slug={slug} />,
  });
  const skillsStub = createRoute({
    getParentRoute: () => root,
    path: "/skills",
    component: () => <div data-testid="skills-stub" />,
  });
  const tree = root.addChildren([tabRoute, skillsStub]);
  const router = createRouter({
    routeTree: tree,
    history: createMemoryHistory({
      initialEntries: [`/matters/${slug}/workflows`],
    }),
  });
  return render(<RouterProvider router={router} />);
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(api, "listDocuments").mockResolvedValue([]);
});
afterEach(() => {
  cleanup();
});

function setupMixedScopeMocks() {
  vi.spyOn(api, "getMatterWorkflows").mockResolvedValue({ workflows: [] });
  vi.spyOn(api, "listGrants").mockResolvedValue({
    matter_id: "m-1",
    grants: [],
  });
  vi.spyOn(api, "listInstalledModules").mockResolvedValue([
    {
      module_id: "contract-review",
      version: "0.1.0",
      publisher: "legalise",
      visibility: "first_party",
      signature_status: "structure_verified",
      enabled: true,
      installed_at: "2026-01-01T00:00:00",
      installed_by_user_id: null,
    },
  ]);
  vi.spyOn(api, "getModulesV2").mockResolvedValue({
    modules: [
      {
        module_id: "contract-review",
        source_kind: "v2",
        manifest: {
          name: "Contract Review",
          capabilities: [
            // Two matter-scoped capabilities — grantable here.
            { id: "review", scope: "matter", reads: ["doc.read"], writes: ["doc.redline"] },
            { id: "summary", scope: "matter", reads: ["doc.read"], writes: [] },
            // One workspace-scoped capability — must NOT be posted.
            // The substrate would 422 it at matter scope.
            { id: "configure", scope: "workspace", reads: [], writes: ["workspace.config"] },
            // One provider-scoped capability — also must NOT be posted.
            { id: "call_model", scope: "provider", reads: [], writes: [] },
          ],
        },
        is_valid: true,
        validation_errors: [],
      },
    ],
    ui_slots: [],
  } as never);
}

describe("MatterSkillsTab — enable truth", () => {
  it("posts grants only for matter-scoped capabilities", async () => {
    setupMixedScopeMocks();
    const createGrant = vi
      .spyOn(api, "createGrant")
      .mockResolvedValue({
        matter_id: "m-1",
        parent_capability_id: "review",
        module_id: "contract-review",
        grants: [],
        was_idempotent_noop: false,
      });

    mountAt("m-1");

    await waitFor(() =>
      expect(
        screen.getByTestId("available-module-contract-review"),
      ).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByTestId("enable-contract-review"));
    fireEvent.click(await screen.findByTestId("enable-modal-submit"));

    await waitFor(() => {
      expect(createGrant).toHaveBeenCalledTimes(2);
    });

    const calls = createGrant.mock.calls.map(
      ([, body]) => (body as { capability_id: string }).capability_id,
    );
    expect(calls.sort()).toEqual(["review", "summary"]);
    expect(calls).not.toContain("configure");
    expect(calls).not.toContain("call_model");
  });

  it("disables Enable with honest copy when no matter capability exists", async () => {
    vi.spyOn(api, "getMatterWorkflows").mockResolvedValue({ workflows: [] });
    vi.spyOn(api, "listGrants").mockResolvedValue({
      matter_id: "m-1",
      grants: [],
    });
    vi.spyOn(api, "listInstalledModules").mockResolvedValue([
      {
        module_id: "workspace-only",
        version: "0.1.0",
        publisher: "legalise",
        visibility: "first_party",
        signature_status: "structure_verified",
        enabled: true,
        installed_at: "2026-01-01T00:00:00",
        installed_by_user_id: null,
      },
    ]);
    vi.spyOn(api, "getModulesV2").mockResolvedValue({
      modules: [
        {
          module_id: "workspace-only",
          source_kind: "v2",
          manifest: {
            name: "Workspace-only skill",
            capabilities: [{ id: "configure", scope: "workspace" }],
          },
          is_valid: true,
          validation_errors: [],
        },
      ],
      ui_slots: [],
    } as never);

    mountAt("m-1");

    const btn = await screen.findByTestId("enable-workspace-only");
    expect(btn).toBeDisabled();
    expect(
      screen.getByTestId("available-disabled-reason-workspace-only"),
    ).toHaveTextContent(/cannot be enabled inside a project/i);
  });

  it("keeps the modal open and surfaces the error on grant failure", async () => {
    setupMixedScopeMocks();
    vi.spyOn(api, "createGrant").mockRejectedValue(
      new Error("upstream 500: grant write failed"),
    );

    mountAt("m-1");

    fireEvent.click(await screen.findByTestId("enable-contract-review"));
    fireEvent.click(await screen.findByTestId("enable-modal-submit"));

    await waitFor(() => {
      expect(screen.getByTestId("enable-modal-error")).toHaveTextContent(
        /upstream 500/i,
      );
    });
    // Modal is still mounted: the dialog header is still present.
    expect(
      screen.getByRole("dialog", { name: /Enable Contract Review/i }),
    ).toBeInTheDocument();
  });

  it("renders a generic runner for a V2 module whose project permissions are complete", async () => {
    vi.spyOn(api, "getMatterWorkflows").mockResolvedValue({ workflows: [] });
    vi.spyOn(api, "listDocuments").mockResolvedValue([
      {
        id: "doc-1",
        filename: "witness.txt",
        sha256: "sha",
        bytes: 200,
        content_type: "text/plain",
        tag: "demo",
        from_disclosure: false,
        disclosure_label: null,
        uploaded_at: "2026-01-01T00:00:00",
      },
    ] as never);
    vi.spyOn(api, "listGrants").mockResolvedValue({
      matter_id: "m-1",
      grants: [
        {
          id: "g-read",
          plugin: "demo.guided-skill",
          skill: "summarise",
          capability: "document.body.read",
          scope_type: "matter",
          scope_id: "m-1",
          granted_at: "2026-01-01T00:00:00",
        },
        {
          id: "g-write",
          plugin: "demo.guided-skill",
          skill: "summarise",
          capability: "matter.artifact.write",
          scope_type: "matter",
          scope_id: "m-1",
          granted_at: "2026-01-01T00:00:00",
        },
      ],
    });
    vi.spyOn(api, "listInstalledModules").mockResolvedValue([
      {
        module_id: "demo.guided-skill",
        version: "0.1.0",
        publisher: "legalise",
        visibility: "first_party",
        signature_status: "structure_verified",
        enabled: true,
        installed_at: "2026-01-01T00:00:00",
        installed_by_user_id: null,
      },
    ]);
    vi.spyOn(api, "getModulesV2").mockResolvedValue({
      modules: [
        {
          module_id: "demo.guided-skill",
          source_kind: "v2",
          manifest: {
            name: "Guided demo skill",
            description: "Summarises the selected document.",
            capabilities: [
              {
                id: "summarise",
                scope: "matter",
                kind: "skill",
                reads: ["document.body.read"],
                writes: ["matter.artifact.write"],
                ui: { label: "Summarise document" },
              },
            ],
          },
          is_valid: true,
          validation_errors: [],
        },
      ],
      ui_slots: [],
    } as never);

    mountAt("m-1");

    expect(
      await screen.findByTestId("generic-runner-demo.guided-skill-summarise"),
    ).toBeInTheDocument();
    expect(screen.getByText("Summarise document")).toBeInTheDocument();
    expect(screen.queryByTestId("enabled-module-demo.guided-skill")).toBeNull();
  });
});
