import { useEffect, useMemo, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

type PdfSearchHit = {
  page: number;
  preview: string;
};

type LoadedPdf = {
  numPages: number;
  getPage: (pageNumber: number) => Promise<{
    getTextContent: () => Promise<{
      items: unknown[];
    }>;
  }>;
};

function normalise(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function previewAround(text: string, index: number, length: number): string {
  const start = Math.max(0, index - 80);
  const end = Math.min(text.length, index + length + 120);
  return text.slice(start, end).replace(/\s+/g, " ").trim();
}

export function PdfDocumentViewer({
  fileUrl,
  filename,
  sourceHighlight,
}: {
  fileUrl: string;
  filename: string;
  sourceHighlight?: string | null;
}) {
  const [numPages, setNumPages] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.15);
  const [error, setError] = useState<string | null>(null);
  const [pageTexts, setPageTexts] = useState<string[]>([]);
  const [query, setQuery] = useState(sourceHighlight?.trim() ?? "");
  const [loadingText, setLoadingText] = useState(false);

  const file = useMemo(
    () => ({ url: fileUrl, withCredentials: true }),
    [fileUrl],
  );
  const searchTerm = query.trim();
  const searchHits = useMemo<PdfSearchHit[]>(() => {
    const needle = normalise(searchTerm);
    if (needle.length < 3) return [];
    return pageTexts.flatMap((text, index) => {
      const normalisedText = normalise(text);
      const hitIndex = normalisedText.indexOf(needle);
      if (hitIndex === -1) return [];
      return [
        {
          page: index + 1,
          preview: previewAround(text, hitIndex, needle.length),
        },
      ];
    });
  }, [pageTexts, searchTerm]);

  useEffect(() => {
    setQuery(sourceHighlight?.trim() ?? "");
  }, [sourceHighlight]);

  async function extractText(pdf: LoadedPdf) {
    setLoadingText(true);
    try {
      const texts: string[] = [];
      for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex += 1) {
        const page = await pdf.getPage(pageIndex);
        const content = await page.getTextContent();
        texts.push(
          content.items
            .map((item) =>
              item && typeof item === "object" && "str" in item
                ? String(item.str)
                : "",
            )
            .filter(Boolean)
            .join(" "),
        );
      }
      setPageTexts(texts);
      const needle = normalise(sourceHighlight ?? "");
      if (needle.length >= 3) {
        const first = texts.findIndex((text) => normalise(text).includes(needle));
        if (first !== -1) setPageNumber(first + 1);
      }
    } finally {
      setLoadingText(false);
    }
  }

  return (
    <section
      className="border border-rule bg-paper"
      data-testid="pdf-document-viewer"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-rule px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-ink">PDF reader</h2>
          <p className="mt-0.5 text-xs text-muted">
            {filename} · audited original proxy · selectable text layer
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <button
            type="button"
            onClick={() => setPageNumber((v) => Math.max(1, v - 1))}
            disabled={pageNumber <= 1}
            className="border border-rule px-3 py-2 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Previous
          </button>
          <span className="min-w-24 text-center text-xs text-muted">
            Page {pageNumber} / {numPages || "?"}
          </span>
          <button
            type="button"
            onClick={() => setPageNumber((v) => Math.min(numPages || v, v + 1))}
            disabled={!numPages || pageNumber >= numPages}
            className="border border-rule px-3 py-2 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next
          </button>
          <button
            type="button"
            onClick={() => setScale((v) => Math.max(0.8, Number((v - 0.1).toFixed(2))))}
            className="border border-rule px-3 py-2"
          >
            -
          </button>
          <button
            type="button"
            onClick={() => setScale((v) => Math.min(1.8, Number((v + 0.1).toFixed(2))))}
            className="border border-rule px-3 py-2"
          >
            +
          </button>
        </div>
      </div>

      <div className="border-b border-rule bg-paper-sunken px-5 py-4">
        <label className="text-[11px] font-semibold uppercase tracking-track2 text-muted">
          Find in PDF
        </label>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search text in this PDF"
            className="min-h-[40px] min-w-[260px] flex-1 border border-rule bg-paper px-3 text-sm outline-none focus:border-ink"
          />
          <span className="text-xs text-muted">
            {loadingText
              ? "Indexing text..."
              : searchTerm.length >= 3
                ? `${searchHits.length} page${searchHits.length === 1 ? "" : "s"}`
                : "Type 3+ characters"}
          </span>
        </div>
        {searchHits.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {searchHits.slice(0, 8).map((hit) => (
              <button
                key={`${hit.page}-${hit.preview}`}
                type="button"
                onClick={() => setPageNumber(hit.page)}
                className="border border-rule bg-paper px-3 py-2 text-left text-xs hover:border-ink"
                title={hit.preview}
              >
                Page {hit.page}
              </button>
            ))}
          </div>
        )}
      </div>

      {error && (
        <div className="border-b border-red-300 bg-red-50 px-5 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="flex max-h-[760px] justify-center overflow-auto bg-neutral-100 px-4 py-6">
        <Document
          file={file}
          loading={<p className="text-sm text-muted">Loading PDF...</p>}
          error={<p className="text-sm text-red-700">Could not render this PDF.</p>}
          onLoadError={(err) => setError(err.message)}
          onLoadSuccess={(pdf) => {
            setError(null);
            setNumPages(pdf.numPages);
            setPageNumber(1);
            void extractText(pdf);
          }}
        >
          <Page
            pageNumber={pageNumber}
            scale={scale}
            renderAnnotationLayer
            renderTextLayer
          />
        </Document>
      </div>
    </section>
  );
}
