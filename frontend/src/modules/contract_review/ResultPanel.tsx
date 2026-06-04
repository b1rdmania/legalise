// Three-accordion result panel: Summary / Analysis / Redlines.
// Visual tokens mirror Paper Ink Workspace conventions
// (bg-paper, border-rule, text-ink, font-sans).

import { useState } from "react";

import type {
  ClauseAnalysis,
  ContractReviewResult,
  Redline,
  RiskSeverity,
  UkIssueCategory,
} from "../../lib/api";

interface Props {
  result: ContractReviewResult;
  onExportDocx: () => void;
  exporting?: boolean;
  exportError?: string | null;
  exportLink?: string | null;
}

const UK_BADGE_LABEL: Record<UkIssueCategory, string> = {
  ucta_s2_s3: "UCTA",
  cra_s62: "CRA s.62",
  uk_gdpr_art28: "UK GDPR 28",
  governing_law: "Governing law",
  jurisdiction: "Jurisdiction",
  arbitration: "Arbitration",
  liability_cap: "Cap",
  indemnity: "Indemnity",
  ip_assignment: "IP",
  termination: "Termination",
  boilerplate: "Boilerplate",
  other: "Other",
};

const SEV_CLS: Record<RiskSeverity, string> = {
  high: "border-[#D9304F] text-[#D9304F] bg-paper",
  medium: "border-[#E67E22] text-[#E67E22] bg-paper",
  low: "border-rule text-prose bg-paper",
};

function Accordion({
  title,
  open,
  onToggle,
  children,
  count,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  count?: number;
}) {
  return (
    <div className="border border-rule">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between bg-paper px-4 py-3 text-left text-sm sm:text-base font-semibold text-ink hover:bg-wash transition-colors"
      >
        <span>
          {title}
          {typeof count === "number" && (
            <span className="ml-2 text-muted text-xs font-mono">({count})</span>
          )}
        </span>
        <span aria-hidden>{open ? "−" : "+"}</span>
      </button>
      {open && <div className="border-t border-rule px-4 py-4">{children}</div>}
    </div>
  );
}

function riskBar(score: number): string {
  if (score <= 0) return "-";
  if (score >= 4) return "⚠⚠⚠⚠";
  if (score === 3) return "⚠⚠⚠";
  if (score === 2) return "⚠⚠";
  return "⚠";
}

function AnalysisRow({
  analysis,
  clauseTitle,
}: {
  analysis: ClauseAnalysis;
  clauseTitle: string;
}) {
  return (
    <div className="border-t border-rule py-3 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="font-semibold text-ink">
          {analysis.clause_id}
          {clauseTitle ? ` - ${clauseTitle}` : ""}
        </h4>
        <span className="text-xs text-muted font-mono">
          risk {analysis.risk_score}/5 {riskBar(analysis.risk_score)}
        </span>
      </div>
      {analysis.summary && (
        <p className="mt-2 text-sm text-prose leading-relaxed">
          {analysis.summary}
        </p>
      )}
      {analysis.uk_issues.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {analysis.uk_issues.map((issue, i) => (
            <span
              key={i}
              className={`inline-flex items-center gap-1 border px-2 py-0.5 text-[11px] sm:text-xs ${SEV_CLS[issue.severity]}`}
              title={`${issue.statute_ref ? issue.statute_ref + " - " : ""}${issue.description}`}
            >
              <span className="font-semibold">
                {UK_BADGE_LABEL[issue.category] || issue.category}
              </span>
              {issue.statute_ref && (
                <span className="opacity-70">· {issue.statute_ref}</span>
              )}
            </span>
          ))}
        </div>
      )}
      {analysis.uk_issues.length > 0 && (
        <ul className="mt-2 space-y-1 list-none pl-0">
          {analysis.uk_issues.map((issue, i) => (
            <li key={i} className="text-sm text-prose">
              <span className="font-semibold text-ink">{issue.severity.toUpperCase()}:</span>{" "}
              {issue.description}
            </li>
          ))}
        </ul>
      )}
      {analysis.posture_note && (
        <p className="mt-2 text-xs italic text-muted">{analysis.posture_note}</p>
      )}
    </div>
  );
}

function RedlineRow({ redline }: { redline: Redline }) {
  const pillCls: Record<string, string> = {
    must: "border-[#D9304F] text-[#D9304F] bg-paper",
    suggested: "border-[#E67E22] text-[#E67E22] bg-paper",
    nice_to_have: "border-rule text-muted bg-paper",
  };
  const labels: Record<string, string> = {
    must: "MUST",
    suggested: "Suggested",
    nice_to_have: "Nice-to-have",
  };
  return (
    <div className="border-t border-rule py-3 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="font-semibold text-ink">{redline.clause_id}</h4>
        <span
          className={`inline-flex items-center border px-2 py-0.5 text-[11px] font-mono uppercase tracking-track2 font-bold ${pillCls[redline.priority] || pillCls.suggested}`}
        >
          {labels[redline.priority] || redline.priority}
        </span>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="border border-rule bg-paper p-3">
          <div className="eyebrow mb-2">Original</div>
          <div className="whitespace-pre-wrap text-sm text-prose leading-relaxed">
            {redline.original_text || (
              <em className="text-muted">(no original - clause to be inserted)</em>
            )}
          </div>
        </div>
        <div className="border border-ink bg-paper p-3">
          <div className="eyebrow mb-2">Suggested</div>
          <div className="whitespace-pre-wrap text-sm text-ink leading-relaxed">
            {redline.suggested_text || <em className="text-muted">(no suggestion)</em>}
          </div>
        </div>
      </div>
      {redline.explanation && (
        <p className="mt-2 text-xs italic text-muted">
          Why: {redline.explanation}
        </p>
      )}
    </div>
  );
}

