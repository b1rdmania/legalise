// Matter document reader at /matters/{slug}/documents/{document_id}.
// Content (extracted text) is the hero; metadata, versions,
// anonymisation, and model edits live behind a Details disclosure.
// Open / Download original stream through the documentOriginalUrl
// proxy and are presented as secondary links beneath the content.

import { useCallback, useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import type { TabKey } from "./tabs/types";
import { MATTER_TAB_LABELS, isTabKey } from "./tabs/types";
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
import { VersionTimeline } from "../modules/document_edit/VersionTimeline";

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

type DocumentWorkspaceTab = "read" | "redline" | "history";

const DOCUMENT_TABS: { key: DocumentWorkspaceTab; label: string; hint: string }[] = [
  {
    key: "read",
    label: "Read",
    hint: "Read the extracted text and open the original file.",
  },
  {
    key: "redline",
    label: "Redline",
    hint: "Ask Legalise to propose edits, then accept or reject them.",
  },
  {
    key: "history",
    label: "History",
    hint: "See versions, redactions, and document facts.",
  },
];

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
  const [showDetails, setShowDetails] = useState(false);
  const [activeTab, setActiveTab] = useState<DocumentWorkspaceTab>("read");

  // Source-anchor honesty: when arrived from chat, surface a single
  // line noting that passage-level anchoring isn't yet wired through
  // the substrate. Without this the user might think a chip click
  // failed to scroll them anywhere.
  const fromTab = useRouterState({
    select: (s) => {
      const search = s.location.search as Record<string, unknown> | undefined;
      const raw = search?.from;
      return typeof raw === "string" && isTabKey(raw) ? (raw as TabKey) : null;
    },
  });
  const backTab: TabKey = fromTab ?? "documents";
  const backLabel =
    fromTab && fromTab !== "documents"
      ? `← Back to ${MATTER_TAB_LABELS[fromTab] ?? "matter"}`
      : "← Documents";
  const arrivedFromChat = fromTab === "assistant";

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
  const recordHref = `/matters/${encodeURIComponent(slug)}/audit`;
  const selectedTab = DOCUMENT_TABS.find((t) => t.key === activeTab) ?? DOCUMENT_TABS[0];

  return (
    <div className="mx-auto max-w-5xl px-6 py-10 text-ink">
      {/* Smart back — returns to the matter surface the user came
          from. ?from=assistant lands here from a chat source chip;
          everything else falls back to the Documents tab. */}
      <p className="text-xs">
        <Link
          to="/matters/$slug/$tab"
          params={{ slug, tab: backTab }}
          className="text-muted underline underline-offset-4 hover:text-ink"
          data-testid="document-back-link"
        >
          {backLabel}
        </Link>
      </p>
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="max-w-3xl">
          <PageHeader eyebrow="Document workspace" title={doc.filename} subId={doc.id} />
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
            Read the document, propose tracked edits, and keep the version record in one place.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <a
            href={documentOriginalUrl(documentId)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center border border-rule px-3 py-2 text-ink hover:bg-wash"
            data-testid="document-open-original"
          >
            Open original
          </a>
          <a
            href={documentOriginalUrl(documentId, { download: true })}
            className="inline-flex items-center border border-rule px-3 py-2 text-ink hover:bg-wash"
          >
            Download
          </a>
        </div>
      </div>

      {arrivedFromChat && (
        <p
          className="mt-3 border-l-2 border-rule pl-3 text-xs text-muted"
          data-testid="from-chat-note"
        >
          Opened from Chat. Pinpointing the exact passage isn't supported
          yet — the document text is shown in full below.
        </p>
      )}

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
        <main>
          <div className="border-b border-rule">
            <div className="flex flex-wrap gap-1" role="tablist" aria-label="Document workspace">
              {DOCUMENT_TABS.map((tab) => {
                const active = activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setActiveTab(tab.key)}
                    className={`border border-b-0 border-rule px-4 py-2 text-sm font-medium ${
                      active
                        ? "bg-paper text-ink"
                        : "bg-wash text-muted hover:text-ink"
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          <p className="mt-3 text-xs text-muted">{selectedTab.hint}</p>

          {activeTab === "read" && (
            <section className="mt-5" data-testid="document-content">
              {bodyMissing ? (
                <EmptyState
                  title="No extracted text"
                  body="No extracted body is available for this document (extraction may have failed or not run). The original file is still available."
                />
              ) : !body ? (
                <LoadingLine label="loading document text" />
              ) : (
                <article className="min-h-[520px] rounded-md border border-rule bg-paper px-6 py-5 text-[15px] leading-7 whitespace-pre-wrap font-sans text-ink">
                  {body.extracted_text || "(empty)"}
                </article>
              )}
            </section>
          )}

          {activeTab === "redline" && (
            <section className="mt-5" data-testid="document-redline-workspace">
              <div className="mb-4 border-l-2 border-ink pl-4">
                <h2 className="text-lg font-bold tracking-tight2">
                  Propose tracked edits
                </h2>
                <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted">
                  Legalise can suggest changes against the extracted text. You decide which edits become part of the document history.
                </p>
              </div>
              <EditPanel
                documentId={documentId}
                filename={doc.filename}
                onClose={() => {
                  setActiveTab("read");
                  loadBody();
                  getDocumentVersions(documentId)
                    .then(setVersions)
                    .catch(() => undefined);
                }}
              />
            </section>
          )}

          {activeTab === "history" && (
            <section className="mt-5" data-testid="document-history-workspace">
              <div className="rounded-md border border-rule bg-paper p-5">
                <h2 className="text-lg font-bold tracking-tight2">
                  Document history
                </h2>
                <p className="mt-1 text-sm leading-relaxed text-muted">
                  Versions, accepted edits, rejected edits, and redaction state stay attached to this document.
                </p>
                <VersionTimeline documentId={documentId} />
                {versions.length === 0 && (
                  <p className="mt-4 text-sm text-muted">No versions recorded.</p>
                )}
              </div>

              <div className="mt-6 rounded-md border border-rule bg-paper p-5">
                <h3 className="text-xs uppercase tracking-widest text-muted">
                  Redaction
                </h3>
                <p className="mt-2 text-sm text-muted">
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
              </div>
            </section>
          )}
        </main>

        <aside className="space-y-4">
          <div className="rounded-md border border-rule bg-paper p-4">
            <h2 className="font-mono text-[10px] uppercase tracking-track2 text-muted">
              Document
            </h2>
            <dl className="mt-3 space-y-3 text-sm">
              <DescItem label="Type">
                <span className="font-mono text-xs">{doc.mime_type}</span>
              </DescItem>
              <DescItem label="Size">{formatBytes(doc.size_bytes)}</DescItem>
              <DescItem label="Tag">{doc.tag || "—"}</DescItem>
              <DescItem label="Source">
                {doc.from_disclosure ? "Disclosure · CPR 31" : "Upload"}
              </DescItem>
            </dl>
            <p className="mt-4 text-xs text-muted">
              Original file access is audited.
            </p>
          </div>

          <div className="rounded-md border border-rule bg-paper p-4">
            <h2 className="font-mono text-[10px] uppercase tracking-track2 text-muted">
              Record
            </h2>
            <p className="mt-2 text-sm text-muted">
              Document opens, edits, redactions, and downloads are part of the matter record where supported.
            </p>
            <p className="mt-3 text-sm">
              <a
                href={recordHref}
                className="text-muted underline underline-offset-4 hover:text-ink"
              >
                View matter Record →
              </a>
            </p>
          </div>
        </aside>
      </div>

      <section className="mt-8 border-t border-rule pt-4">
        <button
          type="button"
          onClick={() => setShowDetails((v) => !v)}
          aria-expanded={showDetails}
          data-testid="document-details-toggle"
          className="flex w-full items-center justify-between text-left"
        >
          <h2 className="text-sm uppercase tracking-widest text-muted">
            Details
          </h2>
          <span aria-hidden="true" className="text-xs text-muted">
            {showDetails ? "Hide" : "Show"}
          </span>
        </button>

        {showDetails && (
          <div className="mt-4 space-y-8">
            {body && !bodyMissing && (
              <p className="text-xs text-muted">
                {body.extraction_method} · {body.char_count.toLocaleString()} chars
                {body.page_count ? ` · ${body.page_count} pages` : ""}
                {body.error_reason ? ` · ${body.error_reason}` : ""}
              </p>
            )}

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
          </div>
        )}
      </section>
    </div>
  );
}
