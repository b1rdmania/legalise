// Tiptap extension stack for the document editor. The three decoration
// extensions (find, review notes, tracked changes) are built per-mount in
// DocumentRichEditor and passed in so their memoisation stays where the
// React state lives. Order is load-bearing and preserved exactly from the
// pre-split DocumentRichEditor.tsx (Fluff C3).
import type { AnyExtension } from "@tiptap/core";

import { firstImageFile } from "./editorText";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Typography from "@tiptap/extension-typography";
import Highlight from "@tiptap/extension-highlight";
import Color from "@tiptap/extension-color";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle } from "@tiptap/extension-text-style";
import { Table } from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";

export function documentEditorExtensions({
  findExtension,
  reviewNoteExtension,
  trackChangesExtension,
}: {
  findExtension: AnyExtension;
  reviewNoteExtension: AnyExtension;
  trackChangesExtension: AnyExtension;
}): AnyExtension[] {
  return [
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
    TextStyle,
    Color,
    Image.configure({
      allowBase64: false,
      inline: false,
    }),
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
    trackChangesExtension,
    Table.configure({ resizable: true }),
    TableRow,
    TableHeader,
    TableCell,
  ];
}

// Editor view props: canvas styling plus paste/drop image interception.
// Verbatim from the pre-split DocumentRichEditor.tsx (Fluff C3).
export function documentEditorProps(onImageFile: (file: File) => void) {
  return {
    attributes: {
      class:
        "legalise-document-editor min-h-[760px] border border-rule bg-paper px-9 py-12 text-[16px] leading-8 outline-hidden shadow-[0_18px_50px_rgba(0,0,0,0.08)] sm:px-14",
    },
    handlePaste: (_view: unknown, event: ClipboardEvent) => {
      const file = firstImageFile(event.clipboardData?.files);
      if (!file) return false;
      onImageFile(file);
      return true;
    },
    handleDrop: (_view: unknown, event: DragEvent) => {
      const file = firstImageFile(event.dataTransfer?.files);
      if (!file) return false;
      event.preventDefault();
      onImageFile(file);
      return true;
    },
  };
}
