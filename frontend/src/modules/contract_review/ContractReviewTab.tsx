// ContractReviewTab - host component for the four-stage redliner UI.
//
// Takes `matter` and `docs` from the parent (App.tsx) - module cannot
// modify lib/api.ts (owned by other workstreams). Filter to documents
// that are plausibly contracts (filename hint + tag) but show all docs
// with a "pick a doc with extracted body" note so a user with weird
// filenames isn't locked out.

import { useMemo, useState } from "react";

import type { Matter, MatterDocument } from "../../lib/api";

import {
  exportContractReviewDocx,
  ProviderKeyMissingError,
  runContractReviewStream,
  StreamPreflightError,
  type ContractKind,
  type ContractReviewResult,
  type Posture,
  type StageState,
  type StageStatus,
} from "./api";
import { ResultPanel } from "./ResultPanel";
import { StageStrip } from "./StageStrip";
import { ErrorCallout, ProviderKeyMissingBanner } from "../../ui/primitives";

interface Props {
  matter: Matter;
  docs: MatterDocument[];
  // Demo path: when supplied, the result panel renders directly with this
  // canned envelope and the "Run review" button flashes a sign-up CTA via
  // the optional onRunOverride callback. Production MatterDetail omits both.
  previewResult?: ContractReviewResult;
  onRunOverride?: () => void;
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

// Empty stage strip baseline - used before any run lands.
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

export function ContractReviewTab({ matter, docs, previewResult, onRunOverride }: Props) {
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
  const [keyMissingProvider, setKeyMissingProvider] = useState<string | null>(null);
  const [result, setResult] = useState<ContractReviewResult | null>(
    previewResult ?? null,
  );
  const [liveStages, setLiveStages] = useState<
    Record<string, Partial<StageStatus>>
  >({});

  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportLink, setExportLink] = useState<string | null>(null);

  const onPickDoc = (id: string) => {
    setDocumentId(id);
    const doc = orderedDocs.find((d) => d.id === id);
    if (doc) setContractType(guessContractKind(doc.filename));
  };

  const onRun = async () => {
    if (onRunOverride) {
      onRunOverride();
      return;
    }
    if (!documentId) {
      setError("Pick a document first.");
      return;
    }
    setRunning(true);
    setError(null);
    setKeyMissingProvider(null);
    setResult(null);
    setLiveStages({});
    setExportLink(null);
    setExportError(null);
    try {
      const iter = runContractReviewStream(matter.slug, {
        document_id: documentId,
        posture,
        contract_type: contractType,
        counterparty_name: counterparty || null,
        deal_value: dealValue || null,
      });
      for await (const evt of iter) {
        if (evt.event === "stage.start") {
          const name = evt.data.stage;
          setLiveStages((prev) => ({
            ...prev,
            [name]: { ...(prev[name] || {}), status: "running" },
          }));
        } else if (evt.event === "stage.end") {
          const { stage, status, duration_ms, token_count, error: stageErr } =
            evt.data;
          const mapped: StageState =
            status === "ok"
              ? "done"
              : status === "skipped"
              ? "skipped"
              : "error";
          setLiveStages((prev) => ({
            ...prev,
            [stage]: {
              status: mapped,
              duration_ms,
              token_count,
              errors: stageErr ? [stageErr] : [],
            },
          }));
          if (status === "error" && stageErr) {
            setError(`${stage}: ${stageErr}`);
          }
        } else if (evt.event === "result") {
          setResult(evt.data);
          // Clear live overrides - the canonical stages array now drives UI.
          setLiveStages({});
        } else if (evt.event === "error") {
          setError(evt.data.message || "Contract review failed.");
        }
      }
    } catch (e: unknown) {
      if (e instanceof ProviderKeyMissingError) {
        setKeyMissingProvider(e.provider);
      } else if (e instanceof StreamPreflightError) {
        // 409 (privilege-paused) and other preflight failures land here.
        setError(e.message);
      } else {
        const msg = e instanceof Error ? e.message : String(e);
        setError(`Contract review failed. ${msg}`);
      }
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
      setExportError(`Could not export .docx. ${msg}`);
    } finally {
      setExporting(false);
    }
  };

  const inputCls =
    "bg-paper border border-rule px-3 py-2 text-sm focus:border-ink focus:outline-none transition-colors min-h-[40px] font-sans text-ink";

  const stages = result?.stages ?? INITIAL_STAGES;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="eyebrow">Document</span>
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
          <span className="eyebrow">Posture</span>
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
          <span className="eyebrow">Contract type (hint)</span>
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
          <span className="eyebrow">Counterparty (optional)</span>
          <input
            value={counterparty}
            onChange={(e) => setCounterparty(e.target.value)}
            className={inputCls}
            placeholder="North Mill Consulting Limited"
          />
        </label>
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="eyebrow">Deal value (optional)</span>
          <input
            value={dealValue}
            onChange={(e) => setDealValue(e.target.value)}
            className={inputCls}
            placeholder="£250k ARR / 18-month term"
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={onRun}
          disabled={running || !documentId}
          className="bg-ink text-paper px-4 py-2 hover:bg-black transition-colors text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed min-h-[40px]"
        >
          {running ? "Running…" : "Run review"}
        </button>
        <StageStrip stages={stages} liveOverrides={liveStages} />
      </div>

      {keyMissingProvider && <ProviderKeyMissingBanner provider={keyMissingProvider} />}
      {error && <ErrorCallout message={error} compact />}
      {!error && !result && (
        <p className="text-xs italic text-muted">
          Pick a contract-shaped document with extracted text. The Khan
          sample matter ships with a synthetic mutual NDA fixture for the
          demo.
        </p>
      )}

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
