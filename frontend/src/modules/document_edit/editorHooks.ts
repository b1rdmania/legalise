// Behaviour hooks for the document editor, extracted verbatim from
// DocumentRichEditor.tsx (Fluff C3):
// - useFindInDocument: find query/index state, match decorations dispatch,
//   active-match scrolling, and the Cmd/Ctrl+F / Cmd/Ctrl+S shortcuts.
// - useTrackedChangeResolution: redlines visibility, per-edit and
//   accept/reject-all resolution against the real endpoints, and the
//   tracked-changes plugin state dispatch.
// - useClipboardActions: copy/download/link/image-URL actions.
// State lives inside the hooks exactly as it did inline; everything the
// hooks need from the component arrives as arguments.
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import type { Editor } from "@tiptap/react";

import { findNormalizedRanges, selectedEditorText } from "./editorText";
import {
  FIND_DECORATIONS_PLUGIN_KEY,
  type FindDecorationState,
} from "./findDecorations";
import {
  applyProposedEditToEditor,
  locateProposedEditInDoc,
  TRACK_CHANGES_PLUGIN_KEY,
  type DocumentProposedEdit,
  type TrackChangeHandlers,
  type TrackChangesPluginState,
} from "./trackedChanges";

export function useFindInDocument({
  editor,
  plainText,
  canSave,
  save,
}: {
  editor: Editor | null;
  plainText: string;
  canSave: boolean;
  save: () => Promise<unknown>;
}) {
  const [findQuery, setFindQuery] = useState("");
  const [findOpen, setFindOpen] = useState(false);
  const [activeFindIndex, setActiveFindIndex] = useState(0);
  const findInputRef = useRef<HTMLInputElement | null>(null);

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
        if (editor.isDestroyed) return;
        editor.view.dom
          .querySelector('[data-find-match="active"]')
          ?.scrollIntoView({ block: "center", inline: "nearest" });
      });
    }
  }, [activeFindIndex, editor, findMatches.length, findQuery]);

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
        setFindOpen(true);
        requestAnimationFrame(() => {
          findInputRef.current?.focus();
          findInputRef.current?.select();
        });
      }
      if (key === "s") {
        event.preventDefault();
        if (canSave) void save();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  return {
    findQuery,
    setFindQuery,
    findOpen,
    setFindOpen,
    findInputRef,
    findMatches,
    findPreview,
    findPositionLabel,
    moveFind,
    handleFindKeyDown,
  };
}

export function useTrackedChangeResolution({
  editor,
  proposedEdits,
  proposedEditsKey,
  plainText,
  onResolveProposedEdit,
  setError,
  trackHandlersRef,
}: {
  editor: Editor | null;
  proposedEdits: DocumentProposedEdit[];
  proposedEditsKey: string;
  plainText: string;
  onResolveProposedEdit?: (
    editId: string,
    action: "accept" | "reject",
  ) => Promise<void>;
  setError: (message: string | null) => void;
  trackHandlersRef: { current: TrackChangeHandlers | null };
}) {
  const [redlinesVisible, setRedlinesVisible] = useState(true);
  const [trackBusy, setTrackBusy] = useState(false);
  const [trackNotice, setTrackNotice] = useState<string | null>(null);

  // A fresh batch of proposed edits always starts visible.
  useEffect(() => {
    setRedlinesVisible(true);
  }, [proposedEditsKey]);

  useEffect(() => {
    if (!editor) return;
    editor.view.dispatch(
      editor.state.tr.setMeta(TRACK_CHANGES_PLUGIN_KEY, {
        edits: proposedEdits,
        visible: redlinesVisible,
      } satisfies TrackChangesPluginState),
    );
    // proposedEditsKey stands in for the array identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, proposedEditsKey, redlinesVisible]);

  const anchoredProposedEditCount = useMemo(() => {
    if (!editor || proposedEdits.length === 0) return 0;
    return proposedEdits.filter((edit) =>
      locateProposedEditInDoc(editor.state.doc, edit),
    ).length;
    // plainText tracks document changes; proposedEditsKey tracks the list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, proposedEditsKey, plainText]);

  async function resolveProposedEditInline(
    edit: DocumentProposedEdit,
    action: "accept" | "reject",
  ) {
    if (!editor || !onResolveProposedEdit || trackBusy) return;
    setTrackBusy(true);
    setError(null);
    try {
      await onResolveProposedEdit(edit.id, action);
      if (action === "accept") {
        const applied = applyProposedEditToEditor(editor, edit);
        if (!applied) {
          setTrackNotice(
            "Accepted on the record. The text could not be applied in place " +
              "here — it lands when the final redline is decided.",
          );
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setTrackBusy(false);
    }
  }

  // "Accept all" / "Reject all" still resolve one edit at a time so each
  // decision lands as its own audit row — and they only touch edits the
  // user can SEE inline (anchored). Unanchored edits stay pending in the
  // suggested-edits rail; one click never decides an unseen change. The
  // anchor is re-checked per iteration because applying one edit can
  // unanchor the next.
  async function resolveAllProposedEdits(action: "accept" | "reject") {
    if (!editor || !onResolveProposedEdit || trackBusy) return;
    setTrackBusy(true);
    setError(null);
    try {
      for (const edit of [...proposedEdits]) {
        if (!locateProposedEditInDoc(editor.state.doc, edit)) continue;
        await onResolveProposedEdit(edit.id, action);
        if (action === "accept") {
          const applied = applyProposedEditToEditor(editor, edit);
          if (!applied) {
            setTrackNotice(
              "Some accepted changes could not be applied in place — they " +
                "land when the final redline is decided.",
            );
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setTrackBusy(false);
    }
  }

  trackHandlersRef.current = {
    resolve: (edit, action) => void resolveProposedEditInline(edit, action),
  };

  return {
    redlinesVisible,
    setRedlinesVisible,
    trackBusy,
    trackNotice,
    anchoredProposedEditCount,
    resolveAllProposedEdits,
  };
}

export function useClipboardActions({
  editor,
  plainText,
  selectedQuote,
  filename,
}: {
  editor: Editor | null;
  plainText: string;
  selectedQuote?: string;
  filename: string;
}) {
  const [copiedMessage, setCopiedMessage] = useState<string | null>(null);

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

  function insertEditorImageUrl() {
    if (!editor) return;
    const src = window.prompt("Paste image URL");
    if (src === null) return;
    const trimmed = src.trim();
    if (!trimmed) return;
    const alt = window.prompt("Image description", "")?.trim() ?? "";
    editor.chain().focus().setImage({ src: trimmed, alt }).run();
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

  return {
    copiedMessage,
    copyWorkingText,
    copySelectedQuote,
    copyEditorSelection,
    highlightEditorSelection,
    setEditorLink,
    insertEditorImageUrl,
    downloadWorkingText,
  };
}
