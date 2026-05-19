import type { Matter, PreMotionRunResult } from "../../lib/api";
import { Badge, ErrorCallout, InlineSpinner } from "../../ui/primitives";
import type { StageProgress } from "./types";

export function PreMotionTab({
  matter,
  running,
  error,
  stages,
  result,
  onRun,
  pdfBusy,
  pdfError,
  onExportPdf,
  docxBusy,
  docxError,
  onExportDocx,
}: {
  matter: Matter;
  running: boolean;
  error: string | null;
  stages: StageProgress[];
  result: PreMotionRunResult | null;
  onRun: () => void;
  pdfBusy: boolean;
  pdfError: string | null;
  onExportPdf: () => void;
  docxBusy: boolean;
  docxError: string | null;
  onExportDocx: () => void;
}) {
  const blocked = matter.privilege_posture === "C_paused";

  return (
    <div className="max-w-4xl">
      <div className="mb-10 pb-8 border-b border-rule">
        <div className="eyebrow mb-3">06 · Pre-Motion</div>
        <h2 className="text-2xl font-bold tracking-tight2 text-ink mb-3">
          Pre-Motion
        </h2>
        <p className="text-sm text-prose max-w-2xl leading-relaxed">
          Adversarial premortem. Optimistic Analyst then Evidence Inspector
          (three parallel sub-agents) then Premortem Adversary (four parallel
          sub-agents) then Synthesiser. Nine model calls per run, all
          audited.
        </p>
      </div>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <button
          onClick={onRun}
          disabled={running || blocked}
          className="bg-ink text-paper px-4 py-2 hover:bg-black transition-colors text-sm font-medium min-h-[44px] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {running ? "Running…" : "Run premortem"}
        </button>
      </div>

      {blocked && (
        <div className="border border-rule p-6 mb-6">
          <div className="text-sm font-semibold text-ink mb-1">
            Privilege posture C_paused
          </div>
          <p className="text-sm text-prose m-0 leading-relaxed">
            Cloud model calls are refused while posture is paused. Change
            the posture in the matter sidebar to run a premortem.
          </p>
        </div>
      )}

      {error && <ErrorCallout message={error} compact />}

      {(running || stages.length > 0) && !result && <PremotionStageStrip stages={stages} />}

      {result && (
        <>
          <PremotionResult result={result} />
          <div className="mt-6 flex items-center gap-4">
            <button
              onClick={onExportPdf}
              disabled={pdfBusy}
              className="border border-rule hover:border-ink text-ink px-4 py-2 hover:bg-wash transition-colors text-sm font-medium min-h-[44px] disabled:opacity-40"
            >
              {pdfBusy ? "Rendering PDF…" : "Export PDF"}
            </button>
            <button
              onClick={onExportDocx}
              disabled={docxBusy}
              className="border border-rule hover:border-ink text-ink px-4 py-2 hover:bg-wash transition-colors text-sm font-medium min-h-[44px] disabled:opacity-40"
            >
              {docxBusy ? "Rendering .docx…" : "Download .docx"}
            </button>
          </div>
          {pdfError && (
            <div className="mt-4">
              <ErrorCallout message={pdfError} compact />
            </div>
          )}
          {docxError && (
            <div className="mt-4">
              <ErrorCallout message={docxError} compact />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function PremotionStageStrip({ stages }: { stages: StageProgress[] }) {
  const expected = [
    { index: 1, stage: "optimistic", sub_agent_count: 1 },
    { index: 2, stage: "evidence", sub_agent_count: 3 },
    { index: 3, stage: "premortem", sub_agent_count: 4 },
    { index: 4, stage: "synthesis", sub_agent_count: 1 },
  ];
  const byIndex = new Map(stages.map((s) => [s.index, s]));
  return (
    <div className="border border-rule mb-6">
      <div className="grid grid-cols-2 md:grid-cols-4">
        {expected.map((e) => {
          const s = byIndex.get(e.index);
          const status = s?.status ?? "pending";
          const colour =
            status === "running"
              ? "text-[#E67E22]"
              : status === "done"
                ? "text-[#00A35C]"
                : status === "error"
                  ? "text-[#D9304F]"
                  : "text-muted";
          return (
            <div
              key={e.index}
              className="border-r border-rule last:border-r-0 border-b md:border-b-0 p-4"
            >
              <div className="eyebrow mb-2">{e.stage}</div>
              <div className={`text-xs font-mono font-bold ${colour}`}>
                {status === "running" && (
                  <span className="flex items-center gap-2">
                    <InlineSpinner />
                    running
                  </span>
                )}
                {status === "done" && (
                  <span>
                    {s!.sub_agent_count} call{s!.sub_agent_count === 1 ? "" : "s"} ·{" "}
                    {((s!.duration_ms ?? 0) / 1000).toFixed(1)}s · {s!.token_count ?? 0}t
                  </span>
                )}
                {status === "error" && <span>error · {s!.errors?.length ?? 1}</span>}
                {status === "pending" && <span>pending</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PremotionResult({ result }: { result: PreMotionRunResult }) {
  const verdictColour =
    result.synthesis.verdict === "steelman"
      ? "#00A35C"
      : result.synthesis.verdict === "strawman"
        ? "#D9304F"
        : "#E67E22";

  return (
    <div className="space-y-8">
      {/* verdict pill + meta */}
      <div>
        <div className="flex flex-wrap items-center gap-4 mb-4">
          <span
            className="inline-flex items-center gap-1.5 border px-2 py-0.5 font-mono uppercase text-[10px] tracking-track2 font-bold"
            style={{ borderColor: verdictColour, color: verdictColour }}
          >
            <span className="w-1.5 h-1.5" style={{ backgroundColor: verdictColour }} />
            {result.synthesis.verdict}
          </span>
          <span className="font-mono text-xs text-muted">
            {result.model_used} · {result.total_token_count} tok ·{" "}
            {(result.total_duration_ms / 1000).toFixed(1)}s
          </span>
        </div>
        <p className="prose-p">{result.synthesis.verdict_reasoning}</p>
        {result.synthesis.if_we_lose_this_will_be_why && (
          <>
            <h3 className="text-lg font-bold tracking-tight2 text-ink mt-8 mb-3">
              If we lose, this will be why
            </h3>
            <div className="bg-wash p-8 border-l-4 border-ink my-4">
              <p className="text-sm font-medium italic m-0 text-prose">
                {result.synthesis.if_we_lose_this_will_be_why}
              </p>
            </div>
          </>
        )}
        {result.synthesis.summary && (
          <p className="prose-p whitespace-pre-wrap">{result.synthesis.summary}</p>
        )}
      </div>

      {/* failure scenarios */}
      {result.synthesis.failure_scenarios.length > 0 && (
        <section>
          <h3 className="text-2xl font-bold tracking-tight2 text-ink mb-6">
            Failure scenarios
          </h3>
          <div className="border-t border-rule">
            {result.synthesis.failure_scenarios.map((fs, i) => (
              <div key={i} className="border-b border-rule py-4">
                <div className="flex items-center gap-3 mb-2">
                  <Badge>{fs.category.toUpperCase()}</Badge>
                  <span className="font-mono text-xs text-muted">
                    prob {fs.probability} · impact {fs.impact}
                  </span>
                </div>
                <p className="text-sm text-ink mb-2 leading-relaxed">{fs.scenario}</p>
                {fs.mitigation && (
                  <p className="text-sm text-prose leading-relaxed">
                    <span className="text-ink font-semibold">Mitigation -</span> {fs.mitigation}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* blind spots */}
      {result.synthesis.blind_spots.length > 0 && (
        <section>
          <h3 className="text-2xl font-bold tracking-tight2 text-ink mb-6">Blind spots</h3>
          <ul className="list-none space-y-4 text-prose text-sm pl-0">
            {result.synthesis.blind_spots.map((bs, i) => (
              <li key={i} className="flex items-start gap-4">
                <span className="font-bold text-ink">-</span>
                <span>{bs}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* evidence inconsistencies */}
      {result.synthesis.evidence_inconsistencies.length > 0 && (
        <section>
          <h3 className="text-2xl font-bold tracking-tight2 text-ink mb-6">
            Evidence inconsistencies
          </h3>
          <ul className="list-none space-y-4 text-prose text-sm pl-0">
            {result.synthesis.evidence_inconsistencies.map((ei, i) => (
              <li key={i} className="flex items-start gap-4">
                <span className="font-bold text-ink">-</span>
                <span>
                  <Badge>{ei.severity.toUpperCase()}</Badge>{" "}
                  <strong className="text-ink font-semibold">{ei.claim}</strong> - {ei.issue}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* stage telemetry - dense rows */}
      <section>
        <h3 className="text-2xl font-bold tracking-tight2 text-ink mb-6">Stage telemetry</h3>
        <div className="border-t border-rule">
          <div className="grid grid-cols-[1fr_80px_100px_100px_80px] gap-4 px-4 py-2 text-muted bg-paper border-b border-rule font-mono uppercase tracking-track2 text-[9px]">
            <span>Stage</span>
            <span>Calls</span>
            <span>Duration</span>
            <span>Tokens</span>
            <span>Errors</span>
          </div>
          {result.stages.map((s) => (
            <div
              key={s.name}
              className="grid grid-cols-[1fr_80px_100px_100px_80px] gap-4 px-4 py-3 border-b border-rule font-mono text-[11px] items-center"
            >
              <span className="text-ink font-bold">{s.name}</span>
              <span className="text-ink">{s.sub_agent_count}</span>
              <span className="text-ink">{(s.duration_ms / 1000).toFixed(1)}s</span>
              <span className="text-ink">{s.token_count}</span>
              <span className={s.errors.length ? "text-[#D9304F]" : "text-muted"}>
                {s.errors.length}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
