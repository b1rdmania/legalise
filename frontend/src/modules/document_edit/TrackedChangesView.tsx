// TrackedChangesView - interactive accept/reject panel for proposed edits.
//
// Replaces Phase A's read-only PendingEditsList. Renders per-edit DiffRows
// with inline Accept / Reject buttons + bulk header buttons. Updates the
// `result.pending_edits` array in place from API responses so we never
// re-call the model on resolution.

import { useState } from "react";
import {
  ConflictError,
  DocumentEditRead,
  DocumentVersionRead,
  EditInstructionResponse,
  acceptAll,
  acceptEdit,
  rejectAll,
  rejectEdit,
} from "../../lib/api";
import { DiffRow } from "./DiffRow";
import { ErrorCallout } from "../../ui/primitives";

type Props = {
  result: EditInstructionResponse;
  onResolved?: () => void;
};

type ResolvedBanner = {
  versionNumber: number;
  textLength: number;
};

export function TrackedChangesView({ result, onResolved }: Props) {
  const [edits, setEdits] = useState<DocumentEditRead[]>(result.pending_edits);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState<null | "accept" | "reject">(null);
  const [conflicts, setConflicts] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<ResolvedBanner | null>(null);

  const replaceEdit = (next: DocumentEditRead) =>
    setEdits((cur) => cur.map((e) => (e.id === next.id ? next : e)));

  const replaceAllOnVersion = (
    versionId: string,
    status: "accepted" | "rejected",
  ) =>
    setEdits((cur) =>
      cur.map((e) =>
        e.document_version_id === versionId && e.status === "pending"
          ? { ...e, status }
          : e,
      ),
    );

  const flashBanner = (v: DocumentVersionRead, len: number) =>
    setBanner({ versionNumber: v.version_number, textLength: len });

  const handleResolve = async (
    edit: DocumentEditRead,
    action: "accept" | "reject",
  ) => {
    setBusyId(edit.id);
    setError(null);
    try {
      const res =
        action === "accept" ? await acceptEdit(edit.id) : await rejectEdit(edit.id);
      replaceEdit(res.edit);
      if (res.new_version) {
        flashBanner(res.new_version, (res.resolved_text || "").length);
      }
      onResolved?.();
    } catch (e: unknown) {
      if (e instanceof ConflictError) {
        setConflicts((prev) => new Set(prev).add(edit.id));
        // Best we can do without a full refetch: mark this row resolved.
        replaceEdit({ ...edit, status: "accepted" });
        onResolved?.();
      } else {
        const msg = e instanceof Error ? e.message : String(e);
        setError(`Could not ${action} this edit. ${msg}`);
      }
    } finally {
      setBusyId(null);
    }
  };

  const handleBulk = async (action: "accept" | "reject") => {
    setBulkBusy(action);
    setError(null);
    try {
      const res =
        action === "accept"
          ? await acceptAll(result.version.id)
          : await rejectAll(result.version.id);
      replaceAllOnVersion(
        result.version.id,
        action === "accept" ? "accepted" : "rejected",
      );
      flashBanner(res.new_version, (res.resolved_text || "").length);
      onResolved?.();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`Could not ${action} all edits. ${msg}`);
    } finally {
      setBulkBusy(null);
    }
  };

  const pendingCount = edits.filter((e) => e.status === "pending").length;

  return (
    <div className="mt-5 border-t border-rule pt-4">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <div className="font-mono uppercase tracking-track2 text-[10px] text-muted">
          Version v{result.version.version_number} · {edits.length} edit
          {edits.length === 1 ? "" : "s"} · {pendingCount} pending · model{" "}
          {result.model_used}
          {!result.parse_ok && " · parse failed"}
        </div>
        {pendingCount > 0 && (
          <div className="flex gap-1.5">
            <button
              onClick={() => handleBulk("accept")}
              disabled={bulkBusy !== null}
              className="bg-ink text-paper px-3 py-1 text-[11px] hover:bg-black transition-colors disabled:opacity-40"
            >
              {bulkBusy === "accept" ? "Accepting..." : "Accept all"}
            </button>
            <button
              onClick={() => handleBulk("reject")}
              disabled={bulkBusy !== null}
              className="border border-rule px-3 py-1 text-[11px] hover:bg-wash transition-colors disabled:opacity-40"
            >
              {bulkBusy === "reject" ? "Rejecting..." : "Reject all"}
            </button>
          </div>
        )}
      </div>

      {result.model_notes && (
        <div className="mb-3 text-[12px] text-muted italic">
          {result.model_notes}
        </div>
      )}

      {banner && (
        <div className="mb-3 border border-ink bg-wash p-2 text-[11px] text-ink font-mono">
          Version v{banner.versionNumber} saved · {banner.textLength} chars
        </div>
      )}

      {error && (
        <div className="mb-3">
          <ErrorCallout message={error} compact />
        </div>
      )}

      {edits.length === 0 && (
        <div className="border border-rule bg-wash p-3 text-[12px] text-muted">
          No edits proposed. Try a different instruction or mode.
        </div>
      )}

      {edits.length > 0 && (
        <div className="space-y-3">
          {edits.map((e, i) => (
            <DiffRow
              key={e.id}
              edit={e}
              index={i + 1}
              busy={busyId === e.id || bulkBusy !== null}
              conflict={conflicts.has(e.id)}
              onAccept={() => handleResolve(e, "accept")}
              onReject={() => handleResolve(e, "reject")}
            />
          ))}
        </div>
      )}
    </div>
  );
}
