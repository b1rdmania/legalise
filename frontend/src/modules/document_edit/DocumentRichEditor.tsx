import { useEffect, useMemo, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Typography from "@tiptap/extension-typography";
import Highlight from "@tiptap/extension-highlight";

import {
  saveDocumentVersion,
  type DocumentVersionRead,
} from "../../lib/api";

type TiptapNode = {
  type?: string;
  text?: string;
  content?: TiptapNode[];
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

type TextRange = { start: number; end: number };

export function findNormalizedRange(
  text: string,
  needle: string | null | undefined,
): TextRange | null {
  const target = needle?.trim().replace(/\s+/g, " ").toLowerCase();
  if (!target || target.length < 3) return null;

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
  const index = searchable.indexOf(target);
  if (index === -1) return null;
  const endIndex = index + target.length - 1;
  return { start: starts[index], end: ends[endIndex] };
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
  return children;
}

export function editorJsonToPlainText(json: TiptapNode): string {
  return plainTextFromNode(json).replace(/\n{3,}/g, "\n\n").trim();
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
  latestVersionNumber,
  sourceLabel,
  sourceHighlight,
  onSaved,
}: {
  documentId: string;
  filename: string;
  initialText: string;
  latestVersionNumber?: number;
  sourceLabel: string;
  sourceHighlight?: string | null;
  onSaved: (version: DocumentVersionRead) => void;
}) {
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const content = useMemo(
    () => textToEditorHtml(initialText, sourceHighlight),
    [initialText, sourceHighlight],
  );
  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          heading: false,
          codeBlock: false,
          horizontalRule: false,
        }),
        Placeholder.configure({
          placeholder: "Start editing this document...",
        }),
        Typography,
        Highlight.configure({ multicolor: false }),
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
    setError(null);
    setSavedMessage(null);
  }, [content, editor]);

  const plainText = editor ? editorJsonToPlainText(editor.getJSON() as TiptapNode) : "";
  const canSave = Boolean(editor && dirty && plainText.trim() && !saving);

  async function save() {
    if (!editor || !canSave) return;
    setSaving(true);
    setError(null);
    try {
      const version = await saveDocumentVersion(
        documentId,
        plainText,
        `Edited ${filename} in Legalise document editor`,
      );
      setDirty(false);
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

      <div className="border-b border-rule bg-paper-sunken px-5 py-2 text-xs text-muted">
        {dirty ? "Unsaved changes" : savedMessage ?? "Every save creates a new document version."}
      </div>
      {error && (
        <p className="border-b border-red-800 bg-red-50 px-5 py-3 text-sm text-red-900">
          {error}
        </p>
      )}
      <EditorContent editor={editor} />
    </section>
  );
}
