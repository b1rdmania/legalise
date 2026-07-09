import { afterEach, describe, expect, it } from "vitest";

import {
  clearDocumentLocalDraft,
  documentOutlineFromJson,
  editorJsonToPlainText,
  documentStatsFromText,
  findNormalizedRange,
  findNormalizedRanges,
  isEditableWordDocument,
  readDocumentLocalDraft,
  type TiptapNode,
  textToEditorHtml,
  writeDocumentLocalDraft,
} from "./DocumentRichEditor";
import { resetDocumentEditorTestEnvironment } from "./DocumentRichEditor.test-utils";

const tableCell = (type: "tableCell" | "tableHeader", text: string): TiptapNode => ({
  type,
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});

afterEach(() => {
  resetDocumentEditorTestEnvironment();
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

  it("keeps checklist items readable in the plain-text fallback", () => {
    expect(
      editorJsonToPlainText({
        type: "doc",
        content: [
          {
            type: "taskList",
            content: [
              {
                type: "taskItem",
                attrs: { checked: false },
                content: [
                  { type: "paragraph", content: [{ type: "text", text: "Review source" }] },
                ],
              },
              {
                type: "taskItem",
                attrs: { checked: true },
                content: [
                  { type: "paragraph", content: [{ type: "text", text: "Check deadline" }] },
                ],
              },
            ],
          },
        ],
      }),
    ).toBe("[ ] Review source\n[x] Check deadline");
  });

  it("keeps image placeholders readable in the plain-text fallback", () => {
    expect(
      editorJsonToPlainText({
        type: "doc",
        content: [
          {
            type: "image",
            attrs: {
              src: "https://example.com/diagram.png",
              alt: "timeline diagram",
            },
          },
        ],
      }),
    ).toBe("[image: timeline diagram]");
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

  it("detects editable Word originals by extension or MIME type", () => {
    expect(isEditableWordDocument("lease.docx", null)).toBe(true);
    expect(
      isEditableWordDocument(
        "lease",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ),
    ).toBe(true);
    expect(isEditableWordDocument("lease.pdf", "application/pdf")).toBe(false);
  });
});
