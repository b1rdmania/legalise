/**
 * Document Workspace v1 — /matters/{slug}/documents/{document_id}.
 *
 * First-class routed detail page for a matter document. Surfaces only
 * what the substrate actually supports: provenance metadata, extracted
 * text, version history, anonymisation, and model edits. There is
 * deliberately NO "download original" / "open source file" button — the
 * original uploaded bytes are not retrievable via any API today
 * (Document.storage_uri is never exposed; only generated docx stream).
 * That gap is logged in DOCUMENT_WORKSPACE_V1_PLAN.md (G1); we surface an
 * honest note rather than a disabled-fiction button.
 */

import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  documentOriginalUrl,
  getAnonymisation,
  getDocumentBody,
  getDocumentVersions,
  listDocuments,
  type AnonymisationResult,
  type DocumentBody,
  type DocumentVersionSummary,
  type MatterDocument,
} from "../lib/api";
import {
  DescItem,
  EmptyState,
  ErrorCallout,
  LoadingLine,
  PageHeader,
} from "../ui/primitives";
import { EditPanel } from "../modules/document_edit/EditPanel";
import { AnonymiseButton } from "../modules/anonymisation/AnonymiseButton";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

type DocQuery =
  | { status: "loading" }
  | { status: "ready"; doc: MatterDocument }
  | { status: "not_found" }
  | { status: "error"; message: string };

