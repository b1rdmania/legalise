import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

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
  it("surfaces review-note counts in the document list", () => {
    render(
      <DocumentsTab
        slug="khan"
        docs={[
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
          },
        ]}
        onUpload={vi.fn()}
      />,
    );

    expect(screen.getAllByText("Notes").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("2 notes")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Documents in this project" })).toBeInTheDocument();
    expect(screen.getByText("Open workbench")).toBeInTheDocument();
    expect(screen.getAllByText("Files")[0]).toBeInTheDocument();
    expect(screen.getAllByText("1K")[0]).toBeInTheDocument();
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
