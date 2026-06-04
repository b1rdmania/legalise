import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { Extension, type Content, type JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Typography from "@tiptap/extension-typography";
import Highlight from "@tiptap/extension-highlight";
import Link from "@tiptap/extension-link";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import TextAlign from "@tiptap/extension-text-align";
import { Table } from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";

import {
  commitDocumentWorkingDraft,
  ConflictError,
  documentVersionDocxUrl,
  fetchDocumentOriginalBlob,
  getDocumentWorkingDraft,
  saveDocumentWorkingDraft,
  type DocumentVersionRead,
  type DocumentWorkingDraftRead,
} from "../../lib/api";
import { buildVersionDiff, buildVersionDiffSummary } from "./VersionDiff";

export type TiptapNode = JSONContent;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

type TextRange = { start: number; end: number };
type OutlineItem = { id: string; label: string; query: string };
type DocumentStats = { words: number; chars: number; blocks: number };
type DocumentCanvasMode = "page" | "wide";
type OriginalImportState = "idle" | "loading" | "ready" | "error";
type WorkingDiffPart = ReturnType<typeof buildVersionDiff>[number];
const SHARED_DRAFT_POLL_MS = 15_000;
type DocumentLocalDraft = {
  documentId: string;
  filename: string;
  savedAt: string;
  plainText: string;
  json: TiptapNode;
};
type FindDecorationState = {
  activeIndex: number;
  query: string;
};
export type DocumentNoteHighlight = {
  id: string;
  label: string;
  quote: string;
  status: "open" | "resolved";
};
const FIND_DECORATIONS_PLUGIN_KEY = new PluginKey<FindDecorationState>(
  "legaliseDocumentFind",
);

function findDecorationsExtension() {
  return Extension.create({
    name: "legaliseDocumentFind",
    addProseMirrorPlugins() {
      return [
        new Plugin<FindDecorationState>({
          key: FIND_DECORATIONS_PLUGIN_KEY,
          state: {
            init: () => ({ query: "", activeIndex: 0 }),
            apply(transaction, previous) {
              return transaction.getMeta(FIND_DECORATIONS_PLUGIN_KEY) ?? previous;
            },
          },
          props: {
            decorations(state) {
              const pluginState = FIND_DECORATIONS_PLUGIN_KEY.getState(state);
              const query = pluginState?.query?.trim() ?? "";
              if (query.length < 3) return DecorationSet.empty;
              const decorations: Decoration[] = [];
              let matchIndex = 0;
              state.doc.descendants((node, position) => {
                if (!node.isText || !node.text) return;
                findNormalizedRanges(node.text, query).forEach((range) => {
                  const isActive = matchIndex === pluginState?.activeIndex;
                  decorations.push(
                    Decoration.inline(position + range.start, position + range.end, {
                      class: isActive
                        ? "legalise-find-match legalise-find-match-active"
                        : "legalise-find-match",
                      "data-find-match": isActive ? "active" : "true",
                    }),
                  );
                  matchIndex += 1;
                });
              });
              return DecorationSet.create(state.doc, decorations);
            },
          },
        }),
      ];
    },
  });
}

function reviewNoteDecorationsExtension(noteHighlights: DocumentNoteHighlight[]) {
  return Extension.create({
    name: "legaliseReviewNotes",
    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: new PluginKey("legaliseReviewNotes"),
          props: {
            decorations(state) {
              const decorations: Decoration[] = [];
              state.doc.descendants((node, position) => {
                if (!node.isText || !node.text) return;
                noteHighlights.forEach((note) => {
                  findNormalizedRanges(node.text ?? "", note.quote).forEach((range) => {
                    decorations.push(
                      Decoration.inline(position + range.start, position + range.end, {
                        class:
                          note.status === "resolved"
                            ? "legalise-review-note-resolved"
                            : "legalise-review-note-open",
                        "data-review-note-id": note.id,
                        title: note.label,
                      }),
                    );
                  });
                });
              });
              return DecorationSet.create(state.doc, decorations);
            },
          },
        }),
      ];
    },
  });
}

function selectedEditorText(editor: Editor | null): string {
  if (!editor) return "";
  const { from, to } = editor.state.selection;
  if (from === to) return "";
  return editor.state.doc.textBetween(from, to, " ").replace(/\s+/g, " ").trim();
}

