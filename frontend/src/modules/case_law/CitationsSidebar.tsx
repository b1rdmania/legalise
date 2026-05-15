// CitationsSidebar — list of saved matter_citations.
//
// Imperatively refreshable via `refreshKey` so the parent tab can bump it
// when a card is cited from the search results panel.

import { useEffect, useState } from "react";
import { MatterCitationRead, deleteCitation, listCitations } from "./api";

type Props = {
  slug: string;
  refreshKey: number;
  // Demo path: when supplied, skip the fetch and render directly.
  initialCitations?: MatterCitationRead[];
};

export function CitationsSidebar({ slug, refreshKey, initialCitations }: Props) {
  const [rows, setRows] = useState<MatterCitationRead[] | null>(
    initialCitations ?? null,
  );
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      const r = await listCitations(slug);
      setRows(r);
    } catch (e) {
      setError(String(e));
    }
  };

  useEffect(() => {
    if (initialCitations) return;
    load();
    // re-runs whenever refreshKey ticks
  }, [slug, refreshKey, initialCitations]);

  const onDelete = async (id: string) => {
    try {
      await deleteCitation(slug, id);
      await load();
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">Cited authorities</h3>
      {error && (
        <div className="text-xs text-red-700 border border-red-300 bg-red-50 rounded p-2">
          {error}
        </div>
      )}
      {rows === null ? (
        <div className="text-xs text-neutral-500">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="text-xs text-neutral-500">
          No citations saved yet. Cite a search result to pin it here.
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((c) => (
            <li
              key={c.id}
              className="border border-neutral-200 rounded p-2 bg-white"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-0.5 min-w-0">
                  <div className="text-sm font-medium truncate">
                    {c.case_name || "(unnamed)"}
                  </div>
                  <div className="text-xs font-mono text-neutral-600 truncate">
                    {c.citation_ref}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onDelete(c.id)}
                  className="shrink-0 text-xs text-red-700 hover:underline"
                >
                  Remove
                </button>
              </div>
              {c.source_url && (
                <a
                  href={c.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-blue-700 underline"
                >
                  Source
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
