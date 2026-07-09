import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { DocumentRichEditor, writeDocumentLocalDraft } from "./DocumentRichEditor";
import { jsonResponse, resetDocumentEditorTestEnvironment } from "./DocumentRichEditor.test-utils";

afterEach(() => {
  resetDocumentEditorTestEnvironment();
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
    const saveButton = screen.getByRole("button", { name: "Save version" });
    await waitFor(() => expect(saveButton).toBeEnabled());
    fireEvent.click(saveButton);

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
    const saveButton = screen.getByRole("button", { name: "Save version" });
    await waitFor(() => expect(saveButton).toBeEnabled());
    fireEvent.click(saveButton);

    expect(await screen.findByTestId("document-server-draft-error")).toHaveTextContent(
      "The shared draft changed before this version save.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Reload shared draft" }));
    await waitFor(() => {
      expect(screen.queryByTestId("document-server-draft-error")).toBeNull();
    });
    expect(screen.getByTestId("document-editor")).toHaveTextContent("Shared draft saved · r3");
  });

  it("renders a single-row command bar with summoned format tools (P25)", async () => {
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

    expect(screen.getByTestId("document-editor-canvas")).toBeInTheDocument();
    // P25: no narration chrome.
    expect(screen.queryByText("Working copy")).toBeNull();
    expect(screen.queryByText(/Every save creates a new version/)).toBeNull();
    expect(screen.queryByText(/Cmd\/Ctrl\+S saves/)).toBeNull();
    expect(screen.queryByTestId("document-editor-stats")).toBeNull();
    // Find is summoned, not standing.
    expect(screen.queryByTestId("document-editor-find-panel")).toBeNull();
    // Format tools are summoned from the single row.
    // Generous timeouts: tiptap mount under parallel CI load exceeds the
    // 1s default (same class as the deflaked trio).
    fireEvent.click(
      await screen.findByRole("button", { name: "Format" }, { timeout: 5000 }),
    );
    expect(
      await screen.findByRole("button", { name: "Underline" }, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Link" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove link" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Align left" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upload image" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Insert table" })).toBeInTheDocument();
    // Secondary actions live in the single More overflow.
    expect(screen.getByRole("button", { name: "Copy text" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download text" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download DOCX" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Copy text" }));
    await waitFor(
      () => {
        expect(window.navigator.clipboard.writeText).toHaveBeenCalledWith(
          expect.stringContaining("The employee was dismissed."),
        );
      },
      { timeout: 5000 },
    );
    // The status line renders from a state update after the clipboard
    // promise resolves — assert inside a wait or it races under
    // parallel CI load (the PR #184 deflake class).
    await waitFor(
      () => {
        expect(screen.getByTestId("document-editor-copy-status")).toHaveTextContent(
          "Copied working text",
        );
      },
      { timeout: 5000 },
    );
  });

  it("uploads an image asset before inserting it into the editor", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url = String(input);
      if (url.endsWith("/documents/doc-1/draft") && !init?.method) {
        return Promise.resolve(
          jsonResponse({
            document_id: "doc-1",
            updated_by_id: null,
            updated_at: null,
            plain_text: "Existing text.",
            editor_json: null,
            base_version_id: "version-1",
            version_counter: 0,
            client_id: null,
          }),
        );
      }
      if (url.endsWith("/documents/doc-1/assets") && init?.method === "POST") {
        expect(init.body).toBeInstanceOf(FormData);
        return Promise.resolve(
          jsonResponse({
            id: "asset-1",
            filename: "diagram.png",
            mime_type: "image/png",
            size_bytes: 7,
            sha256: "abc",
            url: "/api/documents/doc-1/assets/asset-1/diagram.png",
          }),
        );
      }
      return Promise.resolve(jsonResponse({ detail: "not found" }, 404));
    });

    render(
      <DocumentRichEditor
        documentId="doc-1"
        filename="draft.docx"
        initialText="Existing text."
        latestVersionNumber={2}
        latestVersionId="version-1"
        sourceLabel="extracted · 14 chars"
        onSaved={() => undefined}
      />,
    );

    expect(await screen.findByTestId("document-editor-canvas")).toHaveTextContent(
      "Existing text.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Format" }));
    const file = new File(["diagram"], "diagram.png", { type: "image/png" });
    fireEvent.change(screen.getByTestId("document-image-upload-input"), {
      target: { files: [file] },
    });

    expect(await screen.findByAltText("diagram.png")).toHaveAttribute(
      "src",
      "/api/documents/doc-1/assets/asset-1/diagram.png",
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/documents/doc-1/assets",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
