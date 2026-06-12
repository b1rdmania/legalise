// Tiptap extension stack for the document editor. The three decoration
// extensions (find, review notes, tracked changes) are built per-mount in
// DocumentRichEditor and passed in so their memoisation stays where the
// React state lives. Order is load-bearing and preserved exactly from the
// pre-split DocumentRichEditor.tsx (Fluff C3).
import type { AnyExtension } from "@tiptap/core";
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
