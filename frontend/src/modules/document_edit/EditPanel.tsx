// EditPanel - structured edit-instruction surface.
//
// Per-document panel: textarea + mode dropdown + four preset buttons +
// submit. Renders pending edits read-only after submission. Accept/reject
// UI is the separate TrackedChangesView; this panel deliberately stops at
// "model proposed these edits, here they are."

import { useState } from "react";
import {
  EditMode,
  EditInstructionResponse,
  postEditInstruction,
  ProviderUpstreamError,
  providerUpstreamMessage,
} from "../../lib/api";
import { TrackedChangesView } from "./TrackedChangesView";
import { VersionTimeline } from "./VersionTimeline";
import { ErrorCallout } from "../../ui/primitives";

const PRESETS: { label: string; mode: EditMode; instruction: string }[] = [
  {
    label: "Tighten this clause",
    mode: "tighten",
    instruction:
      "Tighten the prose and remove ambiguous timing language without changing legal effect.",
  },
  {
    label: "Rewrite in plain English",
    mode: "rewrite",
    instruction:
      "Rewrite in clearer modern English while preserving every legal effect, defined term, party, date and citation.",
  },
  {
    label: "Summarise to 3 sentences",
    mode: "summarise",
    instruction: "Summarise the document to at most three sentences.",
  },
  {
    label: "UK-jurisdiction sweep",
    mode: "uk-jurisdiction-sweep",
    instruction:
      "Audit for England & Wales jurisdiction issues. Flag any governing-law / statutory / CPR-36 / UCTA / GDPR concerns.",
  },
];

type EditPanelProps = {
  documentId: string;
  filename: string;
  onClose?: () => void;
  onResolved?: () => void;
  onResult?: (result: EditInstructionResponse) => void;
  showResult?: boolean;
  showTimeline?: boolean;
};

export function EditPanel({
  documentId,
  filename,
  onClose,
  onResolved,
  onResult,
  showResult = true,
  showTimeline = true,
}: EditPanelProps) {
  const [instruction, setInstruction] = useState("");
  const [mode, setMode] = useState<EditMode>("free-text");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<EditInstructionResponse | null>(null);
  const [timelineKey, setTimelineKey] = useState(0);

  const applyPreset = (p: (typeof PRESETS)[number]) => {
    setMode(p.mode);
    setInstruction(p.instruction);
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await postEditInstruction(documentId, instruction.trim(), mode);
      setResult(res);
      onResult?.(res);
      setTimelineKey((k) => k + 1);
    } catch (e: unknown) {
      if (e instanceof ProviderUpstreamError) {
        setError(providerUpstreamMessage(e));
      } else {
        const msg = e instanceof Error ? e.message : String(e);
        setError(`Could not propose edits. ${msg}`);
      }
    } finally {
      setBusy(false);
    }
  };

  const disabled = busy || instruction.trim().length < 4;

  return (
    <div className="space-y-4 bg-paper">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted">
          Editing <span className="font-medium text-ink">{filename}</span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="tech-token uppercase tracking-track2 text-[10px] text-muted hover:text-ink"
          >
            Close
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            onClick={() => applyPreset(p)}
            disabled={busy}
            className="min-h-[44px] border border-rule px-3 py-2 text-left text-[12px] leading-4 text-ink transition-colors hover:border-ink disabled:opacity-40"
          >
            {p.label}
          </button>
        ))}
      </div>

      <textarea
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        rows={4}
        placeholder="Type an edit instruction, or pick a preset above."
        disabled={busy}
        className="w-full resize-vertical border border-rule bg-paper px-3 py-2 font-sans text-[14px] text-ink transition-colors focus:border-ink focus:outline-none"
      />

      <div className="flex flex-wrap items-center gap-3">
        <label className="tech-token uppercase tracking-track2 text-[10px] text-muted">
          Mode
        </label>
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as EditMode)}
          disabled={busy}
          className="bg-paper border border-rule px-2 py-1.5 text-[12px] focus:border-ink focus:outline-none tech-token text-ink"
        >
          <option value="free-text">free-text</option>
          <option value="tighten">tighten</option>
          <option value="rewrite">rewrite</option>
          <option value="summarise">summarise</option>
          <option value="uk-jurisdiction-sweep">uk-jurisdiction-sweep</option>
        </select>
        <button
          onClick={submit}
          disabled={disabled}
          className="bg-ink text-paper px-4 py-2 hover:bg-black transition-colors text-sm font-medium disabled:opacity-40 ml-auto"
        >
          {busy ? "Proposing edits..." : "Propose edits"}
        </button>
      </div>

      {error && (
        <div className="mt-4">
          <ErrorCallout message={error} compact />
        </div>
      )}

      {result && !showResult && (
        <p className="border border-rule bg-paper-sunken px-3 py-2 text-[12px] text-muted">
          Proposed edits are ready in the document review area.
        </p>
      )}

      {result && showResult && (
        <TrackedChangesView
          result={result}
          onResolved={() => {
            setTimelineKey((k) => k + 1);
            onResolved?.();
          }}
        />
      )}

      {showTimeline && (
        <VersionTimeline documentId={documentId} refreshKey={timelineKey} />
      )}
    </div>
  );
}
