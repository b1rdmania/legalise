// Matter document reader at /matters/{slug}/documents/{document_id}.
// Content (extracted text) is the document surface; model edit,
// version, redaction, and record tools sit beside it so the page reads
// like a working file rather than an admin metadata screen.

import { useCallback, useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import type { TabKey } from "./tabs/types";
import { MATTER_TAB_LABELS, isTabKey } from "./tabs/types";
import {
  createDocumentComment,
  documentOriginalUrl,
  documentVersionDocxUrl,
  type EditInstructionResponse,
  getAnonymisation,
  getDocumentComments,
  getDocumentBody,
  getDocumentVersions,
  listDocuments,
  resolveDocumentComment,
  type AnonymisationResult,
  type DocumentCommentRead,
  type DocumentBody,
  type DocumentVersionSummary,
  type MatterDocument,
} from "../lib/api";
import {
  DescItem,
  EmptyState,
  ErrorCallout,
  LoadingLine,
} from "../ui/primitives";
import { EditPanel } from "../modules/document_edit/EditPanel";
import { TrackedChangesView } from "../modules/document_edit/TrackedChangesView";
import { AnonymiseButton } from "../modules/anonymisation/AnonymiseButton";
import { VersionTimeline } from "../modules/document_edit/VersionTimeline";
import {
  DocumentRichEditor,
  findNormalizedRange,
  type TiptapNode,
} from "../modules/document_edit/DocumentRichEditor";
import { DocxOriginalPreview } from "../modules/document_preview/DocxOriginalPreview";

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

const EXTRACTED_VERSION_ID = "__extracted";
type WorkbenchView = "editor" | "redlines" | "original" | "versions";

function WorkbenchTab({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-[40px] border px-4 text-sm font-medium transition-colors ${
        active
          ? "border-ink bg-ink text-paper"
          : "border-rule bg-paper text-muted hover:border-ink hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

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
  const [comments, setComments] = useState<DocumentCommentRead[]>([]);
  const [commentBody, setCommentBody] = useState("");
  const [commentQuote, setCommentQuote] = useState("");
  const [commentError, setCommentError] = useState<string | null>(null);
  const [commentBusy, setCommentBusy] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [workbenchView, setWorkbenchView] = useState<WorkbenchView>("editor");
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [editorDirty, setEditorDirty] = useState(false);
  const [activeEditResult, setActiveEditResult] =
    useState<EditInstructionResponse | null>(null);

  const sourceContext = useRouterState({
    select: (s) => {
      const search = s.location.search as Record<string, unknown> | undefined;
      const raw = search?.from;
      const quoteFound = search?.quote_found ?? search?.quoteFound;
      return {
        fromTab: typeof raw === "string" && isTabKey(raw) ? (raw as TabKey) : null,
        quote: typeof search?.quote === "string" ? search.quote : null,
        quoteFound:
          quoteFound === "true" ? true : quoteFound === "false" ? false : null,
      };
    },
  });
  const fromTab = sourceContext.fromTab;
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

  const loadComments = useCallback(() => {
    getDocumentComments(documentId)
      .then(setComments)
      .catch(() => setComments([]));
  }, [documentId]);

  useEffect(() => {
    setActiveEditResult(null);
    setWorkbenchView("editor");
    setSelectedVersionId(null);
    setEditorDirty(false);
    loadBody();
    loadComments();
    getDocumentVersions(documentId).then(setVersions).catch(() => undefined);
    getAnonymisation(documentId)
      .then(setAnon)
      .catch(() => setAnon(null));
  }, [documentId, loadBody, loadComments]);

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
  const originalHref = documentOriginalUrl(documentId);
  const canPreviewOriginal = doc.mime_type === "application/pdf";
  const canPreviewDocx =
    doc.mime_type ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    doc.filename.toLowerCase().endsWith(".docx");
  const latestVersion = versions.at(-1)?.version;
  const resolvedVersions = versions
    .map((v) => v.version)
    .filter((v) => Boolean(v.resolved_text));
  const latestResolvedVersion = [...resolvedVersions]
    .reverse()
    .at(0);
  const selectedResolvedVersion =
    selectedVersionId === EXTRACTED_VERSION_ID
      ? null
      : (resolvedVersions.find((v) => v.id === selectedVersionId) ??
        latestResolvedVersion ??
        null);
  const editorText =
    selectedResolvedVersion?.resolved_text ?? body?.extracted_text ?? "";
  const editorJson = selectedResolvedVersion?.resolved_json as TiptapNode | null | undefined;
  const sourceQuoteFoundInReader = sourceContext.quote
    ? Boolean(findNormalizedRange(editorText, sourceContext.quote))
    : null;
  const editorSourceLabel = selectedResolvedVersion
    ? `Viewing saved version v${selectedResolvedVersion.version_number}`
    : body
      ? `${body.extraction_method} · ${body.char_count.toLocaleString()} chars${
          body.page_count ? ` · ${body.page_count} pages` : ""
        }`
      : "Loading document text";
  const pendingEdits = versions.reduce((total, v) => total + v.pending_count, 0);
  const acceptedEdits = versions.reduce((total, v) => total + v.accepted_count, 0);
  const rejectedEdits = versions.reduce((total, v) => total + v.rejected_count, 0);
  const openComments = comments.filter((comment) => comment.status === "open");
  const resolvedComments = comments.filter((comment) => comment.status === "resolved");
  const confirmDiscardEditorChanges = () =>
    !editorDirty || window.confirm("Discard unsaved document edits?");
  const openWorkbenchView = (next: WorkbenchView) => {
    if (next === workbenchView) return;
    if (!confirmDiscardEditorChanges()) return;
    setWorkbenchView(next);
  };
  const openEditorVersion = (versionId: string | null) => {
    if (!confirmDiscardEditorChanges()) return;
    setSelectedVersionId(versionId);
    setWorkbenchView("editor");
  };
  const submitComment = async () => {
    const trimmed = commentBody.trim();
    if (trimmed.length < 2) {
      setCommentError("Add a note before saving.");
      return;
    }
    setCommentBusy(true);
    setCommentError(null);
    try {
      await createDocumentComment(documentId, {
        body: trimmed,
        quote_text: commentQuote.trim() || null,
      });
      setCommentBody("");
      setCommentQuote("");
      loadComments();
    } catch (err) {
      setCommentError(err instanceof Error ? err.message : "Could not save note.");
    } finally {
      setCommentBusy(false);
    }
  };
  const resolveComment = async (commentId: string) => {
    setCommentBusy(true);
    setCommentError(null);
    try {
      await resolveDocumentComment(documentId, commentId);
      loadComments();
    } catch (err) {
      setCommentError(err instanceof Error ? err.message : "Could not resolve note.");
    } finally {
      setCommentBusy(false);
    }
  };

  return (
    <div className="bg-wash px-4 py-6 text-ink sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1400px]">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <Link
            to="/matters/$slug/$tab"
            params={{ slug, tab: backTab }}
            className="text-sm text-muted underline underline-offset-4 hover:text-ink"
            data-testid="document-back-link"
          >
            {backLabel}
          </Link>
          <a
            href={recordHref}
            className="text-sm text-muted underline underline-offset-4 hover:text-ink"
          >
            View matter Record →
          </a>
        </div>

        <header className="border border-rule bg-paper px-5 py-5 sm:px-6">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto]">
              <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">
                Document
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight2 text-ink sm:text-4xl">
                {doc.filename}
              </h1>
              <div className="mt-4 flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-track2 text-muted">
                <span className="border border-rule bg-paper-sunken px-2 py-1">
                  {doc.tag || "untagged"}
                </span>
                <span className="border border-rule bg-paper-sunken px-2 py-1">
                  {doc.from_disclosure ? "CPR 31 disclosure" : "uploaded"}
                </span>
                <span className="border border-rule bg-paper-sunken px-2 py-1">
                  {formatBytes(doc.size_bytes)}
                </span>
                {latestVersion && (
                  <span className="border border-rule bg-paper-sunken px-2 py-1">
                    v{latestVersion.version_number}
                  </span>
                )}
                {selectedResolvedVersion && (
                  <span className="border border-rule bg-paper-sunken px-2 py-1">
                    editable
                  </span>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-start gap-2 text-sm">
              {selectedResolvedVersion && (
                <a
                  href={documentVersionDocxUrl(documentId, selectedResolvedVersion.id)}
                  className="inline-flex items-center border border-ink bg-ink px-3 py-2 text-paper hover:bg-black"
                  data-testid="document-download-edited-docx"
                >
                  Download edited DOCX
                </a>
              )}
              <a
                href={originalHref}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center border border-rule px-3 py-2 text-ink hover:border-ink"
                data-testid="document-open-original"
              >
                Open original
              </a>
              <a
                href={documentOriginalUrl(documentId, { download: true })}
                className="inline-flex items-center border border-rule px-3 py-2 text-ink hover:border-ink"
              >
                Download
              </a>
            </div>
          </div>
        </header>

        {arrivedFromChat && (
          <p
            className="mt-4 border-l-2 border-rule bg-paper px-4 py-3 text-sm text-muted"
            data-testid="from-chat-note"
          >
            {sourceContext.quote ? (
              <>
                Opened from a cited source.{" "}
                {sourceContext.quoteFound === false
                  ? "The model supplied a quote, but Legalise could not locate it in the extracted source body. "
                  : sourceQuoteFoundInReader
                    ? "The cited passage is highlighted below. "
                    : "Legalise could not locate it in the current reader text. "}
                Source links are for review, not proof.
              </>
            ) : (
              <>
                Opened from Chat. This document was cited or used by the output;
                source links are for review, not proof.
              </>
            )}
          </p>
        )}

        <nav
          className="mt-4 flex flex-wrap gap-2"
          aria-label="Document workspace views"
          data-testid="document-workbench-tabs"
        >
          <WorkbenchTab
            active={workbenchView === "editor"}
            onClick={() => openWorkbenchView("editor")}
          >
            Editor
          </WorkbenchTab>
          <WorkbenchTab
            active={workbenchView === "original"}
            onClick={() => openWorkbenchView("original")}
          >
            Original
          </WorkbenchTab>
          <WorkbenchTab
            active={workbenchView === "versions"}
            onClick={() => openWorkbenchView("versions")}
          >
            Versions
          </WorkbenchTab>
          {activeEditResult && (
            <WorkbenchTab
              active={workbenchView === "redlines"}
              onClick={() => openWorkbenchView("redlines")}
            >
              Redlines
            </WorkbenchTab>
          )}
        </nav>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_390px]">
          <main className="min-w-0">
            {workbenchView === "redlines" && activeEditResult && (
              <section
                className="border border-rule bg-paper p-5"
                data-testid="document-inline-redlines"
              >
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">
                      Proposed redlines
                    </p>
                    <h2 className="mt-1 text-xl font-semibold tracking-tight2 text-ink">
                      Review suggested changes in this document.
                    </h2>
                    <p className="mt-1 text-sm leading-6 text-muted">
                      Accepting edits creates a new version; rejected edits stay in the record.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveEditResult(null);
                      setWorkbenchView("editor");
                    }}
                    className="border border-rule px-3 py-2 text-sm text-muted hover:border-ink hover:text-ink"
                  >
                    Hide redlines
                  </button>
                </div>
                <TrackedChangesView
                  result={activeEditResult}
                  onResolved={() => {
                    loadBody();
                    getDocumentVersions(documentId)
                      .then(setVersions)
                      .catch(() => undefined);
                  }}
                />
              </section>
            )}

            {workbenchView === "editor" && (
            <div data-testid="document-content">
              {bodyMissing && !selectedResolvedVersion ? (
                <div className="p-6">
                  <EmptyState
                    title="No extracted text"
                    body="No extracted body is available for this document (extraction may have failed or not run). The original file is still available."
                  />
                </div>
              ) : !body && !selectedResolvedVersion ? (
                <div className="border border-rule bg-paper p-6">
                  <LoadingLine label="loading document text" />
                </div>
              ) : (
                <DocumentRichEditor
                  documentId={documentId}
                  filename={doc.filename}
                  initialText={editorText}
                  initialJson={editorJson}
                  latestVersionNumber={latestVersion?.version_number}
                  sourceLabel={editorSourceLabel}
                  sourceHighlight={sourceContext.quote}
                  onSaved={(version) => {
                    setSelectedVersionId(version.id);
                    getDocumentVersions(documentId)
                      .then(setVersions)
                      .catch(() => undefined);
                  }}
                  onDirtyChange={setEditorDirty}
                />
              )}
            </div>
            )}

            {workbenchView === "original" && (
              <>
              {canPreviewOriginal ? (
              <section className="border border-rule bg-paper" data-testid="document-original-preview">
                <div className="flex items-center justify-between gap-3 border-b border-rule px-5 py-3">
                  <div>
                    <h2 className="text-sm font-semibold text-ink">Original preview</h2>
                    <p className="mt-0.5 text-xs text-muted">
                      Opens through the audited document proxy.
                    </p>
                  </div>
                  <a
                    href={originalHref}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-muted underline underline-offset-4 hover:text-ink"
                  >
                    Open full size →
                  </a>
                </div>
                <iframe
                  title={`Original preview for ${doc.filename}`}
                  src={originalHref}
                  className="h-[620px] w-full bg-paper-sunken"
                />
              </section>
              ) : canPreviewDocx ? (
              <DocxOriginalPreview documentId={documentId} filename={doc.filename} />
              ) : (
                <section className="border border-rule bg-paper p-6">
                  <EmptyState
                    title="Original preview unavailable"
                    body="This file type does not have an embedded preview yet. Open or download the original file instead."
                  />
                </section>
              )}
              </>
            )}

            {workbenchView === "versions" && (
            <section
              className="border border-rule bg-paper p-5"
              data-testid="document-history-workspace"
            >
              <h2 className="text-lg font-semibold tracking-tight2 text-ink">
                Version record
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-muted">
                Accepted edits and manual saves create new versions. Open a saved version to review or download it.
              </p>
              {resolvedVersions.length > 0 && (
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openEditorVersion(EXTRACTED_VERSION_ID)}
                    className={`border px-3 py-2 text-sm ${
                      selectedVersionId === EXTRACTED_VERSION_ID
                        ? "border-ink bg-ink text-paper"
                        : "border-rule text-ink hover:border-ink"
                    }`}
                  >
                    Extracted text
                  </button>
                  {resolvedVersions.map((version) => (
                    <button
                      key={version.id}
                      type="button"
                      onClick={() => openEditorVersion(version.id)}
                      className={`border px-3 py-2 text-sm ${
                        selectedResolvedVersion?.id === version.id
                          ? "border-ink bg-ink text-paper"
                          : "border-rule text-ink hover:border-ink"
                      }`}
                    >
                      v{version.version_number}
                    </button>
                  ))}
                </div>
              )}
              <VersionTimeline
                documentId={documentId}
                versions={versions}
                selectedVersionId={selectedResolvedVersion?.id ?? null}
                onSelectVersion={(versionId) => openEditorVersion(versionId)}
              />
              {versions.length === 0 && (
                <p className="mt-4 text-sm text-muted">No versions recorded.</p>
              )}
            </section>
            )}
          </main>

          <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
            <section className="border border-rule bg-paper p-4">
              <h2 className="text-sm font-semibold text-ink">
                Document tools
              </h2>
              <p className="mt-1 text-sm leading-6 text-muted">
                Propose edits against the extracted text. Suggested changes appear in the document review area.
              </p>
              <div className="mt-4" data-testid="document-redline-workspace">
                <EditPanel
                  documentId={documentId}
                  filename={doc.filename}
                  showResult={false}
                  showTimeline={false}
                  onResult={(result) => {
                    setActiveEditResult(result);
                    setWorkbenchView("redlines");
                  }}
                  onResolved={() => {
                    loadBody();
                    getDocumentVersions(documentId)
                      .then(setVersions)
                      .catch(() => undefined);
                  }}
                />
              </div>
            </section>

            <section className="border border-rule bg-paper p-4">
              <h2 className="text-sm font-semibold text-ink">
                Review state
              </h2>
              <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                <div className="border border-rule bg-paper-sunken p-2">
                  <dt className="uppercase tracking-track2 text-muted">Pending</dt>
                  <dd className="mt-1 text-lg font-semibold text-ink">{pendingEdits}</dd>
                </div>
                <div className="border border-rule bg-paper-sunken p-2">
                  <dt className="uppercase tracking-track2 text-muted">Accepted</dt>
                  <dd className="mt-1 text-lg font-semibold text-ink">{acceptedEdits}</dd>
                </div>
                <div className="border border-rule bg-paper-sunken p-2">
                  <dt className="uppercase tracking-track2 text-muted">Rejected</dt>
                  <dd className="mt-1 text-lg font-semibold text-ink">{rejectedEdits}</dd>
                </div>
              </dl>
            </section>

            <section className="border border-rule bg-paper p-4" data-testid="document-comments">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-ink">Review notes</h2>
                  <p className="mt-1 text-sm leading-6 text-muted">
                    Leave human notes on the file. Notes are recorded against this document.
                  </p>
                </div>
                <span className="border border-rule bg-paper-sunken px-2 py-1 text-[11px] font-semibold uppercase tracking-track2 text-muted">
                  {openComments.length} open
                </span>
              </div>
              <div className="mt-4 space-y-3">
                {openComments.length === 0 && resolvedComments.length === 0 && (
                  <p className="text-sm text-muted">No review notes yet.</p>
                )}
                {openComments.map((comment) => (
                  <article
                    key={comment.id}
                    className="border border-rule bg-paper-sunken p-3 text-sm"
                  >
                    {comment.quote_text && (
                      <blockquote className="mb-2 border-l-2 border-rule pl-3 text-muted">
                        {comment.quote_text}
                      </blockquote>
                    )}
                    <p className="leading-6 text-ink">{comment.body}</p>
                    <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted">
                      <span>{comment.created_at.replace("T", " ").slice(0, 16)}</span>
                      <button
                        type="button"
                        disabled={commentBusy}
                        onClick={() => resolveComment(comment.id)}
                        className="underline underline-offset-4 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Resolve
                      </button>
                    </div>
                  </article>
                ))}
                {resolvedComments.length > 0 && (
                  <details className="border border-rule bg-paper-sunken p-3">
                    <summary className="cursor-pointer text-sm font-medium text-muted">
                      {resolvedComments.length} resolved
                    </summary>
                    <div className="mt-3 space-y-2">
                      {resolvedComments.map((comment) => (
                        <p key={comment.id} className="text-sm leading-6 text-muted">
                          {comment.body}
                        </p>
                      ))}
                    </div>
                  </details>
                )}
              </div>
              <div className="mt-4 space-y-2">
                <textarea
                  value={commentQuote}
                  onChange={(event) => setCommentQuote(event.target.value)}
                  placeholder="Quoted passage (optional)"
                  rows={2}
                  className="w-full resize-y border border-rule bg-paper px-3 py-2 text-sm outline-none focus:border-ink"
                />
                <textarea
                  value={commentBody}
                  onChange={(event) => setCommentBody(event.target.value)}
                  placeholder="Add a review note"
                  rows={3}
                  className="w-full resize-y border border-rule bg-paper px-3 py-2 text-sm outline-none focus:border-ink"
                />
                {commentError && <p className="text-xs text-red-700">{commentError}</p>}
                <button
                  type="button"
                  disabled={commentBusy}
                  onClick={submitComment}
                  className="w-full border border-ink bg-ink px-3 py-2 text-sm font-medium text-paper hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Save note
                </button>
              </div>
            </section>

            <section className="border border-rule bg-paper p-4">
              <h2 className="text-sm font-semibold text-ink">Redaction</h2>
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
            </section>

            <section className="border border-rule bg-paper p-4">
              <button
                type="button"
                onClick={() => setShowDetails((v) => !v)}
                aria-expanded={showDetails}
                data-testid="document-details-toggle"
                className="flex w-full items-center justify-between text-left"
              >
                <h2 className="text-sm font-semibold text-ink">Details</h2>
                <span aria-hidden="true" className="text-xs text-muted">
                  {showDetails ? "Hide" : "Show"}
                </span>
              </button>

              {showDetails && (
                <div className="mt-4 space-y-4">
                  {body && !bodyMissing && body.error_reason && (
                    <p className="text-xs text-muted">{body.error_reason}</p>
                  )}
                  <dl className="space-y-3 text-sm">
                    <DescItem label="Type">
                      <span className="font-mono text-xs">{doc.mime_type}</span>
                    </DescItem>
                    <DescItem label="Uploaded">
                      {doc.uploaded_at.replace("T", " ").slice(0, 19)}
                    </DescItem>
                    <DescItem label="SHA-256">
                      <span className="font-mono text-xs break-all">{doc.sha256}</span>
                    </DescItem>
                  </dl>
                  <p className="text-xs text-muted">
                    Original file access is audited.
                  </p>
                </div>
              )}
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
