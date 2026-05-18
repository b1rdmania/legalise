// CostEstimateDialog - modal that shows the pre-run cost band.
//
// Above 50 cells the API requires confirm_above_50=true; we surface the
// requires_confirm flag verbatim so the user sees what they're consenting
// to. The cost is an estimated band, not a price.

import { RunEstimate } from "./api";

type Props = {
  estimate: RunEstimate | null;
  onConfirm: () => void;
  onCancel: () => void;
  busy: boolean;
};

function poundString(pence: number): string {
  if (pence <= 0) return "£0.00";
  return `£${(pence / 100).toFixed(2)}`;
}

export function CostEstimateDialog({ estimate, onConfirm, onCancel, busy }: Props) {
  if (!estimate) return null;
  const empty = estimate.total_calls === 0;
  return (
    <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4">
      <div className="bg-white rounded shadow-lg max-w-md w-full p-5 space-y-4">
        <h3 className="text-lg font-semibold">Confirm run</h3>
        {empty ? (
          <p className="text-sm text-neutral-600">
            Nothing to run - either there are no columns, no documents, or no
            document bodies available.
          </p>
        ) : (
          <>
            <dl className="text-sm space-y-1">
              <div className="flex justify-between">
                <dt className="text-neutral-500">Total cells</dt>
                <dd>{estimate.total_calls}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-neutral-500">Estimated input tokens</dt>
                <dd>{estimate.est_input_tokens.toLocaleString()}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-neutral-500">Estimated output tokens</dt>
                <dd>{estimate.est_output_tokens.toLocaleString()}</dd>
              </div>
              <div className="flex justify-between font-medium">
                <dt className="text-neutral-700">Estimated cost</dt>
                <dd>
                  {poundString(estimate.est_cost_pence_lower)} –{" "}
                  {poundString(estimate.est_cost_pence_upper)}
                </dd>
              </div>
              <div className="text-[11px] text-neutral-500 pt-1">
                Provider: {estimate.provider ?? "-"}
                {estimate.model_id && ` · ${estimate.model_id}`}
                {" "}· ±30% band, billed against your provider key.
              </div>
            </dl>
            {estimate.requires_confirm && (
              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                More than 50 cells - explicit confirmation required.
              </div>
            )}
          </>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button
            className="px-3 py-1.5 text-sm rounded border border-neutral-300 hover:bg-neutral-50"
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            className="px-3 py-1.5 text-sm rounded bg-neutral-900 text-white disabled:opacity-40"
            onClick={onConfirm}
            disabled={busy || empty}
          >
            {busy ? "Running…" : "Run"}
          </button>
        </div>
      </div>
    </div>
  );
}
