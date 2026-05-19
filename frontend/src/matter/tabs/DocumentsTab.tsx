import { useState } from "react";
import type { ChangeEvent } from "react";
import { EditPanel } from "../../modules/document_edit/EditPanel";
import { AnonymiseButton } from "../../modules/anonymisation/AnonymiseButton";
import type { MatterDocument } from "../../lib/api";
import { Badge, EmptyState, Field, LoadingLine } from "../../ui/primitives";

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

// Format an ISO timestamp as YYYY-MM-DD. The MatterDocument type only
// carries `uploaded_at`, so that is treated as the most recent mutation
// timestamp for the "Last action" column.
function formatDate(iso: string): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

export function DocumentsTab({
  docs,
  onUpload,
}: {
  docs: MatterDocument[] | null;
  onUpload: (file: File, tag?: string, fromDisclosure?: boolean) => void;
}) {
  const [tag, setTag] = useState("");
  const [fromDisclosure, setFromDisclosure] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    onUpload(file, tag || undefined, fromDisclosure || undefined);
    e.target.value = "";
  };

  const inputCls =
    "bg-paper border border-rule px-4 py-3 text-[16px] sm:text-[17px] focus:border-ink focus:outline-none transition-colors min-h-[44px] font-sans text-ink";

  // Column template shared by the header row and each data row so columns
  // stay aligned. Document gets the largest fr; SHA and Size move into the
  // expand drawer so the primary scan path is workflow-shaped.
  const gridCols =
    "grid grid-cols-[1.5fr_110px_120px_120px_110px_72px] gap-4 px-4 py-3";

  return (
    <div className="max-w-4xl">
      <form className="mb-10 flex flex-wrap items-end gap-4">
        <Field label="Tag" hint="optional, e.g. pleadings, disclosure">
          <input
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            className={inputCls}
            placeholder="pleadings"
          />
        </Field>
        <label className="flex items-center gap-2 min-h-[44px]">
          <input
            type="checkbox"
            checked={fromDisclosure}
            onChange={(e) => setFromDisclosure(e.target.checked)}
          />
          <span className="text-sm text-ink">From disclosure (CPR 31)</span>
        </label>
        <label className="bg-ink text-paper px-4 py-2 hover:bg-black transition-colors text-sm font-medium min-h-[44px] inline-flex items-center cursor-pointer">
          Upload document
          <input type="file" className="hidden" onChange={onFile} />
        </label>
      </form>

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
              <span>Source</span>
              <span>Extracted</span>
              <span>Last action</span>
              <span className="text-right">Action</span>
            </div>
            {docs.map((d) => {
              const typeLabel = deriveType(d);
              // No body-extracted field exists on MatterDocument; the
              // backend extracts on upload, so we render "Extracted" for
              // every registered document. Swap to a real flag once the
              // type grows one (e.g. body_extracted / extracted_at).
              const extractedLabel = "Extracted";
              return (
                <div key={d.id} className="border-b border-rule">
                  <div
                    className={`${gridCols} hover:bg-wash transition-colors items-center cursor-pointer`}
                    onClick={() =>
                      setEditingId(editingId === d.id ? null : d.id)
                    }
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-ink truncate">
                        {d.filename}
                      </div>
                      {d.tag && (
                        <div className="mt-1 text-xs text-muted">
                          <Badge>{d.tag.toUpperCase()}</Badge>
                        </div>
                      )}
                    </div>
                    <span>
                      <Badge>{typeLabel}</Badge>
                    </span>
                    <span>
                      {d.from_disclosure ? (
                        <Badge>CPR 31</Badge>
                      ) : (
                        <span className="text-xs text-muted">Upload</span>
                      )}
                    </span>
                    <span className="text-xs text-ink">{extractedLabel}</span>
                    <span className="font-mono text-xs text-ink">
                      {formatDate(d.uploaded_at)}
                    </span>
                    <span className="text-muted uppercase tracking-track2 text-[9px] text-right">
                      {editingId === d.id ? "Close" : "Edit"}
                    </span>
                  </div>
                  {editingId === d.id && (
                    <>
                      <div className="border-t border-rule bg-paper p-5">
                        <dl className="grid grid-cols-[110px_1fr] gap-x-4 gap-y-1 font-mono text-[11px]">
                          <dt className="uppercase tracking-track2 text-[9px] text-muted self-center">
                            SHA-256
                          </dt>
                          <dd className="text-ink truncate">
                            {d.sha256.slice(0, 16)}
                          </dd>
                          <dt className="uppercase tracking-track2 text-[9px] text-muted self-center">
                            Size
                          </dt>
                          <dd className="text-ink">{formatBytes(d.size_bytes)}</dd>
                          <dt className="uppercase tracking-track2 text-[9px] text-muted self-center">
                            Uploaded
                          </dt>
                          <dd className="text-ink">{d.uploaded_at}</dd>
                          <dt className="uppercase tracking-track2 text-[9px] text-muted self-center">
                            Tag
                          </dt>
                          <dd className="text-ink">
                            {d.tag ? d.tag.toUpperCase() : "(none)"}
                          </dd>
                        </dl>
                      </div>
                      <EditPanel
                        documentId={d.id}
                        filename={d.filename}
                        onClose={() => setEditingId(null)}
                      />
                      <div className="border-t border-rule bg-paper p-5">
                        <div className="flex items-center justify-between mb-2">
                          <div className="font-mono uppercase tracking-track2 text-[10px] text-muted">
                            Anonymise · {d.filename}
                          </div>
                          <AnonymiseButton documentId={d.id} />
                        </div>
                        <div className="text-[11px] text-muted">
                          Generates a redacted body with [PARTY_n] / [ORG_n] / [ADDRESS_n] /
                          [DATE_n] tokens. Original document stays unchanged. Side-by-side
                          toggle UI lands with the routed Document detail view.
                        </div>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
