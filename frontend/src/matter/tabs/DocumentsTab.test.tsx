import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { DocumentsTab } from "./DocumentsTab";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, params, ...props }: any) => (
    <a
      href={
        typeof to === "string"
          ? to
              .replace("$slug", params?.slug ?? "")
              .replace("$documentId", params?.documentId ?? "")
          : "#"
      }
      {...props}
    >
      {children}
    </a>
  ),
}));

afterEach(() => cleanup());

describe("DocumentsTab — document ingress", () => {
  const sampleDocs = [
    {
      id: "doc-1",
      matter_id: "matter-1",
      filename: "witness.docx",
      mime_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      size_bytes: 1200,
      sha256: "a".repeat(64),
      tag: "draft",
      from_disclosure: false,
      uploaded_at: "2026-06-03T10:00:00",
      uploaded_by_id: "u-1",
      comment_count: 2,
      open_comment_count: 1,
      version_count: 3,
      edit_count: 4,
      pending_edit_count: 2,
    },
    {
      id: "doc-2",
      matter_id: "matter-1",
      filename: "dismissal-letter.pdf",
      mime_type: "application/pdf",
      size_bytes: 2400,
      sha256: "b".repeat(64),
      tag: "disclosure",
      from_disclosure: true,
      uploaded_at: "2026-06-03T11:00:00",
      uploaded_by_id: "u-1",
      comment_count: 0,
      open_comment_count: 0,
      version_count: 1,
      edit_count: 0,
      pending_edit_count: 0,
    },
  ];

  it("surfaces review-note counts in the document list", () => {
    render(
      <DocumentsTab
        slug="khan"
        docs={[sampleDocs[0]]}
        onUpload={vi.fn()}
      />,
    );

    // P26 minimal list: statuses appear only when non-zero; chrome is gone.
    expect(screen.getByText("1 open note")).toBeInTheDocument();
    expect(screen.getByText("3 saved versions")).toBeInTheDocument();
    expect(screen.getByText("2 pending changes")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Documents" })).toBeInTheDocument();
    expect(screen.queryByText("Open workbench")).toBeNull();
    expect(screen.queryByText("Ready to review")).toBeNull();
  });

  it("searches and filters the document library without opening files", async () => {
    render(<DocumentsTab slug="khan" docs={sampleDocs} onUpload={vi.fn()} />);

    await userEvent.type(screen.getByPlaceholderText("Search files"), "dismissal");
    expect(screen.queryByText("witness.docx")).not.toBeInTheDocument();
    expect(screen.getByText("dismissal-letter.pdf")).toBeInTheDocument();

    await userEvent.clear(screen.getByPlaceholderText("Search files"));
    await userEvent.click(screen.getByRole("button", { name: "With notes" }));
    expect(screen.getByText("witness.docx")).toBeInTheDocument();
    expect(screen.queryByText("dismissal-letter.pdf")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Disclosure" }));
    expect(screen.queryByText("witness.docx")).not.toBeInTheDocument();
    expect(screen.getByText("dismissal-letter.pdf")).toBeInTheDocument();
  });

  it("uploads multiple selected files through the existing per-document audit path", async () => {
    const onUpload = vi.fn().mockResolvedValue(undefined);
    render(<DocumentsTab slug="khan" docs={[]} onUpload={onUpload} />);

    fireEvent.change(screen.getByLabelText("Upload documents"), {
      target: {
        files: [
          new File(["one"], "one.txt", { type: "text/plain" }),
          new File(["two"], "two.txt", { type: "text/plain" }),
        ],
      },
    });

    await waitFor(() => expect(onUpload).toHaveBeenCalledTimes(2));
    expect(onUpload).toHaveBeenNthCalledWith(1, expect.any(File), undefined, undefined);
    expect(onUpload).toHaveBeenNthCalledWith(2, expect.any(File), undefined, undefined);
    expect(screen.getByTestId("document-ingress-status")).toHaveTextContent(
      "2 documents uploaded",
    );
  });

  it("uses valid backend tag values instead of free-text tags", () => {
    render(<DocumentsTab slug="khan" docs={[]} onUpload={vi.fn()} />);

    expect(screen.getByLabelText(/tag/i)).toHaveDisplayValue("No tag");
    expect(screen.getByRole("option", { name: "Disclosure" })).toHaveValue(
      "disclosure",
    );
    expect(screen.getByRole("option", { name: "Signed" })).toHaveValue("signed");
  });
});
