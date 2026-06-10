// Pins the source-of-truth contract: the in-chat picker reads the
// same matter skills sources as the Skills page and shows only skills
// runnable right now. No third skill-state model.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
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
  const lawveStub = createRoute({
    getParentRoute: () => root,
    path: "/skills/lawve",
    component: () => <div data-testid="lawve-stub" />,
  });
  const router = createRouter({
    routeTree: root.addChildren([tab, lawveStub]),
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
  vi.spyOn(api, "postAssistantMessageStream").mockImplementation(async function* () {
    yield {
      event: "result",
      data: {
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
      },
    } as never;
  });
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

  it("shows the empty state and routes to Add skill when no generic skill is runnable", async () => {
    const setTabAndHash = vi.fn();
    mountChat({ setTabAndHash });

    const toggle = await screen.findByTestId("chat-skills-toggle");
    fireEvent.click(toggle);

    expect(
      await screen.findByText(/Nothing runnable here right now/i),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByText(/Add a skill/i));
    expect(await screen.findByTestId("lawve-stub")).toBeInTheDocument();
    expect(setTabAndHash).not.toHaveBeenCalled();
  });

  it("exposes ambient Activity and document attachment controls in the chat shell", async () => {
    const setTabAndHash = vi.fn();
    mountChat({ setTabAndHash });

    expect(await screen.findByTestId("open-record-link")).toHaveTextContent(
      /Activity/i,
    );

    fireEvent.click(screen.getByTestId("chat-documents-toggle"));
    expect(setTabAndHash).not.toHaveBeenCalledWith("documents");
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

    const context = await screen.findByTestId("chat-attached-document-context");
    expect(context).toHaveTextContent(/Asking about/i);
    expect(context).toHaveTextContent("witness-statement.docx");
    expect(screen.getByTitle("Remove witness-statement.docx")).toBeInTheDocument();
  });

  it("opens the focused file from the attached document context", async () => {
    const onDocumentChip = vi.fn();
    mountChat({
      initialDocumentId: "doc-1",
      onDocumentChip,
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

    fireEvent.click(await screen.findByRole("button", { name: /Preview/i }));

    expect(onDocumentChip).toHaveBeenCalledWith("doc-1");
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
        signature_status: "structure_verified",
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

  it("uses the SSE assistant stream and renders backend progress events", async () => {
    let releaseResult!: () => void;
    const resultGate = new Promise<void>((resolve) => {
      releaseResult = resolve;
    });
    vi.spyOn(api, "postAssistantMessageStream").mockImplementation(async function* () {
      yield {
        event: "context.loaded",
        data: {
          history_message_count: 0,
          chronology_event_count: 0,
          document_count: 1,
          tool_count: 1,
        },
      } as never;
      yield {
        event: "model.start",
        data: { stage: "assistant" },
      } as never;
      yield {
        event: "tool.start",
        data: { module_id: "legalise.contract-review", capability_id: "review" },
      } as never;
      await resultGate;
      yield {
        event: "result",
        data: {
          user: {
            id: "u-stream",
            role: "user",
            content: "Review the NDA",
            suggested_actions: [],
            created_at: "2026-06-05T10:00:00Z",
          },
          assistant: {
            id: "a-stream",
            role: "assistant",
            content: "I reviewed the NDA.",
            suggested_actions: [],
            created_at: "2026-06-05T10:00:01Z",
          },
        },
      } as never;
    });
    mountChat();

    const input = await screen.findByPlaceholderText(/Ask about Khan v Acme/i);
    fireEvent.change(input, { target: { value: "Review the NDA" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText(/Running contract review: review/i)).toBeInTheDocument();
    releaseResult();
    expect(await screen.findByText("I reviewed the NDA.")).toBeInTheDocument();
    expect(api.postAssistantMessageStream).toHaveBeenCalledWith(
      matter.slug,
      { content: "Review the NDA", selected_document_ids: undefined },
    );
  });

  it("keeps workflow suggestion chips in chat instead of routing to legacy tabs", async () => {
    const setTabAndHash = vi.fn();
    mountChat({
      setTabAndHash,
      initialMessages: [
        {
          id: "a-suggest",
          role: "assistant",
          content: "I can run a pre-motion premortem.",
          suggested_actions: [
            {
              type: "run_pre_motion",
              label: "Run a pre-motion premortem",
              params: {},
            },
          ],
          created_at: "2026-06-05T10:00:00Z",
        },
      ],
    });

    const row = await screen.findByTestId("assistant-output-row");
    expect(row).toHaveTextContent("Run a pre-motion premortem");
    fireEvent.click(within(row).getByRole("button", { name: "Open" }));

    await waitFor(() =>
      expect(api.postAssistantMessageStream).toHaveBeenCalledWith(
        matter.slug,
        {
          content:
            "Run the pre-motion premortem now.\n\nRequested from: Run a pre-motion premortem",
          selected_document_ids: undefined,
        },
      ),
    );
    expect(setTabAndHash).not.toHaveBeenCalled();
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

  it("does not render an output row for a plain cited answer", async () => {
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
    });

    expect(
      await screen.findByRole("button", { name: /Document.*demo-note\.txt/i }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("assistant-output-row")).toBeNull();
  });

  it("renders a compact output row and summons the Sources pane", async () => {
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
          content:
            "Summary of demo-note.txt:\n\n- The dismissal date is in [doc:doc-public].",
          suggested_actions: [],
          created_at: "2026-01-01T00:00:00Z",
        },
      ],
    });

    expect(await screen.findByTestId("assistant-output-row")).toHaveTextContent(
      /Summary of demo-note\.txt/i,
    );

    fireEvent.click(screen.getByRole("button", { name: "Sources" }));

    const pane = await screen.findByTestId("assistant-work-pane-sources");
    expect(pane).toHaveTextContent("demo-note.txt");
    expect(pane).toHaveTextContent(/Inspect/i);
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
