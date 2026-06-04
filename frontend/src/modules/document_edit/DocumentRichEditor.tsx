import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Typography from "@tiptap/extension-typography";
import Highlight from "@tiptap/extension-highlight";
import Underline from "@tiptap/extension-underline";
import { Table } from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import type { Content, JSONContent } from "@tiptap/core";

import {
  commitDocumentWorkingDraft,
  documentVersionDocxUrl,
  getDocumentWorkingDraft,
  saveDocumentWorkingDraft,
  type DocumentVersionRead,
  type DocumentWorkingDraftRead,
} from "../../lib/api";

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
type DocumentLocalDraft = {
  documentId: string;
  filename: string;
  savedAt: string;
  plainText: string;
  json: TiptapNode;
};
export type DocumentNoteHighlight = {
  id: string;
  label: string;
  quote: string;
  status: "open" | "resolved";
};

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

export function DocumentRichEditor({
  documentId,
  filename,
  initialText,
  initialJson,
  latestVersionNumber,
  latestVersionId,
  sourceLabel,
  sourceHighlight,
  noteHighlights = [],
  selectedQuote,
  selectedQuoteAnchored,
  onCreateNoteFromSelection,
  onSaved,
  onDirtyChange,
}: {
  documentId: string;
  filename: string;
  initialText: string;
  initialJson?: TiptapNode | null;
  latestVersionNumber?: number;
  latestVersionId?: string | null;
  sourceLabel: string;
  sourceHighlight?: string | null;
  noteHighlights?: DocumentNoteHighlight[];
  selectedQuote?: string;
  selectedQuoteAnchored?: boolean;
  onCreateNoteFromSelection?: () => void;
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
  const [canvasMode, setCanvasMode] = useState<DocumentCanvasMode>("page");
  const findInputRef = useRef<HTMLInputElement | null>(null);
  const draftSaveTimerRef = useRef<number | null>(null);
  const draftBaseVersionIdRef = useRef<string | null>(latestVersionId ?? null);
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
    });
    setServerDraft(draft);
    draftBaseVersionIdRef.current = draft.base_version_id;
    setDraftSaveState("saved");
    return draft;
  }

  function scheduleWorkingDraftSave(editorJson: TiptapNode, plainText: string) {
    if (draftSaveTimerRef.current !== null) {
      window.clearTimeout(draftSaveTimerRef.current);
    }
    setDraftSaveState("saving");
    draftSaveTimerRef.current = window.setTimeout(() => {
      draftSaveTimerRef.current = null;
      persistWorkingDraft(editorJson, plainText).catch(() => {
        setDraftSaveState("error");
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
        Underline,
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
        onDirtyChange?.(true);
        setSavedMessage(null);
      },
      immediatelyRender: false,
    },
    [documentId],
  );

  useEffect(() => {
    if (!editor) return;
    editor.commands.setContent(content, { emitUpdate: false });
    setDirty(false);
    onDirtyChange?.(false);
    setError(null);
    setSavedMessage(null);
    setLocalDraft(readDocumentLocalDraft(documentId));
    setServerDraft(null);
    setDraftLoadState("loading");
    setDraftSaveState("idle");
    draftBaseVersionIdRef.current = latestVersionId ?? null;
    if (draftSaveTimerRef.current !== null) {
      window.clearTimeout(draftSaveTimerRef.current);
      draftSaveTimerRef.current = null;
    }
  }, [content, documentId, editor, latestVersionId, onDirtyChange]);

  useEffect(() => {
    if (!editor) return;
    let cancelled = false;
    setDraftLoadState("loading");
    getDocumentWorkingDraft(documentId)
      .then((draft) => {
        if (cancelled) return;
        setServerDraft(draft);
        draftBaseVersionIdRef.current = draft.base_version_id ?? latestVersionId ?? null;
        const draftContent = draft.editor_json ?? textToEditorHtml(draft.plain_text, sourceHighlight);
        editor.commands.setContent(draftContent as Content, { emitUpdate: false });
        const hasMutableDraft = draft.version_counter > 0;
        setDirty(hasMutableDraft);
        onDirtyChange?.(hasMutableDraft);
        setDraftLoadState("ready");
        setDraftSaveState(hasMutableDraft ? "saved" : "idle");
        setSavedMessage(hasMutableDraft ? "Shared draft loaded" : null);
      })
      .catch(() => {
        if (cancelled) return;
        setDraftLoadState("error");
        setDraftSaveState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [documentId, editor, latestVersionId, onDirtyChange, sourceHighlight]);

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
  const canDownloadDocx = Boolean(editor && plainText.trim() && !saving && !downloadingDocx);
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
  const stats = useMemo(() => documentStatsFromText(plainText), [plainText]);
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
      );
      setDirty(false);
      onDirtyChange?.(false);
      setSavedMessage(`Saved v${version.version_number}`);
      setServerDraft(null);
      draftBaseVersionIdRef.current = version.id;
      setDraftSaveState("idle");
      clearDocumentLocalDraft(documentId);
      setLocalDraft(null);
      onSaved(version);
      return version;
    } catch (err) {
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
    onDirtyChange?.(false);
    setError(null);
    setSavedMessage(null);
    clearDocumentLocalDraft(documentId);
    setLocalDraft(null);
  }

  function restoreLocalDraft() {
    if (!editor || !localDraft) return;
    editor.commands.setContent(localDraft.json, { emitUpdate: false });
    setDirty(true);
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
      {draftSaveState === "error" && (
        <p
          className="border-b border-amber-300 bg-amber-50 px-5 py-2 text-xs leading-5 text-amber-900"
          data-testid="document-server-draft-error"
        >
          Shared draft could not be saved. The browser copy is preserved locally; try saving
          again before leaving this file.
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
                {onCreateNoteFromSelection && (
                  <button
                    type="button"
                    onClick={onCreateNoteFromSelection}
                    className="mt-3 w-full border border-ink bg-ink px-3 py-2 text-xs font-semibold text-paper hover:bg-black"
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
            <EditorContent editor={editor} />
          </div>
        </div>
      </div>
    </section>
  );
}