export function DocumentDetail({
  slug,
  documentId,
}: {
  slug: string;
  documentId: string;
}) {
  const [q, setQ] = useState<DocQuery>({ status: "loading" });
  const [body, setBody] = useState<DocumentBody | null>(null);
  const [bodyMissing, setBodyMissing] = useState(false);
  const [versions, setVersions] = useState<DocumentVersionSummary[]>([]);
  const [anon, setAnon] = useState<AnonymisationResult | null>(null);
  const [showEdit, setShowEdit] = useState(false);

  // Metadata: there's no single-document GET; the matter document list
  // is the authoritative source. Find the row by id.
  useEffect(() => {
    let cancelled = false;
    listDocuments(slug)
      .then((docs) => {
        if (cancelled) return;
        const doc = docs.find((d) => d.id === documentId);
        setQ(doc ? { status: "ready", doc } : { status: "not_found" });
      })
      .catch((err: unknown) => {
        if (!cancelled) setQ({ status: "error", message: String(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [slug, documentId]);

  const loadBody = useCallback(() => {
    getDocumentBody(documentId)
      .then((b) => {
        setBody(b);
        setBodyMissing(false);
      })
      .catch(() => setBodyMissing(true));
  }, [documentId]);

  useEffect(() => {
    loadBody();
    getDocumentVersions(documentId).then(setVersions).catch(() => undefined);
    getAnonymisation(documentId)
      .then(setAnon)
      .catch(() => setAnon(null));
  }, [documentId, loadBody]);

  if (q.status === "loading") {
    return (
      <div className="mx-auto max-w-3xl px-6 py-12">
        <LoadingLine label="loading document" />
      </div>
    );
  }
  if (q.status === "not_found") {
    return (
      <div className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-xl font-bold tracking-tight2">Document not found</h1>
        <p className="mt-3 text-sm">
          <Link
            to="/matters/$slug/$tab"
            params={{ slug, tab: "documents" }}
            className="underline underline-offset-4 hover:text-ink"
          >
            ← All documents
          </Link>
        </p>
      </div>
    );
  }
  if (q.status === "error") {
    return (
      <div className="mx-auto max-w-3xl px-6 py-12">
        <ErrorCallout message={q.message} />
      </div>
    );
  }

  const doc = q.doc;
  const auditHref = `/matters/${encodeURIComponent(slug)}/audit`;

  return (
    <div className="mx-auto max-w-3xl px-6 py-12 text-ink">
      <p className="text-xs">
        <Link
          to="/matters/$slug/$tab"
          params={{ slug, tab: "documents" }}
          className="text-muted underline underline-offset-4 hover:text-ink"
        >
          ← Documents
        </Link>
      </p>
      <PageHeader eyebrow="Document" title={doc.filename} subId={doc.id} />

      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
        <DescItem label="Type">
          <span className="font-mono text-xs">{doc.mime_type}</span>
        </DescItem>
        <DescItem label="Size">{formatBytes(doc.size_bytes)}</DescItem>
        <DescItem label="Tag">{doc.tag || "—"}</DescItem>
        <DescItem label="From disclosure">
          {doc.from_disclosure ? "Yes (CPR 31)" : "No"}
        </DescItem>
        <DescItem label="Uploaded">
          {doc.uploaded_at.replace("T", " ").slice(0, 19)}
        </DescItem>
        <DescItem label="SHA-256">
          <span className="font-mono text-xs break-all">{doc.sha256}</span>
        </DescItem>
      </dl>

      {/* Original file — streamed backend proxy (G1 closed). */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <a
          href={documentOriginalUrl(documentId)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center rounded-md border border-rule px-4 py-2 text-sm hover:border-ink"
        >
          Open original
        </a>
        <a
          href={documentOriginalUrl(documentId, { download: true })}
          className="inline-flex items-center rounded-md border border-rule px-4 py-2 text-sm hover:border-ink"
        >
          Download original
        </a>
        <span className="text-xs text-muted">Original file access is audited.</span>
      </div>

      {/* Extracted text */}
      <section className="mt-8">
        <h2 className="text-sm uppercase tracking-widest text-muted">
          Extracted text
        </h2>
        {bodyMissing ? (
          <div className="mt-3">
            <EmptyState
              title="No extracted text"
              body="No extracted body is available for this document (extraction may have failed or not run)."
            />
          </div>
        ) : !body ? (
          <LoadingLine label="loading text" />
        ) : (
          <>
            <p className="mt-1 text-xs text-muted">
              {body.extraction_method} · {body.char_count.toLocaleString()} chars
              {body.page_count ? ` · ${body.page_count} pages` : ""}
              {body.error_reason ? ` · ${body.error_reason}` : ""}
            </p>
            <pre className="mt-3 max-h-[40vh] overflow-auto rounded-md border border-rule bg-paper px-3 py-2 text-xs whitespace-pre-wrap">
              {body.extracted_text || "(empty)"}
            </pre>
          </>
        )}
      </section>

      {/* Versions */}
      <section className="mt-8">
        <h2 className="text-sm uppercase tracking-widest text-muted">Versions</h2>
        {versions.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No versions recorded.</p>
        ) : (
          <ul className="mt-3 space-y-px bg-rule border border-rule">
            {versions.map((v) => (
              <li
                key={v.version.id}
                className="flex items-baseline justify-between gap-3 bg-paper p-3 text-sm"
              >
                <span>
                  <span className="font-mono text-xs text-muted">
                    v{v.version.version_number}
                  </span>{" "}
                  {v.version.kind}
                </span>
                <span className="text-xs text-muted">
                  {v.pending_count > 0 && `${v.pending_count} pending · `}
                  {v.version.created_at.replace("T", " ").slice(0, 16)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Anonymisation */}
      <section className="mt-8">
        <h2 className="text-sm uppercase tracking-widest text-muted">
          Anonymisation
        </h2>
        <p className="mt-1 text-xs text-muted">
          {anon
            ? `Redacted body available — ${anon.entity_count} entities via ${anon.engine}, ${anon.anonymised_at.replace("T", " ").slice(0, 16)}.`
            : "No redacted body yet."}
        </p>
        <div className="mt-3">
          <AnonymiseButton
            documentId={documentId}
            onResult={(r) => setAnon(r)}
          />
        </div>
      </section>

      {/* Model edits */}
      <section className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-sm uppercase tracking-widest text-muted">
            Model edits
          </h2>
          <button
            type="button"
            onClick={() => setShowEdit((v) => !v)}
            className="text-xs text-muted underline underline-offset-4 hover:text-ink"
          >
            {showEdit ? "Hide" : "Open editor"}
          </button>
        </div>
        {showEdit && (
          <div className="mt-3">
            <EditPanel
              documentId={documentId}
              filename={doc.filename}
              onClose={() => {
                setShowEdit(false);
                loadBody();
                getDocumentVersions(documentId).then(setVersions).catch(() => undefined);
              }}
            />
          </div>
        )}
      </section>

      <section className="mt-10 text-sm">
        <a
          href={auditHref}
          className="text-muted underline underline-offset-4 hover:text-ink"
        >
          View this matter's audit trail
        </a>
      </section>
    </div>
  );
}
