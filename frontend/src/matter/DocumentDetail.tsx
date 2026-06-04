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
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import type { TabKey } from "./tabs/types";
import { MATTER_TAB_LABELS, isTabKey } from "./tabs/types";
import {
  createDocumentComment,
  documentOriginalUrl,
  documentVersionDocxUrl,
  documentVersionPdfUrl,
  endDocumentEditSession,
  type EditInstructionResponse,
  getAnonymisation,
  getModulesV2,
  getDocumentComments,
  getDocumentBody,
  getDocumentEditSessions,
  getDocumentVersions,
  listGrants,
  listArtifacts,
  listDocuments,
  listInstalledModules,
  readArtifact,
  reopenDocumentComment,
  resolveDocumentComment,
  startDocumentEditSession,
  updateDocumentComment,
  uploadDocumentVersion,
  type ArtifactRead,
  type AnonymisationResult,
  type DocumentCommentRead,
  type DocumentBody,
  type DocumentEditSessionRead,
  type DocumentVersionSummary,
  type GrantRow,
  type InstalledModule,
  type MatterDocument,
  type V2ManifestEntry,
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
import { GenericSkillRunner } from "./GenericSkillRunner";
import {
  runnableMatterSkills,
  shortCapabilityList,
  type RunnableMatterSkill,
} from "./skillRunnerModel";

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

function compactText(value: string | null | undefined, max = 96): string {
  const compact = (value ?? "").trim().replace(/\s+/g, " ");
  if (compact.length <= max) return compact;
  return `${compact.slice(0, max - 3).trimEnd()}...`;
}

function artifactLabel(artifact: ArtifactRead): string {
  return artifact.kind.replace(/_/g, " ");
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

function artifactReferencesDocument(artifact: ArtifactRead, documentId: string): boolean {
  const payload = artifact.payload;
  const documentRef = payload.document_id;
  if (documentRef === documentId) return true;
  const documentRefs = payload.document_ids;
  if (Array.isArray(documentRefs) && documentRefs.includes(documentId)) return true;

  const input = payload.input;
  if (input && typeof input === "object") {
    const inputRecord = input as Record<string, unknown>;
    if (inputRecord.document_id === documentId) return true;
    if (
      Array.isArray(inputRecord.document_ids) &&
      inputRecord.document_ids.includes(documentId)
    ) {
      return true;
    }
  }

  const anchors = payload.source_anchors;
  if (
    Array.isArray(anchors) &&
    anchors.some(
      (anchor) =>
        anchor &&
        typeof anchor === "object" &&
        (anchor as Record<string, unknown>).document_id === documentId,
    )
  ) {
    return true;
  }

  const evidence = payload.evidence;
  return (
    Array.isArray(evidence) &&
    evidence.some(
      (row) =>
        row &&
        typeof row === "object" &&
        (row as Record<string, unknown>).document_id === documentId,
    )
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
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentBody, setEditingCommentBody] = useState("");
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
  const [moduleEntries, setModuleEntries] = useState<V2ManifestEntry[]>([]);
  const [installedModules, setInstalledModules] = useState<Map<string, InstalledModule>>(
    new Map(),
  );
  const [grantRows, setGrantRows] = useState<GrantRow[] | null>(null);
  const [skillLoadState, setSkillLoadState] =
    useState<"loading" | "ready" | "error">("loading");
  const [activeRunnerSkill, setActiveRunnerSkill] =
    useState<RunnableMatterSkill | null>(null);
  const [runnerInitialInput, setRunnerInitialInput] = useState<string | undefined>(
    undefined,
  );
  const [documentArtifacts, setDocumentArtifacts] = useState<ArtifactRead[] | null>(null);
  const workbenchRef = useRef<HTMLDivElement | null>(null);
  const notesRef = useRef<HTMLElement | null>(null);
  const skillsRef = useRef<HTMLElement | null>(null);
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
  const navigate = useNavigate();
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

  useEffect(() => {
    let cancelled = false;
    setSkillLoadState("loading");
    void Promise.all([
      getModulesV2(),
      listInstalledModules(),
      listGrants(slug),
    ])
      .then(([moduleResponse, installedRows, grantsResponse]) => {
        if (cancelled) return;
        const installedIndex = new Map<string, InstalledModule>();
        for (const row of installedRows) installedIndex.set(row.module_id, row);
        setModuleEntries(moduleResponse.modules);
        setInstalledModules(installedIndex);
        setGrantRows(grantsResponse.grants);
        setSkillLoadState("ready");
      })
      .catch(() => {
        if (!cancelled) setSkillLoadState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(() => {
    let cancelled = false;
    setDocumentArtifacts(null);
    void listArtifacts(slug)
      .then((rows) =>
        Promise.all(
          rows.slice(0, 40).map((row) =>
            readArtifact(slug, row.id).catch(() => null),
          ),
        ),
      )
      .then((rows) => {
        if (cancelled) return;
        setDocumentArtifacts(
          rows.filter((row): row is ArtifactRead =>
            Boolean(row && artifactReferencesDocument(row, documentId)),
          ),
        );
      })
      .catch(() => {
        if (!cancelled) setDocumentArtifacts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [slug, documentId]);

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
  const anchoredComments = comments.filter(
    (comment) => comment.anchor_start !== null && comment.anchor_end !== null,
  );
  const runnableSkills = runnableMatterSkills({
    modules: moduleEntries,
    installed: installedModules,
    grants: grantRows,
  });
  const documentSkills = runnableSkills.filter((skill) =>
    skill.reads.includes("document.body.read"),
  );
  const primaryDocumentSkill = documentSkills[0] ?? null;
  const secondaryDocumentSkills = documentSkills.slice(1, 4);
  const reviewQueueTotal =
    pendingEdits + openComments.length + (activeEditSessions.length > 1 ? 1 : 0);
  const citedOutputCount = documentArtifacts?.length ?? 0;
  const hasConcurrentSession = activeEditSessions.length > 1;
  const documentStateLabel = editorDirty
    ? "Unsaved working copy"
    : pendingEdits > 0
      ? "Redlines waiting"
      : openComments.length > 0
        ? "Review notes open"
        : selectedResolvedVersion
          ? `Viewing v${selectedResolvedVersion.version_number}`
          : "Ready to read";
  const headerStatusItems = [
    {
      label: "Open notes",
      value: openComments.length,
      tone: openComments.length > 0 ? "active" : "quiet",
    },
    {
      label: "Pending changes",
      value: pendingEdits,
      tone: pendingEdits > 0 ? "active" : "quiet",
    },
    {
      label: "Versions",
      value: versions.length,
      tone: versions.length > 0 ? "active" : "quiet",
    },
    {
      label: "Ready skills",
      value: documentSkills.length,
      tone: documentSkills.length > 0 ? "active" : "quiet",
    },
  ] as const;
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
  const reviewSavedVersion = (version: DocumentVersionSummary["version"]) => {
    setVersions((current) => {
      if (current.some((summary) => summary.version.id === version.id)) return current;
      return [
        ...current,
        {
          version,
          pending_count: 0,
          accepted_count: 0,
          rejected_count: 0,
        },
      ];
    });
    setSelectedVersionId(version.id);
    setCompareVersionId(EXTRACTED_VERSION_ID);
    setWorkbenchView("versions");
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
  const reopenComment = async (commentId: string) => {
    setCommentBusy(true);
    setCommentError(null);
    try {
      await reopenDocumentComment(documentId, commentId);
      loadComments();
    } catch (err) {
      setCommentError(err instanceof Error ? err.message : "Could not reopen note.");
    } finally {
      setCommentBusy(false);
    }
  };
  const startEditingComment = (comment: DocumentCommentRead) => {
    setEditingCommentId(comment.id);
    setEditingCommentBody(comment.body);
    setCommentError(null);
  };
  const cancelEditingComment = () => {
    setEditingCommentId(null);
    setEditingCommentBody("");
  };
  const submitCommentEdit = async (commentId: string) => {
    const trimmed = editingCommentBody.trim();
    if (trimmed.length < 2) {
      setCommentError("Add a note before saving.");
      return;
    }
    setCommentBusy(true);
    setCommentError(null);
    try {
      await updateDocumentComment(documentId, commentId, { body: trimmed });
      setEditingCommentId(null);
      setEditingCommentBody("");
      loadComments();
    } catch (err) {
      setCommentError(err instanceof Error ? err.message : "Could not update note.");
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
      workbenchRef.current?.scrollIntoView?.({ block: "start", behavior: "smooth" });
    });
  };
  const startQuotedNote = (quote: string) => {
    const trimmed = quote.trim().replace(/\s+/g, " ");
    if (!trimmed) return;
    setSelectedQuote(trimmed);
    setCommentQuote(trimmed);
    const range = findNormalizedRange(editorText, trimmed);
    if (range) {
      setSelectedAnchor({ quote: trimmed, start: range.start, end: range.end, bodySha256: null });
      void sha256Hex(editorText).then((bodySha256) => {
        setSelectedAnchor((current) =>
          current?.quote === trimmed && current.start === range.start && current.end === range.end
            ? { ...current, bodySha256 }
            : current,
        );
      });
    } else {
      setSelectedAnchor(null);
    }
    requestAnimationFrame(() => {
      notesRef.current?.scrollIntoView?.({ block: "start", behavior: "smooth" });
    });
  };
  const startNoteFromCurrentSelection = () => {
    const trimmed = selectedQuote.trim().replace(/\s+/g, " ");
    if (!trimmed) return;
    setCommentQuote(trimmed);
    requestAnimationFrame(() => {
      notesRef.current?.scrollIntoView?.({ block: "start", behavior: "smooth" });
    });
  };
  const selectedPassageRequest = (skill: RunnableMatterSkill): string | undefined => {
    const trimmed = selectedQuote.trim().replace(/\s+/g, " ");
    if (!trimmed) return undefined;
    return [
      `Use this selected passage from ${doc?.filename ?? "the document"}:`,
      "",
      `"${trimmed}"`,
      "",
      `Run ${skill.title}.`,
    ].join("\n");
  };
  const openDocumentSkill = (skill: RunnableMatterSkill, useSelection = false) => {
    setRunnerInitialInput(useSelection ? selectedPassageRequest(skill) : undefined);
    setActiveRunnerSkill(skill);
    requestAnimationFrame(() => {
      skillsRef.current?.scrollIntoView?.({ block: "start", behavior: "smooth" });
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
  const openChatWithDocument = () =>
    void navigate({
      to: "/matters/$slug/$tab",
      params: { slug, tab: "assistant" },
      search: { document: documentId },
    });
  const chatNextStep = {
    eyebrow: "Return to Chat",
    title: "Ask the next question with this file attached.",
    body: "This document stays selected in Chat, so the next answer works from the same file.",
    action: "Back to Chat",
    onClick: openChatWithDocument,
  };
  const nextStep =
    activeEditResult
      ? {
          eyebrow: "Review changes",
          title: `${activeEditResult.pending_edits.length} redline${
            activeEditResult.pending_edits.length === 1 ? "" : "s"
          } ready.`,
          body: "Review the model's suggested changes before they become a saved version.",
          action: "Review redlines",
          onClick: () => openWorkbenchView("redlines" as WorkbenchView),
        }
      : arrivedFromChat
        ? chatNextStep
        : primaryDocumentSkill
          ? {
              eyebrow: "Run a skill",
              title: `${primaryDocumentSkill.title} is ready for this file.`,
              body: "Run a governed skill with this document selected, then review and sign the output.",
              action: "Run with this file",
              onClick: () => openDocumentSkill(primaryDocumentSkill),
            }
          : openComments.length > 0
            ? {
                eyebrow: "Review notes",
                title: `${openComments.length} open note${
                  openComments.length === 1 ? "" : "s"
                } on this file.`,
                body: "Open the review notes, resolve what is done, or add a new note from selected text.",
                action: "Open notes",
                onClick: () =>
                  notesRef.current?.scrollIntoView?.({ block: "start", behavior: "smooth" }),
              }
            : {
                eyebrow: "Read the file",
                title: "Start by reading or selecting text.",
                body: "The document is ready. Select a passage to add a note, or switch to the original preview.",
                action: "Keep reading",
                onClick: () => openWorkbenchView("editor" as WorkbenchView),
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
                Document workbench
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight2 text-ink sm:text-4xl">
                {doc.filename}
              </h1>
              <div className="mt-4 flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-track2 text-muted">
                <span className="border border-ink bg-ink px-2 py-1 text-paper">
                  {documentStateLabel}
                </span>
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
              <p
                className="mt-4 text-sm leading-6 text-muted"
                data-testid="document-header-status"
              >
                {headerStatusItems.map((item, index) => (
                  <span key={item.label}>
                    {index > 0 && <span aria-hidden="true"> · </span>}
                    <span className={item.tone === "active" ? "font-semibold text-ink" : ""}>
                      {item.value} {item.label.toLowerCase()}
                    </span>
                  </span>
                ))}
              </p>
            </div>
            <div className="flex flex-col items-stretch gap-2 text-sm sm:min-w-[220px]" aria-label="Document commands">
              <Link
                to="/matters/$slug/$tab"
                params={{ slug, tab: "assistant" }}
                search={{ document: documentId }}
                className="inline-flex items-center justify-center border border-ink bg-ink px-3 py-2 text-paper hover:bg-black"
                data-testid="document-ask-chat-link"
              >
                Ask about this file
              </Link>
              {selectedResolvedVersion && (
                <div className="grid gap-1">
                  <a
                    href={documentVersionDocxUrl(documentId, selectedResolvedVersion.id)}
                    className="inline-flex items-center border border-ink bg-ink px-3 py-2 text-paper hover:bg-black"
                    data-testid="document-download-edited-docx"
                  >
                    Download edited DOCX
                  </a>
                  <a
                    href={documentVersionPdfUrl(documentId, selectedResolvedVersion.id)}
                    className="inline-flex items-center border border-rule bg-paper px-3 py-2 text-ink hover:border-ink"
                    data-testid="document-download-edited-pdf"
                  >
                    Download PDF
                  </a>
                  {comments.length > 0 && (
                    <p className="text-[11px] leading-4 text-muted">
                      Includes {comments.length} review{" "}
                      {comments.length === 1 ? "note" : "notes"}.
                    </p>
                  )}
                </div>
              )}
              <details className="border border-rule bg-paper-sunken px-3 py-2">
                <summary className="cursor-pointer text-sm font-medium text-ink">
                  File actions
                </summary>
                <div className="mt-3 grid gap-2">
                  <a
                    href={originalHref}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center border border-rule bg-paper px-3 py-2 text-ink hover:border-ink"
                    data-testid="document-open-original"
                  >
                    Open original
                  </a>
                  <a
                    href={documentOriginalUrl(documentId, { download: true })}
                    className="inline-flex items-center justify-center border border-rule bg-paper px-3 py-2 text-ink hover:border-ink"
                  >
                    Download
                  </a>
                  <button
                    type="button"
                    onClick={() => openWorkbenchView("versions")}
                    className="inline-flex items-center justify-center border border-rule bg-paper px-3 py-2 text-ink hover:border-ink"
                  >
                    Compare versions
                  </button>
                  <a
                    href={recordHref}
                    className="inline-flex items-center justify-center border border-rule bg-paper px-3 py-2 text-ink hover:border-ink"
                  >
                    View Record
                  </a>
                </div>
              </details>
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
          className="mt-4 flex flex-wrap items-center gap-2 border border-rule bg-paper px-3 py-3"
          aria-label="Document workspace views"
          data-testid="document-workbench-tabs"
        >
          <span className="mr-1 text-[11px] font-semibold uppercase tracking-track2 text-muted">
            View
          </span>
          <WorkbenchTab
            active={workbenchView === "editor"}
            onClick={() => openWorkbenchView("editor")}
          >
            Read / edit
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

        <div
          className="mt-4 flex flex-wrap items-center justify-between gap-3 border border-rule bg-paper px-4 py-3 text-sm"
          data-testid="document-presence-strip"
        >
          <div>
            <span className="font-semibold text-ink">
              {activeEditSessions.length > 1
                ? `${activeEditSessions.length} people have this file open`
                : "You are working in this file"}
            </span>
            <span className="ml-2 text-muted">
              Live presence is recorded; edits save as document versions.
            </span>
          </div>
          {activeEditSessions.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {activeEditSessions.slice(0, 4).map((session) => (
                <span
                  key={session.id}
                  className="border border-rule bg-paper-sunken px-2 py-1 text-xs text-muted"
                >
                  {session.user_label}
                </span>
              ))}
            </div>
          )}
        </div>

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
                  onSavedVersion={reviewSavedVersion}
                />
              </section>
            )}

            {workbenchView === "editor" && (
              <div className="space-y-3">
                {openComments.length > 0 && (
                  <section
                    className="border border-rule bg-paper p-3"
                    data-testid="document-note-navigator"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-track2 text-muted">
                          Review notes
                        </p>
                        <p className="mt-1 text-sm font-semibold text-ink">
                          {openComments.length} open note
                          {openComments.length === 1 ? "" : "s"} on this file.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          notesRef.current?.scrollIntoView?.({
                            block: "start",
                            behavior: "smooth",
                          })
                        }
                        className="border border-rule px-3 py-2 text-xs font-semibold text-muted hover:border-ink hover:text-ink"
                      >
                        Manage notes
                      </button>
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {openComments.slice(0, 4).map((comment, index) => (
                        <button
                          key={comment.id}
                          type="button"
                          onClick={() => {
                            if (comment.quote_text) jumpToCommentQuote(comment.quote_text);
                            else {
                              notesRef.current?.scrollIntoView?.({
                                block: "start",
                                behavior: "smooth",
                              });
                            }
                          }}
                          className="border border-rule bg-paper-sunken px-3 py-2 text-left text-sm hover:border-ink"
                        >
                          <span className="text-[10px] font-semibold uppercase tracking-track2 text-muted">
                            Note {index + 1}
                          </span>
                          <span className="mt-1 block font-medium text-ink">
                            {compactText(comment.body, 72)}
                          </span>
                          {comment.quote_text && (
                            <span className="mt-1 block text-xs text-muted">
                              Quote: {compactText(comment.quote_text, 72)}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                    {openComments.length > 4 && (
                      <p className="mt-2 text-xs text-muted">
                        {openComments.length - 4} more open note
                        {openComments.length - 4 === 1 ? "" : "s"} in the review rail.
                      </p>
                    )}
                  </section>
                )}
                {documentArtifacts && documentArtifacts.length > 0 && (
                  <section
                    className="border border-rule bg-paper p-3"
                    data-testid="document-attached-outputs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-track2 text-muted">
                          Work from this file
                        </p>
                        <p className="mt-1 text-sm font-semibold text-ink">
                          {documentArtifacts.length} signed output
                          {documentArtifacts.length === 1 ? " cites" : "s cite"} this document.
                        </p>
                      </div>
                      <Link
                        to="/matters/$slug/$tab"
                        params={{ slug, tab: "artifacts" }}
                        className="border border-rule px-3 py-2 text-xs font-semibold text-muted hover:border-ink hover:text-ink"
                      >
                        Open signed outputs
                      </Link>
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {documentArtifacts.slice(0, 4).map((artifact) => (
                        <a
                          key={artifact.id}
                          href={`/matters/${encodeURIComponent(slug)}/artifacts/${encodeURIComponent(artifact.id)}`}
                          className="border border-rule bg-paper-sunken px-3 py-2 text-sm hover:border-ink"
                        >
                          <span className="block font-semibold capitalize text-ink">
                            {artifactLabel(artifact)}
                          </span>
                          <span className="mt-1 block text-xs text-muted">
                            {artifact.module_id} ·{" "}
                            {artifact.created_at.replace("T", " ").slice(0, 16)}
                          </span>
                        </a>
                      ))}
                    </div>
                  </section>
                )}
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
                      latestVersionId={latestVersion?.id ?? null}
                      originalMimeType={doc.mime_type}
                      sourceLabel={editorSourceLabel}
                      sourceHighlight={currentReaderQuote}
                      noteHighlights={anchoredOpenNotes}
                      selectedQuote={selectedQuote || undefined}
                      selectedQuoteAnchored={Boolean(selectedAnchor)}
                      onCreateNoteFromSelection={startNoteFromCurrentSelection}
                      onRunSkillFromSelection={
                        primaryDocumentSkill
                          ? () => openDocumentSkill(primaryDocumentSkill, true)
                          : undefined
                      }
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
                    onQuoteSelected={startQuotedNote}
                  />
                ) : canPreviewDocx ? (
                  <DocxOriginalPreview
                    documentId={documentId}
                    filename={doc.filename}
                    sourceHighlight={currentReaderQuote}
                    onQuoteSelected={startQuotedNote}
                  />
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
                reviewNoteCount={comments.length}
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
            <section
              className="border border-ink bg-paper p-4"
              data-testid="document-next-step"
            >
              <p className="text-[11px] font-semibold uppercase tracking-track2 text-muted">
                Work on this file
              </p>
              <h2 className="mt-2 text-lg font-semibold tracking-tight2 text-ink">
                {nextStep.title}
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted">{nextStep.body}</p>
              <button
                type="button"
                onClick={nextStep.onClick}
                className="mt-4 w-full border border-ink bg-ink px-4 py-2 text-sm font-semibold text-paper hover:bg-black"
              >
                {nextStep.action}
              </button>
              <dl
                className="mt-4 grid grid-cols-3 gap-2 text-center text-xs"
                data-testid="document-review-board"
              >
                <div className="border border-rule bg-paper-sunken p-2">
                  <dt className="uppercase tracking-track2 text-muted">Notes</dt>
                  <dd className="mt-1 text-lg font-semibold text-ink">{openComments.length}</dd>
                </div>
                <div className="border border-rule bg-paper-sunken p-2">
                  <dt className="uppercase tracking-track2 text-muted">Skills</dt>
                  <dd className="mt-1 text-lg font-semibold text-ink">{documentSkills.length}</dd>
                </div>
                <div className="border border-rule bg-paper-sunken p-2">
                  <dt className="uppercase tracking-track2 text-muted">Outputs</dt>
                  <dd className="mt-1 text-lg font-semibold text-ink">
                    {documentArtifacts === null ? "..." : citedOutputCount}
                  </dd>
                </div>
              </dl>
              <details
                className="mt-4 border border-rule bg-paper-sunken p-3"
                data-testid="document-work-plan"
              >
                <summary className="cursor-pointer text-sm font-semibold text-ink">
                  More file actions
                </summary>
                <div className="mt-3 divide-y divide-rule border border-rule bg-paper">
                  <button
                    type="button"
                    onClick={() => openWorkbenchView("editor")}
                    className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left text-sm hover:bg-paper-sunken"
                  >
                    <span>
                      <span className="block font-semibold text-ink">Read and mark up</span>
                      <span className="mt-1 block text-xs text-muted">
                        Select text to anchor a review note.
                      </span>
                    </span>
                    <span className="text-xs font-semibold uppercase tracking-track2 text-muted">
                      Editor
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      notesRef.current?.scrollIntoView?.({ block: "start", behavior: "smooth" })
                    }
                    className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left text-sm hover:bg-paper-sunken"
                  >
                    <span>
                      <span className="block font-semibold text-ink">Review notes</span>
                      <span className="mt-1 block text-xs text-muted">
                        {openComments.length === 0
                          ? "No open notes yet."
                          : `${openComments.length} open note${
                              openComments.length === 1 ? "" : "s"
                            } waiting.`}
                      </span>
                    </span>
                    <span className="text-sm font-semibold text-ink">{openComments.length}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (primaryDocumentSkill) openDocumentSkill(primaryDocumentSkill);
                    }}
                    className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left text-sm hover:bg-paper-sunken"
                  >
                    <span>
                      <span className="block font-semibold text-ink">Run document skill</span>
                      <span className="mt-1 block text-xs text-muted">
                        {documentSkills.length === 0
                          ? "No document skills are ready."
                          : `${documentSkills.length} ready for this file.`}
                      </span>
                    </span>
                    <span className="text-sm font-semibold text-ink">{documentSkills.length}</span>
                  </button>
                  <a
                    href={recordHref}
                    className="flex items-center justify-between gap-3 px-3 py-3 text-sm hover:bg-paper-sunken"
                  >
                    <span>
                      <span className="block font-semibold text-ink">View matter Record</span>
                      <span className="mt-1 block text-xs text-muted">
                        Notes, skill runs, sign-off, and file access.
                      </span>
                    </span>
                    <span className="text-xs font-semibold uppercase tracking-track2 text-muted">
                      Open
                    </span>
                  </a>
                </div>
              </details>
              <details
                className="mt-4 border border-rule bg-paper-sunken p-3"
                data-testid="document-output-links"
              >
                <summary className="cursor-pointer text-sm font-semibold text-ink">
                  {documentArtifacts === null
                    ? "Checking outputs that cite this file"
                    : citedOutputCount === 0
                      ? "No signed outputs cite this file yet"
                      : `${citedOutputCount} signed output${
                          citedOutputCount === 1 ? "" : "s"
                        } ${citedOutputCount === 1 ? "cites" : "cite"} this file`}
                </summary>
                {documentArtifacts && documentArtifacts.length > 0 ? (
                  <div className="mt-3 space-y-2">
                    {documentArtifacts.slice(0, 3).map((artifact) => (
                      <a
                        key={artifact.id}
                        href={`/matters/${encodeURIComponent(slug)}/artifacts/${encodeURIComponent(artifact.id)}`}
                        className="block border border-rule bg-paper px-3 py-2 text-sm hover:border-ink"
                      >
                        <span className="block font-semibold text-ink">
                          {artifactLabel(artifact)}
                        </span>
                        <span className="mt-1 block text-xs text-muted">
                          {artifact.module_id} · {artifact.created_at.replace("T", " ").slice(0, 16)}
                        </span>
                      </a>
                    ))}
                    <a
                      href={`/matters/${encodeURIComponent(slug)}/artifacts`}
                      className="text-xs text-muted underline underline-offset-4 hover:text-ink"
                    >
                      Open all signed outputs →
                    </a>
                  </div>
                ) : (
                  <p className="mt-3 text-sm leading-6 text-muted">
                    Run a document skill, then sign the output. When the output cites this
                    file, it appears here and in the matter Record.
                  </p>
                )}
              </details>
              <details
                className="mt-3 border border-rule bg-paper-sunken p-3"
                data-testid="document-review-queue"
                open={reviewQueueTotal > 0}
              >
                <summary className="cursor-pointer text-sm font-semibold text-ink">
                  {reviewQueueTotal === 0
                    ? "Nothing waiting in the review queue"
                    : `${reviewQueueTotal} review item${
                        reviewQueueTotal === 1 ? "" : "s"
                      } waiting`}
                </summary>
                <div className="mt-3 grid gap-2 text-sm">
                  <button
                    type="button"
                    onClick={() => openWorkbenchView(activeEditResult ? "redlines" : "versions")}
                    className="flex items-center justify-between border border-rule bg-paper px-3 py-2 text-left hover:border-ink"
                  >
                    <span>Proposed redlines</span>
                    <span className="font-semibold text-ink">{pendingEdits}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      notesRef.current?.scrollIntoView?.({ block: "start", behavior: "smooth" })
                    }
                    className="flex items-center justify-between border border-rule bg-paper px-3 py-2 text-left hover:border-ink"
                  >
                    <span>Open review notes</span>
                    <span className="font-semibold text-ink">{openComments.length}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => openWorkbenchView("versions")}
                    className="flex items-center justify-between border border-rule bg-paper px-3 py-2 text-left hover:border-ink"
                  >
                    <span>Saved versions</span>
                    <span className="font-semibold text-ink">{versions.length}</span>
                  </button>
                  {activeEditSessions.length > 1 && (
                    <p className="border border-amber-300 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
                      Another session is open. Coordinate before saving a new version.
                    </p>
                  )}
                </div>
              </details>
            </section>

            <section
              ref={skillsRef}
              className="border border-rule bg-paper p-4"
              data-testid="document-skill-runner"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-track2 text-muted">
                    Document skills
                  </p>
                  <h2 className="mt-1 text-sm font-semibold text-ink">
                    Run a skill with this file selected.
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-muted">
                    Skills use the same project runner as Chat, with {doc.filename} already in context.
                  </p>
                </div>
                <span className="border border-rule bg-paper-sunken px-2 py-1 text-[11px] font-semibold uppercase tracking-track2 text-muted">
                  {documentSkills.length} ready
                </span>
              </div>
              {activeRunnerSkill ? (
                <div className="mt-4">
                  <GenericSkillRunner
                    key={`${activeRunnerSkill.moduleId}:${activeRunnerSkill.capabilityId}:${
                      runnerInitialInput ?? "document"
                    }`}
                    slug={slug}
                    skill={activeRunnerSkill}
                    documents={[doc]}
                    initialDocumentIds={[documentId]}
                    initialInput={runnerInitialInput}
                    onRunComplete={(_response, artifacts) => {
                      const related = artifacts.filter((artifact) =>
                        artifactReferencesDocument(artifact, documentId),
                      );
                      if (related.length === 0) return;
                      setDocumentArtifacts((current) => {
                        const existing = new Set((current ?? []).map((artifact) => artifact.id));
                        return [
                          ...related.filter((artifact) => !existing.has(artifact.id)),
                          ...(current ?? []),
                        ];
                      });
                    }}
                    onClose={() => {
                      setActiveRunnerSkill(null);
                      setRunnerInitialInput(undefined);
                    }}
                    compact
                  />
                </div>
              ) : skillLoadState === "loading" ? (
                <p className="mt-3 text-sm text-muted">Loading project skills...</p>
              ) : skillLoadState === "error" ? (
                <p className="mt-3 text-sm text-muted">
                  Skills could not be loaded here. Open the project Skills page to check setup.
                </p>
              ) : documentSkills.length === 0 ? (
                <div className="mt-3 text-sm text-muted">
                  <p>No document-reading skills are ready for this file yet.</p>
                  <Link
                    to="/matters/$slug/$tab"
                    params={{ slug, tab: "workflows" }}
                    className="mt-2 inline-block underline underline-offset-4 hover:text-ink"
                  >
                    Open project Skills →
                  </Link>
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  {primaryDocumentSkill && (
                    <button
                      type="button"
                      onClick={() => openDocumentSkill(primaryDocumentSkill)}
                      className="w-full border border-ink bg-paper px-3 py-3 text-left hover:bg-paper-sunken"
                    >
                      <span className="flex items-start justify-between gap-3">
                        <span>
                          <span className="block text-sm font-semibold text-ink">
                            {primaryDocumentSkill.title}
                          </span>
                          <span className="mt-1 block text-xs leading-5 text-muted">
                            {primaryDocumentSkill.description ||
                              "Runs against this document and writes an output to the Record."}
                          </span>
                        </span>
                        <span className="shrink-0 border border-rule bg-paper-sunken px-2 py-1 text-[10px] font-semibold uppercase tracking-track2 text-muted">
                          Recommended
                        </span>
                      </span>
                      <span className="mt-3 block text-xs text-muted">
                        Reads {shortCapabilityList(primaryDocumentSkill.reads)} · writes{" "}
                        {shortCapabilityList(primaryDocumentSkill.writes)}
                      </span>
                      <span className="mt-3 inline-flex border border-ink bg-ink px-3 py-2 text-xs font-semibold text-paper">
                        Run with this file
                      </span>
                    </button>
                  )}
                  {secondaryDocumentSkills.length > 0 && (
                    <details className="border border-rule bg-paper-sunken p-3">
                      <summary className="cursor-pointer text-sm font-medium text-ink">
                        More document skills ({secondaryDocumentSkills.length})
                      </summary>
                      <div className="mt-3 space-y-2">
                        {secondaryDocumentSkills.map((skill) => (
                          <button
                            key={`${skill.moduleId}:${skill.capabilityId}`}
                            type="button"
                            onClick={() => openDocumentSkill(skill)}
                            className="w-full border border-rule bg-paper px-3 py-2 text-left hover:border-ink"
                          >
                            <span className="block text-sm font-semibold text-ink">
                              {skill.title}
                            </span>
                            <span className="mt-1 block text-xs text-muted">
                              Reads {shortCapabilityList(skill.reads)} · writes{" "}
                              {shortCapabilityList(skill.writes)}
                            </span>
                          </button>
                        ))}
                      </div>
                    </details>
                  )}
                  {documentSkills.length > 4 && (
                    <Link
                      to="/matters/$slug/$tab"
                      params={{ slug, tab: "workflows" }}
                      className="text-xs text-muted underline underline-offset-4 hover:text-ink"
                    >
                      See all skills →
                    </Link>
                  )}
                </div>
              )}
            </section>

            <details
              className="border border-rule bg-paper p-4"
              open={Boolean(activeEditResult)}
              data-testid="document-suggested-edits"
            >
              <summary className="cursor-pointer list-none">
                <span className="flex items-start justify-between gap-3">
                  <span>
                    <span className="block text-sm font-semibold text-ink">Suggest edits</span>
                    <span className="mt-1 block text-sm leading-6 text-muted">
                      Ask the model to propose redlines. Nothing changes until you review and save.
                    </span>
                  </span>
                  {activeEditResult && (
                    <span className="shrink-0 border border-ink bg-paper px-2 py-1 text-[10px] font-semibold uppercase tracking-track2 text-ink">
                      Ready
                    </span>
                  )}
                </span>
              </summary>
              {activeEditResult && (
                <div
                  className="mt-4 border border-ink bg-paper-sunken p-3"
                  data-testid="document-redlines-ready"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-track2 text-muted">
                        Redlines ready
                      </p>
                      <p className="mt-1 text-sm font-semibold text-ink">
                        {activeEditResult.pending_edits.length} proposed edit
                        {activeEditResult.pending_edits.length === 1 ? "" : "s"} waiting in the
                        document review area.
                      </p>
                      {activeEditResult.model_notes && (
                        <p className="mt-2 text-xs leading-5 text-muted">
                          {activeEditResult.model_notes}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => openWorkbenchView("redlines")}
                      className="border border-ink bg-ink px-3 py-2 text-xs font-semibold text-paper hover:bg-black"
                    >
                      Review redlines
                    </button>
                  </div>
                </div>
              )}
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
            </details>

            <details
              className="border border-rule bg-paper p-4"
              data-testid="document-state-rail"
              open={hasConcurrentSession}
            >
              <summary className="cursor-pointer list-none">
                <span className="flex items-start justify-between gap-3">
                  <span>
                    <span className="block text-sm font-semibold text-ink">File state</span>
                    <span className="mt-1 block text-sm leading-6 text-muted">
                      Versions, people, redaction, and file details.
                    </span>
                  </span>
                  <span className="shrink-0 border border-rule bg-paper-sunken px-2 py-1 text-[11px] font-semibold uppercase tracking-track2 text-muted">
                    v{latestVersion?.version_number ?? 1}
                  </span>
                </span>
              </summary>
              <dl className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
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
              <div className="mt-4 space-y-3 text-sm">
                <details className="border border-rule bg-paper-sunken p-3" open={hasConcurrentSession}>
                  <summary className="cursor-pointer font-medium text-ink">
                    Editing now · {activeEditSessions.length || 1} active
                  </summary>
                  <div className="mt-3 space-y-2">
                    {activeEditSessions.length > 0 ? (
                      activeEditSessions.map((session) => (
                        <div
                          key={session.id}
                          className="flex items-center justify-between gap-3 border border-rule bg-paper px-3 py-2 text-sm"
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
                    {hasConcurrentSession && (
                      <p className="border border-amber-300 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
                        Another session is active. Agree who saves the next version before applying edits.
                      </p>
                    )}
                  </div>
                </details>

                <details className="border border-rule bg-paper-sunken p-3">
                  <summary className="cursor-pointer font-medium text-ink">
                    Redaction
                  </summary>
                  <p className="mt-3 text-sm text-muted">
                    {anon
                      ? `Redacted body available · ${anon.entity_count} entities via ${anon.engine}, ${anon.anonymised_at.replace("T", " ").slice(0, 16)}.`
                      : "No redacted body yet."}
                  </p>
                  <div className="mt-3">
                    <AnonymiseButton
                      documentId={documentId}
                      onResult={(r) => setAnon(r)}
                    />
                  </div>
                </details>

                <div className="border border-rule bg-paper-sunken p-3">
                  <button
                    type="button"
                    onClick={() => setShowDetails((v) => !v)}
                    aria-expanded={showDetails}
                    data-testid="document-details-toggle"
                    className="flex w-full items-center justify-between text-left font-medium text-ink"
                  >
                    <span>File details</span>
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
                        Original file access is recorded.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </details>

            <section
              ref={notesRef}
              className="border border-rule bg-paper p-4"
              data-testid="document-comments"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-ink">Review notes</h2>
                  <p className="mt-1 text-sm leading-6 text-muted">
                    Mark points for human review. Select text in the editor to anchor a note
                    to the current document body.
                  </p>
                </div>
                <span className="border border-rule bg-paper-sunken px-2 py-1 text-[11px] font-semibold uppercase tracking-track2 text-muted">
                  {openComments.length} open
                </span>
              </div>
              <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                <div className="border border-rule bg-paper-sunken p-2">
                  <dt className="uppercase tracking-track2 text-muted">Open</dt>
                  <dd className="mt-1 text-base font-semibold text-ink">
                    {openComments.length}
                  </dd>
                </div>
                <div className="border border-rule bg-paper-sunken p-2">
                  <dt className="uppercase tracking-track2 text-muted">Anchored</dt>
                  <dd className="mt-1 text-base font-semibold text-ink">
                    {anchoredComments.length}
                  </dd>
                </div>
                <div className="border border-rule bg-paper-sunken p-2">
                  <dt className="uppercase tracking-track2 text-muted">Resolved</dt>
                  <dd className="mt-1 text-base font-semibold text-ink">
                    {resolvedComments.length}
                  </dd>
                </div>
              </dl>
              <div className="mt-4 border border-rule bg-paper-sunken p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-ink">Add note</h3>
                    <p className="mt-1 text-xs leading-5 text-muted">
                      {selectedQuote
                        ? "Use the selected passage below, or edit the quote before saving."
                        : "Select text in the document to anchor a note, or save an unanchored note."}
                    </p>
                  </div>
                  {selectedAnchor && (
                    <span className="border border-ink bg-paper px-2 py-1 text-[10px] font-semibold uppercase tracking-track2 text-ink">
                      Anchored
                    </span>
                  )}
                </div>
                <div className="mt-3 space-y-2">
                  {selectedQuote && (
                    <div
                      className="border border-rule bg-paper p-3 text-sm"
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
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setCommentQuote(selectedQuote)}
                          className="border border-rule bg-paper px-3 py-2 text-xs font-medium text-ink hover:border-ink"
                        >
                          Quote this passage
                        </button>
                        {primaryDocumentSkill && (
                          <button
                            type="button"
                            onClick={() => openDocumentSkill(primaryDocumentSkill, true)}
                            className="border border-ink bg-ink px-3 py-2 text-xs font-semibold text-paper hover:bg-black"
                          >
                            Run skill on passage
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                  <label className="grid gap-1 text-xs font-semibold uppercase tracking-track2 text-muted">
                    Quote
                    <textarea
                      value={commentQuote}
                      onChange={(event) => setCommentQuote(event.target.value)}
                      placeholder="Optional quoted passage"
                      rows={2}
                      className="w-full resize-y border border-rule bg-paper px-3 py-2 font-sans text-sm font-normal normal-case tracking-normal text-ink outline-none focus:border-ink"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold uppercase tracking-track2 text-muted">
                    Note
                    <textarea
                      value={commentBody}
                      onChange={(event) => setCommentBody(event.target.value)}
                      placeholder="What should be checked before relying on this document?"
                      rows={3}
                      className="w-full resize-y border border-rule bg-paper px-3 py-2 font-sans text-sm font-normal normal-case tracking-normal text-ink outline-none focus:border-ink"
                    />
                  </label>
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
              </div>
              <div className="mt-4 space-y-3">
                {openComments.length === 0 && resolvedComments.length === 0 && (
                  <p className="text-sm text-muted">No review notes yet.</p>
                )}
                {openComments.length > 0 && (
                  <p className="text-[11px] font-semibold uppercase tracking-track2 text-muted">
                    Open notes
                  </p>
                )}
                {openComments.map((comment) => (
                  <article
                    key={comment.id}
                    className="border border-rule bg-paper p-3 text-sm"
                  >
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <span className="border border-rule bg-paper-sunken px-2 py-1 text-[10px] font-semibold uppercase tracking-track2 text-muted">
                        Open note
                      </span>
                      {comment.anchor_start !== null && comment.anchor_end !== null && (
                        <span className="border border-ink bg-paper px-2 py-1 text-[10px] font-semibold uppercase tracking-track2 text-ink">
                          Anchored
                        </span>
                      )}
                    </div>
                    {comment.quote_text && (
                      <div className="mb-2 border-l-2 border-rule pl-3 text-muted">
                        <blockquote>{comment.quote_text}</blockquote>
                        <button
                          type="button"
                          onClick={() => jumpToCommentQuote(comment.quote_text ?? "")}
                          className="mt-2 text-xs font-medium text-ink underline underline-offset-4 hover:text-muted"
                        >
                          Find in document
                        </button>
                      </div>
                    )}
                    {editingCommentId === comment.id ? (
                      <div className="space-y-2">
                        <label className="grid gap-1 text-xs font-semibold uppercase tracking-track2 text-muted">
                          Edit note
                          <textarea
                            value={editingCommentBody}
                            onChange={(event) => setEditingCommentBody(event.target.value)}
                            rows={3}
                            className="w-full resize-y border border-rule bg-paper px-3 py-2 font-sans text-sm font-normal normal-case tracking-normal text-ink outline-none focus:border-ink"
                          />
                        </label>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={commentBusy}
                            onClick={() => submitCommentEdit(comment.id)}
                            className="border border-ink bg-ink px-3 py-2 text-xs font-semibold text-paper hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Save changes
                          </button>
                          <button
                            type="button"
                            disabled={commentBusy}
                            onClick={cancelEditingComment}
                            className="border border-rule px-3 py-2 text-xs font-semibold text-muted hover:border-ink hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="leading-6 text-ink">{comment.body}</p>
                    )}
                    <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted">
                      <span>{comment.created_at.replace("T", " ").slice(0, 16)}</span>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          disabled={commentBusy}
                          onClick={() => startEditingComment(comment)}
                          className="underline underline-offset-4 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          disabled={commentBusy}
                          onClick={() => resolveComment(comment.id)}
                          className="underline underline-offset-4 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Resolve
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
                {resolvedComments.length > 0 && (
                  <details className="border border-rule bg-paper-sunken p-3">
                    <summary className="cursor-pointer text-sm font-medium text-muted">
                      Resolved notes ({resolvedComments.length})
                    </summary>
                    <div className="mt-3 space-y-2">
                      {resolvedComments.map((comment) => (
                        <article
                          key={comment.id}
                          className="border border-rule bg-paper p-3 text-sm"
                        >
                          {comment.quote_text && (
                            <blockquote className="mb-2 border-l-2 border-rule pl-3 text-muted">
                              {comment.quote_text}
                            </blockquote>
                          )}
                          <p className="leading-6 text-muted">{comment.body}</p>
                          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                            <span>
                              resolved{" "}
                              {comment.resolved_at
                                ? comment.resolved_at.replace("T", " ").slice(0, 16)
                                : "without timestamp"}
                            </span>
                            {comment.quote_text && (
                              <button
                                type="button"
                                onClick={() => jumpToCommentQuote(comment.quote_text ?? "")}
                                className="font-medium text-ink underline underline-offset-4 hover:text-muted"
                              >
                                Find in document
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={commentBusy}
                              onClick={() => reopenComment(comment.id)}
                              className="font-medium text-ink underline underline-offset-4 hover:text-muted disabled:cursor-not-allowed disabled:text-muted"
                            >
                              Reopen
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            </section>

          </aside>
        </div>
      </div>
    </div>
  );
}
