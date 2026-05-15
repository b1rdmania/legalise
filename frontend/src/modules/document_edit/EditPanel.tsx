// EditPanel — structured edit-instruction surface (Phase A, §4-pre-A).
//
// Per-document panel: textarea + mode dropdown + four preset buttons +
// submit. Renders pending edits read-only after submission. Accept/reject
// UI lands in Phase B (§4a); Phase A scope deliberately stops at "model
// proposed these edits, here they are."

import { useState } from "react";
import {
  EditMode,
  EditInstructionResponse,
  DocumentEditRead,
  postEditInstruction,
} from "../../lib/api";

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
};

export function EditPanel({ documentId, filename, onClose }: EditPanelProps) {
  const [instruction, setInstruction] = useState("");
  const [mode, setMode] = useState<EditMode>("free-text");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<EditInstructionResponse | null>(null);

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
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const disabled = busy || instruction.trim().length < 4;

  return (
    <div className="border-t border-rule bg-paper p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="font-mono uppercase tracking-track2 text-[10px] text-muted">
          Edit · {filename}
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="font-mono uppercase tracking-track2 text-[10px] text-muted hover:text-ink"
          >
            Close
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            onClick={() => applyPreset(p)}
            disabled={busy}
            className="border border-rule px-3 py-1.5 text-[12px] hover:bg-wash transition-colors text-ink disabled:opacity-40"
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
        className="w-full bg-paper border border-rule px-3 py-2 text-[14px] focus:border-ink focus:outline-none transition-colors font-sans text-ink resize-vertical"
      />

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className="font-mono uppercase tracking-track2 text-[10px] text-muted">
          Mode
        </label>
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as EditMode)}
          disabled={busy}
          className="bg-paper border border-rule px-2 py-1.5 text-[12px] focus:border-ink focus:outline-none font-mono text-ink"
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
        <div className="mt-4 border border-rule bg-wash p-3 text-[12px] text-ink font-mono whitespace-pre-wrap">
          {error}
        </div>
      )}

      {result && <PendingEditsList result={result} />}
    </div>
  );
}

function PendingEditsList({ result }: { result: EditInstructionResponse }) {
  return (
    <div className="mt-5 border-t border-rule pt-4">
      <div className="flex items-center justify-between mb-2">
        <div className="font-mono uppercase tracking-track2 text-[10px] text-muted">
          Version v{result.version.version_number} · {result.pending_edits.length}{" "}
          pending edit{result.pending_edits.length === 1 ? "" : "s"} · model{" "}
          {result.model_used}
          {!result.parse_ok && " · parse failed"}
        </div>
      </div>

      {result.model_notes && (
        <div className="mb-3 text-[12px] text-muted italic">
          {result.model_notes}
        </div>
      )}

      {result.pending_edits.length === 0 && (
        <div className="border border-rule bg-wash p-3 text-[12px] text-muted">
          No edits proposed. Try a different instruction or mode.
        </div>
      )}

      {result.pending_edits.length > 0 && (
        <div className="space-y-3">
          {result.pending_edits.map((e, i) => (
            <PendingEditRow key={e.id} edit={e} index={i + 1} />
          ))}
        </div>
      )}

      <div className="mt-3 font-mono uppercase tracking-track2 text-[9px] text-muted">
        Accept / reject UI lands in Phase B. Phase A surface is read-only.
      </div>
    </div>
  );
}

function PendingEditRow({ edit, index }: { edit: DocumentEditRead; index: number }) {
  return (
    <div className="border border-rule p-3 text-[12px]">
      <div className="flex items-center gap-2 mb-2">
        <span className="font-mono text-[10px] text-muted">#{index}</span>
        <span className="font-mono uppercase tracking-track2 text-[9px] text-muted">
          status · {edit.status}
        </span>
        {edit.correlation_id && (
          <span className="font-mono uppercase tracking-track2 text-[9px] text-muted">
            corr · {edit.correlation_id}
          </span>
        )}
      </div>
      {edit.deleted_text && (
        <div className="mb-1">
          <span className="font-mono uppercase tracking-track2 text-[9px] text-muted">
            delete
          </span>
          <div className="border-l-2 border-rule pl-2 mt-1 line-through text-ink whitespace-pre-wrap">
            {edit.deleted_text}
          </div>
        </div>
      )}
      {edit.inserted_text && (
        <div className="mb-1">
          <span className="font-mono uppercase tracking-track2 text-[9px] text-muted">
            insert
          </span>
          <div className="border-l-2 border-ink pl-2 mt-1 text-ink whitespace-pre-wrap">
            {edit.inserted_text}
          </div>
        </div>
      )}
      {edit.rationale && (
        <div className="mt-2 text-muted italic">{edit.rationale}</div>
      )}
    </div>
  );
}
