import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import { DocumentRichEditor } from "./DocumentRichEditor";
import { resetDocumentEditorTestEnvironment } from "./DocumentRichEditor.test-utils";

afterEach(() => {
  resetDocumentEditorTestEnvironment();
});

describe("DocumentRichEditor surface", () => {
  it("lets the reader move through find results", async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const requestAnimationFrame = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) => {
        callback(0);
        return 1;
      });
    render(
      <DocumentRichEditor
        documentId="doc-1"
        filename="draft.docx"
        initialText="Clause one.\n\nClause two.\n\nClause three."
        sourceLabel="extracted · 39 chars"
        onSaved={() => undefined}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Find" }));
    fireEvent.change(await screen.findByLabelText("Find"), {
      target: { value: "Clause" },
    });
    expect(screen.getByTestId("document-editor-find-count")).toHaveTextContent("3 matches");
    expect(screen.getByTestId("document-editor-find-position")).toHaveTextContent("1 / 3");
    await waitFor(() => {
      expect(document.querySelectorAll('[data-find-match="true"]')).toHaveLength(2);
      expect(document.querySelector('[data-find-match="active"]')).toHaveTextContent("Clause");
    });
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "center", inline: "nearest" });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByTestId("document-editor-find-position")).toHaveTextContent("2 / 3");
    await waitFor(() => {
      expect(document.querySelectorAll('[data-find-match="true"]')).toHaveLength(2);
      expect(document.querySelector('[data-find-match="active"]')).toHaveTextContent("Clause");
    });
    expect(scrollIntoView).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    expect(screen.getByTestId("document-editor-find-position")).toHaveTextContent("1 / 3");
    expect(screen.getByTestId("document-editor-find-preview")).toHaveTextContent(
      "Match 1 / 3:",
    );
    fireEvent.keyDown(screen.getByLabelText("Find"), { key: "Enter" });
    expect(screen.getByTestId("document-editor-find-position")).toHaveTextContent("2 / 3");
    fireEvent.keyDown(screen.getByLabelText("Find"), { key: "Enter", shiftKey: true });
    expect(screen.getByTestId("document-editor-find-position")).toHaveTextContent("1 / 3");
    requestAnimationFrame.mockRestore();
  });

  it("focuses document find with Cmd/Ctrl+F", async () => {
    render(
      <DocumentRichEditor
        documentId="doc-1"
        filename="draft.docx"
        initialText="Clause one.\n\nClause two."
        sourceLabel="extracted · 24 chars"
        onSaved={() => undefined}
      />,
    );

    expect(screen.queryByLabelText("Find")).toBeNull(); // hidden until summoned
    fireEvent.keyDown(window, { key: "f", metaKey: true });
    const find = await screen.findByLabelText("Find");
    await waitFor(() => expect(find).toHaveFocus());
  });

  it("surfaces the selected passage as a review-note action", async () => {
    Object.assign(window.navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
    const onCreateNoteFromSelection = vi.fn();
    const onRunSkillFromSelection = vi.fn();
    render(
      <DocumentRichEditor
        documentId="doc-1"
        filename="draft.docx"
        initialText="The dismissal letter mentioned a single social-media post."
        sourceLabel="extracted · 60 chars"
        selectedQuote="single social-media post"
        selectedQuoteAnchored
        onCreateNoteFromSelection={onCreateNoteFromSelection}
        onRunSkillFromSelection={onRunSkillFromSelection}
        onSaved={() => undefined}
      />,
    );

    expect(await screen.findByTestId("document-editor-selected-passage")).toHaveTextContent(
      "single social-media post",
    );
    expect(screen.getByTestId("document-editor-selected-passage")).toHaveTextContent(
      "Anchored",
    );
    const ribbon = screen.getByTestId("document-editor-selection-ribbon");
    expect(ribbon).toHaveTextContent("single social-media post");
    fireEvent.click(within(ribbon).getByRole("button", { name: "Find in document" }));
    expect(screen.getByLabelText("Find")).toHaveValue("single social-media post");
    fireEvent.click(within(ribbon).getByRole("button", { name: "Run skill" }));
    expect(onRunSkillFromSelection).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Copy passage" }));
    await waitFor(
      () => {
        expect(window.navigator.clipboard.writeText).toHaveBeenCalledWith(
          "single social-media post",
        );
      },
      { timeout: 5000 },
    );
    await waitFor(
      () => {
        expect(screen.getByTestId("document-editor-copy-status")).toHaveTextContent(
          "Copied selected passage",
        );
      },
      { timeout: 5000 },
    );
    fireEvent.click(within(ribbon).getByRole("button", { name: "Add review note" }));
    expect(onCreateNoteFromSelection).toHaveBeenCalledTimes(1);
  });

  it("shows which review notes are located in the working copy", async () => {
    render(
      <DocumentRichEditor
        documentId="doc-1"
        filename="draft.docx"
        initialText="The dismissal letter mentioned a single social-media post."
        sourceLabel="extracted · 60 chars"
        noteHighlights={[
          {
            id: "note-1",
            label: "Open note",
            quote: "single social-media post",
            status: "open",
          },
          {
            id: "note-2",
            label: "Moved note",
            quote: "holiday pay clause",
            status: "open",
          },
        ]}
        onSaved={() => undefined}
      />,
    );

    const reviewMap = await screen.findByTestId("document-editor-review-map");
    expect(reviewMap).toHaveTextContent("1 of 2 note anchors located");
    expect(within(reviewMap).getByRole("button", { name: /Open note/ })).toHaveTextContent(
      "Located",
    );
    expect(within(reviewMap).getByRole("button", { name: /Moved note/ })).toHaveTextContent(
      "Not located",
    );
    expect(
      screen
        .getByTestId("document-editor-canvas")
        .querySelector('[data-review-note-id="note-1"]'),
    ).toHaveTextContent("single social-media post");
    expect(
      screen
        .getByTestId("document-editor-canvas")
        .querySelector('[data-review-note-id="note-2"]'),
    ).toBeNull();

    fireEvent.click(within(reviewMap).getByRole("button", { name: /Open note/ }));
    expect(screen.getByLabelText("Find")).toHaveValue("single social-media post");
  });
});
