import { Fragment, useState } from "react";
import type { ChangeEvent, DragEvent } from "react";
import { Link } from "@tanstack/react-router";
import { FileUp } from "lucide-react";
import type { MatterDocument } from "../../lib/api";
import { UploadError, deleteDocument } from "../../lib/api";
import { EmptyState, ErrorCallout, LoadingLine } from "../../ui/primitives";
import { LedgerLine, SectionRule } from "../../ui/certificate";

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

// Map the matter-wide retrieval index state to a light status chip.
// Returns null for unknown/absent status so older payloads stay quiet.
function indexStatusChip(
  status: string | undefined,
): { label: string; title: string; className: string } | null {
  switch (status) {
    case "indexed":
      return {
        label: "Searchable",
        title: "Indexed for matter-wide retrieval",
        className: "text-seal",
      };
    case "pending":
      return {
        label: "Indexing…",
        title: "Being indexed for matter-wide retrieval",
        className: "text-muted",
      };
    case "failed":
      return {
        label: "Not searchable",
        title: "Indexing failed; this document is not retrievable",
        className: "text-muted",
      };
    case "empty":
      return {
        label: "No text",
        title: "No extractable text to index",
        className: "text-muted",
      };
    default:
      return null;
  }
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
  onReload,
}: {
  slug: string;
  docs: MatterDocument[] | null;
  onUpload: (
    file: File,
    tag?: string,
    fromDisclosure?: boolean,
  ) => void | Promise<void>;
  onReload?: () => void;
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

  const onDelete = async (doc: MatterDocument) => {
    if (
      !window.confirm(
        `Delete "${doc.filename}"? This removes it from this matter.`,
      )
    ) {
      return;
    }
    setUploadError(null);
    try {
      await deleteDocument(doc.id);
      onReload?.();
    } catch {
      setUploadError(
        `Could not delete ${doc.filename}. Try again in a moment.`,
      );
    }
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
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-ink">Documents</h1>
        <p className="mt-1 text-sm text-muted">
          Every document in this matter. Add one below, then click a file to open it.
        </p>
      </div>
      <details className="mb-8 rounded-card border border-rule bg-paper" open={!docs || docs.length === 0}>
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-ink">
          Add documents
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
                {ingress.kind === "idle" && "Accepts PDF, DOCX, and TXT."}
                {ingress.kind === "uploading" &&
                  `Uploading ${ingress.done + 1}/${ingress.total}: ${ingress.current}`}
                {ingress.kind === "done" &&
                  `${ingress.count} document${ingress.count === 1 ? "" : "s"} added.`}
                {ingress.kind === "error" && ingress.message}
              </div>
            </div>
          </div>
        </div>
      </details>

      {uploadError && <ErrorCallout message={uploadError} compact />}

      {!docs && <LoadingLine label="loading documents" />}
      {docs && docs.length === 0 && (
        <>
          <EmptyState
            title="No documents yet"
            body="Add your first document above. Drop a file or click to browse."
          />
          <div className="mt-6 rounded-card border border-rule bg-paper p-5">
            <p className="text-[10px] uppercase tracking-[0.25em] text-muted">
              The happy path
            </p>
            <ol className="mt-4 space-y-3">
              {[
                "Add documents",
                "Ask the assistant",
                "Run a skill",
                "Sign the output",
                "Export the working pack",
              ].map((step, i) => (
                <li key={step} className="flex items-baseline gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-rule text-[11px] text-muted">
                    {i + 1}
                  </span>
                  <span className="text-sm text-ink">{step}</span>
                </li>
              ))}
            </ol>
          </div>
        </>
      )}
      {docs && docs.length > 0 && (
        <div>
          <SectionRule
            label="In this matter"
            right={`${docs.length} file${docs.length === 1 ? "" : "s"} · ${formatBytes(totalBytes)}`}
          />
          <div
            className="mb-4 mt-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]"
            data-testid="document-library-controls"
          >
            <label className="sr-only" htmlFor="document-search">Search documents</label>
            <input
                id="document-search"
                value={documentQuery}
                onChange={(event) => setDocumentQuery(event.target.value)}
                placeholder="Search files"
                className="min-h-[40px] w-full rounded-item border border-rule bg-paper px-3 font-sans text-sm text-ink outline-none focus:border-ink"
              />
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
          </div>
          <div data-testid="document-library-cards">
            {filteredDocs?.map((d, i) => {
              const openNotes = d.open_comment_count ?? 0;
              const versions = d.version_count ?? 0;
              const pendingEdits = d.pending_edit_count ?? 0;
              const workStatus = [
                openNotes > 0 ? plural(openNotes, "open note") : null,
                versions > 0 ? plural(versions, "saved version") : null,
                pendingEdits > 0 ? plural(pendingEdits, "pending change") : null,
              ].filter(Boolean);
              return (
                <LedgerLine
                  key={d.id}
                  index={i + 1}
                  label={`${formatBytes(d.size_bytes)} · ${formatDate(d.uploaded_at)}`}
                  right={
                    <span className="flex items-baseline gap-3">
                      {(() => {
                        const chip = indexStatusChip(d.index_status);
                        return chip ? (
                          <span
                            className={`text-[11px] ${chip.className}`}
                            title={chip.title}
                          >
                            {chip.label}
                          </span>
                        ) : null;
                      })()}
                      {workStatus.length > 0 && (
                        <span
                          className="flex items-baseline gap-1.5 text-[11px] text-muted"
                          aria-label={`Workbench status for ${d.filename}`}
                        >
                          {workStatus.map((item, j) => (
                            <Fragment key={item}>
                              {j > 0 && <span aria-hidden="true">·</span>}
                              <span>{item}</span>
                            </Fragment>
                          ))}
                        </span>
                      )}
                      <Link
                        to="/matters/$slug/documents/$documentId"
                        params={{ slug, documentId: d.id }}
                        className="text-sm text-muted hover:text-seal"
                      >
                        Open →
                      </Link>
                      <button
                        type="button"
                        onClick={() => onDelete(d)}
                        className="text-sm text-muted hover:text-seal"
                      >
                        Delete
                      </button>
                    </span>
                  }
                >
                  <Link
                    to="/matters/$slug/documents/$documentId"
                    params={{ slug, documentId: d.id }}
                    className="block truncate text-left text-sm text-ink hover:text-seal"
                    title={`SHA-256 ${d.sha256}`}
                  >
                    {d.filename}
                  </Link>
                </LedgerLine>
              );
            })}
            {filteredDocs?.length === 0 && (
              <p className="px-1 py-5 text-sm text-muted">
                No documents match this search. Clear the query or switch filters.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
