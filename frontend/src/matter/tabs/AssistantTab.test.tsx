// Pins the source-of-truth contract: the in-chat picker reads the
// same matter skills sources as the Skills page and shows only skills
// runnable right now. No third skill-state model.

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
import { AssistantTab } from "./AssistantTab";
import * as api from "../../lib/api";
import type { Matter } from "../../lib/api";

const matter: Matter = {
  id: "m-1",
  slug: "khan-v-acme",
  title: "Khan v Acme",
  matter_type: "civil",
  privilege_posture: "B_mixed",
  required_provider: null,
  default_model_id: null,
} as never;

function mountChat(overrides?: { setTabAndHash?: (k: string) => void }) {
  const setTabAndHash = overrides?.setTabAndHash ?? vi.fn();
  const root = createRootRoute({ component: () => <Outlet /> });
  const tab = createRoute({
    getParentRoute: () => root,
    path: "/matters/$slug/assistant",
    component: () => (
      <AssistantTab
        matter={matter}
        docs={[]}
        chronology={[]}
        setTabAndHash={setTabAndHash as never}
        auditCount={0}
        showPostureInPulse={false}
      />
    ),
  });
  const router = createRouter({
    routeTree: root.addChildren([tab]),
    history: createMemoryHistory({
      initialEntries: [`/matters/${matter.slug}/assistant`],
    }),
  });
  render(<RouterProvider router={router} />);
  return { setTabAndHash };
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(api, "listAssistantMessages").mockResolvedValue([]);
  vi.spyOn(api, "getModulesV2").mockResolvedValue({
    modules: [],
    ui_slots: [],
  } as never);
  vi.spyOn(api, "listInstalledModules").mockResolvedValue([]);
  vi.spyOn(api, "listGrants").mockResolvedValue({
    matter_id: "m-1",
    grants: [],
  });
  vi.spyOn(api, "postAssistantMessage").mockResolvedValue({
    user: {
      id: "u-1",
      role: "user",
      content: "",
      suggested_actions: [],
      created_at: "",
    },
    assistant: {
      id: "a-1",
      role: "assistant",
      content: "",
      suggested_actions: [],
      created_at: "",
    },
  } as never);
});
afterEach(() => {
  cleanup();
});

