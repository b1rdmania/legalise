// Matter document reader at /matters/{slug}/documents/{document_id}.
// Content (extracted text) is the document surface; model edit,
// version, redaction, and record tools sit beside it so the page reads
// like a working file rather than an admin metadata screen.

import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import type { TabKey } from "./tabs/types";
import { MATTER_TAB_LABELS, isTabKey } from "./tabs/types";
import {
  createDocumentComment,
  documentOriginalUrl,
  documentVersionDocxUrl,
  endDocumentEditSession,
  type EditInstructionResponse,
  getAnonymisation,
  getDocumentComments,
  getDocumentBody,
  getDocumentEditSessions,
  getDocumentVersions,
  listDocuments,
  resolveDocumentComment,
  startDocumentEditSession,
  uploadDocumentVersion,
  type AnonymisationResult,
  type DocumentCommentRead,
  type DocumentBody,
  type DocumentEditSessionRead,
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
import { VersionDiff } from "../modules/document_edit/VersionDiff";
import {
  DocumentRichEditor,
  findNormalizedRange,
  type DocumentNoteHighlight,
  type TiptapNode,
} from "../modules/document_edit/DocumentRichEditor";

const DocxOriginalPreview = lazy(() =>
  import("../modules/document_preview/DocxOriginalPreview").then((mod) => ({
    default: mod.DocxOriginalPreview,
  })),
);

const PdfDocumentViewer = lazy(() =>
  import("../modules/document_preview/PdfDocumentViewer").then((mod) => ({
    default: mod.PdfDocumentViewer,
  })),
);

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
type SelectedAnchor = {
  quote: string;
  start: number;
  end: number;
  bodySha256: string | null;
};

async function sha256Hex(text: string): Promise<string | null> {
  if (!window.crypto?.subtle) return null;
  const bytes = new TextEncoder().encode(text);
  const digest = await window.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

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
  const [selectedQuote, setSelectedQuote] = useState("");
  const [selectedAnchor, setSelectedAnchor] = useState<SelectedAnchor | null>(null);
  const [activeReaderQuote, setActiveReaderQuote] = useState<string | null>(null);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [commentBusy, setCommentBusy] = useState(false);
  const [versionUploadFile, setVersionUploadFile] = useState<File | null>(null);
  const [versionUploadNotes, setVersionUploadNotes] = useState("");
  const [versionUploadBusy, setVersionUploadBusy] = useState(false);
  const [versionUploadError, setVersionUploadError] = useState<string | null>(null);
  const [activeEditSessions, setActiveEditSessions] = useState<DocumentEditSessionRead[]>([]);
  const [showDetails, setShowDetails] = useState(false);
  const [workbenchView, setWorkbenchView] = useState<WorkbenchView>("editor");
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [compareVersionId, setCompareVersionId] = useState<string>(EXTRACTED_VERSION_ID);
  const [editorDirty, setEditorDirty] = useState(false);
  const [activeEditResult, setActiveEditResult] =
    useState<EditInstructionResponse | null>(null);
  const workbenchRef = useRef<HTMLDivElement | null>(null);
  const editClientIdRef = useRef<string | null>(null);

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

  const refreshDocumentMetadata = useCallback(
    (cancelledRef?: { cancelled: boolean }) =>
      listDocuments(slug)
      .then((docs) => {
        if (cancelledRef?.cancelled) return null;
        const doc = docs.find((d) => d.id === documentId);
        setQ(doc ? { status: "ready", doc } : { status: "not_found" });
        return doc ?? null;
      })
      .catch((err: unknown) => {
        if (!cancelledRef?.cancelled) setQ({ status: "error", message: String(err) });
        return null;
      }),
    [slug, documentId],
  );

  // Metadata: there's no single-document GET; the matter document list
  // is the authoritative source. Find the row by id.
  useEffect(() => {
    const cancelledRef = { cancelled: false };
    refreshDocumentMetadata(cancelledRef);
    return () => {
      cancelledRef.cancelled = true;
    };
  }, [refreshDocumentMetadata]);

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

  const loadVersions = useCallback(() => {
    getDocumentVersions(documentId).then(setVersions).catch(() => undefined);
  }, [documentId]);

  useEffect(() => {
    setActiveEditResult(null);
    setWorkbenchView("editor");
    setSelectedVersionId(null);
    setCompareVersionId(EXTRACTED_VERSION_ID);
    setEditorDirty(false);
    loadBody();
    loadComments();
    loadVersions();
    getAnonymisation(documentId)
      .then(setAnon)
      .catch(() => setAnon(null));
  }, [documentId, loadBody, loadComments, loadVersions]);

  useEffect(() => {
    let cancelled = false;
    let currentSessionId: string | null = null;
    const storageKey = "legalise.document_edit_client_id";
    const ensureClientId = () => {
      if (editClientIdRef.current) return editClientIdRef.current;
      const existing = window.localStorage.getItem(storageKey);
      if (existing) {
        editClientIdRef.current = existing;
        return existing;
      }
      const generated = window.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
      window.localStorage.setItem(storageKey, generated);
      editClientIdRef.current = generated;
      return generated;
    };
    const heartbeat = async () => {
      try {
        const response = await startDocumentEditSession(documentId, ensureClientId());
        if (cancelled) return;
        currentSessionId = response.current.id;
        setActiveEditSessions(response.active);
      } catch {
        if (!cancelled) {
          getDocumentEditSessions(documentId)
            .then((rows) => {
              if (!cancelled) setActiveEditSessions(rows);
            })
            .catch(() => undefined);
        }
      }
    };
    heartbeat();
    const interval = window.setInterval(heartbeat, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      if (currentSessionId) {
        endDocumentEditSession(documentId, currentSessionId).catch(() => undefined);
      }
    };
  }, [documentId]);

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
  const selectedResolvedIndex = selectedResolvedVersion
    ? resolvedVersions.findIndex((v) => v.id === selectedResolvedVersion.id)
    : -1;
  const effectiveCompareVersionId =
    compareVersionId === selectedResolvedVersion?.id ? EXTRACTED_VERSION_ID : compareVersionId;
  const compareBeforeVersion =
    effectiveCompareVersionId === EXTRACTED_VERSION_ID
      ? null
      : (resolvedVersions.find(
          (v) => v.id === effectiveCompareVersionId && v.id !== selectedResolvedVersion?.id,
        ) ??
        (selectedResolvedIndex > 0 ? resolvedVersions[selectedResolvedIndex - 1] : null));
  const compareBeforeText =
    effectiveCompareVersionId === EXTRACTED_VERSION_ID
      ? (body?.extracted_text ?? "")
      : (compareBeforeVersion?.resolved_text ?? body?.extracted_text ?? "");
  const editorText =
    selectedResolvedVersion?.resolved_text ?? body?.extracted_text ?? "";
  const editorJson = selectedResolvedVersion?.resolved_json as TiptapNode | null | undefined;
  const currentReaderQuote = activeReaderQuote ?? sourceContext.quote;
  const sourceQuoteFoundInReader = currentReaderQuote
    ? Boolean(findNormalizedRange(editorText, currentReaderQuote))
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
  const anchoredOpenNotes: DocumentNoteHighlight[] = openComments
    .filter(
      (comment) =>
        comment.quote_text && comment.anchor_start !== null && comment.anchor_end !== null,
    )
    .map((comment, index) => ({
      id: comment.id,
      label: `Note ${index + 1}`,
      quote: comment.quote_text ?? "",
      status: comment.status,
    }));
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
    const normalizedQuote = commentQuote.trim().replace(/\s+/g, " ");
    const anchor =
      selectedAnchor && normalizedQuote === selectedAnchor.quote ? selectedAnchor : null;
    try {
      await createDocumentComment(documentId, {
        body: trimmed,
        quote_text: commentQuote.trim() || null,
        body_sha256: anchor?.bodySha256 ?? null,
        anchor_start: anchor?.start ?? null,
        anchor_end: anchor?.end ?? null,
      });
      setCommentBody("");
      setCommentQuote("");
      setSelectedQuote("");
      setSelectedAnchor(null);
      loadComments();
    } catch (err) {
      setCommentError(err instanceof Error ? err.message : "Could not save note.");
    } finally {
      setCommentBusy(false);
    }
  };
  const captureWorkbenchSelection = () => {
    const selection = window.getSelection();
    const selected = selection?.toString().trim().replace(/\s+/g, " ") ?? "";
    if (!selected || selected.length < 3) return;
    const anchorNode = selection?.anchorNode;
    const focusNode = selection?.focusNode;
    const root = workbenchRef.current;
    if (!root || !anchorNode || !focusNode) return;
    if (!root.contains(anchorNode) || !root.contains(focusNode)) return;
    const quote = selected.slice(0, 1200);
    const range = findNormalizedRange(editorText, quote);
    setSelectedQuote(quote);
    if (!range) {
      setSelectedAnchor(null);
      return;
    }
    setSelectedAnchor({ quote, start: range.start, end: range.end, bodySha256: null });
    void sha256Hex(editorText).then((bodySha256) => {
      setSelectedAnchor((current) =>
        current?.quote === quote && current.start === range.start && current.end === range.end
          ? { ...current, bodySha256 }
          : current,
      );
    });
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
  const jumpToCommentQuote = (quote: string) => {
    if (!confirmDiscardEditorChanges()) return;
    setActiveReaderQuote(quote);
    setSelectedVersionId(null);
    setCompareVersionId(EXTRACTED_VERSION_ID);
    setWorkbenchView("editor");
    requestAnimationFrame(() => {
      workbenchRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    });
  };
  const submitVersionUpload = async () => {
    if (!versionUploadFile) {
      setVersionUploadError("Choose a file to upload as the next version.");
      return;
    }
    if (!confirmDiscardEditorChanges()) return;
    setVersionUploadBusy(true);
    setVersionUploadError(null);
    try {
      const uploaded = await uploadDocumentVersion(
        documentId,
        versionUploadFile,
        versionUploadNotes,
      );
      setVersionUploadFile(null);
      setVersionUploadNotes("");
      setSelectedVersionId(uploaded.resolved_text ? uploaded.id : null);
      setCompareVersionId(EXTRACTED_VERSION_ID);
      setActiveReaderQuote(null);
      setEditorDirty(false);
      await Promise.all([
        refreshDocumentMetadata(),
        Promise.resolve(loadBody()),
        Promise.resolve(loadVersions()),
      ]);
      setWorkbenchView("editor");
    } catch (err) {
      setVersionUploadError(
        err instanceof Error ? err.message : "Could not upload this document version.",
      );
    } finally {
      setVersionUploadBusy(false);
    }
  };

  const refreshAfterVersionRestore = async () => {
    setSelectedVersionId(null);
    setCompareVersionId(EXTRACTED_VERSION_ID);
    setActiveReaderQuote(null);
    setEditorDirty(false);
    await Promise.all([
      refreshDocumentMetadata(),
      Promise.resolve(loadBody()),
      Promise.resolve(loadVersions()),
    ]);
    setWorkbenchView("editor");
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
          <main
            ref={workbenchRef}
            className="min-w-0"
            onMouseUp={captureWorkbenchSelection}
            onKeyUp={captureWorkbenchSelection}
          >
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
                  sourceHighlight={currentReaderQuote}
                  noteHighlights={anchoredOpenNotes}
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
              <Suspense
                fallback={
                  <div className="border border-rule bg-paper p-5">
                    <LoadingLine label="loading document preview" />
                  </div>
                }
              >
                {canPreviewOriginal ? (
                  <PdfDocumentViewer
                    fileUrl={originalHref}
                    filename={doc.filename}
                    sourceHighlight={currentReaderQuote}
                  />
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
              </Suspense>
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
              <div
                className="mt-5 border border-rule bg-paper-sunken p-4"
                data-testid="document-version-upload"
              >
                <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                  <div>
                    <h3 className="text-sm font-semibold text-ink">
                      Upload next version
                    </h3>
                    <p className="mt-1 text-sm leading-6 text-muted">
                      Replace the active original file while keeping this document's version history and review notes together.
                    </p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                      <input
                        type="file"
                        accept=".pdf,.doc,.docx,.txt,.md,.rtf,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown,application/rtf,text/rtf"
                        onChange={(event) =>
                          setVersionUploadFile(event.currentTarget.files?.[0] ?? null)
                        }
                        className="w-full border border-rule bg-paper px-3 py-2 text-sm"
                        data-testid="document-version-file-input"
                      />
                      <input
                        type="text"
                        value={versionUploadNotes}
                        onChange={(event) => setVersionUploadNotes(event.target.value)}
                        placeholder="Optional version note"
                        className="w-full border border-rule bg-paper px-3 py-2 text-sm outline-none focus:border-ink"
                      />
                    </div>
                    {versionUploadFile && (
                      <p className="mt-2 text-xs text-muted">
                        Next version: {versionUploadFile.name} · {formatBytes(versionUploadFile.size)}
                      </p>
                    )}
                    {versionUploadError && (
                      <p className="mt-2 text-xs text-red-700">{versionUploadError}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={versionUploadBusy}
                    onClick={submitVersionUpload}
                    className="border border-ink bg-ink px-4 py-2 text-sm font-medium text-paper hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {versionUploadBusy ? "Uploading..." : "Upload version"}
                  </button>
                </div>
              </div>
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
                onVersionRestored={refreshAfterVersionRestore}
              />
              {selectedResolvedVersion?.resolved_text && compareBeforeText && (
                <>
                  <div className="mt-5 flex flex-wrap items-end gap-3 border border-rule bg-paper-sunken p-4">
                    <label className="grid gap-1 text-xs font-semibold text-muted">
                      Compare against
                      <select
                        value={effectiveCompareVersionId}
                        onChange={(event) => setCompareVersionId(event.target.value)}
                        className="min-w-52 border border-rule bg-paper px-3 py-2 text-sm font-normal text-ink"
                      >
                        <option value={EXTRACTED_VERSION_ID}>Extracted text</option>
                        {resolvedVersions
                          .filter((version) => version.id !== selectedResolvedVersion.id)
                          .map((version) => (
                            <option key={version.id} value={version.id}>
                              v{version.version_number}
                            </option>
                          ))}
                      </select>
                    </label>
                    <p className="max-w-xl text-xs leading-5 text-muted">
                      Use this to check how an uploaded or edited copy differs from the source
                      text or another saved version before restoring, downloading, or relying on it.
                    </p>
                  </div>
                  <VersionDiff
                    before={{
                      version: compareBeforeVersion,
                      text: compareBeforeText,
                    }}
                    after={{
                      version: selectedResolvedVersion,
                      text: selectedResolvedVersion.resolved_text,
                    }}
                  />
                </>
              )}
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

            <section className="border border-rule bg-paper p-4" data-testid="document-edit-sessions">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-ink">Editing now</h2>
                  <p className="mt-1 text-sm leading-6 text-muted">
                    Active document sessions are visible here. Real-time co-editing will use this same document session record.
                  </p>
                </div>
                <span className="border border-rule bg-paper-sunken px-2 py-1 text-[11px] font-semibold uppercase tracking-track2 text-muted">
                  {activeEditSessions.length || 1} active
                </span>
              </div>
              <div className="mt-3 space-y-2">
                {activeEditSessions.length > 0 ? (
                  activeEditSessions.map((session) => (
                    <div
                      key={session.id}
                      className="flex items-center justify-between gap-3 border border-rule bg-paper-sunken px-3 py-2 text-sm"
                    >
                      <span className="font-medium text-ink">{session.user_label}</span>
                      <span className="text-xs text-muted">
                        {session.last_seen_at.replace("T", " ").slice(0, 16)}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted">You are editing this document.</p>
                )}
              </div>
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
                      <div className="mb-2 border-l-2 border-rule pl-3 text-muted">
                        <div className="flex items-start justify-between gap-3">
                          <blockquote>{comment.quote_text}</blockquote>
                          {comment.anchor_start !== null && comment.anchor_end !== null && (
                            <span className="shrink-0 border border-rule bg-paper px-2 py-1 text-[10px] font-semibold uppercase tracking-track2 text-muted">
                              Anchored
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => jumpToCommentQuote(comment.quote_text ?? "")}
                          className="mt-2 text-xs font-medium text-ink underline underline-offset-4 hover:text-muted"
                        >
                          Find in document
                        </button>
                      </div>
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
                {selectedQuote && (
                  <div
                    className="border border-rule bg-paper-sunken p-3 text-sm"
                    data-testid="document-selected-quote"
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-track2 text-muted">
                      Selected passage
                    </p>
                    <p className="mt-2 max-h-24 overflow-hidden leading-6 text-muted">
                      {selectedQuote}
                    </p>
                    <p className="mt-2 text-xs text-muted">
                      {selectedAnchor
                        ? "This note will stay anchored to the current document text."
                        : "This passage can be quoted, but its exact text position was not found."}
                    </p>
                    <button
                      type="button"
                      onClick={() => setCommentQuote(selectedQuote)}
                      className="mt-3 border border-rule bg-paper px-3 py-2 text-xs font-medium text-ink hover:border-ink"
                    >
                      Quote this passage
                    </button>
                  </div>
                )}
                <textarea
                  value={commentQuote}
                  onChange={(event) => setCommentQuote(event.target.value)}
                  placeholder="Quoted passage; select text in the document or type one"
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
