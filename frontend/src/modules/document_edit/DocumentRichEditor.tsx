import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { type Content } from "@tiptap/core";

import {
  commitDocumentWorkingDraft,
  ConflictError,
  documentVersionDocxUrl,
  fetchDocumentOriginalBlob,
  getDocumentWorkingDraft,
  saveDocumentWorkingDraft,
  uploadDocumentAsset,
  type DocumentVersionRead,
  type DocumentWorkingDraftRead,
} from "../../lib/api";
import { buildVersionDiff, buildVersionDiffSummary } from "./VersionDiff";
import {
  clearDocumentLocalDraft,
  documentOutlineFromJson,
  editorJsonToPlainText,
  findNormalizedRange,
  isEditableWordDocument,
  readDocumentLocalDraft,
  textToEditorHtml,
  writeDocumentLocalDraft,
  type DocumentLocalDraft,
  type TiptapNode,
} from "./editorText";

export {
  clearDocumentLocalDraft, documentOutlineFromJson, documentStatsFromText,
  editorJsonToPlainText, findNormalizedRange, findNormalizedRanges,
  isEditableWordDocument, readDocumentLocalDraft, textToEditorHtml,
  writeDocumentLocalDraft,
} from "./editorText";
export type { TiptapNode } from "./editorText";

import {
  trackChangesDecorationsExtension,
  type DocumentProposedEdit,
  type TrackChangeHandlers,
} from "./trackedChanges";

export { locateProposedEditInDoc } from "./trackedChanges";
export type { DocumentProposedEdit, ProposedEditLocation } from "./trackedChanges";

import { findDecorationsExtension } from "./findDecorations";
import {
  reviewNoteDecorationsExtension,
  type DocumentNoteHighlight,
} from "./reviewNotes";

export type { DocumentNoteHighlight } from "./reviewNotes";

import {
  documentEditorExtensions,
  documentEditorProps,
} from "./editorExtensions";
import {
  useClipboardActions,
  useFindInDocument,
  useTrackedChangeResolution,
} from "./editorHooks";
import {
  CommandBarRow,
  editorStatusLabelFor,
  FormatToolbar,
} from "./editorChrome";
import {
  DraftNotices,
  EditorSideRail,
  FindPanel,
  RedlinesPanel,
  ReviewMapPanel,
  SelectionBubbleMenu,
  SelectionRibbon,
  WorkingDiffPanel,
} from "./EditorPanels";

type DocumentCanvasMode = "page" | "wide";
type OriginalImportState = "idle" | "loading" | "ready" | "error";
const SHARED_DRAFT_POLL_MS = 15_000;

