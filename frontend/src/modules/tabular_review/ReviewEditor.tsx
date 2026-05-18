// ReviewEditor - host for an open review.
//
// Two regions:
//   - ColumnEditor: edit columns_config (PATCH on blur via save button).
//   - ReviewGrid: per-doc rows of the spreadsheet.
//
// Run flow: click Run → POST /estimate → CostEstimateDialog →
// confirm → POST /run with confirm_above_50 if needed → refresh.
// Export: POST /export.docx → trigger download via download_url.

import { useEffect, useState } from "react";
import {
  ColumnSpec,
  ReviewRead,
  RunEstimate,
  RunReport,
  estimateReview,
  exportReviewDocx,
  generatedDocxUrl,
  getReview,
  runReview,
  updateReview,
} from "./api";
import { ColumnEditor } from "./ColumnEditor";
import { ReviewGrid } from "./ReviewGrid";
import { CostEstimateDialog } from "./CostEstimateDialog";

type Props = {
  slug: string;
  reviewId: string;
  onBack: () => void;
};

export function ReviewEditor({ slug, reviewId, onBack }: Props) {
  const [review, setReview] = useState<ReviewRead | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dirtyColumns, setDirtyColumns] = useState<ColumnSpec[] | null>(null);
  const [savingColumns, setSavingColumns] = useState(false);

  const [estimate, setEstimate] = useState<RunEstimate | null>(null);
  const [runBusy, setRunBusy] = useState(false);
  const [pendingScope, setPendingScope] = useState<{ column_keys?: string[] } | null>(null);
  const [lastReport, setLastReport] = useState<RunReport | null>(null);
  const [runningColumnKey, setRunningColumnKey] = useState<string | null>(null);
  const [runningWhole, setRunningWhole] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);

  const load = async () => {
    try {
      setReview(await getReview(slug, reviewId));
    } catch (e) {
      setError(String(e));
    }
  };
  useEffect(() => {
    load();
  }, [slug, reviewId]);

  const columns = dirtyColumns ?? review?.columns_config ?? [];
  const isDirty = dirtyColumns !== null;

  const saveColumns = async () => {
    if (!isDirty || !review) return;
    setSavingColumns(true);
    try {
      const next = await updateReview(slug, review.id, { columns_config: dirtyColumns! });
      setReview(next);
      setDirtyColumns(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setSavingColumns(false);
    }
  };

  const openEstimate = async (column_keys?: string[]) => {
    if (!review) return;
    setError(null);
    setPendingScope({ column_keys });
    try {
      const est = await estimateReview(slug, review.id, { column_keys });
      setEstimate(est);
    } catch (e) {
      setError(String(e));
      setPendingScope(null);
    }
  };

  const onConfirmRun = async () => {
    if (!review || !estimate) return;
    setRunBusy(true);
    if (pendingScope?.column_keys?.length === 1) {
      setRunningColumnKey(pendingScope.column_keys[0]);
    } else {
      setRunningWhole(true);
    }
    try {
      const report = await runReview(slug, review.id, {
        column_keys: pendingScope?.column_keys,
        confirm_above_50: estimate.requires_confirm,
      });
      setLastReport(report);
      setEstimate(null);
      setPendingScope(null);
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setRunBusy(false);
      setRunningColumnKey(null);
      setRunningWhole(false);
    }
  };

  const onExport = async () => {
    if (!review) return;
    setExportBusy(true);
    try {
      const r = await exportReviewDocx(slug, review.id);
      // Trigger download. download_url is `/api/documents/generated/{uuid}`;
      // join with BACKEND_ROOT so absolute / proxied bases both work.
      const url = generatedDocxUrl(r.download_url);
      const a = document.createElement("a");
      a.href = url;
      a.rel = "noopener";
      a.click();
      // Backend sets Content-Disposition; browser handles the save.
    } catch (e) {
      setError(String(e));
    } finally {
      setExportBusy(false);
    }
  };

  if (!review) {
    return <div className="text-sm text-neutral-500">{error ?? "Loading review…"}</div>;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <button
            className="text-xs text-neutral-500 hover:text-neutral-900"
            onClick={onBack}
          >
            ← All reviews
          </button>
          <h2 className="text-lg font-semibold">{review.title}</h2>
          <div className="text-xs text-neutral-500">{review.rows.length} rows</div>
        </div>
        <div className="flex gap-2">
          {isDirty && (
            <button
              className="px-3 py-1.5 text-sm rounded border border-neutral-300 hover:bg-neutral-50 disabled:opacity-40"
              onClick={saveColumns}
              disabled={savingColumns}
            >
              {savingColumns ? "Saving…" : "Save columns"}
            </button>
          )}
          <button
            className="px-3 py-1.5 text-sm rounded bg-neutral-900 text-white disabled:opacity-40"
            onClick={() => openEstimate()}
            disabled={runBusy || isDirty || columns.length === 0}
            title={isDirty ? "Save column changes first" : ""}
          >
            Run review
          </button>
          <button
            className="px-3 py-1.5 text-sm rounded border border-neutral-300 hover:bg-neutral-50 disabled:opacity-40"
            onClick={onExport}
            disabled={exportBusy || columns.length === 0}
          >
            {exportBusy ? "Exporting…" : "Export .docx"}
          </button>
        </div>
      </div>

      {error && (
        <div className="text-sm text-red-700 border border-red-300 bg-red-50 rounded p-2">
          {error}
        </div>
      )}

      <ColumnEditor
        columns={columns}
        onChange={(next) => setDirtyColumns(next)}
      />

      <ReviewGrid
        columns={review.columns_config}
        rows={review.rows}
        runningColumnKey={runningColumnKey}
        runningWhole={runningWhole}
        onRunColumn={(key) => !isDirty && openEstimate([key])}
      />

      {lastReport && (
        <div className="text-xs text-neutral-600 border border-neutral-200 rounded p-2">
          Last run: {lastReport.cells_run} cells ok
          {lastReport.cells_failed > 0 && ` · ${lastReport.cells_failed} failed`}
          {" · "}
          {lastReport.duration_ms}ms
          {lastReport.errors.length > 0 && (
            <ul className="mt-1 list-disc pl-5">
              {lastReport.errors.slice(0, 5).map((e, i) => (
                <li key={i} className="text-red-600">
                  {e.column_key}: {e.error_message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <CostEstimateDialog
        estimate={estimate}
        busy={runBusy}
        onCancel={() => {
          setEstimate(null);
          setPendingScope(null);
        }}
        onConfirm={onConfirmRun}
      />
    </div>
  );
}
