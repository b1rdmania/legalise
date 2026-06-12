// Text utilities for the document editor: whitespace-normalised search,
// plain-text serialisation, outline/stats derivation, and the per-document
// local draft stored in localStorage. Extracted verbatim from
// DocumentRichEditor.tsx (Fluff C3); DocumentRichEditor re-exports the
// public pieces so consumers keep a single import path.
import type { Editor } from "@tiptap/react";
import type { JSONContent } from "@tiptap/core";

export type TiptapNode = JSONContent;

export type TextRange = { start: number; end: number };
export type OutlineItem = { id: string; label: string; query: string };
export type DocumentStats = { words: number; chars: number; blocks: number };
export type DocumentLocalDraft = {
  documentId: string;
  filename: string;
  savedAt: string;
  plainText: string;
  json: TiptapNode;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function firstImageFile(files: FileList | File[] | null | undefined): File | null {
  for (const file of Array.from(files ?? [])) {
    if (file.type.startsWith("image/")) return file;
  }
  return null;
}

export function selectedEditorText(editor: Editor | null): string {
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
  if (node.type === "image") return node.attrs?.alt ? `[image: ${node.attrs.alt}]\n\n` : "[image]\n\n";
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
