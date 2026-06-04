import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import {
  clearDocumentLocalDraft,
  DocumentRichEditor,
  documentOutlineFromJson,
  editorJsonToPlainText,
  documentStatsFromText,
  findNormalizedRange,
  findNormalizedRanges,
  readDocumentLocalDraft,
  type TiptapNode,
  textToEditorHtml,
  writeDocumentLocalDraft,
} from "./DocumentRichEditor";

const tableCell = (type: "tableCell" | "tableHeader", text: string): TiptapNode => ({
  type,
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});

afterEach(() => {
  window.localStorage.clear();
});

describe("DocumentRichEditor text conversion", () => {
  it("turns plain paragraphs into editor-safe HTML", () => {
    expect(textToEditorHtml("One <two>\n\nThree & four")).toBe(
      "<p>One &lt;two&gt;</p><p>Three &amp; four</p>",
    );
  });

  it("marks the first cited quote when it can be located", () => {
    expect(
      textToEditorHtml(
        "The employee was dismissed for a single social-media post.",
        "dismissed   for a single social-media post",
      ),
    ).toContain(
      '<mark data-source-anchor="true">dismissed for a single social-media post</mark>',
    );
  });

  it("does not mark text when the quote is not located", () => {
    expect(textToEditorHtml("The employee was dismissed.", "holiday pay")).not.toContain(
      "data-source-anchor",
    );
  });

  it("finds quote ranges across normalised whitespace", () => {
    expect(findNormalizedRange("Line one\nline two", "one line")).toEqual({
      start: 5,
      end: 13,
    });
  });

  it("finds every match across normalised whitespace", () => {
    expect(findNormalizedRanges("Clause one.\nClause two. No clause three.", "clause")).toEqual([
      { start: 0, end: 6 },
      { start: 12, end: 18 },
      { start: 27, end: 33 },
    ]);
  });

  it("preserves paragraphs and hard breaks when saving text", () => {
    expect(
      editorJsonToPlainText({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "Line one" },
              { type: "hardBreak" },
              { type: "text", text: "line two" },
            ],
          },
          { type: "paragraph", content: [{ type: "text", text: "Next" }] },
        ],
      }),
    ).toBe("Line one\nline two\n\nNext");
  });

  it("keeps headings and ordered lists readable in the plain-text fallback", () => {
    expect(
      editorJsonToPlainText({
        type: "doc",
        content: [
          {
            type: "heading",
            attrs: { level: 2 },
            content: [{ type: "text", text: "Issues" }],
          },
          {
            type: "orderedList",
            content: [
              {
                type: "listItem",
                content: [
                  { type: "paragraph", content: [{ type: "text", text: "Limitation" }] },
                ],
              },
              {
                type: "listItem",
                content: [
                  { type: "paragraph", content: [{ type: "text", text: "Disclosure" }] },
                ],
              },
            ],
          },
        ],
      }),
    ).toBe("Issues\n\nLimitation\nDisclosure");
  });

  it("keeps table cells legible in the plain-text fallback", () => {
    expect(
      editorJsonToPlainText({
        type: "doc",
        content: [
          {
            type: "table",
            content: [
              {
                type: "tableRow",
                content: [
                  tableCell("tableHeader", "Issue"),
                  tableCell("tableHeader", "Risk"),
                ],
              },
              {
                type: "tableRow",
                content: [
                  tableCell("tableCell", "Indemnity"),
                  tableCell("tableCell", "High"),
                ],
              },
            ],
          },
        ],
      }),
    ).toBe("Issue\tRisk\nIndemnity\tHigh");
  });

  it("counts words, characters, and blocks for the editor status line", () => {
    expect(documentStatsFromText("One two\n\nThree")).toEqual({
      words: 3,
      chars: 14,
      blocks: 2,
    });
  });

  it("builds the editor outline from real headings before paragraph fallback", () => {
    expect(
      documentOutlineFromJson(
        {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "This paragraph is not the heading." }],
            },
            {
              type: "heading",
              attrs: { level: 2 },
              content: [{ type: "text", text: "Key issues" }],
            },
            {
              type: "heading",
              attrs: { level: 3 },
              content: [{ type: "text", text: "Limitation" }],
            },
          ],
        },
        "Fallback text should not win.",
      ).map((item) => item.label),
    ).toEqual(["Key issues", "Limitation"]);
  });

  it("round-trips a local document draft", () => {
    writeDocumentLocalDraft({
      documentId: "doc-1",
      filename: "draft.docx",
      savedAt: "2026-06-03T21:30:00Z",
      plainText: "Unsaved wording",
      json: {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "Unsaved wording" }] }],
      },
    });

    expect(readDocumentLocalDraft("doc-1")?.plainText).toBe("Unsaved wording");
    clearDocumentLocalDraft("doc-1");
    expect(readDocumentLocalDraft("doc-1")).toBeNull();
  });
});

