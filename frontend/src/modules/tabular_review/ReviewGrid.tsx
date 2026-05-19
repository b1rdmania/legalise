// ReviewGrid - the spreadsheet itself.
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
    return <span className="text-muted">-</span>;
  }
  const s = String(value);
  if (col.type === "yesno") {
    const lower = s.toLowerCase();
    const colour =
      lower === "yes"
        ? "#00A35C"
        : lower === "no"
        ? "#D9304F"
        : "#9CA3AF";
    return (
      <span
        className="inline-flex items-center gap-1.5 border px-2 py-0.5 font-mono uppercase text-[10px] tracking-track2 font-bold"
        style={{ borderColor: colour, color: colour }}
      >
        {s}
      </span>
    );
  }
  if (col.type === "date" && !DATE_RE.test(s)) {
    return (
      <span title="Not a strict YYYY-MM-DD value" className="text-ink">
        {s} <span className="text-[#E67E22]">⚠</span>
      </span>
    );
  }
  return <span className="text-ink">{s}</span>;
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
      <div className="border border-rule p-4 text-sm text-muted italic">
        Add at least one column above to start.
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="border border-rule p-4 text-sm text-muted italic">
        No documents in this matter yet. Upload one to populate the grid.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto border border-rule">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="bg-paper border-b border-rule">
            <th className="sticky left-0 bg-paper px-3 py-3 text-left border-r border-rule font-mono uppercase tracking-track2 text-[9px] text-muted">
              Filename
            </th>
            {columns.map((c) => {
              const busy = runningWhole || runningColumnKey === c.key;
              return (
                <th
                  key={c.key}
                  className="px-3 py-3 text-left border-r border-rule align-top"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold text-ink normal-case">
                        {c.label}
                      </div>
                      <div className="text-[9px] text-muted font-mono uppercase tracking-track2 mt-0.5">
                        {c.key} · {c.type}
                      </div>
                    </div>
                    <button
                      className="text-[10px] px-2 py-0.5 border border-rule hover:border-ink hover:bg-wash transition-colors font-mono uppercase tracking-track2 text-ink disabled:opacity-40 disabled:cursor-not-allowed"
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
            <tr key={r.document_id} className="border-t border-rule hover:bg-wash transition-colors">
              <td className="sticky left-0 bg-paper px-3 py-2 text-left border-r border-rule max-w-[18rem] truncate font-mono text-xs text-ink">
                {r.document_filename}
              </td>
              {columns.map((c) => {
                const busy = runningWhole || runningColumnKey === c.key;
                const v = r.extracted_values?.[c.key];
                return (
                  <td key={c.key} className="px-3 py-2 border-r border-rule align-top">
                    {busy && (v === undefined || v === null) ? (
                      <span className="inline-block w-3 h-3 border-2 border-rule border-t-ink rounded-full animate-spin" />
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
