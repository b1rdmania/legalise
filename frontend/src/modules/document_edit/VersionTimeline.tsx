import { useEffect, useState } from "react";
import {
  DocumentVersionSummary,
  documentVersionDocxUrl,
  documentVersionOriginalUrl,
  getDocumentVersions,
  restoreDocumentVersion,
} from "../../lib/api";

const KIND_LABEL: Record<string, string> = {
  upload: "Upload",
  assistant_edit: "Assistant edit",
  user_accept: "User accept",
  user_reject: "User reject",
  user_edit: "User edit",
  generated: "Generated",
  replicated: "Replicated",
  restored: "Restored",
};

const KIND_TONE: Record<string, string> = {
  upload: "Original file",
  assistant_edit: "Suggested edit",
  user_accept: "Accepted redlines",
  user_reject: "Rejected redlines",
  user_edit: "Manual edit",
  generated: "Generated",
  replicated: "Replicated",
  restored: "Restored copy",
};

function fmt(ts: string): string {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return ts;
  }
}

type Props = {
  documentId: string;
  refreshKey?: number;
  versions?: DocumentVersionSummary[];
  selectedVersionId?: string | null;
  reviewNoteCount?: number;
  onSelectVersion?: (versionId: string) => void;
  onVersionRestored?: () => void | Promise<void>;
};

