// VersionTimeline - vertical list of document versions with edit counts.
//
// Fetches `getDocumentVersions(documentId)` on mount + whenever `refreshKey`
// changes. Renders nothing if no versions exist (invariant: every
// document has at least a v1 upload).

import { useEffect, useState } from "react";
import { DocumentVersionSummary, getDocumentVersions } from "../../lib/api";

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
};

export function VersionTimeline({ documentId, refreshKey = 0 }: Props) {
  const [versions, setVersions] = useState<DocumentVersionSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getDocumentVersions(documentId)
      .then((vs) => {
        if (!cancelled) setVersions(vs);
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
  }, [documentId, refreshKey]);

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
      <div className="font-mono uppercase tracking-track2 text-[10px] text-muted mb-2">
        Versions
      </div>
      <ol className="space-y-1.5">
        {versions.map((s) => (
          <li
            key={s.version.id}
            className="flex items-baseline gap-3 text-[12px] border-l-2 border-rule pl-3"
          >
            <span className="font-mono text-[11px] text-ink">
              v{s.version.version_number}
            </span>
            <span className="font-mono uppercase tracking-track2 text-[9px] text-muted">
              {KIND_LABEL[s.version.kind] || s.version.kind}
            </span>
            <span className="text-muted text-[11px]">{fmt(s.version.created_at)}</span>
            <span className="ml-auto font-mono text-[10px] text-muted">
              {s.pending_count} pending · {s.accepted_count} accepted · {s.rejected_count} rejected
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
