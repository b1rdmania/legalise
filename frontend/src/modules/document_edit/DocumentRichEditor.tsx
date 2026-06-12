import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
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
  documentStatsFromText,
  editorJsonToPlainText,
  findNormalizedRange,
  findNormalizedRanges,
  firstImageFile,
  isEditableWordDocument,
  readDocumentLocalDraft,
  selectedEditorText,
  textToEditorHtml,
  writeDocumentLocalDraft,
  type DocumentLocalDraft,
  type TiptapNode,
} from "./editorText";

export {
  clearDocumentLocalDraft,
  documentOutlineFromJson,
  documentStatsFromText,
  editorJsonToPlainText,
  findNormalizedRange,
  findNormalizedRanges,
  isEditableWordDocument,
  readDocumentLocalDraft,
  textToEditorHtml,
  writeDocumentLocalDraft,
} from "./editorText";
export type { TiptapNode } from "./editorText";

import {
  applyProposedEditToEditor,
  locateProposedEditInDoc,
  TRACK_CHANGES_PLUGIN_KEY,
  trackChangesDecorationsExtension,
  type DocumentProposedEdit,
  type TrackChangeHandlers,
  type TrackChangesPluginState,
} from "./trackedChanges";

export { locateProposedEditInDoc } from "./trackedChanges";
export type { DocumentProposedEdit, ProposedEditLocation } from "./trackedChanges";

import {
  FIND_DECORATIONS_PLUGIN_KEY,
  findDecorationsExtension,
  type FindDecorationState,
} from "./findDecorations";
import {
  reviewNoteDecorationsExtension,
  type DocumentNoteHighlight,
} from "./reviewNotes";

export type { DocumentNoteHighlight } from "./reviewNotes";

