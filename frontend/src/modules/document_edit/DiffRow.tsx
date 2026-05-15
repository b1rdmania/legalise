// DiffRow — single edit's inline tracked-change renderer.
//
// Visual layout: muted context_before / context_after wrapping a char-level
// diff between deleted_text and inserted_text. Status pill + rationale below.

import { DocumentEditRead } from "../../lib/api";
import { diffStrings, DiffSegment } from "./diff";

type Props = {
  edit: DocumentEditRead;
  index: number;
  busy: boolean;
  conflict?: boolean;
  onAccept?: () => void;
  onReject?: () => void;
};

function statusClasses(status: string): string {
  if (status === "accepted") return "text-ink border-ink";
  if (status === "rejected") return "text-muted border-rule";
  return "text-ink border-rule";
}

function renderDiff(segments: DiffSegment[]) {
  return segments.map((seg, i) => {
    if (seg.op === "equal") {
      return (
        <span key={i} className="text-ink">
          {seg.text}
        </span>
      );
    }
    if (seg.op === "delete") {
      return (
        <span key={i} className="line-through text-muted bg-wash">
          {seg.text}
        </span>
      );
    }
    return (
      <span key={i} className="underline decoration-ink text-ink bg-paper">
        {seg.text}
      </span>
    );
  });
}

export function DiffRow({
  edit,
  index,
  busy,
  conflict,
  onAccept,
  onReject,
}: Props) {
  const pending = edit.status === "pending";
  const segments =
    edit.deleted_text && edit.inserted_text
      ? diffStrings(edit.deleted_text, edit.inserted_text)
      : edit.deleted_text
        ? ([{ op: "delete", text: edit.deleted_text }] as DiffSegment[])
        : edit.inserted_text
          ? ([{ op: "insert", text: edit.inserted_text }] as DiffSegment[])
          : [];

  return (
    <div className="border border-rule p-3 text-[12px]">
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <span className="font-mono text-[10px] text-muted">#{index}</span>
        <span
          className={`font-mono uppercase tracking-track2 text-[9px] border px-1.5 py-0.5 ${statusClasses(edit.status)}`}
        >
          {edit.status}
        </span>
        {edit.correlation_id && (
          <span className="font-mono uppercase tracking-track2 text-[9px] text-muted">
            corr · {edit.correlation_id}
          </span>
        )}
        {conflict && (
          <span className="font-mono uppercase tracking-track2 text-[9px] text-muted italic">
            resolved elsewhere — refreshed
          </span>
        )}
        {pending && onAccept && onReject && (
          <div className="ml-auto flex gap-1.5">
            <button
              onClick={onAccept}
              disabled={busy}
              className="bg-ink text-paper px-2.5 py-1 text-[11px] hover:bg-black transition-colors disabled:opacity-40"
            >
              {busy ? "..." : "Accept"}
            </button>
            <button
              onClick={onReject}
              disabled={busy}
              className="border border-rule px-2.5 py-1 text-[11px] hover:bg-wash transition-colors disabled:opacity-40"
            >
              {busy ? "..." : "Reject"}
            </button>
          </div>
        )}
      </div>

      <div className="whitespace-pre-wrap leading-snug border-l-2 border-rule pl-2">
        {edit.context_before && (
          <span className="text-muted">{edit.context_before}</span>
        )}
        {renderDiff(segments)}
        {edit.context_after && (
          <span className="text-muted">{edit.context_after}</span>
        )}
      </div>

      {edit.rationale && (
        <div className="mt-2 text-muted italic">{edit.rationale}</div>
      )}
    </div>
  );
}
