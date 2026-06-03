import { useEffect, useMemo, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Typography from "@tiptap/extension-typography";
import Highlight from "@tiptap/extension-highlight";
import { Table } from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import type { Content, JSONContent } from "@tiptap/core";

import {
  saveDocumentVersion,
  type DocumentVersionRead,
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

export function documentStatsFromText(text: string): DocumentStats {
  const trimmed = text.trim();
  return {
    words: trimmed ? trimmed.split(/\s+/).length : 0,
    chars: text.length,
    blocks: trimmed ? trimmed.split(/\n{2,}/).filter(Boolean).length : 0,
  };
}

function ToolbarButton({
  active,
  children,
  onClick,
  label,
}: {
  active?: boolean;
  children: string;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`inline-flex h-8 min-w-8 items-center justify-center border px-2 text-sm font-semibold ${
        active
          ? "border-ink bg-ink text-paper"
          : "border-rule bg-paper text-ink hover:border-ink"
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
  sourceLabel,
  sourceHighlight,
  noteHighlights = [],
  onSaved,
  onDirtyChange,
}: {
  documentId: string;
  filename: string;
  initialText: string;
  initialJson?: TiptapNode | null;
  latestVersionNumber?: number;
  sourceLabel: string;
  sourceHighlight?: string | null;
  noteHighlights?: DocumentNoteHighlight[];
  onSaved: (version: DocumentVersionRead) => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [findQuery, setFindQuery] = useState("");
  const content = useMemo<Content>(
    () => initialJson ?? textToEditorHtml(initialText, sourceHighlight),
    [initialJson, initialText, sourceHighlight],
  );
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
        Table.configure({ resizable: true }),
        TableRow,
        TableHeader,
        TableCell,
      ],
      content,
      editorProps: {
        attributes: {
          class:
            "legalise-document-editor min-h-[620px] px-7 py-7 text-[16px] leading-8 outline-none sm:px-10",
        },
      },
      onUpdate: () => {
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
  }, [content, editor, onDirtyChange]);

  const plainText = editor ? editorJsonToPlainText(editor.getJSON() as TiptapNode) : "";
  const canSave = Boolean(editor && dirty && plainText.trim() && !saving);
  const findMatches = useMemo(
    () => findNormalizedRanges(plainText, findQuery),
    [plainText, findQuery],
  );
  const firstFindMatch = findMatches[0] ?? null;
  const findPreview =
    firstFindMatch && plainText
      ? plainText
          .slice(
            Math.max(0, firstFindMatch.start - 70),
            Math.min(plainText.length, firstFindMatch.end + 90),
          )
          .replace(/\s+/g, " ")
          .trim()
      : null;
  const outlineItems = useMemo(
    () => documentOutlineFromText(plainText),
    [plainText],
  );
  const sourceRange = useMemo(
    () => findNormalizedRange(plainText, sourceHighlight),
    [plainText, sourceHighlight],
  );
  const stats = useMemo(() => documentStatsFromText(plainText), [plainText]);

  async function save() {
    if (!editor || !canSave) return;
    setSaving(true);
    setError(null);
    try {
      const editorJson = editor.getJSON() as TiptapNode;
      const version = await saveDocumentVersion(
        documentId,
        plainText,
        `Edited ${filename} in Legalise document editor`,
        editorJson,
      );
      setDirty(false);
      onDirtyChange?.(false);
      setSavedMessage(`Saved v${version.version_number}`);
      onSaved(version);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    editor?.commands.setContent(content, { emitUpdate: false });
    setDirty(false);
    onDirtyChange?.(false);
    setError(null);
    setSavedMessage(null);
  }

  return (
    <section className="min-h-[760px] border border-rule bg-paper" data-testid="document-editor">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule px-5 py-3">
        <div>
          <h2 className="text-sm font-semibold text-ink">Document editor</h2>
          <p className="mt-0.5 text-xs text-muted">
            {sourceLabel}
            {latestVersionNumber ? ` · latest v${latestVersionNumber}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {editor && (
            <>
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
                label="Bullet list"
                active={editor.isActive("bulletList")}
                onClick={() => editor.chain().focus().toggleBulletList().run()}
              >
                *
              </ToolbarButton>
              <ToolbarButton
                label="Numbered list"
                active={editor.isActive("orderedList")}
                onClick={() => editor.chain().focus().toggleOrderedList().run()}
              >
                1.
              </ToolbarButton>
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
            </>
          )}
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
            onClick={save}
            disabled={!canSave}
            className="inline-flex h-8 items-center border border-ink bg-ink px-3 text-xs font-semibold text-paper disabled:border-rule disabled:bg-paper-sunken disabled:text-muted"
          >
            {saving ? "Saving..." : "Save version"}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule bg-paper-sunken px-5 py-2 text-xs text-muted">
        <span>
          {dirty ? "Unsaved changes" : savedMessage ?? "Every save creates a new document version."}
        </span>
        <span className="font-mono uppercase tracking-track2" data-testid="document-editor-stats">
          {stats.words.toLocaleString()} words · {stats.chars.toLocaleString()} chars ·{" "}
          {stats.blocks.toLocaleString()} blocks
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-3 border-b border-rule bg-paper px-5 py-3">
        <label
          htmlFor={`find-${documentId}`}
          className="text-xs font-semibold uppercase tracking-track2 text-muted"
        >
          Find
        </label>
        <input
          id={`find-${documentId}`}
          type="search"
          value={findQuery}
          onChange={(event) => setFindQuery(event.target.value)}
          placeholder="Search this document"
          className="min-h-[34px] min-w-[220px] flex-1 border border-rule bg-paper-sunken px-3 text-sm outline-none focus:border-ink"
        />
        <span className="text-xs text-muted" data-testid="document-editor-find-count">
          {findQuery.trim().length >= 3
            ? `${findMatches.length} match${findMatches.length === 1 ? "" : "es"}`
            : "Type 3+ characters"}
        </span>
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
            First match: {findPreview}
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
        <EditorContent editor={editor} />
      </div>
    </section>
  );
}