import { documentEditorExtensions } from "./editorExtensions";
import { FormatToolbar, ViewModeButton } from "./editorChrome";
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
  const [copiedMessage, setCopiedMessage] = useState<string | null>(null);
  const [findQuery, setFindQuery] = useState("");
  const [findOpen, setFindOpen] = useState(false);
  const [formatOpen, setFormatOpen] = useState(false);
  const [activeFindIndex, setActiveFindIndex] = useState(0);
  const [localDraft, setLocalDraft] = useState<DocumentLocalDraft | null>(null);
  const [serverDraft, setServerDraft] = useState<DocumentWorkingDraftRead | null>(null);
  const [draftLoadState, setDraftLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [draftSaveState, setDraftSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [draftConflict, setDraftConflict] = useState<string | null>(null);
  const [remoteDraftNotice, setRemoteDraftNotice] = useState<string | null>(null);
  const [originalImportState, setOriginalImportState] = useState<OriginalImportState>("idle");
  const [draftBaselineText, setDraftBaselineText] = useState(initialText);
  const [canvasMode, setCanvasMode] = useState<DocumentCanvasMode>("page");
  const [redlinesVisible, setRedlinesVisible] = useState(true);
  const [trackBusy, setTrackBusy] = useState(false);
  const [trackNotice, setTrackNotice] = useState<string | null>(null);
  const findInputRef = useRef<HTMLInputElement | null>(null);
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
      editorProps: {
        attributes: {
          class:
            "legalise-document-editor min-h-[760px] border border-rule bg-paper px-9 py-12 text-[16px] leading-8 outline-none shadow-[0_18px_50px_rgba(0,0,0,0.08)] sm:px-14",
        },
        handlePaste: (_view, event) => {
          const file = firstImageFile(event.clipboardData?.files);
          if (!file) return false;
          void uploadAndInsertEditorImage(file);
          return true;
        },
        handleDrop: (_view, event) => {
          const file = firstImageFile(event.dataTransfer?.files);
          if (!file) return false;
          event.preventDefault();
          void uploadAndInsertEditorImage(file);
          return true;
        },
      },
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
  const findMatches = useMemo(
    () => findNormalizedRanges(plainText, findQuery),
    [plainText, findQuery],
  );
  const activeFindMatch = findMatches[activeFindIndex] ?? findMatches[0] ?? null;
  const findPreview =
    activeFindMatch && plainText
      ? plainText
          .slice(
            Math.max(0, activeFindMatch.start - 70),
            Math.min(plainText.length, activeFindMatch.end + 90),
          )
          .replace(/\s+/g, " ")
          .trim()
      : null;
  const findPositionLabel =
    findMatches.length > 0
      ? `${activeFindIndex + 1} / ${findMatches.length}`
      : null;
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
  const sharedDraftLabel =
    draftLoadState === "loading"
      ? "Loading shared draft"
      : draftSaveState === "saving"
        ? "Saving shared draft"
        : draftSaveState === "saved"
          ? `Shared draft saved${serverDraft ? ` · r${serverDraft.version_counter}` : ""}`
          : draftSaveState === "error"
            ? "Local fallback active"
            : "Shared draft ready";
  const editorStatusLabel = dirty
    ? sharedDraftLabel
    : savedMessage
      ? savedMessage
      : latestVersionNumber
        ? `Saved v${latestVersionNumber}`
        : "Extracted text";
  const canvasMaxWidth = canvasMode === "page" ? "max-w-[820px]" : "max-w-[1040px]";

  useEffect(() => {
    setActiveFindIndex(0);
  }, [findQuery]);

  useEffect(() => {
    if (activeFindIndex >= findMatches.length) setActiveFindIndex(0);
  }, [activeFindIndex, findMatches.length]);

  useEffect(() => {
    if (!editor) return;
    const activeIndex =
      findMatches.length === 0
        ? 0
        : Math.min(activeFindIndex, Math.max(0, findMatches.length - 1));
    editor.view.dispatch(
      editor.state.tr.setMeta(FIND_DECORATIONS_PLUGIN_KEY, {
        query: findQuery,
        activeIndex,
      } satisfies FindDecorationState),
    );
    if (findQuery.trim().length >= 3 && findMatches.length > 0) {
      window.requestAnimationFrame(() => {
        if (editor.isDestroyed) return;
        editor.view.dom
          .querySelector('[data-find-match="active"]')
          ?.scrollIntoView({ block: "center", inline: "nearest" });
      });
    }
  }, [activeFindIndex, editor, findMatches.length, findQuery]);

  // A fresh batch of proposed edits always starts visible.
  useEffect(() => {
    setRedlinesVisible(true);
  }, [proposedEditsKey]);

  useEffect(() => {
    if (!editor) return;
    editor.view.dispatch(
      editor.state.tr.setMeta(TRACK_CHANGES_PLUGIN_KEY, {
        edits: proposedEdits,
        visible: redlinesVisible,
      } satisfies TrackChangesPluginState),
    );
    // proposedEditsKey stands in for the array identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, proposedEditsKey, redlinesVisible]);

  const anchoredProposedEditCount = useMemo(() => {
    if (!editor || proposedEdits.length === 0) return 0;
    return proposedEdits.filter((edit) =>
      locateProposedEditInDoc(editor.state.doc, edit),
    ).length;
    // plainText tracks document changes; proposedEditsKey tracks the list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, proposedEditsKey, plainText]);

  async function resolveProposedEditInline(
    edit: DocumentProposedEdit,
    action: "accept" | "reject",
  ) {
    if (!editor || !onResolveProposedEdit || trackBusy) return;
    setTrackBusy(true);
    setError(null);
    try {
      await onResolveProposedEdit(edit.id, action);
      if (action === "accept") {
        const applied = applyProposedEditToEditor(editor, edit);
        if (!applied) {
          setTrackNotice(
            "Accepted on the record. The text could not be applied in place " +
              "here — it lands when the final redline is decided.",
          );
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setTrackBusy(false);
    }
  }

  // "Accept all" / "Reject all" still resolve one edit at a time so each
  // decision lands as its own audit row — and they only touch edits the
  // user can SEE inline (anchored). Unanchored edits stay pending in the
  // suggested-edits rail; one click never decides an unseen change. The
  // anchor is re-checked per iteration because applying one edit can
  // unanchor the next.
  async function resolveAllProposedEdits(action: "accept" | "reject") {
    if (!editor || !onResolveProposedEdit || trackBusy) return;
    setTrackBusy(true);
    setError(null);
    try {
      for (const edit of [...proposedEdits]) {
        if (!locateProposedEditInDoc(editor.state.doc, edit)) continue;
        await onResolveProposedEdit(edit.id, action);
        if (action === "accept") {
          const applied = applyProposedEditToEditor(editor, edit);
          if (!applied) {
            setTrackNotice(
              "Some accepted changes could not be applied in place — they " +
                "land when the final redline is decided.",
            );
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setTrackBusy(false);
    }
  }

  trackHandlersRef.current = {
    resolve: (edit, action) => void resolveProposedEditInline(edit, action),
  };

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

  async function copyWorkingText() {
    if (!plainText.trim()) return;
    await window.navigator.clipboard.writeText(plainText);
    setCopiedMessage("Copied working text");
    window.setTimeout(() => setCopiedMessage(null), 2000);
  }

  async function copySelectedQuote() {
    if (!selectedQuote?.trim()) return;
    await window.navigator.clipboard.writeText(selectedQuote.trim());
    setCopiedMessage("Copied selected passage");
    window.setTimeout(() => setCopiedMessage(null), 2000);
  }

  async function copyEditorSelection() {
    const selection = selectedEditorText(editor);
    if (!selection) return;
    await window.navigator.clipboard.writeText(selection);
    setCopiedMessage("Copied selected passage");
    window.setTimeout(() => setCopiedMessage(null), 2000);
  }

  function highlightEditorSelection() {
    if (!editor || !selectedEditorText(editor)) return;
    editor.chain().focus().toggleHighlight().run();
  }

  function setEditorLink() {
    if (!editor) return;
    const currentHref = typeof editor.getAttributes("link").href === "string"
      ? editor.getAttributes("link").href
      : "";
    const nextHref = window.prompt("Paste link URL. Leave blank to remove the link.", currentHref);
    if (nextHref === null) return;
    const trimmed = nextHref.trim();
    if (!trimmed) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: trimmed }).run();
  }

  function insertEditorImageUrl() {
    if (!editor) return;
    const src = window.prompt("Paste image URL");
    if (src === null) return;
    const trimmed = src.trim();
    if (!trimmed) return;
    const alt = window.prompt("Image description", "")?.trim() ?? "";
    editor.chain().focus().setImage({ src: trimmed, alt }).run();
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

  function downloadWorkingText() {
    const blob = new Blob([plainText], { type: "text/plain;charset=utf-8" });
    const url = window.URL.createObjectURL(blob);
    const anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download = `${filename.replace(/\.[^.]+$/, "") || "document"}-working-copy.txt`;
    window.document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.URL.revokeObjectURL(url);
  }

  const moveFind = (direction: 1 | -1) => {
    if (findMatches.length === 0) return;
    setActiveFindIndex((current) =>
      (current + direction + findMatches.length) % findMatches.length,
    );
  };
  const handleFindKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    moveFind(event.shiftKey ? -1 : 1);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.metaKey && !event.ctrlKey) return;
      const key = event.key.toLowerCase();
      if (key === "f") {
        event.preventDefault();
        setFindOpen(true);
        requestAnimationFrame(() => {
          findInputRef.current?.focus();
          findInputRef.current?.select();
        });
      }
      if (key === "s") {
        event.preventDefault();
        if (canSave) void save();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  return (
    <section className="min-h-[760px] rounded-card border border-rule bg-paper" data-testid="document-editor">
      <div
        className="sticky top-0 z-10 border-b border-rule bg-paper/95 backdrop-blur"
        data-testid="document-editor-command-bar"
      >
        <div className="flex flex-wrap items-center gap-1.5 px-4 py-2.5 text-[13px]">
          <div
            className="flex items-center gap-1 border-r border-rule pr-2"
            aria-label="Document view"
            data-testid="document-editor-view-mode"
          >
            <ViewModeButton active={canvasMode === "page"} onClick={() => setCanvasMode("page")}>
              Page
            </ViewModeButton>
            <ViewModeButton active={canvasMode === "wide"} onClick={() => setCanvasMode("wide")}>
              Wide
            </ViewModeButton>
          </div>
          <button
            type="button"
            onClick={() => setFormatOpen((current) => !current)}
            aria-expanded={formatOpen}
            className="inline-flex h-8 items-center rounded-item border border-rule px-3 text-xs text-muted hover:border-ink hover:text-ink"
          >
            Format
          </button>
          <button
            type="button"
            onClick={() => {
              setFindOpen((current) => {
                const next = !current;
                if (next) {
                  requestAnimationFrame(() => findInputRef.current?.focus());
                }
                return next;
              });
            }}
            aria-expanded={findOpen}
            className="inline-flex h-8 items-center rounded-item border border-rule px-3 text-xs text-muted hover:border-ink hover:text-ink"
          >
            Find
          </button>
          {proposedEdits.length > 0 && (
            <button
              type="button"
              onClick={() => setRedlinesVisible((current) => !current)}
              aria-pressed={redlinesVisible}
              data-testid="document-editor-redlines-toggle"
              className={`inline-flex h-8 items-center rounded-item border px-3 text-xs ${
                redlinesVisible
                  ? "border-ink bg-paper text-ink"
                  : "border-rule bg-paper text-muted hover:border-ink hover:text-ink"
              }`}
            >
              Redlines ({proposedEdits.length})
            </button>
          )}
          <span className="ml-2 inline-flex items-center gap-2 text-xs text-muted">
            <span
              className={`h-2 w-2 rounded-full ${
                draftSaveState === "error"
                  ? "bg-red-700"
                  : dirty
                    ? "bg-amber-500"
                    : "bg-emerald-700"
              }`}
              aria-hidden="true"
            />
            {editorStatusLabel}
          </span>
          {sourceLabel?.startsWith("Viewing saved version") && (
            <span className="text-xs text-muted">{sourceLabel}</span>
          )}
          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={save}
              disabled={!canSave}
              className="inline-flex h-8 items-center rounded-item border border-ink bg-ink px-3 text-xs text-paper disabled:border-rule disabled:bg-paper-sunken disabled:text-muted"
            >
              {saving ? "Saving…" : "Save version"}
            </button>
            <details className="relative" data-testid="document-editor-more">
              <summary className="inline-flex h-8 cursor-pointer list-none items-center rounded-item border border-rule px-3 text-xs text-muted hover:border-ink hover:text-ink">
                More
              </summary>
              <div className="absolute right-0 z-20 mt-1 grid min-w-44 gap-1 rounded-card border border-rule bg-paper p-1.5 shadow-panel">
                <button
                  type="button"
                  onClick={() => void saveAndDownloadDocx()}
                  disabled={!canDownloadDocx}
                  className="inline-flex h-8 items-center rounded-item px-2 text-xs text-ink hover:bg-paper-sunken disabled:text-muted"
                >
                  {downloadingDocx ? "Preparing…" : dirty ? "Save & download DOCX" : "Download DOCX"}
                </button>
                <button
                  type="button"
                  onClick={() => void copyWorkingText()}
                  disabled={!plainText.trim()}
                  className="inline-flex h-8 items-center rounded-item px-2 text-xs text-ink hover:bg-paper-sunken disabled:text-muted"
                >
                  Copy text
                </button>
                <button
                  type="button"
                  onClick={downloadWorkingText}
                  disabled={!plainText.trim()}
                  className="inline-flex h-8 items-center rounded-item px-2 text-xs text-ink hover:bg-paper-sunken disabled:text-muted"
                >
                  Download text
                </button>
                <span
                  className="inline-flex h-8 items-center px-2 text-xs text-muted"
                  data-testid="document-editor-word-count"
                >
                  {documentStatsFromText(plainText).words.toLocaleString()} words
                </span>
                <button
                  type="button"
                  onClick={() => window.print()}
                  disabled={!plainText.trim()}
                  className="inline-flex h-8 items-center rounded-item px-2 text-xs text-ink hover:bg-paper-sunken disabled:text-muted"
                >
                  Print / PDF
                </button>
                <button
                  type="button"
                  onClick={reset}
                  disabled={!dirty || saving}
                  className="inline-flex h-8 items-center rounded-item px-2 text-xs text-ink hover:bg-paper-sunken disabled:text-muted"
                >
                  Reset
                </button>
              </div>
            </details>
          </div>
        </div>
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
