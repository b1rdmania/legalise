import { useState } from "react";
import type { ChangeEvent } from "react";
import { Link } from "@tanstack/react-router";
import type { MatterDocument } from "../../lib/api";
import { UploadError } from "../../lib/api";
import { Badge, EmptyState, ErrorCallout, LoadingLine } from "../../ui/primitives";

function formatBytes(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)}K`;
  return `${(n / 1024 / 1024).toFixed(1)}M`;
}

// Derive a Type label from the document. Prefer the user-set tag, else
// fall back to the file extension. Always uppercased.
function deriveType(d: MatterDocument): string {
  if (d.tag) return d.tag.toUpperCase();
  const name = d.filename.toLowerCase();
  const dot = name.lastIndexOf(".");
  if (dot < 0) return "FILE";
  const ext = name.slice(dot + 1);
  if (ext === "pdf") return "PDF";
  if (ext === "docx") return "DOCX";
  if (ext === "txt") return "TXT";
  return "FILE";
}

// Format an ISO timestamp as "12 Mar 2026". The MatterDocument type only
// carries `uploaded_at`, so that is treated as the most recent mutation
// timestamp for the "Updated" column.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function formatDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso.slice(0, 10);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function DocumentsTab({
  slug,
  docs,
  onUpload,
}: {
  slug: string;
  docs: MatterDocument[] | null;
  onUpload: (
    file: File,
    tag?: string,
    fromDisclosure?: boolean,
  ) => void | Promise<void>;
}) {
  const [tag, setTag] = useState("");
  const [fromDisclosure, setFromDisclosure] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    try {
      await onUpload(file, tag || undefined, fromDisclosure || undefined);
    } catch (err) {
      // Caller may rethrow UploadError so the inline banner can show
      // the friendly message. Anything else falls through to a
      // generic message; the page-level banner still catches it too.
      if (err instanceof UploadError) {
        setUploadError(err.message);
      } else {
        setUploadError("Upload failed. Try again or pick a different file.");
      }
    }
    e.target.value = "";
  };

  // Phase 17-IA-B: compact upload control. The prior version was an
  // outsized band (big input + large padding) that dominated the
  // documents view (MD-3). Keep 16px text (mobile no-zoom) but tighten
  // padding and constrain the tag field width.
  const inputCls =
    "bg-paper border border-rule px-3 py-2 text-[16px] focus:border-ink focus:outline-none transition-colors min-h-[40px] font-sans text-ink w-44";

  // Column template shared by the header row and each data row so columns
  // stay aligned. Document gets the largest fr; full SHA moves into the
  // expand drawer (short hash still shown as muted secondary line under
  // the filename) so the primary scan path is workflow-shaped.
  const gridCols =
    "grid grid-cols-[1.5fr_110px_90px_110px_130px_72px] gap-4 px-4 py-3";

  return (
    <div className="max-w-4xl">
      <form className="mb-8 flex flex-wrap items-center gap-3 border border-rule bg-wash px-3 py-2.5">
        <input
          value={tag}
          onChange={(e) => setTag(e.target.value)}
          className={inputCls}
          placeholder="Tag (optional)"
          aria-label="Document tag"
        />
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={fromDisclosure}
            onChange={(e) => setFromDisclosure(e.target.checked)}
          />
          From disclosure (CPR 31)
        </label>
        <label className="ml-auto bg-ink text-paper px-3 py-2 hover:bg-black transition-colors text-sm font-medium min-h-[40px] inline-flex items-center cursor-pointer">
          Upload document
          <input type="file" className="hidden" onChange={onFile} />
        </label>
      </form>

      {uploadError && <ErrorCallout message={uploadError} compact />}

      {!docs && <LoadingLine label="loading documents" />}
      {docs && docs.length === 0 && (
        <EmptyState
          title="No documents registered yet"
          body="Upload a document above to populate the matter."
        />
      )}
      {docs && docs.length > 0 && (
        <div className="border-t border-rule overflow-x-auto">
          <div className="min-w-[720px]">
            <div
              className={`${gridCols} text-muted bg-paper border-b border-rule font-mono uppercase tracking-track2 text-[9px]`}
            >
              <span>Document</span>
              <span>Type</span>
              <span>Size</span>
              <span>Disclosure</span>
              <span>Updated</span>
              <span className="text-right">Action</span>
            </div>
            {docs.map((d) => {
              const typeLabel = deriveType(d);
              return (
                <Link
                  key={d.id}
                  to="/matters/$slug/documents/$documentId"
                  params={{ slug, documentId: d.id }}
                  className={`${gridCols} border-b border-rule hover:bg-wash transition-colors items-center`}
                  title={`SHA-256 ${d.sha256}`}
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-ink truncate">
                      {d.filename}
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted truncate">
                      {d.sha256.slice(0, 8)}
                    </div>
                  </div>
                  <span>
                    <Badge>{typeLabel}</Badge>
                  </span>
                  <span className="text-xs text-ink">
                    {formatBytes(d.size_bytes)}
                  </span>
                  <span>
                    {d.from_disclosure ? (
                      <Badge>CPR 31</Badge>
                    ) : (
                      <span className="text-xs text-muted">Upload</span>
                    )}
                  </span>
                  <span className="text-xs text-ink">
                    {formatDate(d.uploaded_at)}
                  </span>
                  <span className="text-muted uppercase tracking-track2 text-[9px] text-right">
                    Open
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
