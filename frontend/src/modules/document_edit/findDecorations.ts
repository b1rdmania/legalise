// Find-in-document decorations: a ProseMirror plugin that highlights every
// whitespace-normalised match of the current query and marks the active
// one. Extracted verbatim from DocumentRichEditor.tsx (Fluff C3).
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";

import { findNormalizedRanges } from "./editorText";

export type FindDecorationState = {
  activeIndex: number;
  query: string;
};

export const FIND_DECORATIONS_PLUGIN_KEY = new PluginKey<FindDecorationState>(
  "legaliseDocumentFind",
);

export function findDecorationsExtension() {
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