export function ResultPanel({
  result,
  onExportDocx,
  exporting,
  exportError,
  exportLink,
}: Props) {
  const [openSummary, setOpenSummary] = useState(true);
  const [openAnalysis, setOpenAnalysis] = useState(true);
  const [openRedlines, setOpenRedlines] = useState(true);

  const clauseLookup = new Map(result.parsed.clauses.map((c) => [c.id, c]));

  return (
    <div className="space-y-4">
      {/* Header row + export */}
      <div className="flex flex-wrap items-center justify-between gap-3 border border-rule bg-paper px-4 py-3">
        <div className="text-sm text-ink">
          <div className="font-semibold">
            {result.parsed.title || result.document_filename}
          </div>
          <div className="text-xs text-muted font-mono mt-1">
            {result.parsed.parties.length > 0 && (
              <>parties: {result.parsed.parties.join(" / ")} · </>
            )}
            type: {result.parsed.document_type} · posture: {result.posture} ·{" "}
            governing law: {result.parsed.governing_law_stated || "not stated"} ·{" "}
            {result.total_token_count} tok · {(result.total_duration_ms / 1000).toFixed(1)}s
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {exportLink && (
            <a
              href={exportLink}
              className="text-xs underline text-muted hover:text-ink transition-colors"
              target="_blank"
              rel="noreferrer"
            >
              latest .docx
            </a>
          )}
          <button
            type="button"
            onClick={onExportDocx}
            disabled={exporting}
            className="bg-ink text-paper px-3 py-2 hover:bg-black transition-colors text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed min-h-[36px]"
          >
            {exporting ? "Exporting…" : "Export .docx"}
          </button>
        </div>
      </div>
      {exportError && (
        <div className="border border-[#D9304F] bg-[#FEF2F2] px-3 py-2 text-xs text-[#B91C1C]">
          {exportError}
        </div>
      )}

      {/* Summary */}
      <Accordion
        title="Summary"
        open={openSummary}
        onToggle={() => setOpenSummary((v) => !v)}
      >
        {result.summary.executive_summary ? (
          <p className="whitespace-pre-wrap text-sm text-prose leading-relaxed">
            {result.summary.executive_summary}
          </p>
        ) : (
          <p className="italic text-muted text-sm">(no executive summary)</p>
        )}
        {result.summary.recommendation && (
          <div className="mt-3 border-l-4 border-ink pl-4 text-sm font-semibold text-ink">
            Recommendation: {result.summary.recommendation}
          </div>
        )}
        {result.summary.risk_overview && (
          <div className="mt-4">
            <div className="eyebrow mb-2">Risk overview</div>
            <p className="whitespace-pre-wrap text-sm text-prose leading-relaxed">
              {result.summary.risk_overview}
            </p>
          </div>
        )}
        {result.summary.uk_specific_callouts.length > 0 && (
          <div className="mt-4">
            <div className="eyebrow mb-2">UK callouts</div>
            <ul className="list-none space-y-2 text-sm text-prose pl-0">
              {result.summary.uk_specific_callouts.map((c, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="font-bold text-ink">-</span>
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {result.summary.key_terms.length > 0 && (
          <div className="mt-4">
            <div className="eyebrow mb-2">Key terms</div>
            <ul className="list-none space-y-2 text-sm text-prose pl-0">
              {result.summary.key_terms.map((t, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="font-bold text-ink">-</span>
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Accordion>

      {/* Analysis */}
      <Accordion
        title="Analysis"
        open={openAnalysis}
        onToggle={() => setOpenAnalysis((v) => !v)}
        count={result.analyses.length}
      >
        {result.analyses.length === 0 ? (
          <p className="italic text-muted text-sm">
            No clause-level analysis produced.
          </p>
        ) : (
          <div className="divide-y divide-rule">
            {result.analyses.map((a) => {
              const clause = clauseLookup.get(a.clause_id);
              const title = clause
                ? `${clause.section ? clause.section + " " : ""}${clause.title}`.trim()
                : "";
              return (
                <AnalysisRow key={a.clause_id} analysis={a} clauseTitle={title} />
              );
            })}
          </div>
        )}
      </Accordion>

      {/* Redlines */}
      <Accordion
        title="Redlines"
        open={openRedlines}
        onToggle={() => setOpenRedlines((v) => !v)}
        count={result.redlines.length}
      >
        {result.redlines.length === 0 ? (
          <p className="italic text-muted text-sm">
            No redlines proposed. No clause scored at risk 3+ or carried a
            high-severity UK issue.
          </p>
        ) : (
          <div className="divide-y divide-rule">
            {result.redlines.map((r, i) => (
              <RedlineRow key={`${r.clause_id}-${i}`} redline={r} />
            ))}
          </div>
        )}
      </Accordion>
    </div>
  );
}
