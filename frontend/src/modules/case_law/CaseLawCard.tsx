// CaseLawCard — single result from the /case-law/search endpoint.
//
// "Cite into matter" persists the row into matter_citations via POST
// /citations. The composed citation_text is what survives — a stable string
// rather than the structured result fields — because v0.2 may swap result
// shapes when MCP transport lands.

import { useState } from "react";
import { CaseLawResult, createCitation } from "./api";

type Props = {
  slug: string;
  result: CaseLawResult;
  onCited: () => void;
};

function composeCitationText(r: CaseLawResult): string {
  const bits: string[] = [];
  if (r.case_name) bits.push(r.case_name);
  if (r.citation_ref) bits.push(r.citation_ref);
  if (r.court) bits.push(r.court);
  if (r.judgment_date) bits.push(r.judgment_date);
  const head = bits.join(" — ");
  return r.summary ? `${head}\n\n${r.summary}` : head;
}

export function CaseLawCard({ slug, result, onCited }: Props) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onCite = async () => {
    setBusy(true);
    setError(null);
    try {
      await createCitation(slug, {
        case_name: result.case_name,
        citation_ref: result.citation_ref,
        citation_text: composeCitationText(result),
        source_url: result.source_url,
      });
      setDone(true);
      onCited();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border border-neutral-200 rounded p-3 bg-white space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-0.5">
          <div className="font-medium text-sm">{result.case_name}</div>
          <div className="text-xs font-mono text-neutral-700">
            {result.citation_ref}
          </div>
          <div className="text-xs text-neutral-500">
            {[result.court, result.judgment_date].filter(Boolean).join(" · ")}
          </div>
        </div>
        <button
          type="button"
          onClick={onCite}
          disabled={busy || done}
          className="shrink-0 px-3 py-1 text-xs rounded bg-neutral-900 text-white disabled:opacity-50"
        >
          {done ? "Cited" : busy ? "Citing…" : "Cite into matter"}
        </button>
      </div>
      {result.summary && (
        <div className="text-sm text-neutral-700 whitespace-pre-wrap">
          {result.summary}
        </div>
      )}
      {result.source_url && (
        <div className="text-xs">
          <a
            href={result.source_url}
            target="_blank"
            rel="noreferrer"
            className="text-blue-700 underline"
          >
            Source
          </a>
        </div>
      )}
      {error && (
        <div className="text-xs text-red-700 border border-red-300 bg-red-50 rounded p-2">
          {error}
        </div>
      )}
    </div>
  );
}
