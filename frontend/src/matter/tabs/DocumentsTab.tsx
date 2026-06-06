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

function plural(count: number, singular: string, pluralLabel = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralLabel}`;
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
  const [documentQuery, setDocumentQuery] = useState("");
  const [documentFilter, setDocumentFilter] =
    useState<"all" | "disclosure" | "notes">("all");

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
  const totalBytes = docs?.reduce((total, d) => total + d.size_bytes, 0) ?? 0;
  const disclosureCount = docs?.filter((d) => d.from_disclosure).length ?? 0;
  const openNoteCount =
    docs?.reduce((total, d) => total + (d.open_comment_count ?? 0), 0) ?? 0;
  const versionCount =
    docs?.reduce((total, d) => total + (d.version_count ?? 0), 0) ?? 0;
  const pendingEditCount =
    docs?.reduce((total, d) => total + (d.pending_edit_count ?? 0), 0) ?? 0;
  const filteredDocs =
    docs?.filter((d) => {
      const query = documentQuery.trim().toLowerCase();
      const matchesQuery =
        !query ||
        [
          d.filename,
          d.tag ?? "",
          d.sha256,
          d.from_disclosure ? "disclosure cpr 31" : "upload",
          deriveType(d),
        ]
          .join(" ")
          .toLowerCase()
          .includes(query);
      const matchesFilter =
        documentFilter === "all" ||
        (documentFilter === "disclosure" && d.from_disclosure) ||
        (documentFilter === "notes" && (d.comment_count ?? 0) > 0);
      return matchesQuery && matchesFilter;
    }) ?? null;

  return (
    <div className="max-w-4xl">
      <details className="mb-8 rounded-card border border-rule bg-paper" open={!docs || docs.length === 0}>
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
            <span className="flex h-10 w-10 items-center justify-center rounded-item border border-rule bg-paper-sunken">
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
        <div>
          <div className="mb-4 grid gap-3 rounded-card border border-rule bg-paper p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
            <div>
              <h2 className="text-xl font-semibold tracking-tight2 text-ink">
                Documents in this project
              </h2>
              <p className="mt-1 text-sm leading-6 text-muted">
                Open a file to read, edit, compare versions, and keep review notes
                with the matter record.
              </p>
            </div>
            <dl className="grid grid-cols-2 gap-2 text-center text-xs sm:grid-cols-5">
              <div className="rounded-card border border-rule bg-paper-sunken p-2">
                <dt className="tech-token uppercase tracking-track2 text-muted">Files</dt>
                <dd className="mt-1 text-sm font-semibold text-ink">{docs.length}</dd>
              </div>
              <div className="rounded-card border border-rule bg-paper-sunken p-2">
                <dt className="tech-token uppercase tracking-track2 text-muted">Size</dt>
                <dd className="mt-1 text-sm font-semibold text-ink">{formatBytes(totalBytes)}</dd>
              </div>
              <div className="rounded-card border border-rule bg-paper-sunken p-2">
                <dt className="tech-token uppercase tracking-track2 text-muted">Open notes</dt>
                <dd className="mt-1 text-sm font-semibold text-ink">{openNoteCount}</dd>
              </div>
              <div className="rounded-card border border-rule bg-paper-sunken p-2">
                <dt className="tech-token uppercase tracking-track2 text-muted">Versions</dt>
                <dd className="mt-1 text-sm font-semibold text-ink">{versionCount}</dd>
              </div>
              <div className="rounded-card border border-rule bg-paper-sunken p-2">
                <dt className="tech-token uppercase tracking-track2 text-muted">Changes</dt>
                <dd className="mt-1 text-sm font-semibold text-ink">{pendingEditCount}</dd>
              </div>
            </dl>
          </div>
          {disclosureCount > 0 && (
            <p className="mb-3 border-l-2 border-rule bg-paper px-3 py-2 text-sm text-muted">
              {disclosureCount} disclosure document{disclosureCount === 1 ? "" : "s"} marked
              as CPR 31 material.
            </p>
          )}
          <div
            className="mb-4 grid gap-3 rounded-card border border-rule bg-paper px-4 py-3 md:grid-cols-[minmax(0,1fr)_auto]"
            data-testid="document-library-controls"
          >
            <label className="text-xs font-semibold uppercase tracking-track2 text-muted">
              Search documents
              <input
                value={documentQuery}
                onChange={(event) => setDocumentQuery(event.target.value)}
                placeholder="Filename, tag, hash, source"
                className="mt-1 min-h-[40px] w-full rounded-item border border-rule bg-paper-sunken px-3 font-sans text-sm font-normal normal-case tracking-normal text-ink outline-none focus:border-ink"
              />
            </label>
            <div className="flex flex-wrap items-end gap-2">
              {[
                ["all", "All"],
                ["disclosure", "Disclosure"],
                ["notes", "With notes"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() =>
                    setDocumentFilter(value as "all" | "disclosure" | "notes")
                  }
                  className={`min-h-[40px] border px-3 text-sm font-medium ${
                    documentFilter === value
                      ? "border-ink bg-ink text-paper"
                      : "border-rule bg-paper text-ink hover:border-ink"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted md:col-span-2">
              Showing {filteredDocs?.length ?? 0} of {docs.length} document{docs.length === 1 ? "" : "s"}.
            </p>
          </div>
          <div
            className="grid gap-3 md:grid-cols-2"
            data-testid="document-library-cards"
          >
            {filteredDocs?.map((d) => {
              const typeLabel = deriveType(d);
              const openNotes = d.open_comment_count ?? 0;
              const versions = d.version_count ?? 0;
              const pendingEdits = d.pending_edit_count ?? 0;
              const workStatus = [
                openNotes > 0 ? plural(openNotes, "open note") : null,
                versions > 0 ? plural(versions, "saved version") : null,
                pendingEdits > 0 ? plural(pendingEdits, "pending change") : null,
              ].filter(Boolean);
              return (
                <Link
                  key={d.id}
                  to="/matters/$slug/documents/$documentId"
                  params={{ slug, documentId: d.id }}
                  className="group rounded-card border border-rule bg-paper p-4 transition-colors hover:border-ink hover:bg-wash"
                  title={`SHA-256 ${d.sha256}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold text-ink">
                        {d.filename}
                      </p>
                      <p className="mt-1 truncate tech-token text-[11px] text-muted">
                        {d.sha256.slice(0, 8)}
                      </p>
                    </div>
                    <Badge>{typeLabel}</Badge>
                  </div>
                  <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <dt className="tech-token text-[10px] uppercase tracking-track2 text-muted">
                        Source
                      </dt>
                      <dd className="mt-1 text-ink">
                        {d.from_disclosure ? "CPR 31 disclosure" : "Upload"}
                      </dd>
                    </div>
                    <div>
                      <dt className="tech-token text-[10px] uppercase tracking-track2 text-muted">
                        Size
                      </dt>
                      <dd className="mt-1 text-ink">{formatBytes(d.size_bytes)}</dd>
                    </div>
                    <div>
                      <dt className="tech-token text-[10px] uppercase tracking-track2 text-muted">
                        Open notes
                      </dt>
                      <dd className="mt-1 text-ink">
                        {openNotes
                          ? plural(openNotes, "note")
                          : "None"}
                      </dd>
                    </div>
                    <div>
                      <dt className="tech-token text-[10px] uppercase tracking-track2 text-muted">
                        Updated
                      </dt>
                      <dd className="mt-1 text-ink">{formatDate(d.uploaded_at)}</dd>
                    </div>
                  </dl>
                  <div className="mt-4 flex flex-wrap gap-2" aria-label={`Workbench status for ${d.filename}`}>
                    {workStatus.length > 0 ? (
                      workStatus.map((item) => (
                        <span
                          key={item}
                          className="rounded-item border border-rule bg-paper-sunken px-2 py-1 text-xs font-medium text-ink"
                        >
                          {item}
                        </span>
                      ))
                    ) : (
                      <span className="rounded-item border border-rule bg-paper-sunken px-2 py-1 text-xs text-muted">
                        Ready to review
                      </span>
                    )}
                  </div>
                  <div className="mt-5 flex items-center justify-between border-t border-rule pt-3">
                    <span className="text-xs leading-5 text-muted">
                      Reader, notes, versions, skills, and Record links open together.
                    </span>
                    <span className="shrink-0 rounded-item border border-ink bg-ink px-3 py-2 text-xs font-semibold text-paper group-hover:bg-black">
                      Open workbench
                    </span>
                  </div>
                </Link>
              );
            })}
            {filteredDocs?.length === 0 && (
              <div className="rounded-card border border-rule bg-paper px-4 py-6 text-sm text-muted md:col-span-2">
                No documents match this search. Clear the query or switch filters.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
