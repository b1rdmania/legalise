import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

import { PdfDocumentViewer } from "./PdfDocumentViewer";

const mockPdfState = vi.hoisted(() => ({ loaded: false }));

const getTextContentForPage = vi.fn(async (pageNumber: number) => ({
  items:
    pageNumber === 1
      ? [
          { str: "The dismissal letter mentioned" },
          { str: "a single social-media post" },
        ]
      : [{ str: "A second page without the target phrase." }],
}));

vi.mock("react-pdf", () => ({
  pdfjs: { GlobalWorkerOptions: { workerSrc: "" } },
  Document: ({
    children,
    onLoadSuccess,
  }: {
    children: ReactNode;
    onLoadSuccess: (pdf: {
      numPages: number;
      getPage: (pageNumber: number) => Promise<{
        getTextContent: () => ReturnType<typeof getTextContentForPage>;
      }>;
    }) => void;
  }) => {
    if (!mockPdfState.loaded) {
      mockPdfState.loaded = true;
      queueMicrotask(() => {
        onLoadSuccess({
          numPages: 2,
          getPage: async (pageNumber) => ({
            getTextContent: () => getTextContentForPage(pageNumber),
          }),
        });
      });
    }
    return <div data-testid="mock-pdf-document">{children}</div>;
  },
  Page: ({ pageNumber }: { pageNumber: number }) => (
    <div data-testid="mock-pdf-page">Page {pageNumber}</div>
  ),
}));

vi.mock("react-pdf/dist/Page/AnnotationLayer.css", () => ({}));
vi.mock("react-pdf/dist/Page/TextLayer.css", () => ({}));

describe("PdfDocumentViewer", () => {
  it("renders a searchable PDF reader shell", async () => {
    mockPdfState.loaded = false;
    render(
      <PdfDocumentViewer
        fileUrl="/api/documents/doc-1/original"
        filename="dismissal-letter.pdf"
        sourceHighlight="single social-media post"
      />,
    );

    expect(screen.getByText("PDF reader")).toBeInTheDocument();
    expect(screen.getByText(/dismissal-letter.pdf/)).toBeInTheDocument();
    expect(screen.getByTestId("mock-pdf-page")).toHaveTextContent("Page 1");

    await waitFor(() => {
      expect(screen.getByText("1 page · 1 / 1")).toBeInTheDocument();
    });

    await userEvent.clear(screen.getByPlaceholderText("Search text in this PDF"));
    await userEvent.type(screen.getByPlaceholderText("Search text in this PDF"), "dismissal");
    await waitFor(() => {
      expect(screen.getByText("1 page · 1 / 1")).toBeInTheDocument();
    });
    await userEvent.keyboard("{Enter}");
    expect(screen.getByText("1 page · 1 / 1")).toBeInTheDocument();
  });
});
