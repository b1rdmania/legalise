// Pins the source-of-truth contract: the in-chat picker reads the
// same matter skills sources as the Skills page and shows only skills
// runnable right now. No third skill-state model.

import { describe, expect, it, vi } from "vitest";
import {
  api,
  fireEvent,
  mountChat,
  matter,
  registerAssistantTabHooks,
  screen,
  waitFor,
  within,
} from "./AssistantTab.test-utils";

registerAssistantTabHooks();

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
