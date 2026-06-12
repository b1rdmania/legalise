// ----- Inline tracked changes (proposed document_edits rows) --------------
//
// AI/skill-proposed edits arrive as (deleted_text, inserted_text,
// context_before, context_after) rows. We anchor each one in the live
// document with the same whitespace-normalised search the review notes
// use, then decorate: deletion struck through in seal, insertion as an
// underlined inline widget, with compact accept/reject controls. Edits
// that cannot be anchored stay in the rail listing — never dropped.
//
// Extracted verbatim from DocumentRichEditor.tsx (Fluff C3).
import type { Editor } from "@tiptap/react";
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import type { Node as ProseMirrorNode } from "prosemirror-model";

import { findNormalizedRanges } from "./editorText";

export type DocumentProposedEdit = {
  id: string;
  deletedText: string;
  insertedText: string;
  contextBefore: string;
  contextAfter: string;
  rationale?: string | null;
};

export type ProposedEditLocation =
  | { kind: "replace"; from: number; to: number }
  | { kind: "insert"; pos: number };

export type TrackChangesPluginState = {
  edits: DocumentProposedEdit[];
  visible: boolean;
};

export type TrackChangeHandlers = {
  resolve: (edit: DocumentProposedEdit, action: "accept" | "reject") => void;
};

export const TRACK_CHANGES_PLUGIN_KEY = new PluginKey<TrackChangesPluginState>(
  "legaliseTrackChanges",
);

export function locateProposedEditInDoc(
  doc: ProseMirrorNode,
  edit: DocumentProposedEdit,
  options?: { strict?: boolean },
): ProposedEditLocation | null {
  const deleted = edit.deletedText ?? "";
  const deletedNeedle = deleted.trim().replace(/\s+/g, " ");
  let located: ProposedEditLocation | null = null;

  if (deletedNeedle.length >= 3) {
    // Most specific anchor first; bare deleted text last. First match
    // wins — the same policy the backend resolver applies. Strict mode
    // (used when APPLYING text, not just decorating) requires the full
    // context anchor: a bare-needle match after a neighbouring accept
    // could land on the wrong occurrence while the server, applying to
    // untouched base_text, lands on the right one.
    const anchors = options?.strict
      ? [`${edit.contextBefore ?? ""}${deleted}${edit.contextAfter ?? ""}`]
      : [
          `${edit.contextBefore ?? ""}${deleted}${edit.contextAfter ?? ""}`,
          `${edit.contextBefore ?? ""}${deleted}`,
          deleted,
        ];
    for (const anchor of anchors) {
      if (located) break;
      doc.descendants((node, position) => {
        if (located) return false;
        if (!node.isText || !node.text) return true;
        const anchorRange = findNormalizedRanges(node.text, anchor)[0];
        if (!anchorRange) return true;
        const slice = node.text.slice(anchorRange.start, anchorRange.end);
        const inner = findNormalizedRanges(slice, deleted)[0];
        if (!inner) return true;
        located = {
          kind: "replace",
          from: position + anchorRange.start + inner.start,
          to: position + anchorRange.start + inner.end,
        };
        return false;
      });
    }
    return located;
  }

  // Deletions under three characters cannot be anchored safely; they
  // fall back to the rail listing.
  if (deletedNeedle.length > 0) return null;

  // Pure insertion: anchor on the surrounding context.
  doc.descendants((node, position) => {
    if (located) return false;
    if (!node.isText || !node.text) return true;
    const beforeRange = findNormalizedRanges(node.text, edit.contextBefore)[0];
    if (beforeRange) {
      located = { kind: "insert", pos: position + beforeRange.end };
      return false;
    }
    const afterRange = findNormalizedRanges(node.text, edit.contextAfter)[0];
    if (afterRange) {
      located = { kind: "insert", pos: position + afterRange.start };
      return false;
    }
    return true;
  });
  return located;
}

export function applyProposedEditToEditor(
  activeEditor: Editor,
  edit: DocumentProposedEdit,
): boolean {
  const located = locateProposedEditInDoc(activeEditor.state.doc, edit, {
    strict: true,
  });
  if (!located) return false;
  const inserted = (edit.insertedText ?? "").replace(/\s+/g, " ");
  return activeEditor
    .chain()
    .command(({ tr, state }) => {
      if (located.kind === "replace") {
        if (inserted.trim()) {
          tr.replaceWith(located.from, located.to, state.schema.text(inserted));
        } else {
          tr.delete(located.from, located.to);
        }
        return true;
      }
      if (!inserted.trim()) return false;
      tr.insert(located.pos, state.schema.text(inserted));
      return true;
    })
    .run();
}

function trackChangeWidget(
  edit: DocumentProposedEdit,
  handlersRef: { current: TrackChangeHandlers | null },
): HTMLElement {
  const wrap = window.document.createElement("span");
  wrap.className = "legalise-track-change";
  wrap.dataset.trackEditId = edit.id;
  if (edit.rationale) wrap.title = edit.rationale;
  const inserted = (edit.insertedText ?? "").replace(/\s+/g, " ").trim();
  if (inserted) {
    const ins = window.document.createElement("span");
    ins.className = "legalise-track-insert";
    ins.textContent = inserted;
    wrap.append(ins);
  }
  const controls = window.document.createElement("span");
  controls.className = "legalise-track-controls";
  const makeButton = (
    label: string,
    glyph: string,
    action: "accept" | "reject",
  ) => {
    const button = window.document.createElement("button");
    button.type = "button";
    button.className =
      action === "accept" ? "legalise-track-accept" : "legalise-track-reject";
    button.setAttribute("aria-label", label);
    button.title = label;
    button.textContent = glyph;
    // mousedown (not click) so the editor selection is not stolen first.
    button.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      handlersRef.current?.resolve(edit, action);
    });
    return button;
  };
  controls.append(
    makeButton("Accept change", "✓", "accept"),
    makeButton("Reject change", "✕", "reject"),
  );
  wrap.append(controls);
  return wrap;
}

export function trackChangesDecorationsExtension(handlersRef: {
  current: TrackChangeHandlers | null;
}) {
  return Extension.create({
    name: "legaliseTrackChanges",
    addProseMirrorPlugins() {
      return [
        new Plugin<TrackChangesPluginState>({
          key: TRACK_CHANGES_PLUGIN_KEY,
          state: {
            init: () => ({ edits: [], visible: true }),
            apply(transaction, previous) {
              return transaction.getMeta(TRACK_CHANGES_PLUGIN_KEY) ?? previous;
            },
          },
          props: {
            decorations(state) {
              const pluginState = TRACK_CHANGES_PLUGIN_KEY.getState(state);
              if (!pluginState?.visible || pluginState.edits.length === 0) {
                return DecorationSet.empty;
              }
              const decorations: Decoration[] = [];
              pluginState.edits.forEach((edit) => {
                const located = locateProposedEditInDoc(state.doc, edit);
                if (!located) return;
                if (located.kind === "replace") {
                  decorations.push(
                    Decoration.inline(located.from, located.to, {
                      class: "legalise-track-delete",
                      "data-track-edit-id": edit.id,
                    }),
                  );
                }
                const widgetPos =
                  located.kind === "replace" ? located.to : located.pos;
                decorations.push(
                  Decoration.widget(
                    widgetPos,
                    () => trackChangeWidget(edit, handlersRef),
                    { side: 1, key: `legalise-track-${edit.id}` },
                  ),
                );
              });
              return DecorationSet.create(state.doc, decorations);
            },
          },
        }),
      ];
    },
  });
}
