// ReviewList - landing surface for the Reviews tab.
//
// Lists existing reviews for a matter, lets the user create a new one,
// and emits selection events the host (ReviewsTab) routes to an editor.

import { useEffect, useState } from "react";
import {
  ReviewSummary,
  listReviews,
  createReview,
  deleteReview,
} from "./api";

type Props = {
  slug: string;
  onSelect: (reviewId: string) => void;
  // Demo path: when supplied, skip the fetch and render directly.
  initialReviews?: ReviewSummary[];
};

export function ReviewList({ slug, onSelect, initialReviews }: Props) {
  const [items, setItems] = useState<ReviewSummary[] | null>(
    initialReviews ?? null,
  );
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const rows = await listReviews(slug);
      setItems(rows);
    } catch (e) {
      setError(String(e));
    }
  };

  useEffect(() => {
    if (initialReviews) return;
    load();
  }, [slug, initialReviews]);

  const onCreate = async () => {
    if (!newTitle.trim()) return;
    setBusy(true);
    try {
      const r = await createReview(slug, { title: newTitle.trim(), columns_config: [] });
      setNewTitle("");
      setCreating(false);
      await load();
      onSelect(r.id);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (id: string) => {
    if (!confirm("Delete this review?")) return;
    try {
      await deleteReview(slug, id);
      await load();
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <div className="max-w-4xl">
      <div className="mb-10 pb-8 border-b border-rule">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="eyebrow mb-3">03 · Reviews</div>
            <h2 className="text-2xl font-bold tracking-tight2 text-ink mb-3">
              Tabular reviews
            </h2>
            <p className="text-sm text-prose max-w-2xl leading-relaxed">
              Run a structured column set across a document set. One row
              per document, one column per question. Cell answers cite back
              to the source passage.
            </p>
          </div>
          <button
            className="border border-rule hover:border-ink text-ink px-4 py-2 hover:bg-wash transition-colors text-sm font-medium min-h-[40px] shrink-0"
            onClick={() => setCreating((c) => !c)}
          >
            {creating ? "Cancel" : "New review"}
          </button>
        </div>
      </div>

      {creating && (
        <div className="flex gap-2 mb-6">
          <input
            autoFocus
            className="flex-1 bg-paper border border-rule px-3 py-2 text-sm focus:border-ink focus:outline-none transition-colors min-h-[40px] font-sans text-ink"
            placeholder="Review title (e.g. Acme correspondence - disclosure relevance)"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onCreate()}
          />
          <button
            className="bg-ink text-paper px-4 py-2 hover:bg-black transition-colors text-sm font-medium min-h-[40px] disabled:opacity-40 disabled:cursor-not-allowed"
            onClick={onCreate}
            disabled={busy || !newTitle.trim()}
          >
            Create
          </button>
        </div>
      )}

      {error && (
        <div className="border border-[#D9304F] bg-[#FEF2F2] p-4 text-sm text-[#B91C1C] mb-6">
          {error}
        </div>
      )}

      {items === null ? (
        <div className="text-sm text-muted">Loading…</div>
      ) : items.length === 0 ? (
        <div className="border border-rule p-6 text-sm text-muted">
          No reviews yet. Click <em>New review</em> to start.
        </div>
      ) : (
        <div className="border-t border-rule">
          {items.map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between gap-4 px-4 py-4 border-b border-rule hover:bg-wash transition-colors cursor-pointer"
              onClick={() => onSelect(r.id)}
            >
              <div className="min-w-0">
                <div className="text-sm font-semibold text-ink truncate">{r.title}</div>
                <div className="text-xs text-muted font-mono mt-1">
                  {r.column_count} cols · {r.row_count} rows
                  {r.last_run_at && ` · last run ${new Date(r.last_run_at).toLocaleString()}`}
                </div>
              </div>
              <button
                className="text-xs text-muted hover:text-ink transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(r.id);
                }}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
