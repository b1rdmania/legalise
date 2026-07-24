import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
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

function pagePreview(text: string): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (!compact) return "No selectable text indexed on this page.";
  if (compact.length <= 110) return compact;
  return `${compact.slice(0, 107).trimEnd()}...`;
}

export function PdfDocumentViewer({
  fileUrl,
  filename,
  sourceHighlight,
  onQuoteSelected,
}: {
  fileUrl: string;
  filename: string;
  sourceHighlight?: string | null;
  onQuoteSelected?: (quote: string) => void;
}) {
  const [numPages, setNumPages] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.15);
  const [error, setError] = useState<string | null>(null);
  const [pageTexts, setPageTexts] = useState<string[]>([]);
  const [query, setQuery] = useState(sourceHighlight?.trim() ?? "");
  const [loadingText, setLoadingText] = useState(false);
  const [activeHitIndex, setActiveHitIndex] = useState(0);

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

  useEffect(() => {
    setActiveHitIndex(0);
  }, [query]);

  useEffect(() => {
    if (activeHitIndex >= searchHits.length) setActiveHitIndex(0);
  }, [activeHitIndex, searchHits.length]);

  const moveSearchHit = (direction: 1 | -1) => {
    if (searchHits.length === 0) return;
    setActiveHitIndex((current) => {
      const next = (current + direction + searchHits.length) % searchHits.length;
      setPageNumber(searchHits[next].page);
      return next;
    });
  };

  const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    moveSearchHit(event.shiftKey ? -1 : 1);
  };

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
          <label className="sr-only" htmlFor={`pdf-page-${filename}`}>
            Jump to page
          </label>
          <input
            id={`pdf-page-${filename}`}
            type="number"
            min={1}
            max={numPages || undefined}
            value={pageNumber}
            onChange={(event) => {
              const next = Number(event.target.value);
              if (!Number.isFinite(next)) return;
              setPageNumber(Math.min(Math.max(1, next), numPages || next));
            }}
            className="h-10 w-20 border border-rule bg-paper px-2 text-center text-sm outline-hidden focus:border-ink"
          />
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
            onClick={() => setScale(1.15)}
            className="min-w-16 border border-rule px-3 py-2 text-xs text-muted hover:border-ink hover:text-ink"
          >
            {Math.round(scale * 100)}%
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
            onKeyDown={onSearchKeyDown}
            placeholder="Search text in this PDF"
            className="min-h-[40px] min-w-[260px] flex-1 border border-rule bg-paper px-3 text-sm outline-hidden focus:border-ink"
          />
          <span className="text-xs text-muted">
            {loadingText
              ? "Indexing text..."
              : searchTerm.length >= 3
                ? `${searchHits.length} page${searchHits.length === 1 ? "" : "s"}${
                    searchHits.length > 0 ? ` · ${activeHitIndex + 1} / ${searchHits.length}` : ""
                  }`
                : "Type 3+ characters"}
          </span>
        </div>
        {searchHits.length > 0 && (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {searchHits.slice(0, 8).map((hit, index) => (
              <div
                key={`${hit.page}-${hit.preview}`}
                className={`border bg-paper px-3 py-2 text-xs ${
                  index === activeHitIndex ? "border-ink" : "border-rule"
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    setActiveHitIndex(index);
                    setPageNumber(hit.page);
                  }}
                  className="block w-full text-left hover:text-ink"
                  title={hit.preview}
                >
                  <span className="block font-semibold text-ink">Page {hit.page}</span>
                  <span className="mt-1 block max-h-10 overflow-hidden leading-5 text-muted">
                    {hit.preview}
                  </span>
                </button>
                {onQuoteSelected && (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveHitIndex(index);
                      setPageNumber(hit.page);
                      onQuoteSelected(hit.preview);
                    }}
                    className="mt-2 font-medium text-ink underline underline-offset-4 hover:text-muted"
                  >
                    Quote in note
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        {searchTerm.length >= 3 && !loadingText && searchHits.length === 0 && (
          <p className="mt-3 text-xs text-muted">No matches in the indexed PDF text.</p>
        )}
      </div>

      {error && (
        <div className="border-b border-red-300 bg-red-50 px-5 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="grid max-h-[760px] grid-cols-1 overflow-hidden bg-neutral-100 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside
          className="max-h-[220px] overflow-auto border-b border-rule bg-paper px-3 py-3 lg:max-h-none lg:border-b-0 lg:border-r"
          data-testid="pdf-page-index"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-track2 text-muted">
              Pages
            </p>
            <span className="text-xs text-muted">{numPages || "?"}</span>
          </div>
          {numPages === 0 ? (
            <p className="mt-3 text-xs text-muted">Loading page index...</p>
          ) : (
            <div className="mt-3 space-y-2">
              {Array.from({ length: numPages }, (_, index) => index + 1).map((page) => (
                <button
                  key={page}
                  type="button"
                  onClick={() => setPageNumber(page)}
                  className={`w-full border px-3 py-2 text-left text-xs leading-5 ${
                    page === pageNumber
                      ? "border-ink bg-paper text-ink"
                      : "border-rule bg-paper-sunken text-muted hover:border-ink hover:text-ink"
                  }`}
                >
                  <span className="block font-semibold">Page {page}</span>
                  <span className="mt-1 block max-h-10 overflow-hidden">
                    {pagePreview(pageTexts[page - 1] ?? "")}
                  </span>
                </button>
              ))}
            </div>
          )}
        </aside>
        <div className="flex overflow-auto px-4 py-6 lg:justify-center">
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
      </div>
    </section>
  );
}
