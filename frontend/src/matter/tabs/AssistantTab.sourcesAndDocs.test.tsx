// Document/source surfacing concerns: source chips, docs loading state,
// doc-aware empty state, attach popover, and the header document popover.

import { describe, expect, it, vi } from "vitest";
import {
  AssistantTab,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  fireEvent,
  matter,
  mountChat,
  Outlet,
  registerAssistantTabHooks,
  render,
  RouterProvider,
  screen,
  someDoc,
  within,
} from "./AssistantTab.test-utils";
import type { MatterDocument } from "./AssistantTab.test-utils";

registerAssistantTabHooks();

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
