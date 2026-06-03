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
  generated: "Generated",
  replicated: "Replicated",
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
  onSelectVersion?: (versionId: string) => void;
  onVersionRestored?: () => void | Promise<void>;
};

export function VersionTimeline({
  documentId,
  refreshKey = 0,
  versions: providedVersions,
  selectedVersionId,
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
  const latestVersionNumber = Math.max(...versions.map((s) => s.version.version_number));

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
      <div className="mt-4 border border-rule bg-wash p-3 text-[11px] text-muted font-mono">
        {error}
      </div>
    );
  }
  if (versions.length === 0) return null;

  return (
    <div className="mt-5 border-t border-rule pt-4">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-ink">Saved versions</h3>
        <p className="mt-1 text-xs leading-5 text-muted">
          Open prior uploads, review saved edits, restore an older copy, or download an audited file.
        </p>
      </div>
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
              className={`border bg-paper p-3 text-sm ${
                selectedVersionId === s.version.id
                  ? "border-ink"
                  : "border-rule"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-ink">
                    v{s.version.version_number}{" "}
                    <span className="font-normal text-muted">
                      {KIND_LABEL[s.version.kind] || s.version.kind}
                    </span>
                  </p>
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
                    {s.pending_count} pending · {s.accepted_count} accepted ·{" "}
                    {s.rejected_count} rejected
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
                    <a
                      href={documentVersionDocxUrl(documentId, s.version.id)}
                      className="border border-ink bg-ink px-3 py-2 text-xs font-semibold text-paper hover:bg-black"
                    >
                      Download DOCX
                    </a>
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
                        ? "Active"
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
