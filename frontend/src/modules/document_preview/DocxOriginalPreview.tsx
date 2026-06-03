import { useEffect, useRef, useState } from "react";

import { fetchDocumentOriginalBlob } from "../../lib/api";
import { LoadingLine } from "../../ui/primitives";

type PreviewState =
  | { status: "loading" }
  | { status: "ready" }
  | { status: "error"; message: string };

type DocxSearchHit = {
  index: number;
  preview: string;
};

function normalise(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function previewAround(text: string, index: number, length: number): string {
  const start = Math.max(0, index - 80);
  const end = Math.min(text.length, index + length + 120);
  return text.slice(start, end).replace(/\s+/g, " ").trim();
}

export function DocxOriginalPreview({
  documentId,
  filename,
  sourceHighlight,
  onQuoteSelected,
}: {
  documentId: string;
  filename: string;
  sourceHighlight?: string | null;
  onQuoteSelected?: (quote: string) => void;
}) {
  const [state, setState] = useState<PreviewState>({ status: "loading" });
  const [renderedText, setRenderedText] = useState("");
  const [query, setQuery] = useState(sourceHighlight?.trim() ?? "");
  const containerRef = useRef<HTMLDivElement | null>(null);

  const searchTerm = query.trim();
  const searchHits = (() => {
    const needle = normalise(searchTerm);
    const haystack = normalise(renderedText);
    if (needle.length < 3 || !haystack) return [] as DocxSearchHit[];
    const hits: DocxSearchHit[] = [];
    let from = 0;
    while (from < haystack.length && hits.length < 8) {
      const index = haystack.indexOf(needle, from);
      if (index === -1) break;
      hits.push({
        index,
        preview: previewAround(renderedText, index, needle.length),
      });
      from = index + Math.max(needle.length, 1);
    }
    return hits;
  })();

  useEffect(() => {
    setQuery(sourceHighlight?.trim() ?? "");
  }, [sourceHighlight]);

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    if (!container) return;
    container.innerHTML = "";
    setState({ status: "loading" });
    setRenderedText("");

    fetchDocumentOriginalBlob(documentId)
      .then(async (blob) => {
        if (cancelled || !containerRef.current) return;
        containerRef.current.innerHTML = "";
        const { renderAsync } = await import("docx-preview");
        if (cancelled || !containerRef.current) return;
        await renderAsync(blob, containerRef.current, undefined, {
          className: "legalise-docx",
          inWrapper: true,
          ignoreWidth: false,
          ignoreHeight: false,
          breakPages: true,
          renderHeaders: true,
          renderFooters: true,
          renderFootnotes: true,
          renderEndnotes: true,
          renderComments: false,
          renderChanges: false,
          useBase64URL: true,
        });
        if (!cancelled) {
          setRenderedText(containerRef.current?.textContent ?? "");
          setState({ status: "ready" });
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({
          status: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [documentId]);

  return (
    <section
      className="mt-6 border border-rule bg-paper"
      data-testid="document-docx-preview"
    >
      <div className="flex items-center justify-between gap-3 border-b border-rule px-5 py-3">
        <div>
          <h2 className="text-sm font-semibold text-ink">Original preview</h2>
          <p className="mt-0.5 text-xs text-muted">
            Word preview rendered from the audited original file proxy.
          </p>
        </div>
        <div className="text-right">
          <span className="block text-xs font-medium text-ink">{filename}</span>
          <span className="mt-1 block text-[11px] uppercase tracking-track2 text-muted">
            {state.status === "ready"
              ? "Rendered"
              : state.status === "loading"
                ? "Rendering"
                : "Preview failed"}
          </span>
        </div>
      </div>
      {state.status === "loading" && (
        <div className="border-b border-rule px-5 py-3">
          <LoadingLine label="rendering Word document" />
        </div>
      )}
      {state.status === "error" && (
        <div className="border-b border-red-800 bg-red-50 px-5 py-3 text-sm text-red-900">
          <p>Could not render the Word preview.</p>
          <p className="mt-1 text-xs">{state.message}</p>
        </div>
      )}
      <div className="border-b border-rule bg-paper-sunken px-5 py-4">
        <label className="text-[11px] font-semibold uppercase tracking-track2 text-muted">
          Find in Word
        </label>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search text in this Word file"
            className="min-h-[40px] min-w-[260px] flex-1 border border-rule bg-paper px-3 text-sm outline-none focus:border-ink"
          />
          <span className="text-xs text-muted">
            {state.status === "loading"
              ? "Indexing text..."
              : searchTerm.length >= 3
                ? `${searchHits.length} match${searchHits.length === 1 ? "" : "es"}`
                : "Type 3+ characters"}
          </span>
        </div>
        {searchHits.length > 0 && (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {searchHits.map((hit, index) => (
              <div
                key={`${hit.index}-${hit.preview}`}
                className="border border-rule bg-paper px-3 py-2 text-xs"
              >
                <span className="block font-semibold text-ink">Match {index + 1}</span>
                <span className="mt-1 block max-h-12 overflow-hidden leading-5 text-muted">
                  {hit.preview}
                </span>
                {onQuoteSelected && (
                  <button
                    type="button"
                    onClick={() => onQuoteSelected(hit.preview)}
                    className="mt-2 font-medium text-ink underline underline-offset-4 hover:text-muted"
                  >
                    Quote in note
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        {searchTerm.length >= 3 && state.status === "ready" && searchHits.length === 0 && (
          <p className="mt-3 text-xs text-muted">No matches in the rendered Word text.</p>
        )}
      </div>
      <div className="max-h-[780px] overflow-auto bg-paper-sunken px-4 py-5">
        <div
          ref={containerRef}
          aria-label={`Original Word preview for ${filename}`}
          className="legalise-docx-preview"
        />
      </div>
    </section>
  );
}