export function VersionTimeline({
  documentId,
  refreshKey = 0,
  versions: providedVersions,
  selectedVersionId,
  reviewNoteCount = 0,
  onSelectVersion,
  onVersionRestored,
}: Props) {
  const [fetchedVersions, setFetchedVersions] = useState<DocumentVersionSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  useEffect(() => {
    if (providedVersions) return undefined;
    let cancelled = false;
    getDocumentVersions(documentId)
      .then((vs) => {
        if (!cancelled) setFetchedVersions(vs);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : String(e);
          setError(`Could not load version history. ${msg}`);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [documentId, providedVersions, refreshKey]);

  const versions = providedVersions ?? fetchedVersions;
  const versionStats = versions.reduce(
    (summary, item) => {
      summary.pending += item.pending_count;
      summary.accepted += item.accepted_count;
      summary.rejected += item.rejected_count;
      if (item.version.resolved_text) summary.editable += 1;
      if (item.version.storage_uri) summary.files += 1;
      return summary;
    },
    { pending: 0, accepted: 0, rejected: 0, editable: 0, files: 0 },
  );

  const restore = async (versionId: string) => {
    setRestoreError(null);
    setRestoringId(versionId);
    try {
      await restoreDocumentVersion(documentId, versionId);
      if (providedVersions) {
        await onVersionRestored?.();
      } else {
        const vs = await getDocumentVersions(documentId);
        setFetchedVersions(vs);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setRestoreError(`Could not restore version. ${msg}`);
    } finally {
      setRestoringId(null);
    }
  };

  if (error) {
    return (
      <div className="mt-4 border border-rule bg-wash p-3 text-[11px] text-muted tech-token">
        {error}
      </div>
    );
  }
  if (versions.length === 0) return null;
  const latestVersionNumber = Math.max(...versions.map((s) => s.version.version_number));

  return (
    <div className="mt-5 border-t border-rule pt-4">
      <div className="mb-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <div>
          <h3 className="text-sm font-semibold text-ink">Saved versions</h3>
          <p className="mt-1 text-xs leading-5 text-muted">
            Each row is a preserved copy of the document. Open a copy, compare it,
            restore it, or download the file that was actually saved.
          </p>
        </div>
        <dl className="grid grid-cols-3 gap-2 text-center text-xs">
          <div className="border border-rule bg-paper p-2">
            <dt className="tech-token uppercase tracking-track2 text-muted">Versions</dt>
            <dd className="mt-1 text-sm font-semibold text-ink">{versions.length}</dd>
          </div>
          <div className="border border-rule bg-paper p-2">
            <dt className="tech-token uppercase tracking-track2 text-muted">Editable</dt>
            <dd className="mt-1 text-sm font-semibold text-ink">{versionStats.editable}</dd>
          </div>
          <div className="border border-rule bg-paper p-2">
            <dt className="tech-token uppercase tracking-track2 text-muted">Files</dt>
            <dd className="mt-1 text-sm font-semibold text-ink">{versionStats.files}</dd>
          </div>
        </dl>
      </div>
      {(versionStats.pending > 0 ||
        versionStats.accepted > 0 ||
        versionStats.rejected > 0) && (
        <p
          className="mb-3 border border-rule bg-paper-sunken px-3 py-2 text-xs leading-5 text-muted"
          data-testid="version-redline-summary"
        >
          Redlines: {versionStats.pending} pending · {versionStats.accepted} accepted ·{" "}
          {versionStats.rejected} rejected.
        </p>
      )}
      {restoreError && (
        <div className="mb-3 border border-danger/40 bg-danger/5 p-3 text-xs text-danger">
          {restoreError}
        </div>
      )}
      <ol className="space-y-2">
        {versions.map((s) => {
          const hasOriginal = Boolean(s.version.storage_uri);
          const hasEditableText = Boolean(s.version.resolved_text);
          const canRestore = hasOriginal || hasEditableText;
          const isLatest = s.version.version_number === latestVersionNumber;
          return (
            <li
              key={s.version.id}
              className={`border bg-paper p-4 text-sm ${
                selectedVersionId === s.version.id
                  ? "border-ink"
                  : "border-rule"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-ink">
                      v{s.version.version_number}{" "}
                      <span className="font-normal text-muted">
                        {KIND_LABEL[s.version.kind] || s.version.kind}
                      </span>
                    </p>
                    {isLatest && (
                      <span className="border border-ink bg-ink px-2 py-0.5 text-[10px] font-semibold uppercase tracking-track2 text-paper">
                        Current
                      </span>
                    )}
                    <span className="border border-rule bg-paper-sunken px-2 py-0.5 text-[10px] font-semibold uppercase tracking-track2 text-muted">
                      {KIND_TONE[s.version.kind] || "Document copy"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted">{fmt(s.version.created_at)}</p>
                  {(s.version.filename || s.version.mime_type || s.version.sha256) && (
                    <p className="mt-2 max-w-xl text-xs leading-5 text-muted">
                      {s.version.filename || "saved document"} ·{" "}
                      {s.version.mime_type || "unknown type"}
                      {s.version.sha256 ? ` · ${s.version.sha256.slice(0, 10)}` : ""}
                    </p>
                  )}
                  {s.version.notes && (
                    <p className="mt-2 max-w-xl text-xs leading-5 text-ink">
                      {s.version.notes}
                    </p>
                  )}
                  <p className="mt-2 text-xs text-muted">
                    Redlines: {s.pending_count} pending · {s.accepted_count} accepted ·{" "}
                    {s.rejected_count} rejected.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {hasEditableText && onSelectVersion && (
                    <button
                      type="button"
                      onClick={() => onSelectVersion(s.version.id)}
                      className="border border-rule px-3 py-2 text-xs font-semibold text-ink hover:border-ink"
                    >
                      {selectedVersionId === s.version.id ? "Open in editor" : "Open version"}
                    </button>
                  )}
                  {hasEditableText && (
                    <div className="grid gap-1">
                      <a
                        href={documentVersionDocxUrl(documentId, s.version.id)}
                        className="border border-ink bg-ink px-3 py-2 text-xs font-semibold text-paper hover:bg-black"
                      >
                        Download DOCX
                      </a>
                      {reviewNoteCount > 0 && (
                        <p className="text-[11px] leading-4 text-muted">
                          Includes {reviewNoteCount} review{" "}
                          {reviewNoteCount === 1 ? "note" : "notes"}.
                        </p>
                      )}
                    </div>
                  )}
                  {hasOriginal && (
                    <>
                      <a
                        href={documentVersionOriginalUrl(documentId, s.version.id)}
                        target="_blank"
                        rel="noreferrer"
                        className="border border-rule px-3 py-2 text-xs font-semibold text-ink hover:border-ink"
                      >
                        Open original
                      </a>
                      <a
                        href={documentVersionOriginalUrl(documentId, s.version.id, {
                          download: true,
                        })}
                        className="border border-rule px-3 py-2 text-xs font-semibold text-ink hover:border-ink"
                      >
                        Download original
                      </a>
                    </>
                  )}
                  {!hasOriginal && !hasEditableText && (
                    <span className="border border-rule px-3 py-2 text-xs font-semibold text-muted">
                      No file available
                    </span>
                  )}
                  {canRestore && (
                    <button
                      type="button"
                      disabled={isLatest || restoringId === s.version.id}
                      onClick={() => void restore(s.version.id)}
                      className="border border-rule px-3 py-2 text-xs font-semibold text-ink hover:border-ink disabled:cursor-not-allowed disabled:text-muted"
                    >
                      {isLatest
                        ? "Current"
                        : restoringId === s.version.id
                          ? "Restoring..."
                          : "Restore"}
                    </button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
