// ColumnEditor — array editor for a review's columns_config.
//
// Per-row inline form: snake_case key, label, prompt textarea, type
// dropdown, delete. Add-column row at bottom. Changes are debounced
// and persisted via the parent's onSave (PATCH /reviews/{id}).

import { useState } from "react";
import { ColumnSpec } from "./api";

type Props = {
  columns: ColumnSpec[];
  onChange: (next: ColumnSpec[]) => void;
};

const TYPES: ColumnSpec["type"][] = ["text", "date", "yesno", "number"];

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
}

export function ColumnEditor({ columns, onChange }: Props) {
  const [draftLabel, setDraftLabel] = useState("");
  const [draftPrompt, setDraftPrompt] = useState("");
  const [draftType, setDraftType] = useState<ColumnSpec["type"]>("text");

  const update = (i: number, patch: Partial<ColumnSpec>) => {
    const next = columns.map((c, idx) => (idx === i ? { ...c, ...patch } : c));
    onChange(next);
  };

  const remove = (i: number) => {
    onChange(columns.filter((_, idx) => idx !== i));
  };

  const add = () => {
    if (!draftLabel.trim() || draftPrompt.trim().length < 4) return;
    const key = slugify(draftLabel) || `col_${columns.length + 1}`;
    if (columns.some((c) => c.key === key)) {
      alert(`Column key "${key}" already exists. Tweak the label.`);
      return;
    }
    onChange([
      ...columns,
      { key, label: draftLabel.trim(), prompt: draftPrompt.trim(), type: draftType },
    ]);
    setDraftLabel("");
    setDraftPrompt("");
    setDraftType("text");
  };

  return (
    <div className="space-y-3">
      <div className="text-sm font-medium text-neutral-700">Columns</div>

      {columns.length === 0 && (
        <div className="text-xs text-neutral-500 italic">No columns yet.</div>
      )}

      <div className="space-y-2">
        {columns.map((c, i) => (
          <div
            key={c.key}
            className="grid grid-cols-12 gap-2 p-2 border border-neutral-200 rounded bg-white"
          >
            <input
              className="col-span-3 px-2 py-1 text-sm border border-neutral-300 rounded"
              value={c.label}
              onChange={(e) => update(i, { label: e.target.value })}
              placeholder="Label"
            />
            <textarea
              className="col-span-6 px-2 py-1 text-sm border border-neutral-300 rounded resize-y min-h-[2.5rem]"
              value={c.prompt}
              onChange={(e) => update(i, { prompt: e.target.value })}
              placeholder="Prompt — what should the model extract?"
            />
            <select
              className="col-span-2 px-2 py-1 text-sm border border-neutral-300 rounded"
              value={c.type}
              onChange={(e) => update(i, { type: e.target.value as ColumnSpec["type"] })}
            >
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <button
              className="col-span-1 text-xs text-red-600 hover:underline"
              onClick={() => remove(i)}
            >
              Remove
            </button>
            <div className="col-span-12 text-[10px] text-neutral-400 font-mono pl-1">
              key: {c.key}
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-12 gap-2 p-2 border border-dashed border-neutral-300 rounded">
        <input
          className="col-span-3 px-2 py-1 text-sm border border-neutral-300 rounded"
          value={draftLabel}
          onChange={(e) => setDraftLabel(e.target.value)}
          placeholder="New column label"
        />
        <textarea
          className="col-span-6 px-2 py-1 text-sm border border-neutral-300 rounded resize-y min-h-[2.5rem]"
          value={draftPrompt}
          onChange={(e) => setDraftPrompt(e.target.value)}
          placeholder="Prompt (≥4 chars)"
        />
        <select
          className="col-span-2 px-2 py-1 text-sm border border-neutral-300 rounded"
          value={draftType}
          onChange={(e) => setDraftType(e.target.value as ColumnSpec["type"])}
        >
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <button
          className="col-span-1 text-xs text-neutral-700 hover:underline disabled:opacity-40"
          onClick={add}
          disabled={!draftLabel.trim() || draftPrompt.trim().length < 4}
        >
          Add
        </button>
      </div>
    </div>
  );
}