describe("DocumentRichEditor surface", () => {
  it("renders grouped document editing controls on a page canvas", async () => {
    Object.assign(window.navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
    render(
      <DocumentRichEditor
        documentId="doc-1"
        filename="draft.docx"
        initialText="The employee was dismissed.\n\nThe grievance came later."
        latestVersionNumber={2}
        sourceLabel="extracted · 64 chars"
        onSaved={() => undefined}
      />,
    );

    expect(screen.getByTestId("document-editor")).toHaveTextContent("Document editor");
    expect(screen.getByTestId("document-editor-canvas")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Underline" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Insert table" })).toBeInTheDocument();
    expect(screen.getByTestId("document-editor-stats")).toHaveTextContent("words");
    expect(screen.getByRole("button", { name: "Copy text" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download text" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Copy text" }));
    await waitFor(() => {
      expect(window.navigator.clipboard.writeText).toHaveBeenCalledWith(
        expect.stringContaining("The employee was dismissed."),
      );
    });
    expect(screen.getByTestId("document-editor-copy-status")).toHaveTextContent(
      "Copied working text",
    );
  });

  it("lets the reader move through find results", async () => {
    render(
      <DocumentRichEditor
        documentId="doc-1"
        filename="draft.docx"
        initialText="Clause one.\n\nClause two.\n\nClause three."
        sourceLabel="extracted · 39 chars"
        onSaved={() => undefined}
      />,
    );

    fireEvent.change(await screen.findByLabelText("Find"), {
      target: { value: "Clause" },
    });
    expect(screen.getByTestId("document-editor-find-count")).toHaveTextContent("3 matches");
    expect(screen.getByTestId("document-editor-find-position")).toHaveTextContent("1 / 3");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByTestId("document-editor-find-position")).toHaveTextContent("2 / 3");
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    expect(screen.getByTestId("document-editor-find-position")).toHaveTextContent("1 / 3");
    expect(screen.getByTestId("document-editor-find-preview")).toHaveTextContent(
      "Match 1 / 3:",
    );
    fireEvent.keyDown(screen.getByLabelText("Find"), { key: "Enter" });
    expect(screen.getByTestId("document-editor-find-position")).toHaveTextContent("2 / 3");
    fireEvent.keyDown(screen.getByLabelText("Find"), { key: "Enter", shiftKey: true });
    expect(screen.getByTestId("document-editor-find-position")).toHaveTextContent("1 / 3");
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

    const find = await screen.findByLabelText("Find");
    fireEvent.keyDown(window, { key: "f", metaKey: true });
    expect(find).toHaveFocus();
  });

  it("surfaces the selected passage as a review-note action", async () => {
    const onCreateNoteFromSelection = vi.fn();
    render(
      <DocumentRichEditor
        documentId="doc-1"
        filename="draft.docx"
        initialText="The dismissal letter mentioned a single social-media post."
        sourceLabel="extracted · 60 chars"
        selectedQuote="single social-media post"
        selectedQuoteAnchored
        onCreateNoteFromSelection={onCreateNoteFromSelection}
        onSaved={() => undefined}
      />,
    );

    expect(await screen.findByTestId("document-editor-selected-passage")).toHaveTextContent(
      "single social-media post",
    );
    expect(screen.getByTestId("document-editor-selected-passage")).toHaveTextContent(
      "Anchored",
    );
    fireEvent.click(screen.getByRole("button", { name: "Add review note" }));
    expect(onCreateNoteFromSelection).toHaveBeenCalledTimes(1);
  });
});
