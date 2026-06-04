// Four-pill horizontal indicator for the contract-review pipeline.
// Pill state maps to StageState; visuals mirror the Pre-Motion strip's
// Paper Ink Workspace tokens (bg-paper / border-rule / text-ink).

import type { StageState, StageStatus } from "../../lib/api";

interface Props {
  stages: StageStatus[];
  // Optional progress overlay - when a stream is mid-flight the caller can
  // pass partial stage state keyed by name; we merge over the static array.
  liveOverrides?: Record<string, Partial<StageStatus>>;
}

const STAGE_ORDER: readonly string[] = [
  "parser",
  "analyst",
  "redliner",
  "summariser",
] as const;

const STAGE_LABELS: Record<string, string> = {
  parser: "1. Parse",
  analyst: "2. Analyse (UK)",
  redliner: "3. Redline",
  summariser: "4. Summarise",
};

const STATE_PILL_CLS: Record<StageState, string> = {
  pending: "border-rule text-muted bg-paper",
  running: "border-ink text-ink bg-paper animate-pulse",
  done: "border-ink text-paper bg-ink",
  error: "border-[#D9304F] text-[#D9304F] bg-paper",
  skipped: "border-rule text-muted bg-paper line-through",
};

const STATE_DOT: Record<StageState, string> = {
  pending: "○",
  running: "◐",
  done: "●",
  error: "✕",
  skipped: "–",
};

export function StageStrip({ stages, liveOverrides }: Props) {
  const byName = new Map(stages.map((s) => [s.name, s]));
  return (
    <div className="flex flex-wrap items-center gap-2 sm:gap-3">
      {STAGE_ORDER.map((name) => {
        const base = byName.get(name);
        const override = liveOverrides?.[name];
        const status: StageState =
          (override?.status as StageState | undefined) ||
          base?.status ||
          "pending";
        const duration = override?.duration_ms ?? base?.duration_ms ?? 0;
        return (
          <div
            key={name}
            className={`inline-flex items-center gap-2 border px-3 py-1.5 text-xs sm:text-sm font-medium transition-colors ${STATE_PILL_CLS[status]}`}
            title={
              base?.errors?.length
                ? `errors: ${base.errors.join("; ")}`
                : status
            }
          >
            <span aria-hidden>{STATE_DOT[status]}</span>
            <span>{STAGE_LABELS[name] || name}</span>
            {duration > 0 && status !== "pending" && (
              <span className="text-[10px] sm:text-xs opacity-70">
                {(duration / 1000).toFixed(1)}s
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
