import { useEffect, useRef, useState, type KeyboardEvent } from "react";

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

type WordOutlineItem = {
  id: string;
  label: string;
  level: number;
};

function previewAround(text: string, index: number, length: number): string {
  const start = Math.max(0, index - 80);
  const end = Math.min(text.length, index + length + 120);
  return text.slice(start, end).replace(/\s+/g, " ").trim();
}

function clearDocxSearchHighlights(root: HTMLElement): void {
  const marks = Array.from(root.querySelectorAll("mark[data-docx-search-hit]"));
  for (const mark of marks) {
    const text = document.createTextNode(mark.textContent ?? "");
    mark.replaceWith(text);
    text.parentElement?.normalize();
  }
}

function applyDocxSearchHighlights(root: HTMLElement, query: string): HTMLElement[] {
  clearDocxSearchHighlights(root);
  const needle = query.trim().toLowerCase();
  if (needle.length < 3) return [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let current = walker.nextNode();
  while (current) {
    if (current.textContent?.trim()) textNodes.push(current as Text);
    current = walker.nextNode();
  }

  const marks: HTMLElement[] = [];
  for (const node of textNodes) {
    const value = node.nodeValue ?? "";
    const lower = value.toLowerCase();
    let from = 0;
    const fragment = document.createDocumentFragment();
    let changed = false;
    while (from < value.length) {
      const index = lower.indexOf(needle, from);
      if (index === -1) break;
      changed = true;
      if (index > from) {
        fragment.appendChild(document.createTextNode(value.slice(from, index)));
      }
      const mark = document.createElement("mark");
      mark.dataset.docxSearchHit = String(marks.length);
      mark.className = "legalise-docx-search-hit";
      mark.textContent = value.slice(index, index + needle.length);
      marks.push(mark);
      fragment.appendChild(mark);
      from = index + needle.length;
      if (marks.length >= 50) break;
    }
    if (!changed) continue;
    if (from < value.length) {
      fragment.appendChild(document.createTextNode(value.slice(from)));
    }
    node.replaceWith(fragment);
    if (marks.length >= 50) break;
  }
  return marks;
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
  const [viewMode, setViewMode] = useState<"paper" | "wide">("paper");
  const [activeHitIndex, setActiveHitIndex] = useState(0);
  const [outline, setOutline] = useState<WordOutlineItem[]>([]);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const searchTerm = query.trim();
  const searchHits = (() => {
    const needle = searchTerm.toLowerCase();
    const haystack = renderedText.toLowerCase();
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
    setActiveHitIndex(0);
  }, [query]);

  useEffect(() => {
    if (activeHitIndex >= searchHits.length) setActiveHitIndex(0);
  }, [activeHitIndex, searchHits.length]);

  useEffect(() => {
    const root = containerRef.current;
    if (!root || state.status !== "ready") return;
    const marks = applyDocxSearchHighlights(root, searchTerm);
    marks.forEach((mark, index) => {
      mark.classList.toggle("legalise-docx-search-hit-active", index === activeHitIndex);
    });
    const active = marks[activeHitIndex];
    active?.scrollIntoView?.({ block: "center", behavior: "smooth" });
    return () => {
      if (root.isConnected) clearDocxSearchHighlights(root);
    };
  }, [activeHitIndex, searchTerm, state.status, renderedText]);

  const moveSearchHit = (direction: 1 | -1) => {
    if (searchHits.length === 0) return;
    setActiveHitIndex((current) =>
      (current + direction + searchHits.length) % searchHits.length,
    );
  };

  const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    moveSearchHit(event.shiftKey ? -1 : 1);
  };

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    if (!container) return;
    container.innerHTML = "";
    setOutline([]);
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
          const rendered = containerRef.current;
          setRenderedText(rendered?.textContent ?? "");
          const headings = Array.from(
            rendered?.querySelectorAll("h1,h2,h3") ?? [],
          ).slice(0, 16);
          setOutline(
            headings
              .map((heading, index) => {
                const level = Number(heading.tagName.slice(1));
                const label = heading.textContent?.trim().replace(/\s+/g, " ") ?? "";
                if (!label) return null;
                const id = `docx-outline-${index}`;
                heading.id = id;
                return { id, label, level };
              })
              .filter((item): item is WordOutlineItem => Boolean(item)),
          );
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
      className="border border-rule bg-paper"
      data-testid="document-docx-preview"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-rule px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-ink">Word reader</h2>
          <p className="mt-0.5 text-xs text-muted">
            Word preview rendered from the audited original file proxy.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="mr-1 max-w-52 truncate text-xs font-medium text-muted">
            {filename}
          </span>
          <button
            type="button"
            onClick={() => setViewMode("paper")}
            className={`border px-3 py-2 text-xs font-medium ${
              viewMode === "paper"
                ? "border-ink bg-ink text-paper"
                : "border-rule text-muted hover:border-ink hover:text-ink"
            }`}
          >
            Paper
          </button>
          <button
            type="button"
            onClick={() => setViewMode("wide")}
            className={`border px-3 py-2 text-xs font-medium ${
              viewMode === "wide"
                ? "border-ink bg-ink text-paper"
                : "border-rule text-muted hover:border-ink hover:text-ink"
            }`}
          >
            Wide
          </button>
          <span className="border border-rule bg-paper-sunken px-2 py-1 text-[11px] uppercase tracking-track2 text-muted">
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
            onKeyDown={onSearchKeyDown}
            placeholder="Search text in this Word file"
            className="min-h-[40px] min-w-[260px] flex-1 border border-rule bg-paper px-3 text-sm outline-none focus:border-ink"
          />
          <span className="text-xs text-muted">
            {state.status === "loading"
              ? "Indexing text..."
              : searchTerm.length >= 3
                ? `${searchHits.length} match${searchHits.length === 1 ? "" : "es"}${
                    searchHits.length > 0 ? ` · ${activeHitIndex + 1} / ${searchHits.length}` : ""
                  }`
                : "Type 3+ characters"}
          </span>
        </div>
        {searchHits.length > 0 && (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {searchHits.map((hit, index) => (
              <div
                key={`${hit.index}-${hit.preview}`}
                className={`border bg-paper px-3 py-2 text-xs ${
                  index === activeHitIndex ? "border-ink" : "border-rule"
                }`}
              >
                <span className="block font-semibold text-ink">Match {index + 1}</span>
                <span className="mt-1 block max-h-12 overflow-hidden leading-5 text-muted">
                  {hit.preview}
                </span>
                {onQuoteSelected && (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveHitIndex(index);
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
        {searchTerm.length >= 3 && state.status === "ready" && searchHits.length === 0 && (
          <p className="mt-3 text-xs text-muted">No matches in the rendered Word text.</p>
        )}
      </div>
      <div className="grid max-h-[780px] grid-cols-1 overflow-hidden bg-paper-sunken lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside
          className="max-h-[220px] overflow-auto border-b border-rule bg-paper px-3 py-3 lg:max-h-none lg:border-b-0 lg:border-r"
          data-testid="document-docx-outline"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-track2 text-muted">
              Outline
            </p>
            <span className="text-xs text-muted">{outline.length}</span>
          </div>
          {outline.length === 0 ? (
            <p className="mt-3 text-xs leading-5 text-muted">
              No headings found in the rendered Word file.
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              {outline.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() =>
                    document.getElementById(item.id)?.scrollIntoView?.({
                      block: "start",
                      behavior: "smooth",
                    })
                  }
                  className="w-full border border-rule bg-paper-sunken px-3 py-2 text-left text-xs hover:border-ink"
                  style={{ paddingLeft: `${0.75 + (item.level - 1) * 0.5}rem` }}
                >
                  <span className="block font-semibold text-ink">{item.label}</span>
                </button>
              ))}
            </div>
          )}
        </aside>
        <div
          className="overflow-auto px-4 py-5"
          data-testid="document-docx-reader-canvas"
        >
          <div
            ref={containerRef}
            aria-label={`Original Word preview for ${filename}`}
            className={`legalise-docx-preview ${
              viewMode === "wide" ? "legalise-docx-preview-wide" : ""
            }`}
          />
        </div>
      </div>
    </section>
  );
}
