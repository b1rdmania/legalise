import { useEffect, useRef, useState } from "react";

import { fetchDocumentOriginalBlob } from "../../lib/api";
import { LoadingLine } from "../../ui/primitives";

type PreviewState =
  | { status: "loading" }
  | { status: "ready" }
  | { status: "error"; message: string };

export function DocxOriginalPreview({
  documentId,
  filename,
}: {
  documentId: string;
  filename: string;
}) {
  const [state, setState] = useState<PreviewState>({ status: "loading" });
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    if (!container) return;
    container.innerHTML = "";
    setState({ status: "loading" });

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
        if (!cancelled) setState({ status: "ready" });
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
        <span className="text-xs text-muted">{filename}</span>
      </div>
      {state.status === "loading" && (
        <div className="border-b border-rule px-5 py-3">
          <LoadingLine label="rendering Word document" />
        </div>
      )}
      {state.status === "error" && (
        <p className="border-b border-red-800 bg-red-50 px-5 py-3 text-sm text-red-900">
          {state.message}
        </p>
      )}
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
