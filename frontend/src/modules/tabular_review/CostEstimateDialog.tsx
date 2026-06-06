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
    <div className="fixed inset-0 bg-ink/40 z-40 flex items-center justify-center p-4">
      <div className="bg-paper border border-rule max-w-md w-full p-6 space-y-4">
        <div>
          <div className="eyebrow mb-2">Confirm</div>
          <h3 className="text-xl font-bold tracking-tight2 text-ink">
            Run review
          </h3>
        </div>
        {empty ? (
          <p className="text-sm text-prose leading-relaxed">
            Nothing to run. Either there are no columns, no documents, or no
            document bodies available.
          </p>
        ) : (
          <>
            <dl className="text-sm space-y-1.5 tech-token">
              <div className="flex justify-between">
                <dt className="text-muted">Total cells</dt>
                <dd className="text-ink">{estimate.total_calls}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Est. input tokens</dt>
                <dd className="text-ink">{estimate.est_input_tokens.toLocaleString()}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Est. output tokens</dt>
                <dd className="text-ink">{estimate.est_output_tokens.toLocaleString()}</dd>
              </div>
              <div className="flex justify-between font-semibold pt-2 border-t border-rule">
                <dt className="text-ink">Estimated cost</dt>
                <dd className="text-ink">
                  {poundString(estimate.est_cost_pence_lower)} to{" "}
                  {poundString(estimate.est_cost_pence_upper)}
                </dd>
              </div>
            </dl>
            <p className="text-[11px] text-muted leading-relaxed">
              Provider: {estimate.provider ?? "-"}
              {estimate.model_id && ` · ${estimate.model_id}`}. ±30% band,
              billed against your provider key.
            </p>
            {estimate.requires_confirm && (
              <div className="border border-rule p-3 text-xs text-ink">
                <strong className="font-semibold">More than 50 cells.</strong>{" "}
                Explicit confirmation required.
              </div>
            )}
          </>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button
            className="border border-rule hover:border-ink text-ink px-4 py-2 hover:bg-wash transition-colors text-sm font-medium min-h-[40px] disabled:opacity-40 disabled:cursor-not-allowed"
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            className="bg-ink text-paper px-4 py-2 hover:bg-black transition-colors text-sm font-medium min-h-[40px] disabled:opacity-40 disabled:cursor-not-allowed"
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
