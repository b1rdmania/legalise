// CitationsSidebar - list of saved matter_citations.
//
// Imperatively refreshable via `refreshKey` so the parent tab can bump it
// when a card is cited from the search results panel.

import { useEffect, useState } from "react";
import { MatterCitationRead, deleteCitation, listCitations } from "./api";
import { ErrorCallout } from "../../ui/primitives";

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
      const msg = e instanceof Error ? e.message : String(e);
      setError(`Could not load cited authorities. ${msg}`);
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
      const msg = e instanceof Error ? e.message : String(e);
      setError(`Could not remove citation. ${msg}`);
    }
  };

  return (
    <div className="space-y-3">
      <div className="eyebrow">Cited authorities</div>
      {error && <ErrorCallout message={error} compact />}
      {rows === null ? (
        <div className="text-xs text-muted">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="text-xs text-muted">
          No citations saved yet. Cite a search result to pin it here.
        </div>
      ) : (
        <ul className="space-y-2 list-none pl-0">
          {rows.map((c) => (
            <li
              key={c.id}
              className="border border-rule p-3 bg-paper"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1 min-w-0">
                  <div className="text-sm font-semibold text-ink truncate">
                    {c.case_name || "(unnamed)"}
                  </div>
                  <div className="text-xs font-mono text-prose truncate">
                    {c.citation_ref}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onDelete(c.id)}
                  className="shrink-0 text-xs text-muted hover:text-ink transition-colors"
                >
                  Remove
                </button>
              </div>
              {c.source_url && (
                <a
                  href={c.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-[#0066CC] hover:underline mt-1 inline-block"
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