describe("AssistantTab — in-chat skill picker", () => {
  it("keeps legacy workflows out of the primary runnable skill count", async () => {
    vi.spyOn(api, "getMatterWorkflows").mockResolvedValue({
      workflows: [
        // Granted + ok → primary list, counted.
        {
          key: "premotion",
          title: "Pre-Motion",
          description: "Analyse the dispute.",
          declared_capabilities: [],
          granted_capabilities: [],
          grant: "granted",
          last_run_at: null,
          availability: "ok",
          reason: null,
        },
        {
          key: "letters",
          title: "Letters",
          description: "Draft pre-action letters.",
          declared_capabilities: [],
          granted_capabilities: [],
          grant: "granted",
          last_run_at: null,
          availability: "ok",
          reason: null,
        },
        // Granted but blocked by privilege state → "Needs attention",
        // NOT counted in the Skills (N) total.
        {
          key: "contract-review",
          title: "Contract Review",
          description: "Review contracts.",
          declared_capabilities: [],
          granted_capabilities: [],
          grant: "granted",
          last_run_at: null,
          availability: "blocked-by-posture",
          reason: "Privilege state C_paused blocks cloud calls.",
        },
        // Not granted on this matter at all → must not appear anywhere.
        {
          key: "reviews",
          title: "Tabular Review",
          description: "Review tables.",
          declared_capabilities: [],
          granted_capabilities: [],
          grant: "blocked",
          last_run_at: null,
          availability: "blocked-by-grant",
          reason: null,
        },
      ],
    } as never);

    mountChat();

    const toggle = await screen.findByTestId("chat-skills-toggle");
    await waitFor(() => expect(toggle).toHaveTextContent("Skills"));

    fireEvent.click(toggle);
    expect(await screen.findByTestId("chat-skills-popover")).toBeInTheDocument();
    expect(screen.getByText(/Legacy built-in actions \(2\)/i)).toBeInTheDocument();
    expect(screen.getByTestId("chat-skill-premotion")).toBeInTheDocument();
    expect(screen.getByTestId("chat-skill-letters")).toBeInTheDocument();
    // Granted-but-blocked → in Needs attention, not in primary picker.
    expect(screen.queryByTestId("chat-skill-contract-review")).toBeNull();
    expect(
      screen.getByTestId("chat-skill-blocked-contract-review"),
    ).toBeInTheDocument();
    // Ungranted → nowhere.
    expect(screen.queryByTestId("chat-skill-reviews")).toBeNull();
    expect(screen.queryByTestId("chat-skill-blocked-reviews")).toBeNull();
  });

  it("routes to the picked skill's tab via setTabAndHash", async () => {
    vi.spyOn(api, "getMatterWorkflows").mockResolvedValue({
      workflows: [
        {
          key: "premotion",
          title: "Pre-Motion",
          description: "Analyse.",
          declared_capabilities: [],
          granted_capabilities: [],
          grant: "granted",
          last_run_at: null,
          availability: "ok",
          reason: null,
        },
      ],
    } as never);

    const setTabAndHash = vi.fn();
    mountChat({ setTabAndHash });

    fireEvent.click(await screen.findByTestId("chat-skills-toggle"));
    fireEvent.click(await screen.findByTestId("chat-skill-premotion"));

    expect(setTabAndHash).toHaveBeenCalledWith("premotion");
  });

  it("shows the empty state and routes to the matter Skills tab when nothing is runnable", async () => {
    vi.spyOn(api, "getMatterWorkflows").mockResolvedValue({
      workflows: [],
    } as never);

    const setTabAndHash = vi.fn();
    mountChat({ setTabAndHash });

    const toggle = await screen.findByTestId("chat-skills-toggle");
    fireEvent.click(toggle);

    expect(
      await screen.findByText(/Nothing runnable here right now/i),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByText(/Open Skills/i));
    expect(setTabAndHash).toHaveBeenCalledWith("workflows");
  });

  it("exposes the ambient Record and Documents links in the header", async () => {
    vi.spyOn(api, "getMatterWorkflows").mockResolvedValue({
      workflows: [],
    } as never);

    const setTabAndHash = vi.fn();
    mountChat({ setTabAndHash });

    fireEvent.click(await screen.findByTestId("open-record-link"));
    expect(setTabAndHash).toHaveBeenCalledWith("audit");

    fireEvent.click(screen.getByTestId("open-documents-link"));
    expect(setTabAndHash).toHaveBeenCalledWith("documents");
  });

  it("mounts the generic runner for a runnable V2 skill instead of routing to a bespoke tab", async () => {
    vi.spyOn(api, "getMatterWorkflows").mockResolvedValue({
      workflows: [],
    } as never);
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
    vi.spyOn(api, "listInstalledModules").mockResolvedValue([
      {
        module_id: "demo.guided-skill",
        version: "0.1.0",
        publisher: "legalise",
        visibility: "first_party",
        signature_status: "verified",
        enabled: true,
        installed_at: "2026-01-01T00:00:00",
        installed_by_user_id: null,
      },
    ]);
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
    const setTabAndHash = vi.fn();
    mountChat({ setTabAndHash });

    const toggle = await screen.findByTestId("chat-skills-toggle");
    await waitFor(() => expect(toggle).toHaveTextContent("Skills (1)"));
    fireEvent.click(toggle);
    fireEvent.click(
      await screen.findByTestId("chat-runner-skill-demo.guided-skill-summarise"),
    );

    expect(setTabAndHash).not.toHaveBeenCalled();
    expect(
      await screen.findByTestId("generic-runner-demo.guided-skill-summarise"),
    ).toBeInTheDocument();
  });
});

describe("AssistantTab — docs loading state", () => {
  it("shows a loading line while docs are null, then resolves to the count", async () => {
    vi.spyOn(api, "getMatterWorkflows").mockResolvedValue({
      workflows: [],
    } as never);

    // Mount with docs=null (still fetching). The header must not lie
    // and claim "No documents yet" — that's the empty state for a
    // resolved matter with zero documents, not the loading state.
    const root = createRootRoute({ component: () => <Outlet /> });
    const tab = createRoute({
      getParentRoute: () => root,
      path: "/matters/$slug/assistant",
      component: () => (
        <AssistantTab
          matter={matter}
          docs={null}
          chronology={[]}
          setTabAndHash={vi.fn() as never}
          auditCount={0}
          showPostureInPulse={false}
        />
      ),
    });
    const router = createRouter({
      routeTree: root.addChildren([tab]),
      history: createMemoryHistory({
        initialEntries: [`/matters/${matter.slug}/assistant`],
      }),
    });
    render(<RouterProvider router={router} />);

    expect(await screen.findByTestId("docs-context-status")).toHaveTextContent(
      /Loading documents…/i,
    );
  });
});
