// ReviewGrid — the spreadsheet itself.
//
// Sticky first column: filename. Header row from columns_config. Per-cell
// loading spinner when this column or this run is in flight. "Run column"
// per header; "Run review" lives in the parent (ReviewEditor).

import type { ReactElement } from "react";
import { ColumnSpec, ReviewRowRead } from "./api";

type Props = {
  columns: ColumnSpec[];
  rows: ReviewRowRead[];
  runningColumnKey: string | null;
  runningWhole: boolean;
  onRunColumn: (key: string) => void;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function renderCell(col: ColumnSpec, value: unknown): ReactElement {
  if (value === undefined || value === null || value === "") {
    return <span className="text-neutral-300">—</span>;
  }
  const s = String(value);
  if (col.type === "yesno") {
    const lower = s.toLowerCase();
    const tone =
      lower === "yes"
        ? "bg-green-100 text-green-800"
        : lower === "no"
        ? "bg-red-100 text-red-800"
        : "bg-neutral-100 text-neutral-700";
    return <span className={`px-1.5 py-0.5 rounded text-xs ${tone}`}>{s}</span>;
  }
  if (col.type === "date" && !DATE_RE.test(s)) {
    return (
      <span title="Not a strict YYYY-MM-DD value">
        {s} <span className="text-amber-600">⚠</span>
      </span>
    );
  }
  return <span>{s}</span>;
}

export function ReviewGrid({
  columns,
  rows,
  runningColumnKey,
  runningWhole,
  onRunColumn,
}: Props) {
  if (columns.length === 0) {
    return (
      <div className="text-sm text-neutral-500 italic p-4 border border-neutral-200 rounded">
        Add at least one column above to start.
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="text-sm text-neutral-500 italic p-4 border border-neutral-200 rounded">
        No documents in this matter yet — upload one to populate the grid.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto border border-neutral-200 rounded">
      <table className="min-w-full text-sm">
        <thead className="bg-neutral-50 text-xs uppercase tracking-wide text-neutral-600">
          <tr>
            <th className="sticky left-0 bg-neutral-50 px-3 py-2 text-left border-r border-neutral-200">
              Filename
            </th>
            {columns.map((c) => {
              const busy = runningWhole || runningColumnKey === c.key;
              return (
                <th key={c.key} className="px-3 py-2 text-left border-r border-neutral-200 align-top">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-medium normal-case">{c.label}</div>
                      <div className="text-[10px] text-neutral-400 font-mono normal-case">
                        {c.key} · {c.type}
                      </div>
                    </div>
                    <button
                      className="text-[10px] px-1.5 py-0.5 rounded border border-neutral-300 hover:bg-white disabled:opacity-40"
                      onClick={() => onRunColumn(c.key)}
                      disabled={busy}
                    >
                      {busy ? "…" : "Run"}
                    </button>
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.document_id} className="border-t border-neutral-200">
              <td className="sticky left-0 bg-white px-3 py-2 text-left border-r border-neutral-200 max-w-[18rem] truncate">
                {r.document_filename}
              </td>
              {columns.map((c) => {
                const busy = runningWhole || runningColumnKey === c.key;
                const v = r.extracted_values?.[c.key];
                return (
                  <td key={c.key} className="px-3 py-2 border-r border-neutral-200 align-top">
                    {busy && (v === undefined || v === null) ? (
                      <span className="inline-block w-3 h-3 border-2 border-neutral-400 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      renderCell(c, v)
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
