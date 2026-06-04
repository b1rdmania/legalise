import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import {
  clearDocumentLocalDraft,
  DocumentRichEditor,
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

const tableCell = (type: "tableCell" | "tableHeader", text: string): TiptapNode => ({
  type,
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});

afterEach(() => {
  vi.useRealTimers();
  window.localStorage.clear();
  vi.restoreAllMocks();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

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

describe("DocumentRichEditor surface", () => {
  it("loads a shared server draft into the editor", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        document_id: "doc-1",
        updated_by_id: "user-1",
        updated_at: "2026-06-04T02:30:00Z",
        plain_text: "Server draft wording.",
        editor_json: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Server draft wording." }],
            },
          ],
        },
        base_version_id: "version-1",
        version_counter: 3,
        client_id: "client-1",
      }),
    );

    render(
      <DocumentRichEditor
        documentId="doc-1"
        filename="draft.txt"
        initialText="Extracted fallback."
        latestVersionNumber={2}
        latestVersionId="version-1"
        sourceLabel="extracted · 19 chars"
        onSaved={() => undefined}
      />,
    );

    expect(await screen.findByText("Server draft wording.")).toBeInTheDocument();
    expect(screen.getByTestId("document-editor")).toHaveTextContent("Shared draft saved · r3");
    expect(screen.getByTestId("document-working-diff")).toHaveTextContent("Unsaved changes");
    expect(screen.getByTestId("document-working-diff")).toHaveTextContent("Preview redline before saving");
  });

  it("refreshes a clean editor when a newer shared draft appears", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          document_id: "doc-1",
          updated_by_id: null,
          updated_at: null,
          plain_text: "Extracted fallback.",
          editor_json: null,
          base_version_id: "version-1",
          version_counter: 0,
          client_id: null,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          document_id: "doc-1",
          updated_by_id: "user-2",
          updated_at: "2026-06-04T03:10:00Z",
          plain_text: "Remote shared wording.",
          editor_json: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Remote shared wording." }],
              },
            ],
          },
          base_version_id: "version-1",
          version_counter: 1,
          client_id: "other-client",
        }),
      );

    render(
      <DocumentRichEditor
        documentId="doc-1"
        filename="draft.txt"
        initialText="Extracted fallback."
        latestVersionNumber={2}
        latestVersionId="version-1"
        sourceLabel="extracted · 19 chars"
        onSaved={() => undefined}
      />,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByTestId("document-editor-canvas")).toHaveTextContent(
      "Extracted fallback.",
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(screen.getByTestId("document-editor-canvas")).toHaveTextContent(
      "Remote shared wording.",
    );
    expect(screen.queryByTestId("document-remote-draft-notice")).toBeNull();
  });

  it("warns instead of overwriting when a newer shared draft appears over local edits", async () => {
    vi.useFakeTimers();
    writeDocumentLocalDraft({
      documentId: "doc-1",
      filename: "draft.txt",
      savedAt: "2026-06-04T03:00:00Z",
      plainText: "Local edit.",
      json: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Local edit." }],
          },
        ],
      },
    });
    let draftGetCount = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url = String(input);
      if (url.endsWith("/documents/doc-1/draft") && init?.method === "PUT") {
        return Promise.resolve(
          jsonResponse({
            document_id: "doc-1",
            updated_by_id: "user-1",
            updated_at: "2026-06-04T03:05:00Z",
            plain_text: "Local edit.",
            editor_json: {
              type: "doc",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Local edit." }],
                },
              ],
            },
            base_version_id: "version-1",
            version_counter: 1,
            client_id: "document-editor-test",
          }),
        );
      }
      if (url.endsWith("/documents/doc-1/draft") && !init?.method) {
        draftGetCount += 1;
        if (draftGetCount === 1) {
          return Promise.resolve(
            jsonResponse({
              document_id: "doc-1",
              updated_by_id: null,
              updated_at: null,
              plain_text: "Extracted fallback.",
              editor_json: null,
              base_version_id: "version-1",
              version_counter: 0,
              client_id: null,
            }),
          );
        }
        return Promise.resolve(
          jsonResponse({
            document_id: "doc-1",
            updated_by_id: "user-2",
            updated_at: "2026-06-04T03:10:00Z",
            plain_text: "Remote shared wording.",
            editor_json: {
              type: "doc",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Remote shared wording." }],
                },
              ],
            },
            base_version_id: "version-1",
            version_counter: 2,
            client_id: "other-client",
          }),
        );
      }
      return Promise.resolve(jsonResponse({ detail: "not found" }, 404));
    });

    render(
      <DocumentRichEditor
        documentId="doc-1"
        filename="draft.txt"
        initialText="Extracted fallback."
        latestVersionNumber={2}
        latestVersionId="version-1"
        sourceLabel="extracted · 19 chars"
        onSaved={() => undefined}
      />,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    fireEvent.click(screen.getByRole("button", { name: "Restore draft" }));
    expect(screen.getByTestId("document-editor-canvas")).toHaveTextContent("Local edit.");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });

    expect(screen.getByTestId("document-editor-canvas")).toHaveTextContent("Local edit.");
    expect(screen.getByTestId("document-editor-canvas")).not.toHaveTextContent(
      "Remote shared wording.",
    );
    expect(screen.getByTestId("document-remote-draft-notice")).toHaveTextContent(
      "A newer shared draft is available (r2).",
    );
  });

  it("saves by committing the shared working draft", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url = String(input);
      if (url.endsWith("/documents/doc-1/draft") && !init?.method) {
        return Promise.resolve(
          jsonResponse({
            document_id: "doc-1",
            updated_by_id: "user-1",
            updated_at: "2026-06-04T02:30:00Z",
            plain_text: "Server draft wording.",
            editor_json: {
              type: "doc",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Server draft wording." }],
                },
              ],
            },
            base_version_id: "version-1",
            version_counter: 3,
            client_id: "client-1",
          }),
        );
      }
      if (url.endsWith("/documents/doc-1/draft") && init?.method === "PUT") {
        return Promise.resolve(
          jsonResponse({
            document_id: "doc-1",
            updated_by_id: "user-1",
            updated_at: "2026-06-04T02:31:00Z",
            plain_text: "Server draft wording.",
            editor_json: {
              type: "doc",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Server draft wording." }],
                },
              ],
            },
            base_version_id: "version-1",
            version_counter: 4,
            client_id: "document-editor-test",
          }),
        );
      }
      if (url.endsWith("/documents/doc-1/draft/commit") && init?.method === "POST") {
        return Promise.resolve(
          jsonResponse({
            id: "version-2",
            document_id: "doc-1",
            version_number: 3,
            kind: "user_edit",
            created_by_id: "user-1",
            created_at: "2026-06-04T02:32:00Z",
            storage_uri: null,
            filename: "draft.docx",
            mime_type: "text/plain",
            size_bytes: 21,
            sha256: "abc",
            notes: "Edited draft.docx in Legalise document editor",
            resolved_text: "Server draft wording.",
            resolved_json: null,
          }),
        );
      }
      return Promise.resolve(jsonResponse({ detail: "not found" }, 404));
    });
    const onSaved = vi.fn();

    render(
      <DocumentRichEditor
        documentId="doc-1"
        filename="draft.docx"
        initialText="Extracted fallback."
        latestVersionNumber={2}
        latestVersionId="version-1"
        sourceLabel="extracted · 19 chars"
        onSaved={onSaved}
      />,
    );

    expect(await screen.findByText("Server draft wording.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save version" }));

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ id: "version-2" }));
    });
    const calledUrls = fetchMock.mock.calls.map(([input, init]) => ({
      url: String(input),
      method: init?.method ?? "GET",
    }));
    expect(calledUrls).toContainEqual({ url: "/api/documents/doc-1/draft", method: "PUT" });
    expect(calledUrls).toContainEqual({
      url: "/api/documents/doc-1/draft/commit",
      method: "POST",
    });
    expect(calledUrls.some((call) => call.url.endsWith("/versions/manual"))).toBe(false);
  });

  it("surfaces shared-draft conflicts when saving a version", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url = String(input);
      if (url.endsWith("/documents/doc-1/draft") && !init?.method) {
        return Promise.resolve(
          jsonResponse({
            document_id: "doc-1",
            updated_by_id: "user-1",
            updated_at: "2026-06-04T02:30:00Z",
            plain_text: "Server draft wording.",
            editor_json: {
              type: "doc",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Server draft wording." }],
                },
              ],
            },
            base_version_id: "version-1",
            version_counter: 3,
            client_id: "client-1",
          }),
        );
      }
      if (url.endsWith("/documents/doc-1/draft") && init?.method === "PUT") {
        return Promise.resolve(
          jsonResponse({
            document_id: "doc-1",
            updated_by_id: "user-1",
            updated_at: "2026-06-04T02:31:00Z",
            plain_text: "Server draft wording.",
            editor_json: {
              type: "doc",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Server draft wording." }],
                },
              ],
            },
            base_version_id: "version-1",
            version_counter: 4,
            client_id: "document-editor-test",
          }),
        );
      }
      if (url.endsWith("/documents/doc-1/draft/commit") && init?.method === "POST") {
        return Promise.resolve(
          jsonResponse(
            {
              detail: {
                error: "working_draft_conflict",
                message: "The shared draft changed before this version save.",
                current_version_counter: 5,
                current_client_id: "client-2",
              },
            },
            409,
          ),
        );
      }
      return Promise.resolve(jsonResponse({ detail: "not found" }, 404));
    });

    render(
      <DocumentRichEditor
        documentId="doc-1"
        filename="draft.docx"
        initialText="Extracted fallback."
        latestVersionNumber={2}
        latestVersionId="version-1"
        sourceLabel="extracted · 19 chars"
        onSaved={() => undefined}
      />,
    );

    expect(await screen.findByText("Server draft wording.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save version" }));

    expect(await screen.findByTestId("document-server-draft-error")).toHaveTextContent(
      "The shared draft changed before this version save.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Reload shared draft" }));
    await waitFor(() => {
      expect(screen.queryByTestId("document-server-draft-error")).toBeNull();
    });
    expect(screen.getByTestId("document-editor")).toHaveTextContent("Shared draft saved · r3");
  });

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
    expect(screen.getByRole("button", { name: "Link" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove link" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Ink text" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Red text" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove text colour" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Align left" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Align centre" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Align right" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Insert image" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Insert table" })).toBeInTheDocument();
    expect(screen.getByTestId("document-editor-stats")).toHaveTextContent("words");
    expect(screen.getByRole("button", { name: "Copy text" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download text" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download DOCX" })).toBeDisabled();
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

    const find = await screen.findByLabelText("Find");
    fireEvent.keyDown(window, { key: "f", metaKey: true });
    expect(find).toHaveFocus();
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
    await waitFor(() => {
      expect(window.navigator.clipboard.writeText).toHaveBeenCalledWith(
        "single social-media post",
      );
    });
    expect(screen.getByTestId("document-editor-copy-status")).toHaveTextContent(
      "Copied selected passage",
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