export function findNormalizedRanges(
  text: string,
  needle: string | null | undefined,
): TextRange[] {
  const target = needle?.trim().replace(/\s+/g, " ").toLowerCase();
  if (!target || target.length < 3) return [];

  let normalised = "";
  const starts: number[] = [];
  const ends: number[] = [];

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (/\s/.test(ch)) {
      if (normalised.length === 0) continue;
      if (normalised.endsWith(" ")) {
        ends[ends.length - 1] = i + 1;
      } else {
        normalised += " ";
        starts.push(i);
        ends.push(i + 1);
      }
      continue;
    }
    normalised += ch.toLowerCase();
    starts.push(i);
    ends.push(i + 1);
  }

  const searchable = normalised.trimEnd();
  const ranges: TextRange[] = [];
  let from = 0;
  while (from < searchable.length) {
    const index = searchable.indexOf(target, from);
    if (index === -1) break;
    const endIndex = index + target.length - 1;
    ranges.push({ start: starts[index], end: ends[endIndex] });
    from = index + Math.max(target.length, 1);
  }
  return ranges;
}

export function findNormalizedRange(
  text: string,
  needle: string | null | undefined,
): TextRange | null {
  return findNormalizedRanges(text, needle)[0] ?? null;
}

function escapeWithOptionalMark(text: string, range: TextRange | null): string {
  if (!range || range.end <= range.start) return escapeHtml(text);
  const matched = text.slice(range.start, range.end);
  if (/\n{2,}/.test(matched)) return escapeHtml(text);
  return [
    escapeHtml(text.slice(0, range.start)),
    '<mark data-source-anchor="true">',
    escapeHtml(matched),
    "</mark>",
    escapeHtml(text.slice(range.end)),
  ].join("");
}

export function textToEditorHtml(
  text: string,
  sourceHighlight?: string | null,
): string {
  const trimmed = text.trim();
  if (!trimmed) return "<p></p>";
  const range = findNormalizedRange(trimmed, sourceHighlight);
  const html = escapeWithOptionalMark(trimmed, range)
    .replace(/\n{2,}/g, "</p><p>")
    .replace(/\n/g, "<br />");
  return `<p>${html}</p>`;
}

function plainTextFromNode(node: TiptapNode): string {
  if (node.type === "text") return node.text ?? "";
  if (node.type === "hardBreak") return "\n";
  const children = node.content?.map(plainTextFromNode).join("") ?? "";
  if (node.type === "paragraph" || node.type === "heading") return `${children}\n\n`;
  if (node.type === "taskItem") {
    return `${node.attrs?.checked ? "[x]" : "[ ]"} ${children.trimEnd()}\n`;
  }
  if (node.type === "listItem") return `${children.trimEnd()}\n`;
  if (node.type === "tableCell" || node.type === "tableHeader") return children.trim();
  if (node.type === "tableRow") {
    return `${node.content?.map(plainTextFromNode).join("\t") ?? ""}\n`;
  }
  if (node.type === "table") return `${children}\n`;
  return children;
}

export function editorJsonToPlainText(json: TiptapNode): string {
  return plainTextFromNode(json).replace(/\n{3,}/g, "\n\n").trim();
}

export function isEditableWordDocument(filename: string, mimeType?: string | null): boolean {
  return (
    /\.docx$/i.test(filename) ||
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  );
}

function firstTextFromNode(node: TiptapNode): string {
  if (node.type === "text") return node.text ?? "";
  return node.content?.map(firstTextFromNode).join("") ?? "";
}

function documentOutlineFromText(text: string): OutlineItem[] {
  const blocks = text
    .split(/\n{2,}/)
    .map((block) => block.replace(/\s+/g, " ").trim())
    .filter((block) => block.length >= 12);
  return blocks.slice(0, 12).map((block, index) => {
    const compact = block.length > 76 ? `${block.slice(0, 73).trimEnd()}...` : block;
    return {
      id: `${index}-${compact}`,
      label: compact,
      query: block.slice(0, 96),
    };
  });
}

export function documentOutlineFromJson(
  json: TiptapNode | null | undefined,
  fallbackText: string,
): OutlineItem[] {
  const headingItems =
    json?.content?.flatMap((node, index): OutlineItem[] => {
      if (node.type !== "heading") return [];
      const text = firstTextFromNode(node).replace(/\s+/g, " ").trim();
      if (!text) return [];
      return [{
        id: `heading-${index}-${text}`,
        label: text.length > 76 ? `${text.slice(0, 73).trimEnd()}...` : text,
        query: text,
      }];
    }) ?? [];
  return headingItems.length > 0 ? headingItems.slice(0, 12) : documentOutlineFromText(fallbackText);
}

