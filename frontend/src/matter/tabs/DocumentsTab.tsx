import { useState } from "react";
import type { ChangeEvent, DragEvent } from "react";
import { Link } from "@tanstack/react-router";
import { FileUp } from "lucide-react";
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

type IngressStatus =
  | { kind: "idle" }
  | { kind: "uploading"; done: number; total: number; current: string }
  | { kind: "done"; count: number }
  | { kind: "error"; message: string };

const TAG_OPTIONS = [
  { value: "", label: "No tag" },
  { value: "disclosure", label: "Disclosure" },
  { value: "draft", label: "Draft" },
  { value: "cleared", label: "Cleared" },
  { value: "signed", label: "Signed" },
] as const;

const ACCEPTED_TYPES = ".pdf,.docx,.txt";

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
  const [ingress, setIngress] = useState<IngressStatus>({ kind: "idle" });
  const [dragging, setDragging] = useState(false);

  const uploadFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setUploadError(null);
    setIngress({ kind: "uploading", done: 0, total: files.length, current: files[0].name });
    for (let i = 0; i < files.length; i += 1) {
      const file = files[i];
      setIngress({ kind: "uploading", done: i, total: files.length, current: file.name });
      try {
        await onUpload(file, tag || undefined, fromDisclosure || undefined);
      } catch (err) {
        // Caller may rethrow UploadError so the inline banner can show
        // the friendly message. Anything else falls through to a
        // generic message; the page-level banner still catches it too.
        const message =
          err instanceof UploadError
            ? err.message
            : `Upload failed for ${file.name}. Try again or pick a different file.`;
        setUploadError(message);
        setIngress({ kind: "error", message });
        return;
      }
    }
    setIngress({ kind: "done", count: files.length });
  };

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    await uploadFiles(files);
    e.target.value = "";
  };

  const onDrop = async (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setDragging(false);
    await uploadFiles(Array.from(e.dataTransfer.files ?? []));
  };

  const inputCls =
    "bg-paper border border-rule px-3 py-2 text-[16px] focus:border-ink focus:outline-none transition-colors min-h-[40px] font-sans text-ink";

  // Column template shared by the header row and each data row so columns
  // stay aligned. Document gets the largest fr; full SHA moves into the
  // expand drawer (short hash still shown as muted secondary line under
  // the filename) so the primary scan path is workflow-shaped.
  const gridCols =
    "grid grid-cols-[1.5fr_110px_90px_110px_130px_72px] gap-4 px-4 py-3";

  return (
    <div className="max-w-4xl">
      <details className="mb-8 border border-rule bg-paper" open={!docs || docs.length === 0}>
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-ink">
          Add documents
          <span className="ml-2 font-normal text-muted">
            PDFs, Word files, or text; each upload is hashed and recorded.
          </span>
        </summary>
        <div className="grid gap-px border-t border-rule bg-rule md:grid-cols-[1.4fr_1fr]">
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={`flex min-h-[132px] cursor-pointer flex-col justify-center bg-paper p-5 transition-colors ${
              dragging ? "bg-wash" : "hover:bg-wash"
            }`}
          >
            <span className="flex h-10 w-10 items-center justify-center border border-rule bg-paper-sunken">
              <FileUp size={18} aria-hidden="true" />
            </span>
            <span className="mt-4 text-base font-medium text-ink">
              Drop files here, or click to browse
            </span>
            <span className="mt-1 text-sm text-muted">
              Extraction and audit trail are automatic.
            </span>
            <input
              type="file"
              className="hidden"
              onChange={onFile}
              multiple
              accept={ACCEPTED_TYPES}
              aria-label="Upload documents"
            />
          </label>
          <div className="bg-paper p-5">
            <div className="grid gap-3">
              <label className="text-xs uppercase tracking-widest text-muted">
                Tag
                <select
                  value={tag}
                  onChange={(e) => setTag(e.target.value)}
                  className={`${inputCls} mt-1 w-full normal-case tracking-normal`}
                >
                  {TAG_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-start gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={fromDisclosure}
                  onChange={(e) => setFromDisclosure(e.target.checked)}
                  className="mt-1"
                />
                <span>
                  From disclosure{" "}
                  <span className="text-muted">(CPR 31 material)</span>
                </span>
              </label>
              <div className="border-t border-rule pt-3 text-sm text-muted" data-testid="document-ingress-status">
                {ingress.kind === "idle" && "Ready for matter documents."}
                {ingress.kind === "uploading" &&
                  `Uploading ${ingress.done + 1}/${ingress.total}: ${ingress.current}`}
                {ingress.kind === "done" &&
                  `${ingress.count} document${ingress.count === 1 ? "" : "s"} uploaded and queued for use.`}
                {ingress.kind === "error" && ingress.message}
              </div>
            </div>
          </div>
        </div>
      </details>

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
