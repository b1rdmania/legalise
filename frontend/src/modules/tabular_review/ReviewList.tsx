// ReviewList — landing surface for the Reviews tab.
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
};

export function ReviewList({ slug, onSelect }: Props) {
  const [items, setItems] = useState<ReviewSummary[] | null>(null);
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
    load();
  }, [slug]);

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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Tabular reviews</h2>
        <button
          className="px-3 py-1.5 text-sm rounded border border-neutral-300 hover:bg-neutral-50"
          onClick={() => setCreating((c) => !c)}
        >
          {creating ? "Cancel" : "New review"}
        </button>
      </div>

      {creating && (
        <div className="flex gap-2 p-3 border border-neutral-200 rounded bg-neutral-50">
          <input
            autoFocus
            className="flex-1 px-2 py-1 border border-neutral-300 rounded text-sm"
            placeholder="Review title (e.g. Acme correspondence — disclosure relevance)"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onCreate()}
          />
          <button
            className="px-3 py-1 text-sm rounded bg-neutral-900 text-white disabled:opacity-50"
            onClick={onCreate}
            disabled={busy || !newTitle.trim()}
          >
            Create
          </button>
        </div>
      )}

      {error && (
        <div className="text-sm text-red-700 border border-red-300 bg-red-50 rounded p-2">
          {error}
        </div>
      )}

      {items === null ? (
        <div className="text-sm text-neutral-500">Loading…</div>
      ) : items.length === 0 ? (
        <div className="text-sm text-neutral-500">
          No reviews yet. Click <em>New review</em> to start.
        </div>
      ) : (
        <ul className="divide-y divide-neutral-200 border border-neutral-200 rounded">
          {items.map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between p-3 hover:bg-neutral-50 cursor-pointer"
              onClick={() => onSelect(r.id)}
            >
              <div>
                <div className="font-medium text-sm">{r.title}</div>
                <div className="text-xs text-neutral-500">
                  {r.column_count} cols · {r.row_count} rows
                  {r.last_run_at && ` · last run ${new Date(r.last_run_at).toLocaleString()}`}
                </div>
              </div>
              <button
                className="text-xs text-neutral-500 hover:text-red-600"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(r.id);
                }}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