export function documentStatsFromText(text: string): DocumentStats {
  const trimmed = text.trim();
  return {
    words: trimmed ? trimmed.split(/\s+/).length : 0,
    chars: text.length,
    blocks: trimmed ? trimmed.split(/\n{2,}/).filter(Boolean).length : 0,
  };
}

function draftStorageKey(documentId: string): string {
  return `legalise.documentDraft.${documentId}`;
}

export function readDocumentLocalDraft(documentId: string): DocumentLocalDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(draftStorageKey(documentId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DocumentLocalDraft>;
    if (
      parsed.documentId !== documentId ||
      !parsed.json ||
      typeof parsed.plainText !== "string" ||
      typeof parsed.savedAt !== "string"
    ) {
      window.localStorage.removeItem(draftStorageKey(documentId));
      return null;
    }
    return parsed as DocumentLocalDraft;
  } catch {
    window.localStorage.removeItem(draftStorageKey(documentId));
    return null;
  }
}

export function writeDocumentLocalDraft(draft: DocumentLocalDraft): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(draftStorageKey(draft.documentId), JSON.stringify(draft));
}

export function clearDocumentLocalDraft(documentId: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(draftStorageKey(documentId));
}

function ToolbarButton({
  active,
  children,
  onClick,
  label,
  disabled,
}: {
  active?: boolean;
  children: string;
  onClick: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-8 min-w-8 items-center justify-center border px-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-35 ${
        active
          ? "border-ink bg-ink text-paper"
          : "border-rule bg-paper text-ink hover:border-ink"
      }`}
    >
      {children}
    </button>
  );
}

function ToolbarGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-1 border-r border-rule pr-2 last:border-r-0 last:pr-0">
      <span className="mr-1 hidden text-[10px] font-semibold uppercase tracking-track2 text-muted xl:inline">
        {label}
      </span>
      {children}
    </div>
  );
}

function ViewModeButton({
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
      className={`inline-flex h-8 items-center border px-3 text-xs font-semibold ${
        active
          ? "border-ink bg-ink text-paper"
          : "border-rule bg-paper text-muted hover:border-ink hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function renderWorkingDiffParts(parts: WorkingDiffPart[]) {
  return parts.map((part, index) => {
    if (part.type === "insert") {
      return (
        <ins
          key={`${part.type}-${index}`}
          className="bg-green-100 px-0.5 text-green-950 no-underline"
        >
          {part.text}
        </ins>
      );
    }
    if (part.type === "delete") {
      return (
        <del
          key={`${part.type}-${index}`}
          className="bg-red-100 px-0.5 text-red-950"
        >
          {part.text}
        </del>
      );
    }
    return <span key={`${part.type}-${index}`}>{part.text}</span>;
  });
}

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
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [copiedMessage, setCopiedMessage] = useState<string | null>(null);
  const [findQuery, setFindQuery] = useState("");
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
  const findInputRef = useRef<HTMLInputElement | null>(null);
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
      extensions: [
        StarterKit.configure({
          heading: {
            levels: [2, 3],
          },
          codeBlock: false,
          horizontalRule: false,
        }),
        Placeholder.configure({
          placeholder: "Start editing this document...",
        }),
        Typography,
        Highlight.configure({ multicolor: false }),
        Link.configure({
          autolink: true,
          defaultProtocol: "https",
          openOnClick: false,
          HTMLAttributes: {
            class: "text-ink underline underline-offset-4",
          },
        }),
        TextAlign.configure({
          types: ["heading", "paragraph"],
        }),
        TaskList,
        TaskItem.configure({
          nested: true,
        }),
        findExtension,
        reviewNoteExtension,
        Table.configure({ resizable: true }),
        TableRow,
        TableHeader,
        TableCell,
      ],
      content,
      editorProps: {
        attributes: {
          class:
            "legalise-document-editor min-h-[720px] bg-paper px-8 py-10 text-[16px] leading-8 outline-none shadow-sm sm:px-12",
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
  const stats = useMemo(() => documentStatsFromText(plainText), [plainText]);
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
        editor.view.dom
          .querySelector('[data-find-match="active"]')
          ?.scrollIntoView({ block: "center", inline: "nearest" });
      });
    }
  }, [activeFindIndex, editor, findMatches.length, findQuery]);

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
        findInputRef.current?.focus();
        findInputRef.current?.select();
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
    <section className="min-h-[760px] border border-rule bg-paper" data-testid="document-editor">
      <div
        className="sticky top-0 z-10 border-b border-rule bg-paper/95 backdrop-blur"
        data-testid="document-editor-command-bar"
      >
        <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-3">
          <div className="min-w-[220px]">
            <p className="text-[11px] font-semibold uppercase tracking-track2 text-muted">
              Working copy
            </p>
            <h2 className="mt-1 text-sm font-semibold text-ink">Document editor</h2>
            <p className="mt-0.5 text-xs text-muted">
              {sourceLabel}
              {latestVersionNumber ? ` · latest v${latestVersionNumber}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
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
              onClick={reset}
              disabled={!dirty || saving}
              className="inline-flex h-8 items-center border border-rule px-3 text-xs font-semibold text-muted hover:border-ink hover:text-ink disabled:opacity-40"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={() => void copyWorkingText()}
              disabled={!plainText.trim()}
              className="inline-flex h-8 items-center border border-rule px-3 text-xs font-semibold text-muted hover:border-ink hover:text-ink disabled:opacity-40"
            >
              Copy text
            </button>
            <button
              type="button"
              onClick={downloadWorkingText}
              disabled={!plainText.trim()}
              className="inline-flex h-8 items-center border border-rule px-3 text-xs font-semibold text-muted hover:border-ink hover:text-ink disabled:opacity-40"
            >
              Download text
            </button>
            <button
              type="button"
              onClick={save}
              disabled={!canSave}
              className="inline-flex h-8 items-center border border-ink bg-ink px-3 text-xs font-semibold text-paper disabled:border-rule disabled:bg-paper-sunken disabled:text-muted"
            >
              {saving ? "Saving..." : "Save version"}
            </button>
            <button
              type="button"
              onClick={() => void saveAndDownloadDocx()}
              disabled={!canDownloadDocx}
              className="inline-flex h-8 items-center border border-ink bg-paper px-3 text-xs font-semibold text-ink hover:bg-paper-sunken disabled:border-rule disabled:text-muted disabled:opacity-50"
            >
              {downloadingDocx ? "Preparing..." : dirty ? "Save & download DOCX" : "Download DOCX"}
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-rule bg-paper-sunken px-5 py-2 text-xs text-muted">
          <span className="inline-flex items-center gap-2">
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
            {editorStatusLabel}. Every save creates a new version.
          </span>
          <span className="font-mono uppercase tracking-track2" data-testid="document-editor-stats">
            {stats.words.toLocaleString()} words · {stats.chars.toLocaleString()} chars ·{" "}
            {stats.blocks.toLocaleString()} blocks
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-rule px-5 py-2">
          {editor && (
            <>
              <ToolbarGroup label="Style">
                <ToolbarButton
                  label="Heading 2"
                  active={editor.isActive("heading", { level: 2 })}
                  onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                >
                  H2
                </ToolbarButton>
                <ToolbarButton
                  label="Heading 3"
                  active={editor.isActive("heading", { level: 3 })}
                  onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
                >
                  H3
                </ToolbarButton>
              </ToolbarGroup>
              <ToolbarGroup label="Text">
                <ToolbarButton
                  label="Bold"
                  active={editor.isActive("bold")}
                  onClick={() => editor.chain().focus().toggleBold().run()}
                >
                  B
                </ToolbarButton>
                <ToolbarButton
                  label="Italic"
                  active={editor.isActive("italic")}
                  onClick={() => editor.chain().focus().toggleItalic().run()}
                >
                  I
                </ToolbarButton>
                <ToolbarButton
                  label="Underline"
                  active={editor.isActive("underline")}
                  onClick={() => editor.chain().focus().toggleUnderline().run()}
                >
                  U
                </ToolbarButton>
                <ToolbarButton
                  label="Highlight"
                  active={editor.isActive("highlight")}
                  onClick={() => editor.chain().focus().toggleHighlight().run()}
                >
                  H
                </ToolbarButton>
                <ToolbarButton
                  label="Link"
                  active={editor.isActive("link")}
                  onClick={setEditorLink}
                >
                  Link
                </ToolbarButton>
                <ToolbarButton
                  label="Remove link"
                  disabled={!editor.isActive("link")}
                  onClick={() =>
                    editor.chain().focus().extendMarkRange("link").unsetLink().run()
                  }
                >
                  Unlink
                </ToolbarButton>
              </ToolbarGroup>
              <ToolbarGroup label="Align">
                <ToolbarButton
                  label="Align left"
                  active={editor.isActive({ textAlign: "left" })}
                  onClick={() => editor.chain().focus().setTextAlign("left").run()}
                >
                  L
                </ToolbarButton>
                <ToolbarButton
                  label="Align centre"
                  active={editor.isActive({ textAlign: "center" })}
                  onClick={() => editor.chain().focus().setTextAlign("center").run()}
                >
                  C
                </ToolbarButton>
                <ToolbarButton
                  label="Align right"
                  active={editor.isActive({ textAlign: "right" })}
                  onClick={() => editor.chain().focus().setTextAlign("right").run()}
                >
                  R
                </ToolbarButton>
              </ToolbarGroup>
              <ToolbarGroup label="Lists">
                <ToolbarButton
                  label="Bullet list"
                  active={editor.isActive("bulletList")}
                  onClick={() => editor.chain().focus().toggleBulletList().run()}
                >
                  •
                </ToolbarButton>
                <ToolbarButton
                  label="Numbered list"
                  active={editor.isActive("orderedList")}
                  onClick={() => editor.chain().focus().toggleOrderedList().run()}
                >
                  1.
                </ToolbarButton>
                <ToolbarButton
                  label="Checklist"
                  active={editor.isActive("taskList")}
                  onClick={() => editor.chain().focus().toggleTaskList().run()}
                >
                  ☑
                </ToolbarButton>
              </ToolbarGroup>
              <ToolbarGroup label="Table">
                <ToolbarButton
                  label="Insert table"
                  active={editor.isActive("table")}
                  onClick={() =>
                    editor
                      .chain()
                      .focus()
                      .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
                      .run()
                  }
                >
                  Tbl
                </ToolbarButton>
                {editor.isActive("table") && (
                  <>
                    <ToolbarButton
                      label="Add row"
                      onClick={() => editor.chain().focus().addRowAfter().run()}
                    >
                      +R
                    </ToolbarButton>
                    <ToolbarButton
                      label="Add column"
                      onClick={() => editor.chain().focus().addColumnAfter().run()}
                    >
                      +C
                    </ToolbarButton>
                    <ToolbarButton
                      label="Delete row"
                      onClick={() => editor.chain().focus().deleteRow().run()}
                    >
                      -R
                    </ToolbarButton>
                    <ToolbarButton
                      label="Delete column"
                      onClick={() => editor.chain().focus().deleteColumn().run()}
                    >
                      -C
                    </ToolbarButton>
                    <ToolbarButton
                      label="Delete table"
                      onClick={() => editor.chain().focus().deleteTable().run()}
                    >
                      X
                    </ToolbarButton>
                  </>
                )}
                {!editor.isActive("table") && (
                  <ToolbarButton
                    label="Add row"
                    disabled
                    onClick={() => editor.chain().focus().addRowAfter().run()}
                  >
                    +R
                  </ToolbarButton>
                )}
              </ToolbarGroup>
            </>
          )}
          <span className="ml-auto text-xs text-muted">Cmd/Ctrl+S saves · Cmd/Ctrl+F finds</span>
        </div>
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
        <div
          className="flex flex-wrap items-center justify-between gap-3 border-b border-ink bg-paper px-5 py-3"
          data-testid="document-editor-selection-ribbon"
        >
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-track2 text-ink">
              Selected passage
            </p>
            <p className="mt-1 max-w-3xl truncate text-sm text-muted">{selectedQuote}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void copySelectedQuote()}
              className="border border-rule px-3 py-2 text-xs font-semibold text-ink hover:border-ink"
            >
              Copy
            </button>
            <button
              type="button"
              onClick={() => setFindQuery(selectedQuote)}
              className="border border-rule px-3 py-2 text-xs font-semibold text-ink hover:border-ink"
            >
              Find in document
            </button>
            {onCreateNoteFromSelection && (
              <button
                type="button"
                onClick={onCreateNoteFromSelection}
                className="border border-ink bg-ink px-3 py-2 text-xs font-semibold text-paper hover:bg-black"
              >
                Add review note
              </button>
            )}
            {onRunSkillFromSelection && (
              <button
                type="button"
                onClick={onRunSkillFromSelection}
                className="border border-ink bg-paper px-3 py-2 text-xs font-semibold text-ink hover:bg-paper-sunken"
              >
                Run skill
              </button>
            )}
          </div>
        </div>
      )}
      {draftSaveState === "error" && (
        <div
          className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-300 bg-amber-50 px-5 py-2 text-xs leading-5 text-amber-900"
          data-testid="document-server-draft-error"
        >
          <span>
            {draftConflict ??
              "Shared draft could not be saved. The browser copy is preserved locally; try saving again before leaving this file."}
          </span>
          <button
            type="button"
            onClick={() =>
              loadSharedDraftFromServer({
                allowWordImport: false,
                reloadedMessage: "Shared draft reloaded",
              }).catch((err) => {
                setDraftSaveState("error");
                setError(err instanceof Error ? err.message : String(err));
              })
            }
            className="border border-amber-900 bg-paper px-3 py-1.5 text-xs font-semibold text-amber-950 hover:bg-amber-100"
          >
            Reload shared draft
          </button>
        </div>
      )}
      {remoteDraftNotice && (
        <div
          className="flex flex-wrap items-center justify-between gap-3 border-b border-rule bg-paper-sunken px-5 py-2 text-xs leading-5 text-muted"
          data-testid="document-remote-draft-notice"
        >
          <span>{remoteDraftNotice}</span>
          <button
            type="button"
            onClick={() =>
              loadSharedDraftFromServer({
                allowWordImport: false,
                reloadedMessage: "Shared draft reloaded",
              }).catch((err) => {
                setRemoteDraftNotice(null);
                setError(err instanceof Error ? err.message : String(err));
              })
            }
            className="border border-rule bg-paper px-3 py-1.5 text-xs font-semibold text-ink hover:border-ink"
          >
            Reload shared draft
          </button>
        </div>
      )}
      {originalImportState === "loading" && (
        <p className="border-b border-rule bg-paper-sunken px-5 py-2 text-xs text-muted">
          Importing Word structure into the editable working copy...
        </p>
      )}
      {originalImportState === "ready" && (
        <p
          className="border-b border-rule bg-paper-sunken px-5 py-2 text-xs text-muted"
          data-testid="document-word-import-ready"
        >
          Word structure imported into the shared draft. Save a version when the edit is ready.
        </p>
      )}
      {originalImportState === "error" && (
        <p
          className="border-b border-amber-300 bg-amber-50 px-5 py-2 text-xs leading-5 text-amber-900"
          data-testid="document-word-import-fallback"
        >
          Word structure could not be imported here, so the editor is using extracted text.
        </p>
      )}
      {localDraft && (
        <div
          className="flex flex-wrap items-center justify-between gap-3 border-b border-rule bg-amber-50 px-5 py-3 text-sm text-ink"
          data-testid="document-local-draft-banner"
        >
          <span>
            Unsaved local draft from{" "}
            {new Date(localDraft.savedAt).toLocaleString()}. Restore it or discard it.
          </span>
          <span className="flex gap-2">
            <button
              type="button"
              onClick={restoreLocalDraft}
              className="border border-ink bg-paper px-3 py-1.5 text-xs font-semibold text-ink hover:bg-ink hover:text-paper"
            >
              Restore draft
            </button>
            <button
              type="button"
              onClick={discardLocalDraft}
              className="border border-rule bg-paper px-3 py-1.5 text-xs font-semibold text-muted hover:border-ink hover:text-ink"
            >
              Discard
            </button>
          </span>
        </div>
      )}
      {showWorkingDiff && (
        <div
          className="border-b border-rule bg-paper px-5 py-3"
          data-testid="document-working-diff"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-track2 text-muted">
                Unsaved changes
              </p>
              <p className="mt-1 text-sm text-ink">
                Review the working copy before saving it as a new document version.
              </p>
            </div>
            <dl className="flex flex-wrap gap-2 text-xs">
              <div className="border border-rule bg-paper-sunken px-3 py-2">
                <dt className="font-mono uppercase tracking-track2 text-muted">Added</dt>
                <dd className="mt-1 font-semibold text-green-900">
                  {workingDiffSummary.insertedChars.toLocaleString()} chars
                </dd>
              </div>
              <div className="border border-rule bg-paper-sunken px-3 py-2">
                <dt className="font-mono uppercase tracking-track2 text-muted">Removed</dt>
                <dd className="mt-1 font-semibold text-red-900">
                  {workingDiffSummary.deletedChars.toLocaleString()} chars
                </dd>
              </div>
            </dl>
          </div>
          <details className="mt-3 border border-rule bg-paper-sunken">
            <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-ink">
              Preview redline before saving
            </summary>
            <div className="max-h-[260px] overflow-auto border-t border-rule bg-paper p-4 text-sm leading-7">
              {renderWorkingDiffParts(workingDiffParts)}
            </div>
          </details>
        </div>
      )}
      <div
        className="flex flex-wrap items-center gap-3 border-b border-rule bg-paper px-5 py-3"
        data-testid="document-editor-find-panel"
      >
        <label
          htmlFor={`find-${documentId}`}
          className="text-xs font-semibold uppercase tracking-track2 text-muted"
        >
          Find
        </label>
        <input
          ref={findInputRef}
          id={`find-${documentId}`}
          type="search"
          value={findQuery}
          onChange={(event) => setFindQuery(event.target.value)}
          onKeyDown={handleFindKeyDown}
          placeholder="Search this document"
          className="min-h-[34px] min-w-[220px] flex-1 border border-rule bg-paper-sunken px-3 text-sm outline-none focus:border-ink"
        />
        <span className="text-xs text-muted" data-testid="document-editor-find-count">
          {findQuery.trim().length >= 3
            ? `${findMatches.length} match${findMatches.length === 1 ? "" : "es"}`
            : "Type 3+ characters"}
        </span>
        <button
          type="button"
          onClick={() => moveFind(-1)}
          disabled={findMatches.length === 0}
          className="border border-rule px-2 py-1 text-xs text-muted hover:border-ink hover:text-ink disabled:opacity-40"
        >
          Previous
        </button>
        <button
          type="button"
          onClick={() => moveFind(1)}
          disabled={findMatches.length === 0}
          className="border border-rule px-2 py-1 text-xs text-muted hover:border-ink hover:text-ink disabled:opacity-40"
        >
          Next
        </button>
        {findMatches.length > 0 && (
          <span className="text-xs text-muted" data-testid="document-editor-find-position">
            {findPositionLabel}
          </span>
        )}
        {findQuery && (
          <button
            type="button"
            onClick={() => setFindQuery("")}
            className="text-xs text-muted underline underline-offset-4 hover:text-ink"
          >
            Clear
          </button>
        )}
        {findPreview && (
          <p
            className="basis-full text-xs leading-5 text-muted"
            data-testid="document-editor-find-preview"
          >
            Match {findPositionLabel}: {findPreview}
          </p>
        )}
      </div>
      {error && (
        <p className="border-b border-red-800 bg-red-50 px-5 py-3 text-sm text-red-900">
          {error}
        </p>
      )}
      {noteAnchorSummaries.length > 0 && (
        <div
          className="border-b border-rule bg-paper px-5 py-3"
          data-testid="document-editor-review-map"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-track2 text-muted">
                Review map
              </p>
              <p className="mt-1 text-sm text-ink">
                {locatedNoteCount} of {noteAnchorSummaries.length} note anchor
                {noteAnchorSummaries.length === 1 ? "" : "s"} located in this working copy.
              </p>
            </div>
            <span className="border border-rule bg-paper-sunken px-2 py-1 text-[11px] font-semibold uppercase tracking-track2 text-muted">
              Anchored notes
            </span>
          </div>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {noteAnchorSummaries.map((note) => (
              <button
                key={note.id}
                type="button"
                onClick={() => setFindQuery(note.quote)}
                className={`min-w-[220px] max-w-[280px] border px-3 py-2 text-left text-xs leading-5 ${
                  note.located
                    ? "border-ink bg-paper text-ink"
                    : "border-amber-300 bg-amber-50 text-amber-950"
                }`}
              >
                <span className="block font-semibold">{note.label}</span>
                <span className="mt-1 block max-h-10 overflow-hidden text-muted">
                  {note.quote}
                </span>
                <span className="mt-2 block font-mono uppercase tracking-track2">
                  {note.located ? "Located" : "Not located"}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="grid min-h-[620px] lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="border-b border-rule bg-paper-sunken px-5 py-5 lg:border-b-0 lg:border-r">
          <div className="space-y-5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-track2 text-muted">
                Source passage
              </p>
              <p className="mt-2 text-sm leading-6 text-muted">
                {sourceHighlight
                  ? sourceRange
                    ? "Located in this version."
                    : "Not located in this version."
                  : "No cited passage selected."}
              </p>
              {sourceHighlight && (
                <button
                  type="button"
                  onClick={() => setFindQuery(sourceHighlight)}
                  className="mt-2 text-xs font-medium text-ink underline underline-offset-4 hover:text-muted"
                >
                  Search cited text
                </button>
              )}
            </div>
            {selectedQuote && (
              <div
                className="border border-ink bg-paper p-3"
                data-testid="document-editor-selected-passage"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[11px] font-semibold uppercase tracking-track2 text-ink">
                    Selected passage
                  </p>
                  <span className="border border-rule bg-paper-sunken px-2 py-1 text-[10px] font-semibold uppercase tracking-track2 text-muted">
                    {selectedQuoteAnchored ? "Anchored" : "Unanchored"}
                  </span>
                </div>
                <p className="mt-2 max-h-28 overflow-hidden text-xs leading-5 text-muted">
                  {selectedQuote}
                </p>
                <button
                  type="button"
                  onClick={() => void copySelectedQuote()}
                  className="mt-3 w-full border border-rule px-3 py-2 text-xs font-semibold text-ink hover:border-ink"
                >
                  Copy passage
                </button>
                {onCreateNoteFromSelection && (
                  <button
                    type="button"
                    onClick={onCreateNoteFromSelection}
                    className="mt-2 w-full border border-ink bg-ink px-3 py-2 text-xs font-semibold text-paper hover:bg-black"
                  >
                    Add review note
                  </button>
                )}
              </div>
            )}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-track2 text-muted">
                Review notes
              </p>
              {noteHighlights.length > 0 ? (
                <div className="mt-2 space-y-2" data-testid="document-editor-note-rail">
                  {noteHighlights.map((note) => (
                    <button
                      key={note.id}
                      type="button"
                      onClick={() => setFindQuery(note.quote)}
                      className="block w-full border border-rule bg-paper px-3 py-2 text-left text-xs leading-5 text-muted hover:border-ink hover:text-ink"
                    >
                      <span className="block font-medium text-ink">{note.label}</span>
                      <span className="mt-1 block max-h-10 overflow-hidden">{note.quote}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm text-muted">No anchored notes yet.</p>
              )}
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-track2 text-muted">
                Outline
              </p>
              {outlineItems.length > 0 ? (
                <nav className="mt-2 space-y-1" aria-label="Document outline">
                  {outlineItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setFindQuery(item.query)}
                      className="block w-full border-l border-transparent py-1 pl-2 text-left text-xs leading-5 text-muted hover:border-ink hover:text-ink"
                    >
                      {item.label}
                    </button>
                  ))}
                </nav>
              ) : (
                <p className="mt-2 text-sm text-muted">No outline yet.</p>
              )}
            </div>
          </div>
        </aside>
        <div className="bg-[#f5f5f2] px-4 py-6 sm:px-8" data-testid="document-editor-canvas">
          <div className={`mx-auto ${canvasMaxWidth}`}>
            {editor && (
              <BubbleMenu
                editor={editor}
                shouldShow={({ editor: bubbleEditor }) =>
                  selectedEditorText(bubbleEditor).length >= 3
                }
                options={{ placement: "top", offset: 8 }}
              >
                <div
                  className="flex items-center gap-1 border border-ink bg-paper px-1.5 py-1 shadow-[0_10px_30px_rgba(0,0,0,0.12)]"
                  data-testid="document-editor-selection-menu"
                >
                  <button
                    type="button"
                    onClick={() => void copyEditorSelection()}
                    className="px-2 py-1 text-xs font-semibold text-ink hover:bg-paper-sunken"
                  >
                    Copy
                  </button>
                  <button
                    type="button"
                    onClick={highlightEditorSelection}
                    className="px-2 py-1 text-xs font-semibold text-ink hover:bg-paper-sunken"
                  >
                    Highlight
                  </button>
                  <button
                    type="button"
                    onClick={setEditorLink}
                    className="px-2 py-1 text-xs font-semibold text-ink hover:bg-paper-sunken"
                  >
                    Link
                  </button>
                  {onCreateNoteFromSelection && (
                    <button
                      type="button"
                      onClick={onCreateNoteFromSelection}
                      className="bg-ink px-2 py-1 text-xs font-semibold text-paper hover:bg-black"
                    >
                      Add note
                    </button>
                  )}
                  {onRunSkillFromSelection && (
                    <button
                      type="button"
                      onClick={onRunSkillFromSelection}
                      className="px-2 py-1 text-xs font-semibold text-ink hover:bg-paper-sunken"
                    >
                      Run skill
                    </button>
                  )}
                </div>
              </BubbleMenu>
            )}
            <EditorContent editor={editor} />
          </div>
        </div>
      </div>
    </section>
  );
}
