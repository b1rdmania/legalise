// ContractReviewTab — host component for the four-stage redliner UI.
//
// Takes `matter` and `docs` from the parent (App.tsx) — module cannot
// modify lib/api.ts (owned by other workstreams). Filter to documents
// that are plausibly contracts (filename hint + tag) but show all docs
// with a "pick a doc with extracted body" note so a user with weird
// filenames isn't locked out.

import { useMemo, useState } from "react";

import type { Matter, MatterDocument } from "../../lib/api";

import {
  exportContractReviewDocx,
  runContractReview,
  type ContractKind,
  type ContractReviewResult,
  type Posture,
  type StageStatus,
} from "./api";
import { ResultPanel } from "./ResultPanel";
import { StageStrip } from "./StageStrip";

interface Props {
  matter: Matter;
  docs: MatterDocument[];
}

const POSTURES: { value: Posture; label: string }[] = [
  { value: "buyer", label: "Buyer (we receive)" },
  { value: "seller", label: "Seller (we provide)" },
  { value: "balanced", label: "Balanced" },
];

const CONTRACT_KINDS: { value: ContractKind; label: string }[] = [
  { value: "nda", label: "NDA" },
  { value: "saas", label: "SaaS" },
  { value: "msa", label: "MSA" },
  { value: "dpa", label: "DPA" },
  { value: "consultancy", label: "Consultancy" },
  { value: "employment", label: "Employment" },
  { value: "settlement", label: "Settlement" },
  { value: "other", label: "Other" },
];

// Empty stage strip baseline — used before any run lands.
const INITIAL_STAGES: StageStatus[] = [
  { name: "parser", status: "pending", sub_agent_count: 1, duration_ms: 0, token_count: 0, errors: [] },
  { name: "analyst", status: "pending", sub_agent_count: 1, duration_ms: 0, token_count: 0, errors: [] },
  { name: "redliner", status: "pending", sub_agent_count: 1, duration_ms: 0, token_count: 0, errors: [] },
  { name: "summariser", status: "pending", sub_agent_count: 1, duration_ms: 0, token_count: 0, errors: [] },
];

function guessContractKind(filename: string): ContractKind {
  const f = filename.toLowerCase();
  if (f.includes("nda") || f.includes("non-disclosure")) return "nda";
  if (f.includes("saas")) return "saas";
  if (f.includes("msa")) return "msa";
  if (f.includes("dpa")) return "dpa";
  if (f.includes("consultancy") || f.includes("consult")) return "consultancy";
  if (f.includes("employment") || f.includes("contract-of-employment")) return "employment";
  if (f.includes("settlement")) return "settlement";
  return "other";
}

