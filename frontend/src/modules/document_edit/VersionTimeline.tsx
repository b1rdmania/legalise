// VersionTimeline - vertical list of document versions with edit counts.
//
// Fetches `getDocumentVersions(documentId)` on mount + whenever `refreshKey`
// changes. Renders nothing if no versions exist (invariant: every
// document has at least a v1 upload).

import { useEffect, useState } from "react";
import {
  DocumentVersionSummary,
  documentVersionDocxUrl,
  getDocumentVersions,
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
};

export function VersionTimeline({
  documentId,
  refreshKey = 0,
  versions: providedVersions,
  selectedVersionId,
  onSelectVersion,
}: Props) {
  const [fetchedVersions, setFetchedVersions] = useState<DocumentVersionSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

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
          Open a saved version in the editor, or download it as an audited DOCX.
        </p>
      </div>
      <ol className="space-y-2">
        {versions.map((s) => (
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
                <p className="mt-2 text-xs text-muted">
                  {s.pending_count} pending · {s.accepted_count} accepted ·{" "}
                  {s.rejected_count} rejected
                </p>
              </div>
              {s.version.resolved_text && (
                <div className="flex flex-wrap gap-2">
                  {onSelectVersion && (
                    <button
                      type="button"
                      onClick={() => onSelectVersion(s.version.id)}
                      className="border border-rule px-3 py-2 text-xs font-semibold text-ink hover:border-ink"
                    >
                      {selectedVersionId === s.version.id ? "Open in editor" : "Open version"}
                    </button>
                  )}
                  <a
                    href={documentVersionDocxUrl(documentId, s.version.id)}
                    className="border border-ink bg-ink px-3 py-2 text-xs font-semibold text-paper hover:bg-black"
                  >
                    Download DOCX
                  </a>
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
