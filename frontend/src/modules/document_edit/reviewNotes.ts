// Review-note (comment) decorations: anchors each note's quoted passage in
// the live document with the shared whitespace-normalised search and marks
// it open/resolved. Extracted verbatim from DocumentRichEditor.tsx
// (Fluff C3).
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";

import { findNormalizedRanges } from "./editorText";

export type DocumentNoteHighlight = {
  id: string;
  label: string;
  quote: string;
  status: "open" | "resolved";
};

export function reviewNoteDecorationsExtension(noteHighlights: DocumentNoteHighlight[]) {
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
