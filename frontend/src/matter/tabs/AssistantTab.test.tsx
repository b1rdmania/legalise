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
  matter?: Matter;
  onPostureChange?: (next: string) => Promise<void>;
}) {
  const setTabAndHash = overrides?.setTabAndHash ?? vi.fn();
  const docs = overrides?.docs ?? [];
  const mounted = overrides?.matter ?? matter;
  const root = createRootRoute({ component: () => <Outlet /> });
  const tab = createRoute({
    getParentRoute: () => root,
    path: "/matters/$slug/assistant",
    component: () => (
      <AssistantTab
        matter={mounted}
        docs={docs}
        chronology={[]}
        setTabAndHash={setTabAndHash as never}
        auditCount={0}
        showPostureInPulse={false}
        initialMessages={overrides?.initialMessages}
        onDocumentChip={overrides?.onDocumentChip}
        initialDocumentId={overrides?.initialDocumentId}
        onPostureChange={overrides?.onPostureChange}
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
  const { unmount } = render(<RouterProvider router={router} />);
  return { setTabAndHash, unmount };
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
  it("does not expose legacy built-in workflows in the chat picker", async () => {
    mountChat();

    const toggle = await screen.findByTestId("chat-skills-toggle");
    await waitFor(() => expect(toggle).toHaveTextContent("Skills"));

    fireEvent.click(toggle);
    expect(await screen.findByTestId("chat-skills-popover")).toBeInTheDocument();
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

  it("exposes a single document attachment control in the chat shell", async () => {
    // The faint header "Activity" link was removed (redundant with the
    // matter rail, WS1). Attaching documents has one obvious control that
    // opens the picker rather than routing to the Documents tab.
    const setTabAndHash = vi.fn();
    mountChat({ setTabAndHash });

    const attach = await screen.findByTestId("chat-documents-toggle");
    expect(attach).toHaveTextContent(/Attach documents/i);

    fireEvent.click(attach);
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
      expect.any(AbortSignal),
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
          content: "I can anonymise that document.",
          suggested_actions: [
            {
              type: "anonymise_document",
              label: "Anonymise the witness statement",
              params: {},
            },
          ],
          created_at: "2026-06-05T10:00:00Z",
        },
      ],
    });

    const row = await screen.findByTestId("assistant-output-row");
    expect(row).toHaveTextContent("Anonymise the witness statement");
    fireEvent.click(within(row).getByRole("button", { name: "Open" }));

    await waitFor(() =>
      expect(api.postAssistantMessageStream).toHaveBeenCalledWith(
        matter.slug,
        {
          content:
            "Anonymise the selected document now.\n\nRequested from: Anonymise the witness statement",
          selected_document_ids: undefined,
        },
        expect.any(AbortSignal),
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

describe("AssistantTab — pause affordance in the header meta line", () => {
  it("shows Pause AI on an active matter and pauses via onPostureChange", async () => {
    const onPostureChange = vi.fn().mockResolvedValue(undefined);
    mountChat({ onPostureChange });

    const toggle = await screen.findByTestId("chat-pause-toggle");
    expect(toggle).toHaveTextContent("Pause AI");
    fireEvent.click(toggle);
    await waitFor(() => {
      expect(onPostureChange).toHaveBeenCalledWith("C_paused");
    });
  });

  it("shows Resume AI on a paused matter and resumes to B_mixed", async () => {
    const onPostureChange = vi.fn().mockResolvedValue(undefined);
    mountChat({
      onPostureChange,
      matter: { ...matter, privilege_posture: "C_paused" } as Matter,
    });

    const toggle = await screen.findByTestId("chat-pause-toggle");
    expect(toggle).toHaveTextContent("Resume AI");
    fireEvent.click(toggle);
    await waitFor(() => {
      expect(onPostureChange).toHaveBeenCalledWith("B_mixed");
    });
  });

  it("hides the action when no posture plumbing is provided (demo/read-only shells)", async () => {
    mountChat();
    await screen.findByTestId("docs-context-status");
    expect(screen.queryByTestId("chat-pause-toggle")).toBeNull();
  });
});

const someDoc = (
  id: string,
  filename: string,
  uploadedAt = "2026-06-03T10:00:00",
): MatterDocument =>
  ({
    id,
    matter_id: "m-1",
    filename,
    mime_type: "text/plain",
    size_bytes: 100,
    sha256: "a".repeat(64),
    tag: "draft",
    from_disclosure: false,
    uploaded_at: uploadedAt,
    uploaded_by_id: "u-1",
  }) as never;

describe("AssistantTab — composer send keys", () => {
  it("sends on Enter and keeps Shift+Enter as newline", async () => {
    mountChat({ docs: [someDoc("doc-1", "note.txt")] });

    const input = await screen.findByTestId("chat-composer-input");
    fireEvent.change(input, { target: { value: "First line" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect(api.postAssistantMessageStream).not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() =>
      expect(api.postAssistantMessageStream).toHaveBeenCalledWith(
        matter.slug,
        expect.objectContaining({ content: "First line" }),
        expect.any(AbortSignal),
      ),
    );
  });

  it("still sends on Cmd/Ctrl+Enter", async () => {
    mountChat({ docs: [someDoc("doc-1", "note.txt")] });

    const input = await screen.findByTestId("chat-composer-input");
    fireEvent.change(input, { target: { value: "Meta send" } });
    fireEvent.keyDown(input, { key: "Enter", metaKey: true });
    await waitFor(() =>
      expect(api.postAssistantMessageStream).toHaveBeenCalledWith(
        matter.slug,
        expect.objectContaining({ content: "Meta send" }),
        expect.any(AbortSignal),
      ),
    );
  });
});

describe("AssistantTab — failed send", () => {
  it("restores the typed prompt into the composer on error", async () => {
    vi.spyOn(api, "postAssistantMessageStream").mockImplementation(
      // eslint-disable-next-line require-yield
      async function* () {
        throw new Error("boom");
      },
    );
    mountChat({ docs: [someDoc("doc-1", "note.txt")] });

    const input = await screen.findByTestId("chat-composer-input");
    fireEvent.change(input, { target: { value: "Do not lose me" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText(/Could not send message/i)).toBeInTheDocument();
    // The prompt is back in the composer — a failed send never eats the text.
    expect(input).toHaveValue("Do not lose me");
  });
});

describe("AssistantTab — doc-aware empty state", () => {
  it("replaces starter chips with an upload action when the matter has no documents", async () => {
    const setTabAndHash = vi.fn();
    mountChat({ setTabAndHash, docs: [] });

    const emptyState = await screen.findByTestId("chat-empty-state-no-docs");
    expect(emptyState).toHaveTextContent(/Upload your first document/i);
    expect(screen.queryByTestId("chat-empty-state")).toBeNull();
    expect(screen.queryByText(/Stress-test this case/i)).toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: /Upload your first document/i }),
    );
    expect(setTabAndHash).toHaveBeenCalledWith("documents");
  });

  it("shows the starter chips once the matter has documents", async () => {
    mountChat({ docs: [someDoc("doc-1", "note.txt")] });

    expect(await screen.findByTestId("chat-empty-state")).toBeInTheDocument();
    expect(screen.getByText(/Stress-test this case/i)).toBeInTheDocument();
    expect(screen.queryByTestId("chat-empty-state-no-docs")).toBeNull();
  });
});

describe("AssistantTab — attach popover", () => {
  const manyDocs = Array.from({ length: 7 }, (_, i) =>
    someDoc(`doc-${i}`, `bundle-${i}.pdf`, `2026-06-0${(i % 9) + 1}T10:00:00`),
  );

  it("lists every matter document, not just the 5 most recent", async () => {
    mountChat({ docs: manyDocs });

    fireEvent.click(await screen.findByTestId("chat-documents-toggle"));
    const popover = await screen.findByTestId("chat-attach-popover");
    expect(within(popover).getAllByRole("checkbox")).toHaveLength(7);
  });

  it("filters the list by title", async () => {
    mountChat({ docs: manyDocs });

    fireEvent.click(await screen.findByTestId("chat-documents-toggle"));
    const filter = await screen.findByTestId("chat-attach-filter");
    fireEvent.change(filter, { target: { value: "bundle-3" } });

    const popover = screen.getByTestId("chat-attach-popover");
    expect(within(popover).getAllByRole("checkbox")).toHaveLength(1);
    expect(within(popover).getByText("bundle-3.pdf")).toBeInTheDocument();

    fireEvent.change(filter, { target: { value: "no-such-doc" } });
    expect(within(popover).queryAllByRole("checkbox")).toHaveLength(0);
    expect(within(popover).getByText(/No documents match/i)).toBeInTheDocument();
  });
});

describe("AssistantTab — header document popover", () => {
  const docWithStatus = (
    id: string,
    filename: string,
    indexStatus?: string,
  ): MatterDocument =>
    ({ ...someDoc(id, filename), index_status: indexStatus }) as never;

  it("keeps the zero-doc header line as plain text with no popover", async () => {
    mountChat({ docs: [] });

    const status = await screen.findByTestId("docs-context-status");
    expect(status).toHaveTextContent("No documents yet");
    fireEvent.click(status);
    expect(screen.queryByTestId("chat-docs-popover")).toBeNull();
  });

  it("opens a list of documents with their index status from the doc count", async () => {
    mountChat({
      docs: [
        docWithStatus("doc-1", "contract.pdf", "indexed"),
        docWithStatus("doc-2", "witness.docx", "pending"),
        docWithStatus("doc-3", "bundle.pdf", "failed"),
      ],
    });

    const count = await screen.findByTestId("docs-context-status");
    expect(count).toHaveTextContent("3 documents");
    fireEvent.click(count);

    const popover = await screen.findByTestId("chat-docs-popover");
    expect(within(popover).getByText("contract.pdf")).toBeInTheDocument();
    expect(within(popover).getByText("Searchable")).toBeInTheDocument();
    expect(within(popover).getByText("witness.docx")).toBeInTheDocument();
    expect(within(popover).getByText("Indexing…")).toBeInTheDocument();
    expect(within(popover).getByText("bundle.pdf")).toBeInTheDocument();
    expect(within(popover).getByText("Not searchable")).toBeInTheDocument();
  });

  it("shows just the names when every document is indexed and status is absent", async () => {
    // Older payloads omit index_status; the row stays quiet rather than
    // guessing a state.
    mountChat({ docs: [someDoc("doc-1", "note.txt")] });

    fireEvent.click(await screen.findByTestId("docs-context-status"));
    const popover = await screen.findByTestId("chat-docs-popover");
    expect(within(popover).getByText("note.txt")).toBeInTheDocument();
    expect(within(popover).queryByText("Searchable")).toBeNull();
    expect(within(popover).queryByText("Indexing…")).toBeNull();
  });

  it("navigates to the document on row click and closes the popover", async () => {
    const onDocumentChip = vi.fn();
    mountChat({
      onDocumentChip,
      docs: [docWithStatus("doc-1", "contract.pdf", "indexed")],
    });

    fireEvent.click(await screen.findByTestId("docs-context-status"));
    fireEvent.click(await screen.findByTestId("chat-docs-row-doc-1"));

    expect(onDocumentChip).toHaveBeenCalledWith("doc-1");
    expect(screen.queryByTestId("chat-docs-popover")).toBeNull();
  });

  it("offers a filter for long lists, matching the attach popover", async () => {
    const manyDocs = Array.from({ length: 7 }, (_, i) =>
      docWithStatus(`doc-${i}`, `bundle-${i}.pdf`, "indexed"),
    );
    mountChat({ docs: manyDocs });

    fireEvent.click(await screen.findByTestId("docs-context-status"));
    const filter = await screen.findByTestId("chat-docs-filter");
    fireEvent.change(filter, { target: { value: "bundle-3" } });

    const popover = screen.getByTestId("chat-docs-popover");
    expect(within(popover).getByText("bundle-3.pdf")).toBeInTheDocument();
    expect(within(popover).queryByText("bundle-4.pdf")).toBeNull();
  });
});

describe("AssistantTab — no-key header notice", () => {
  it("shows a passive notice when the matter's model needs a key the user lacks", async () => {
    vi.spyOn(api, "listApiKeys").mockResolvedValue([]);
    mountChat({
      matter: { ...matter, required_provider: "anthropic" } as Matter,
    });

    const notice = await screen.findByTestId("chat-no-key-notice");
    expect(notice).toHaveTextContent(/No Anthropic key yet/i);
    expect(within(notice).getByRole("link")).toHaveAttribute(
      "href",
      "/settings/keys",
    );
  });

  it("stays silent when the key is on file", async () => {
    vi.spyOn(api, "listApiKeys").mockResolvedValue([
      { provider: "anthropic", last_used_at: null, created_at: "2026-01-01" },
    ]);
    mountChat({
      matter: { ...matter, required_provider: "anthropic" } as Matter,
    });

    await screen.findByTestId("docs-context-status");
    await waitFor(() => expect(api.listApiKeys).toHaveBeenCalled());
    expect(screen.queryByTestId("chat-no-key-notice")).toBeNull();
  });

  it("does not fetch keys for keyless models", async () => {
    const spy = vi.spyOn(api, "listApiKeys").mockResolvedValue([]);
    mountChat();
    await screen.findByTestId("docs-context-status");
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("AssistantTab — token-streamed draft", () => {
  it("renders deltas in a draft bubble, then the final message replaces it", async () => {
    let releaseResult!: () => void;
    const resultGate = new Promise<void>((resolve) => {
      releaseResult = resolve;
    });
    vi.spyOn(api, "postAssistantMessageStream").mockImplementation(
      async function* () {
        yield { event: "model.start", data: { stage: "assistant" } } as never;
        yield { event: "model.delta", data: { text: "Khan was " } } as never;
        yield { event: "model.delta", data: { text: "dismissed." } } as never;
        await resultGate;
        yield {
          event: "result",
          data: {
            user: {
              id: "u-1",
              role: "user",
              content: "When was Khan dismissed?",
              suggested_actions: [],
              created_at: "",
            },
            assistant: {
              id: "a-1",
              role: "assistant",
              content: "Khan was dismissed.",
              suggested_actions: [],
              created_at: "",
            },
          },
        } as never;
      },
    );
    mountChat({ docs: [someDoc("doc-1", "note.txt")] });

    const input = await screen.findByTestId("chat-composer-input");
    fireEvent.change(input, { target: { value: "When was Khan dismissed?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    const bubble = await screen.findByTestId("chat-draft-bubble");
    expect(bubble).toHaveTextContent("Khan was dismissed.");
    // Draft is plain text with no per-message actions — those belong to
    // the final message only.
    expect(within(bubble).queryByTestId("message-actions")).toBeNull();
    // Streaming is visible progress, so the honesty line stays hidden.
    expect(screen.queryByTestId("chat-long-wait-note")).toBeNull();

    releaseResult();
    await waitFor(() =>
      expect(screen.queryByTestId("chat-draft-bubble")).toBeNull(),
    );
    expect(await screen.findByText("Khan was dismissed.")).toBeInTheDocument();
    expect(await screen.findByTestId("message-actions")).toBeInTheDocument();
  });

  it("resets the draft when a tool turn starts a second model call", async () => {
    let releaseResult!: () => void;
    const resultGate = new Promise<void>((resolve) => {
      releaseResult = resolve;
    });
    vi.spyOn(api, "postAssistantMessageStream").mockImplementation(
      async function* () {
        yield { event: "model.start", data: { stage: "assistant" } } as never;
        yield { event: "model.delta", data: { text: "I'll run the tool." } } as never;
        yield {
          event: "model.start",
          data: { stage: "assistant.final" },
        } as never;
        yield { event: "model.delta", data: { text: "Final answer." } } as never;
        await resultGate;
        yield {
          event: "result",
          data: {
            user: {
              id: "u-1",
              role: "user",
              content: "Run it",
              suggested_actions: [],
              created_at: "",
            },
            assistant: {
              id: "a-1",
              role: "assistant",
              content: "Final answer.",
              suggested_actions: [],
              created_at: "",
            },
          },
        } as never;
      },
    );
    mountChat({ docs: [someDoc("doc-1", "note.txt")] });

    const input = await screen.findByTestId("chat-composer-input");
    fireEvent.change(input, { target: { value: "Run it" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    const bubble = await screen.findByTestId("chat-draft-bubble");
    await waitFor(() => expect(bubble).toHaveTextContent("Final answer."));
    expect(bubble).not.toHaveTextContent(/I'll run the tool\./);

    releaseResult();
    await waitFor(() =>
      expect(screen.queryByTestId("chat-draft-bubble")).toBeNull(),
    );
  });

  it("discards a partial draft and restores the prompt when the stream fails", async () => {
    vi.spyOn(api, "postAssistantMessageStream").mockImplementation(
      async function* () {
        yield { event: "model.start", data: { stage: "assistant" } } as never;
        yield { event: "model.delta", data: { text: "Half an ans" } } as never;
        yield {
          event: "error",
          data: { message: "provider fell over" },
        } as never;
      },
    );
    mountChat({ docs: [someDoc("doc-1", "note.txt")] });

    const input = await screen.findByTestId("chat-composer-input");
    fireEvent.change(input, { target: { value: "Do not lose me" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText(/Could not send message/i)).toBeInTheDocument();
    expect(screen.queryByTestId("chat-draft-bubble")).toBeNull();
    expect(screen.queryByText("Half an ans")).toBeNull();
    expect(input).toHaveValue("Do not lose me");
  });
});

describe("AssistantTab — long-wait honesty line", () => {
  it("does not show the note for a fast turn", async () => {
    let releaseResult!: () => void;
    const resultGate = new Promise<void>((resolve) => {
      releaseResult = resolve;
    });
    vi.spyOn(api, "postAssistantMessageStream").mockImplementation(
      async function* () {
        await resultGate;
        yield {
          event: "result",
          data: {
            user: {
              id: "u-1",
              role: "user",
              content: "Slow question",
              suggested_actions: [],
              created_at: "",
            },
            assistant: {
              id: "a-1",
              role: "assistant",
              content: "Slow answer",
              suggested_actions: [],
              created_at: "",
            },
          },
        } as never;
      },
    );
    mountChat({ docs: [someDoc("doc-1", "note.txt")] });

    const input = await screen.findByTestId("chat-composer-input");
    fireEvent.change(input, { target: { value: "Slow question" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    // The ticker appears immediately; the honesty line waits for the timer.
    expect(await screen.findByText("Working...")).toBeInTheDocument();
    expect(screen.queryByTestId("chat-long-wait-note")).toBeNull();

    releaseResult();
    expect(await screen.findByText("Slow answer")).toBeInTheDocument();
    expect(screen.queryByTestId("chat-long-wait-note")).toBeNull();
  });
});

// WI-1 (2026-07-06): chat turn control. Stop is client-side only — the
// stream endpoint runs the turn in a detached task, so aborting the fetch
// never cancels the turn; the persisted reply lands on the record and the
// thread refresh swaps it in. Regenerate resends the last prompt as a
// brand-new turn; the earlier answer stays (append-only record).
describe("AssistantTab — Stop mid-stream", () => {
  const heldStream = (onSignal?: (signal: AbortSignal | undefined) => void) =>
    vi.spyOn(api, "postAssistantMessageStream").mockImplementation(
      async function* (_slug, _body, signal) {
        onSignal?.(signal);
        yield {
          event: "turn.start",
          data: { slug: matter.slug, thread_id: "t-1" },
        } as never;
        yield { event: "model.start", data: { stage: "assistant" } } as never;
        yield { event: "model.delta", data: { text: "Khan was dis" } } as never;
        // Hold the stream open until the client aborts, then fail the
        // read the way fetch does.
        await new Promise<never>((_, reject) => {
          const fail = () =>
            reject(new DOMException("The operation was aborted.", "AbortError"));
          if (signal?.aborted) fail();
          else signal?.addEventListener("abort", fail);
        });
      },
    );

  it(
    "aborts the fetch, freezes the draft with a stopped line, then swaps in the persisted turn",
    async () => {
      let capturedSignal: AbortSignal | undefined;
      heldStream((signal) => {
        capturedSignal = signal;
      });
      vi.spyOn(api, "getThreadMessages").mockResolvedValue([
        {
          id: "u-p",
          role: "user",
          content: "When was Khan dismissed?",
          suggested_actions: [],
          created_at: "2026-07-07T10:00:00Z",
        },
        {
          id: "a-p",
          role: "assistant",
          content: "Khan was dismissed on 10 March 2026.",
          suggested_actions: [],
          created_at: "2026-07-07T10:00:05Z",
        },
      ]);
      mountChat({ docs: [someDoc("doc-1", "note.txt")] });

      const input = await screen.findByTestId("chat-composer-input");
      fireEvent.change(input, { target: { value: "When was Khan dismissed?" } });
      fireEvent.click(screen.getByRole("button", { name: "Send" }));

      // Stop replaces Send only once deltas are arriving.
      fireEvent.click(await screen.findByTestId("chat-composer-stop"));

      await waitFor(() => expect(capturedSignal?.aborted).toBe(true));
      const frozen = await screen.findByTestId("chat-stopped-bubble");
      expect(frozen).toHaveTextContent("Khan was dis");
      expect(screen.getByTestId("chat-stopped-note")).toHaveTextContent(
        "Stopped. The full answer is still being recorded.",
      );
      // A stop is not a failure: no error banner, prompt not restored.
      expect(screen.queryByText(/Could not send message/i)).toBeNull();
      expect(screen.getByTestId("chat-composer-send")).toBeInTheDocument();

      // ~2s later the thread refresh replaces the frozen draft with the
      // persisted turn.
      await waitFor(
        () => expect(screen.queryByTestId("chat-stopped-bubble")).toBeNull(),
        { timeout: 4000 },
      );
      expect(
        screen.getByText("Khan was dismissed on 10 March 2026."),
      ).toBeInTheDocument();
      expect(api.getThreadMessages).toHaveBeenCalledWith(matter.slug, "t-1");
    },
    10_000,
  );

  it("never offers Stop for a non-streaming turn", async () => {
    let releaseResult!: () => void;
    const resultGate = new Promise<void>((resolve) => {
      releaseResult = resolve;
    });
    vi.spyOn(api, "postAssistantMessageStream").mockImplementation(
      async function* () {
        yield { event: "model.start", data: { stage: "assistant" } } as never;
        // No model.delta events — a keyless/stub turn.
        await resultGate;
        yield {
          event: "result",
          data: {
            user: {
              id: "u-1",
              role: "user",
              content: "Hello",
              suggested_actions: [],
              created_at: "",
            },
            assistant: {
              id: "a-1",
              role: "assistant",
              content: "Stub answer",
              suggested_actions: [],
              created_at: "",
            },
          },
        } as never;
      },
    );
    mountChat({ docs: [someDoc("doc-1", "note.txt")] });

    const input = await screen.findByTestId("chat-composer-input");
    fireEvent.change(input, { target: { value: "Hello" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("Working...")).toBeInTheDocument();
    expect(screen.queryByTestId("chat-composer-stop")).toBeNull();

    releaseResult();
    expect(await screen.findByText("Stub answer")).toBeInTheDocument();
    expect(screen.queryByTestId("chat-composer-stop")).toBeNull();
  });

  it("aborts the in-flight stream on unmount without state warnings", async () => {
    let capturedSignal: AbortSignal | undefined;
    heldStream((signal) => {
      capturedSignal = signal;
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { unmount } = mountChat({ docs: [someDoc("doc-1", "note.txt")] });

    const input = await screen.findByTestId("chat-composer-input");
    fireEvent.change(input, { target: { value: "When was Khan dismissed?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByTestId("chat-composer-stop");

    unmount();

    await waitFor(() => expect(capturedSignal?.aborted).toBe(true));
    // Give the rejected stream a beat to run its catch/finally paths.
    await new Promise((resolve) => setTimeout(resolve, 20));
    const logged = errorSpy.mock.calls.flat().map(String).join(" ");
    expect(logged).not.toMatch(/unmounted component|not wrapped in act/i);
  });
});

describe("AssistantTab — Regenerate", () => {
  const priorTurn: AssistantMessage[] = [
    {
      id: "u-1",
      role: "user",
      content: "When was Khan dismissed?",
      suggested_actions: [],
      created_at: "2026-07-07T09:00:00Z",
    },
    {
      id: "a-1",
      role: "assistant",
      content: "First answer.",
      suggested_actions: [],
      created_at: "2026-07-07T09:00:05Z",
    },
  ];

  it("resends the previous prompt as a new turn and keeps the earlier answer", async () => {
    vi.spyOn(api, "postAssistantMessageStream").mockImplementation(
      async function* () {
        yield {
          event: "result",
          data: {
            user: {
              id: "u-2",
              role: "user",
              content: "When was Khan dismissed?",
              suggested_actions: [],
              created_at: "2026-07-07T09:01:00Z",
            },
            assistant: {
              id: "a-2",
              role: "assistant",
              content: "Second answer.",
              suggested_actions: [],
              created_at: "2026-07-07T09:01:05Z",
            },
          },
        } as never;
      },
    );
    mountChat({
      docs: [someDoc("doc-1", "note.txt")],
      initialMessages: priorTurn,
    });

    fireEvent.click(await screen.findByTestId("message-regenerate"));

    await waitFor(() =>
      expect(api.postAssistantMessageStream).toHaveBeenCalledWith(
        matter.slug,
        expect.objectContaining({ content: "When was Khan dismissed?" }),
        expect.any(AbortSignal),
      ),
    );
    // Append-only: the old answer stays in the transcript beside the new one.
    expect(await screen.findByText("Second answer.")).toBeInTheDocument();
    expect(screen.getByText("First answer.")).toBeInTheDocument();
  });

  it("renders only on the last assistant message and resends its prompt", async () => {
    mountChat({
      docs: [someDoc("doc-1", "note.txt")],
      initialMessages: [
        ...priorTurn,
        {
          id: "u-2",
          role: "user",
          content: "Draft a letter",
          suggested_actions: [],
          created_at: "2026-07-07T09:02:00Z",
        },
        {
          id: "a-2",
          role: "assistant",
          content: "Here is a letter.",
          suggested_actions: [],
          created_at: "2026-07-07T09:02:05Z",
        },
      ],
    });

    await screen.findByText("Here is a letter.");
    const actions = screen.getAllByTestId("message-regenerate");
    expect(actions).toHaveLength(1);

    fireEvent.click(actions[0]);
    await waitFor(() =>
      expect(api.postAssistantMessageStream).toHaveBeenCalledWith(
        matter.slug,
        expect.objectContaining({ content: "Draft a letter" }),
        expect.any(AbortSignal),
      ),
    );
  });

  it("hides Regenerate while a turn is in flight", async () => {
    let releaseResult!: () => void;
    const resultGate = new Promise<void>((resolve) => {
      releaseResult = resolve;
    });
    vi.spyOn(api, "postAssistantMessageStream").mockImplementation(
      async function* () {
        await resultGate;
        yield {
          event: "result",
          data: {
            user: {
              id: "u-2",
              role: "user",
              content: "Another question",
              suggested_actions: [],
              created_at: "",
            },
            assistant: {
              id: "a-2",
              role: "assistant",
              content: "Another answer.",
              suggested_actions: [],
              created_at: "",
            },
          },
        } as never;
      },
    );
    mountChat({
      docs: [someDoc("doc-1", "note.txt")],
      initialMessages: priorTurn,
    });

    expect(await screen.findByTestId("message-regenerate")).toBeInTheDocument();

    const input = screen.getByTestId("chat-composer-input");
    fireEvent.change(input, { target: { value: "Another question" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() =>
      expect(screen.queryByTestId("message-regenerate")).toBeNull(),
    );

    releaseResult();
    await screen.findByText("Another answer.");
    expect(screen.getAllByTestId("message-regenerate")).toHaveLength(1);
  });
});
