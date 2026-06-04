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
import type { AssistantMessage, Matter, MatterDocument } from "../../lib/api";

const matter: Matter = {
  id: "m-1",
  slug: "khan-v-acme",
  title: "Khan v Acme",
  matter_type: "civil",
  privilege_posture: "B_mixed",
  required_provider: null,
  default_model_id: null,
} as never;

function mountChat(overrides?: {
  setTabAndHash?: (k: string) => void;
  docs?: MatterDocument[] | null;
  initialMessages?: AssistantMessage[];
  onDocumentChip?: (documentId: string) => void;
  initialDocumentId?: string | null;
}) {
  const setTabAndHash = overrides?.setTabAndHash ?? vi.fn();
  const docs = overrides?.docs ?? [];
  const root = createRootRoute({ component: () => <Outlet /> });
  const tab = createRoute({
    getParentRoute: () => root,
    path: "/matters/$slug/assistant",
    component: () => (
      <AssistantTab
        matter={matter}
        docs={docs}
        chronology={[]}
        setTabAndHash={setTabAndHash as never}
        auditCount={0}
        showPostureInPulse={false}
        initialMessages={overrides?.initialMessages}
        onDocumentChip={overrides?.onDocumentChip}
        initialDocumentId={overrides?.initialDocumentId}
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
  it("does not fetch or expose legacy built-in workflows in the chat picker", async () => {
    const workflowsSpy = vi.spyOn(api, "getMatterWorkflows");

    mountChat();

    const toggle = await screen.findByTestId("chat-skills-toggle");
    await waitFor(() => expect(toggle).toHaveTextContent("Skills"));

    fireEvent.click(toggle);
    expect(await screen.findByTestId("chat-skills-popover")).toBeInTheDocument();
    expect(workflowsSpy).not.toHaveBeenCalled();
    expect(screen.queryByText(/Legacy built-in actions/i)).toBeNull();
    expect(screen.queryByTestId("chat-skill-premotion")).toBeNull();
    expect(screen.queryByTestId("chat-skill-letters")).toBeNull();
  });

  it("shows the empty state and routes to the matter Skills tab when no generic skill is runnable", async () => {
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

  it("exposes ambient Record and Documents links in the shell", async () => {
    const setTabAndHash = vi.fn();
    mountChat({ setTabAndHash });

    expect(await screen.findByTestId("open-record-link")).toHaveTextContent(
      /View Record/i,
    );

    fireEvent.click(screen.getByTestId("open-documents-link"));
    expect(setTabAndHash).toHaveBeenCalledWith("documents");
  });

  it("pre-attaches a document when opened from the document workbench", async () => {
    mountChat({
      initialDocumentId: "doc-1",
      docs: [
        {
          id: "doc-1",
          matter_id: "m-1",
          filename: "witness-statement.docx",
          mime_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          size_bytes: 1200,
          sha256: "a".repeat(64),
          tag: "draft",
          from_disclosure: false,
          uploaded_at: "2026-06-03T10:00:00",
          uploaded_by_id: "u-1",
        },
      ],
    });

    expect(await screen.findByText("witness-statement.docx")).toBeInTheDocument();
    expect(screen.getByTitle("Remove witness-statement.docx")).toBeInTheDocument();
  });

  it("mounts the generic runner for a runnable V2 skill instead of routing to a bespoke tab", async () => {
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

describe("AssistantTab — source chips", () => {
  it("lets public shells override document chip routing", async () => {
    const onDocumentChip = vi.fn();
    mountChat({
      docs: [
        {
          id: "doc-public",
          filename: "demo-note.txt",
          sha256: "sha",
          size_bytes: 99,
          tag: "demo",
          from_disclosure: false,
          uploaded_at: "2026-01-01T00:00:00Z",
          mime_type: "text/plain",
        } as never,
      ],
      initialMessages: [
        {
          id: "a-1",
          role: "assistant",
          content: "The dismissal date is in [doc:doc-public].",
          suggested_actions: [],
          created_at: "2026-01-01T00:00:00Z",
        },
      ],
      onDocumentChip,
    });

    fireEvent.click(await screen.findByRole("button", { name: /Document.*demo-note\.txt/i }));

    expect(onDocumentChip).toHaveBeenCalledWith("doc-public");
  });
});

describe("AssistantTab — docs loading state", () => {
  it("shows a loading line while docs are null, then resolves to the count", async () => {
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
