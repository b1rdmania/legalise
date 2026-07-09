import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { DocumentRichEditor } from "./DocumentRichEditor";
import { jsonResponse, resetDocumentEditorTestEnvironment } from "./DocumentRichEditor.test-utils";

afterEach(() => {
  resetDocumentEditorTestEnvironment();
});

describe("DocumentRichEditor inline tracked changes", () => {
  const DOC_TEXT =
    "The employer may terminate the agreement without notice during probation.";
  const PROPOSED_EDIT = {
    id: "edit-1",
    deletedText: "without notice",
    insertedText: "with statutory notice",
    contextBefore: "the agreement ",
    contextAfter: " during",
    rationale: "Align with statutory minimum notice.",
  };

  function trackedProps(extra: Record<string, unknown> = {}) {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        document_id: "doc-1",
        updated_by_id: null,
        updated_at: null,
        plain_text: DOC_TEXT,
        editor_json: null,
        base_version_id: "version-1",
        version_counter: 0,
        client_id: null,
      }),
    );
    return {
      documentId: "doc-1",
      filename: "contract.txt",
      initialText: DOC_TEXT,
      latestVersionNumber: 1,
      latestVersionId: "version-1",
      sourceLabel: "extracted · 74 chars",
      onSaved: () => undefined,
      ...extra,
    };
  }

  it("renders proposed edits as inline decorations with a Redlines toggle", async () => {
    const { container } = render(
      <DocumentRichEditor
        {...trackedProps({
          proposedEdits: [PROPOSED_EDIT],
          onResolveProposedEdit: vi.fn().mockResolvedValue(undefined),
        })}
      />,
    );

    expect(
      await screen.findByTestId("document-editor-redlines-toggle"),
    ).toHaveTextContent("Redlines (1)");
    await waitFor(() => {
      const deletion = container.querySelector(".legalise-track-delete");
      expect(deletion).not.toBeNull();
      expect(deletion).toHaveTextContent("without notice");
    });
    expect(container.querySelector(".legalise-track-insert")).toHaveTextContent(
      "with statutory notice",
    );
    expect(screen.getByTestId("document-editor-redlines-panel")).toHaveTextContent(
      "1 proposed change",
    );
    // Quiet word count sits in the status area.
    expect(screen.getByTestId("document-editor-word-count")).toHaveTextContent(
      "10 words",
    );
  });

  it("accepts a change via the per-edit endpoint and applies it to the working text", async () => {
    const onResolveProposedEdit = vi.fn().mockResolvedValue(undefined);
    const props = trackedProps({
      proposedEdits: [PROPOSED_EDIT],
      onResolveProposedEdit,
    });
    const { container, rerender } = render(<DocumentRichEditor {...props} />);

    await screen.findByTestId("document-editor-redlines-toggle");
    await waitFor(() =>
      expect(container.querySelector(".legalise-track-accept")).not.toBeNull(),
    );
    fireEvent.mouseDown(container.querySelector(".legalise-track-accept")!);

    await waitFor(() =>
      expect(onResolveProposedEdit).toHaveBeenCalledWith("edit-1", "accept"),
    );
    await waitFor(() => {
      expect(screen.getByTestId("document-editor-canvas")).toHaveTextContent(
        "with statutory notice",
      );
    });
    expect(screen.getByTestId("document-editor-canvas")).not.toHaveTextContent(
      "without notice",
    );

    // Parent removes the resolved edit from the pending list — the mark
    // and the toggle go with it.
    rerender(<DocumentRichEditor {...props} proposedEdits={[]} />);
    await waitFor(() => {
      expect(container.querySelector(".legalise-track-delete")).toBeNull();
    });
    expect(screen.queryByTestId("document-editor-redlines-toggle")).toBeNull();
  });

  it("rejects a change without touching the working text", async () => {
    const onResolveProposedEdit = vi.fn().mockResolvedValue(undefined);
    const props = trackedProps({
      proposedEdits: [PROPOSED_EDIT],
      onResolveProposedEdit,
    });
    const { container, rerender } = render(<DocumentRichEditor {...props} />);

    await waitFor(() =>
      expect(container.querySelector(".legalise-track-reject")).not.toBeNull(),
    );
    fireEvent.mouseDown(container.querySelector(".legalise-track-reject")!);

    await waitFor(() =>
      expect(onResolveProposedEdit).toHaveBeenCalledWith("edit-1", "reject"),
    );
    rerender(<DocumentRichEditor {...props} proposedEdits={[]} />);
    await waitFor(() => {
      expect(container.querySelector(".legalise-track-delete")).toBeNull();
    });
    expect(screen.getByTestId("document-editor-canvas")).toHaveTextContent(
      "without notice",
    );
    expect(screen.getByTestId("document-editor-canvas")).not.toHaveTextContent(
      "with statutory notice",
    );
  });

  it("hides the inline decorations when the Redlines toggle is switched off", async () => {
    const { container } = render(
      <DocumentRichEditor
        {...trackedProps({
          proposedEdits: [PROPOSED_EDIT],
          onResolveProposedEdit: vi.fn().mockResolvedValue(undefined),
        })}
      />,
    );

    const toggle = await screen.findByTestId("document-editor-redlines-toggle");
    await waitFor(() =>
      expect(container.querySelector(".legalise-track-delete")).not.toBeNull(),
    );
    fireEvent.click(toggle);
    await waitFor(() => {
      expect(container.querySelector(".legalise-track-delete")).toBeNull();
    });
    expect(screen.queryByTestId("document-editor-redlines-panel")).toBeNull();
  });

  it("shows no Redlines toggle when there are no proposed edits", async () => {
    render(<DocumentRichEditor {...trackedProps()} />);
    await screen.findByTestId("document-editor-canvas");
    expect(screen.queryByTestId("document-editor-redlines-toggle")).toBeNull();
    expect(screen.queryByTestId("document-editor-redlines-panel")).toBeNull();
  });
});