export function DocumentRichEditor({
  documentId,
  filename,
  initialText,
  initialJson,
  latestVersionNumber,
  latestVersionId,
  originalMimeType,
  sourceLabel,
  sourceHighlight,
  noteHighlights = [],
  proposedEdits = [],
  onResolveProposedEdit,
  selectedQuote,
  selectedQuoteAnchored,
  onCreateNoteFromSelection,
  onRunSkillFromSelection,
  onSaved,
  onDirtyChange,
}: {
  documentId: string;
  filename: string;
  initialText: string;
  initialJson?: TiptapNode | null;
  latestVersionNumber?: number;
  latestVersionId?: string | null;
  originalMimeType?: string | null;
  sourceLabel: string;
  sourceHighlight?: string | null;
  noteHighlights?: DocumentNoteHighlight[];
  proposedEdits?: DocumentProposedEdit[];
  onResolveProposedEdit?: (
    editId: string,
    action: "accept" | "reject",
  ) => Promise<void>;
  selectedQuote?: string;
  selectedQuoteAnchored?: boolean;
  onCreateNoteFromSelection?: () => void;
  onRunSkillFromSelection?: () => void;
  onSaved: (version: DocumentVersionRead) => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [downloadingDocx, setDownloadingDocx] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [formatOpen, setFormatOpen] = useState(false);
  const [localDraft, setLocalDraft] = useState<DocumentLocalDraft | null>(null);
  const [serverDraft, setServerDraft] = useState<DocumentWorkingDraftRead | null>(null);
  const [draftLoadState, setDraftLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [draftSaveState, setDraftSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [draftConflict, setDraftConflict] = useState<string | null>(null);
  const [remoteDraftNotice, setRemoteDraftNotice] = useState<string | null>(null);
  const [originalImportState, setOriginalImportState] = useState<OriginalImportState>("idle");
  const [draftBaselineText, setDraftBaselineText] = useState(initialText);
  const [canvasMode, setCanvasMode] = useState<DocumentCanvasMode>("page");
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const draftSaveTimerRef = useRef<number | null>(null);
  const dirtyRef = useRef(false);
  const draftBaseVersionIdRef = useRef<string | null>(latestVersionId ?? null);
  const draftVersionCounterRef = useRef<number>(0);
  const draftClientIdRef = useRef<string>("");
  if (!draftClientIdRef.current) {
    const suffix =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    draftClientIdRef.current = `document-editor-${suffix}`;
  }
  const content = useMemo<Content>(
    () => initialJson ?? textToEditorHtml(initialText, sourceHighlight),
    [initialJson, initialText, sourceHighlight],
  );
  const noteHighlightsKey = useMemo(
    () =>
      noteHighlights
        .map((note) => `${note.id}:${note.status}:${note.quote}`)
        .join("|"),
    [noteHighlights],
  );
  const reviewNoteExtension = useMemo(
    () => reviewNoteDecorationsExtension(noteHighlights),
    // The key keeps the editor extension stable unless the actual anchor inputs change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [noteHighlightsKey],
  );
  const findExtension = useMemo(() => findDecorationsExtension(), []);
  const trackHandlersRef = useRef<TrackChangeHandlers | null>(null);
  const trackChangesExtension = useMemo(
    () => trackChangesDecorationsExtension(trackHandlersRef),
    [],
  );
  const proposedEditsKey = useMemo(
    () => proposedEdits.map((edit) => edit.id).join("|"),
    [proposedEdits],
  );
  async function persistWorkingDraft(
    editorJson: TiptapNode,
    plainText: string,
  ): Promise<DocumentWorkingDraftRead> {
    setDraftSaveState("saving");
    const draft = await saveDocumentWorkingDraft(documentId, {
      plain_text: plainText,
      editor_json: editorJson as Record<string, unknown>,
      base_version_id: draftBaseVersionIdRef.current,
      client_id: draftClientIdRef.current,
      expected_version_counter: draftVersionCounterRef.current,
    });
    setServerDraft(draft);
    draftBaseVersionIdRef.current = draft.base_version_id;
    draftVersionCounterRef.current = draft.version_counter;
    setDraftConflict(null);
    setRemoteDraftNotice(null);
    setDraftSaveState("saved");
    return draft;
  }

  async function importOriginalWordDraft(): Promise<boolean> {
    if (!editor || !isEditableWordDocument(filename, originalMimeType)) return false;
    setOriginalImportState("loading");
    try {
      const blob = await fetchDocumentOriginalBlob(documentId);
      const arrayBuffer = await blob.arrayBuffer();
      const mammoth = await import("mammoth");
      const result = await mammoth.convertToHtml({ arrayBuffer });
      const html = result.value.trim();
      if (!html) throw new Error("Word import returned no editable content.");
      editor.commands.setContent(html, { emitUpdate: false });
      const editorJson = editor.getJSON() as TiptapNode;
      const importedText = editorJsonToPlainText(editorJson);
      setDraftBaselineText(initialText);
      await persistWorkingDraft(editorJson, importedText);
      setDirty(true);
      onDirtyChange?.(true);
      setSavedMessage("Word structure imported. Save it to create an editable version.");
      setOriginalImportState("ready");
      return true;
    } catch {
      setOriginalImportState("error");
      return false;
    }
  }

  function scheduleWorkingDraftSave(editorJson: TiptapNode, plainText: string) {
    if (draftSaveTimerRef.current !== null) {
      window.clearTimeout(draftSaveTimerRef.current);
    }
    setDraftSaveState("saving");
    draftSaveTimerRef.current = window.setTimeout(() => {
      draftSaveTimerRef.current = null;
      persistWorkingDraft(editorJson, plainText).catch((err) => {
        setDraftSaveState("error");
        setDraftConflict(
          err instanceof ConflictError
            ? err.message
            : null,
        );
      });
    }, 900);
  }

  const editor = useEditor(
    {
      extensions: documentEditorExtensions({
        findExtension,
        reviewNoteExtension,
        trackChangesExtension,
      }),
      content,
      editorProps: documentEditorProps((file) =>
        void uploadAndInsertEditorImage(file),
      ),
      onUpdate: ({ editor: activeEditor }) => {
        const json = activeEditor.getJSON() as TiptapNode;
        const plainText = editorJsonToPlainText(json);
        writeDocumentLocalDraft({
          documentId,
          filename,
          savedAt: new Date().toISOString(),
          plainText,
          json,
        });
        scheduleWorkingDraftSave(json, plainText);
        setDirty(true);
        dirtyRef.current = true;
        onDirtyChange?.(true);
        setSavedMessage(null);
      },
      immediatelyRender: false,
    },
    [documentId, findExtension, reviewNoteExtension],
  );

  async function loadSharedDraftFromServer({
    allowWordImport = true,
    reloadedMessage = null,
    isCancelled = () => false,
  }: {
    allowWordImport?: boolean;
    reloadedMessage?: string | null;
    isCancelled?: () => boolean;
  } = {}) {
    if (!editor) return;
    setDraftLoadState("loading");
    const draft = await getDocumentWorkingDraft(documentId);
    if (isCancelled()) return;
    setServerDraft(draft);
    draftBaseVersionIdRef.current = draft.base_version_id ?? latestVersionId ?? null;
    draftVersionCounterRef.current = draft.version_counter;
    const shouldImportWord =
      allowWordImport &&
      draft.version_counter === 0 &&
      !draft.editor_json &&
      isEditableWordDocument(filename, originalMimeType);
    if (shouldImportWord) {
      const imported = await importOriginalWordDraft();
      if (isCancelled()) return;
      if (imported) {
        setDraftLoadState("ready");
        return;
      }
    }
    const draftContent = draft.editor_json ?? textToEditorHtml(draft.plain_text, sourceHighlight);
    editor.commands.setContent(draftContent as Content, { emitUpdate: false });
    const hasMutableDraft = draft.version_counter > 0;
    setDraftBaselineText(initialText);
    setDirty(hasMutableDraft);
    dirtyRef.current = hasMutableDraft;
    onDirtyChange?.(hasMutableDraft);
    setDraftLoadState("ready");
    setDraftSaveState(hasMutableDraft ? "saved" : "idle");
    setDraftConflict(null);
    setRemoteDraftNotice(null);
    setError(null);
    setSavedMessage(reloadedMessage ?? (hasMutableDraft ? "Shared draft loaded" : null));
  }

  useEffect(() => {
    if (!editor) return;
    editor.commands.setContent(content, { emitUpdate: false });
    setDirty(false);
    dirtyRef.current = false;
    onDirtyChange?.(false);
    setError(null);
    setSavedMessage(null);
    setLocalDraft(readDocumentLocalDraft(documentId));
    setServerDraft(null);
    setDraftLoadState("loading");
    setDraftSaveState("idle");
    setDraftConflict(null);
    setRemoteDraftNotice(null);
    setOriginalImportState("idle");
    setDraftBaselineText(initialText);
    draftBaseVersionIdRef.current = latestVersionId ?? null;
    draftVersionCounterRef.current = 0;
    if (draftSaveTimerRef.current !== null) {
      window.clearTimeout(draftSaveTimerRef.current);
      draftSaveTimerRef.current = null;
    }
  }, [content, documentId, editor, initialText, latestVersionId, onDirtyChange]);

  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  useEffect(() => {
    if (!editor) return;
    let cancelled = false;
    loadSharedDraftFromServer({ isCancelled: () => cancelled })
      .then(() => {
        if (cancelled) return;
      })
      .catch(() => {
        if (cancelled) return;
        setDraftLoadState("error");
        setDraftSaveState("error");
        setDraftConflict(null);
      });
    return () => {
      cancelled = true;
    };
    // loadSharedDraftFromServer captures editor-bound state and is intentionally scoped here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId, editor, filename, initialText, latestVersionId, onDirtyChange, originalMimeType, sourceHighlight]);

  useEffect(() => {
    if (!editor) return;
    const interval = window.setInterval(() => {
      getDocumentWorkingDraft(documentId)
        .then((draft) => {
          if (draft.version_counter <= draftVersionCounterRef.current) return;
          if (draft.client_id && draft.client_id === draftClientIdRef.current) return;
          if (dirtyRef.current) {
            setRemoteDraftNotice(
              `A newer shared draft is available (r${draft.version_counter}). Reload it when you are ready.`,
            );
            return;
          }
          const draftContent =
            draft.editor_json ?? textToEditorHtml(draft.plain_text, sourceHighlight);
          editor.commands.setContent(draftContent as Content, { emitUpdate: false });
          setServerDraft(draft);
          draftBaseVersionIdRef.current = draft.base_version_id ?? latestVersionId ?? null;
          draftVersionCounterRef.current = draft.version_counter;
          setDraftBaselineText(initialText);
          setDirty(draft.version_counter > 0);
          dirtyRef.current = draft.version_counter > 0;
          onDirtyChange?.(draft.version_counter > 0);
          setDraftLoadState("ready");
          setDraftSaveState(draft.version_counter > 0 ? "saved" : "idle");
          setDraftConflict(null);
          setRemoteDraftNotice(null);
          setError(null);
          setSavedMessage("Shared draft updated");
        })
        .catch(() => undefined);
    }, SHARED_DRAFT_POLL_MS);
    return () => window.clearInterval(interval);
  }, [documentId, editor, initialText, latestVersionId, onDirtyChange, sourceHighlight]);

  useEffect(() => {
    return () => {
      if (draftSaveTimerRef.current !== null) {
        window.clearTimeout(draftSaveTimerRef.current);
      }
    };
  }, []);

  const plainText = editor ? editorJsonToPlainText(editor.getJSON() as TiptapNode) : "";
  const currentEditorJson = editor ? editor.getJSON() as TiptapNode : null;
  const canSave = Boolean(editor && dirty && plainText.trim() && !saving && !downloadingDocx);
  const canDownloadDocx = Boolean(
    editor &&
      plainText.trim() &&
      !saving &&
      !downloadingDocx &&
      (dirty || latestVersionId),
  );
  const {
    findQuery,
    setFindQuery,
    findOpen,
    setFindOpen,
    findInputRef,
    findMatches,
    findPreview,
    findPositionLabel,
    moveFind,
    handleFindKeyDown,
  } = useFindInDocument({ editor, plainText, canSave, save });
  const {
    redlinesVisible,
    setRedlinesVisible,
    trackBusy,
    trackNotice,
    anchoredProposedEditCount,
    resolveAllProposedEdits,
  } = useTrackedChangeResolution({
    editor,
    proposedEdits,
    proposedEditsKey,
    plainText,
    onResolveProposedEdit,
    setError,
    trackHandlersRef,
  });
  const {
    copiedMessage,
    copyWorkingText,
    copySelectedQuote,
    copyEditorSelection,
    highlightEditorSelection,
    setEditorLink,
    insertEditorImageUrl,
    downloadWorkingText,
  } = useClipboardActions({ editor, plainText, selectedQuote, filename });
  const outlineItems = useMemo(
    () => documentOutlineFromJson(currentEditorJson, plainText),
    [currentEditorJson, plainText],
  );
  const sourceRange = useMemo(
    () => findNormalizedRange(plainText, sourceHighlight),
    [plainText, sourceHighlight],
  );
  const noteAnchorSummaries = useMemo(
    () =>
      noteHighlights.map((note) => ({
        ...note,
        located: Boolean(findNormalizedRange(plainText, note.quote)),
      })),
    [noteHighlights, plainText],
  );
  const locatedNoteCount = noteAnchorSummaries.filter((note) => note.located).length;
  const workingDiffParts = useMemo(
    () => buildVersionDiff(draftBaselineText, plainText),
    [draftBaselineText, plainText],
  );
  const workingDiffSummary = useMemo(
    () => buildVersionDiffSummary(workingDiffParts),
    [workingDiffParts],
  );
  const showWorkingDiff = dirty && workingDiffSummary.changed;
  const editorStatusLabel = editorStatusLabelFor({
    dirty,
    draftLoadState,
    draftSaveState,
    serverDraftCounter: serverDraft ? serverDraft.version_counter : null,
    savedMessage,
    latestVersionNumber,
  });
  const canvasMaxWidth = canvasMode === "page" ? "max-w-[820px]" : "max-w-[1040px]";

  async function save(): Promise<DocumentVersionRead | null> {
    if (!editor || !canSave) return null;
    setSaving(true);
    setError(null);
    try {
      const editorJson = editor.getJSON() as TiptapNode;
      if (draftSaveTimerRef.current !== null) {
        window.clearTimeout(draftSaveTimerRef.current);
        draftSaveTimerRef.current = null;
      }
      await persistWorkingDraft(editorJson, plainText);
      const version = await commitDocumentWorkingDraft(
        documentId,
        `Edited ${filename} in Legalise document editor`,
        true,
        draftVersionCounterRef.current,
      );
      setDirty(false);
      dirtyRef.current = false;
      onDirtyChange?.(false);
      setSavedMessage(`Saved v${version.version_number}`);
      setServerDraft(null);
      setDraftBaselineText(plainText);
      draftBaseVersionIdRef.current = version.id;
      draftVersionCounterRef.current = 0;
      setDraftSaveState("idle");
      setDraftConflict(null);
      setRemoteDraftNotice(null);
      clearDocumentLocalDraft(documentId);
      setLocalDraft(null);
      onSaved(version);
      return version;
    } catch (err) {
      if (err instanceof ConflictError) {
        const message =
          err.message ||
          "The shared draft changed in another editor. Reload this document before saving again.";
        setDraftSaveState("error");
        setDraftConflict(message);
        setError(message);
        return null;
      }
      setError(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function saveAndDownloadDocx() {
    if (!editor || !canDownloadDocx) return;
    setDownloadingDocx(true);
    setError(null);
    try {
      let versionId = latestVersionId ?? null;
      if (dirty) {
        const saved = await save();
        versionId = saved?.id ?? null;
      }
      if (!versionId) {
        throw new Error("Save this document before downloading a Word copy.");
      }
      window.location.assign(documentVersionDocxUrl(documentId, versionId));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDownloadingDocx(false);
    }
  }

  function reset() {
    editor?.commands.setContent(content, { emitUpdate: false });
    setDirty(false);
    dirtyRef.current = false;
    onDirtyChange?.(false);
    setError(null);
    setSavedMessage(null);
    setDraftConflict(null);
    setRemoteDraftNotice(null);
    setDraftBaselineText(initialText);
    clearDocumentLocalDraft(documentId);
    setLocalDraft(null);
  }

  function restoreLocalDraft() {
    if (!editor || !localDraft) return;
    editor.commands.setContent(localDraft.json, { emitUpdate: false });
    setDraftBaselineText(initialText);
    setDirty(true);
    dirtyRef.current = true;
    onDirtyChange?.(true);
    scheduleWorkingDraftSave(localDraft.json, localDraft.plainText);
    setSavedMessage("Local draft restored. Save it to create a document version.");
    setLocalDraft(null);
  }

  function discardLocalDraft() {
    clearDocumentLocalDraft(documentId);
    setLocalDraft(null);
  }

  async function uploadAndInsertEditorImage(file: File) {
    if (!editor) return;
    setUploadingImage(true);
    setError(null);
    try {
      const uploaded = await uploadDocumentAsset(documentId, file);
      editor.chain().focus().setImage({
        src: uploaded.url,
        alt: uploaded.filename,
      }).run();
      setSavedMessage("Image inserted into the working copy.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload image.");
    } finally {
      setUploadingImage(false);
    }
  }

  async function handleEditorImageUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!file) return;
    await uploadAndInsertEditorImage(file);
  }

  return (
    <section className="min-h-[760px] rounded-card border border-rule bg-paper" data-testid="document-editor">
      <div
        className="sticky top-0 z-10 border-b border-rule bg-paper/95 backdrop-blur-sm"
        data-testid="document-editor-command-bar"
      >
        <CommandBarRow
          canvasMode={canvasMode}
          onSetCanvasMode={setCanvasMode}
          formatOpen={formatOpen}
          onToggleFormat={() => setFormatOpen((current) => !current)}
          findOpen={findOpen}
          onToggleFind={() => {
            setFindOpen((current) => {
              const next = !current;
              if (next) {
                requestAnimationFrame(() => findInputRef.current?.focus());
              }
              return next;
            });
          }}
          proposedEditCount={proposedEdits.length}
          redlinesVisible={redlinesVisible}
          onToggleRedlines={() => setRedlinesVisible((current) => !current)}
          draftSaveError={draftSaveState === "error"}
          dirty={dirty}
          editorStatusLabel={editorStatusLabel}
          sourceLabel={sourceLabel}
          onSave={save}
          canSave={canSave}
          saving={saving}
          onSaveAndDownloadDocx={saveAndDownloadDocx}
          canDownloadDocx={canDownloadDocx}
          downloadingDocx={downloadingDocx}
          onCopyWorkingText={copyWorkingText}
          onDownloadWorkingText={downloadWorkingText}
          plainText={plainText}
          onReset={reset}
        />
        {formatOpen && (
          <FormatToolbar
            editor={editor}
            imageInputRef={imageInputRef}
            uploadingImage={uploadingImage}
            onImageUpload={handleEditorImageUpload}
            onSetLink={setEditorLink}
            onInsertImageUrl={insertEditorImageUrl}
          />
        )}
        {(findOpen || findQuery.trim()) && (
          <FindPanel
            documentId={documentId}
            findInputRef={findInputRef}
            findQuery={findQuery}
            setFindQuery={setFindQuery}
            onFindKeyDown={handleFindKeyDown}
            matchCount={findMatches.length}
            moveFind={moveFind}
            findPositionLabel={findPositionLabel}
            findPreview={findPreview}
          />
        )}
        {redlinesVisible && proposedEdits.length > 0 && (
          <RedlinesPanel
            proposedEditCount={proposedEdits.length}
            anchoredProposedEditCount={anchoredProposedEditCount}
            trackNotice={trackNotice}
            trackBusy={trackBusy}
            canResolve={Boolean(onResolveProposedEdit)}
            onResolveAll={resolveAllProposedEdits}
          />
        )}
      </div>

      {copiedMessage && (
        <p
          className="border-b border-rule bg-paper-sunken px-5 py-2 text-xs text-muted"
          data-testid="document-editor-copy-status"
        >
          {copiedMessage}
        </p>
      )}
      {selectedQuote && (
        <SelectionRibbon
          selectedQuote={selectedQuote}
          onCopySelectedQuote={copySelectedQuote}
          onFindInDocument={() => setFindQuery(selectedQuote)}
          onCreateNoteFromSelection={onCreateNoteFromSelection}
          onRunSkillFromSelection={onRunSkillFromSelection}
        />
      )}
      <DraftNotices
        draftSaveError={draftSaveState === "error"}
        draftConflict={draftConflict}
        onReloadAfterError={() =>
          loadSharedDraftFromServer({
            allowWordImport: false,
            reloadedMessage: "Shared draft reloaded",
          }).catch((err) => {
            setDraftSaveState("error");
            setError(err instanceof Error ? err.message : String(err));
          })
        }
        remoteDraftNotice={remoteDraftNotice}
        onReloadAfterNotice={() =>
          loadSharedDraftFromServer({
            allowWordImport: false,
            reloadedMessage: "Shared draft reloaded",
          }).catch((err) => {
            setRemoteDraftNotice(null);
            setError(err instanceof Error ? err.message : String(err));
          })
        }
        originalImportState={originalImportState}
        localDraft={localDraft}
        onRestoreLocalDraft={restoreLocalDraft}
        onDiscardLocalDraft={discardLocalDraft}
      />
      {showWorkingDiff && (
        <WorkingDiffPanel
          workingDiffParts={workingDiffParts}
          insertedChars={workingDiffSummary.insertedChars}
          deletedChars={workingDiffSummary.deletedChars}
        />
      )}
      {error && (
        <p className="border-b border-red-800 bg-red-50 px-5 py-3 text-sm text-red-900">
          {error}
        </p>
      )}
      {noteAnchorSummaries.length > 0 && (
        <ReviewMapPanel
          noteAnchorSummaries={noteAnchorSummaries}
          locatedNoteCount={locatedNoteCount}
          onJumpToNote={setFindQuery}
        />
      )}
      <div className="grid min-h-[620px] lg:grid-cols-[240px_minmax(0,1fr)]">
        <EditorSideRail
          sourceHighlight={sourceHighlight}
          sourceLocated={Boolean(sourceRange)}
          selectedQuote={selectedQuote}
          selectedQuoteAnchored={selectedQuoteAnchored}
          onCopySelectedQuote={copySelectedQuote}
          onCreateNoteFromSelection={onCreateNoteFromSelection}
          noteHighlights={noteHighlights}
          outlineItems={outlineItems}
          onFind={setFindQuery}
        />
        <div
          className="bg-[linear-gradient(180deg,#f7f7f4_0%,#efefea_100%)] px-4 py-8 sm:px-8 sm:py-10"
          data-testid="document-editor-canvas"
        >
          <div className={`mx-auto ${canvasMaxWidth}`}>
            {editor && (
              <SelectionBubbleMenu
                editor={editor}
                onCopyEditorSelection={copyEditorSelection}
                onHighlightSelection={highlightEditorSelection}
                onSetLink={setEditorLink}
                onCreateNoteFromSelection={onCreateNoteFromSelection}
                onRunSkillFromSelection={onRunSkillFromSelection}
              />
            )}
            <EditorContent editor={editor} />
          </div>
        </div>
      </div>
    </section>
  );
}