export function ContractReviewTab({ matter, docs }: Props) {
  // Prefer contract-shaped docs first; fall back to everything.
  const contractDocs = useMemo(
    () =>
      docs.filter(
        (d) =>
          d.tag === "contract" ||
          d.filename.toLowerCase().includes("nda") ||
          d.filename.toLowerCase().includes("contract") ||
          d.filename.toLowerCase().includes("agreement"),
      ),
    [docs],
  );
  const orderedDocs = useMemo(() => {
    const ids = new Set(contractDocs.map((d) => d.id));
    return [...contractDocs, ...docs.filter((d) => !ids.has(d.id))];
  }, [contractDocs, docs]);

  const [documentId, setDocumentId] = useState<string>(
    orderedDocs[0]?.id || "",
  );
  const [posture, setPosture] = useState<Posture>("balanced");
  const [contractType, setContractType] = useState<ContractKind>(
    orderedDocs[0] ? guessContractKind(orderedDocs[0].filename) : "other",
  );
  const [counterparty, setCounterparty] = useState("");
  const [dealValue, setDealValue] = useState("");

  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ContractReviewResult | null>(null);

  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportLink, setExportLink] = useState<string | null>(null);

  const onPickDoc = (id: string) => {
    setDocumentId(id);
    const doc = orderedDocs.find((d) => d.id === id);
    if (doc) setContractType(guessContractKind(doc.filename));
  };

  const onRun = async () => {
    if (!documentId) {
      setError("Pick a document first.");
      return;
    }
    setRunning(true);
    setError(null);
    setResult(null);
    setExportLink(null);
    setExportError(null);
    try {
      const r = await runContractReview(matter.slug, {
        document_id: documentId,
        posture,
        contract_type: contractType,
        counterparty_name: counterparty || null,
        deal_value: dealValue || null,
      });
      setResult(r);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setRunning(false);
    }
  };

  const onExport = async () => {
    if (!result) return;
    setExporting(true);
    setExportError(null);
    try {
      const r = await exportContractReviewDocx(matter.slug, result);
      setExportLink(r.download_url);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setExportError(msg);
    } finally {
      setExporting(false);
    }
  };

  const inputCls =
    "bg-paper border border-rule px-3 py-2 text-sm focus:border-ink focus:outline-none transition-colors min-h-[40px] font-sans text-ink";

  const stages = result?.stages ?? INITIAL_STAGES;

  return (
    <div className="space-y-6">
      <div className="border border-rule bg-paper p-4 sm:p-5">
        <h3 className="font-medium text-ink mb-1">Contract review</h3>
        <p className="text-xs text-ink/60 mb-4 leading-relaxed">
          Four-stage UK-focused review: parse → analyse (UCTA / CRA s.62 /
          UK GDPR Art 28 / governing law / jurisdiction / arbitration) →
          redline → summarise. Runs against the document's extracted text;
          anonymised bodies are not used. Results are not persisted in v0.1
          — export as .docx to keep a copy.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-wide text-ink/60">
              Document
            </span>
            <select
              value={documentId}
              onChange={(e) => onPickDoc(e.target.value)}
              className={inputCls}
            >
              {orderedDocs.length === 0 && (
                <option value="">(no documents on this matter)</option>
              )}
              {orderedDocs.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.filename}
                  {d.tag ? ` · ${d.tag}` : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-wide text-ink/60">
              Posture
            </span>
            <select
              value={posture}
              onChange={(e) => setPosture(e.target.value as Posture)}
              className={inputCls}
            >
              {POSTURES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-wide text-ink/60">
              Contract type (hint)
            </span>
            <select
              value={contractType}
              onChange={(e) => setContractType(e.target.value as ContractKind)}
              className={inputCls}
            >
              {CONTRACT_KINDS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-wide text-ink/60">
              Counterparty <span className="opacity-50">(optional)</span>
            </span>
            <input
              value={counterparty}
              onChange={(e) => setCounterparty(e.target.value)}
              className={inputCls}
              placeholder="North Mill Consulting Limited"
            />
          </label>
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-xs uppercase tracking-wide text-ink/60">
              Deal value <span className="opacity-50">(optional)</span>
            </span>
            <input
              value={dealValue}
              onChange={(e) => setDealValue(e.target.value)}
              className={inputCls}
              placeholder="£250k ARR / 18-month term"
            />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onRun}
            disabled={running || !documentId}
            className="bg-ink text-paper px-4 py-2 hover:bg-black transition-colors text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed min-h-[40px]"
          >
            {running ? "Running…" : "Run review"}
          </button>
          <StageStrip stages={stages} />
        </div>

        {error && (
          <div className="mt-4 border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}
        {!error && !result && (
          <p className="mt-3 text-xs italic text-ink/50">
            Pick a contract-shaped document with extracted text. The Khan
            sample matter ships with a synthetic mutual NDA fixture for the
            demo.
          </p>
        )}
      </div>

      {result && (
        <ResultPanel
          result={result}
          onExportDocx={onExport}
          exporting={exporting}
          exportError={exportError}
          exportLink={exportLink}
        />
      )}
    </div>
  );
}
