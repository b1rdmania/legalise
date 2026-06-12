// Presentational panels for the document editor: find bar, redlines bar,
// selection ribbon, draft notices, working-diff preview, review map, side
// rail and the selection bubble menu. All markup, class strings and
// test ids are verbatim from the pre-split DocumentRichEditor.tsx
// (Fluff C3); every callback and value arrives via props so state and
// behaviour stay in the parent.
import type { KeyboardEvent as ReactKeyboardEvent, RefObject } from "react";
import type { Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";

import {
  selectedEditorText,
  type DocumentLocalDraft,
} from "./editorText";
import type { DocumentNoteHighlight } from "./reviewNotes";
import { renderWorkingDiffParts, type WorkingDiffPart } from "./editorChrome";

export function FindPanel({
  documentId,
  findInputRef,
  findQuery,
  setFindQuery,
  onFindKeyDown,
  matchCount,
  moveFind,
  findPositionLabel,
  findPreview,
}: {
  documentId: string;
  findInputRef: RefObject<HTMLInputElement | null>;
  findQuery: string;
  setFindQuery: (value: string) => void;
  onFindKeyDown: (event: ReactKeyboardEvent<HTMLInputElement>) => void;
  matchCount: number;
  moveFind: (direction: 1 | -1) => void;
  findPositionLabel: string | null;
  findPreview: string | null;
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-3 border-t border-rule bg-paper px-4 py-2.5"
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
        onKeyDown={onFindKeyDown}
        placeholder="Search this document"
        className="min-h-[34px] min-w-[220px] flex-1 border border-rule bg-paper-sunken px-3 text-sm outline-none focus:border-ink"
      />
      <span className="text-xs text-muted" data-testid="document-editor-find-count">
        {findQuery.trim().length >= 3
          ? `${matchCount} match${matchCount === 1 ? "" : "es"}`
          : "Type 3+ characters"}
      </span>
      <button
        type="button"
        onClick={() => moveFind(-1)}
        disabled={matchCount === 0}
        className="border border-rule px-2 py-1 text-xs text-muted hover:border-ink hover:text-ink disabled:opacity-40"
      >
        Previous
      </button>
      <button
        type="button"
        onClick={() => moveFind(1)}
        disabled={matchCount === 0}
        className="border border-rule px-2 py-1 text-xs text-muted hover:border-ink hover:text-ink disabled:opacity-40"
      >
        Next
      </button>
      {matchCount > 0 && (
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
  );
}

export function RedlinesPanel({
  proposedEditCount,
  anchoredProposedEditCount,
  trackNotice,
  trackBusy,
  canResolve,
  onResolveAll,
}: {
  proposedEditCount: number;
  anchoredProposedEditCount: number;
  trackNotice: string | null;
  trackBusy: boolean;
  canResolve: boolean;
  onResolveAll: (action: "accept" | "reject") => Promise<void>;
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-3 border-t border-rule bg-paper px-4 py-2 text-xs text-muted"
      data-testid="document-editor-redlines-panel"
    >
      <span>
        {proposedEditCount} proposed change
        {proposedEditCount === 1 ? "" : "s"}
        {anchoredProposedEditCount < proposedEditCount
          ? ` · ${proposedEditCount - anchoredProposedEditCount} not anchored in this text — review in the suggested-edits list`
          : ""}
        {trackNotice ? ` · ${trackNotice}` : ""}
      </span>
      <span className="ml-auto flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => void onResolveAll("accept")}
          disabled={trackBusy || !canResolve}
          className="inline-flex h-7 items-center rounded-item border border-ink bg-ink px-2.5 text-xs text-paper hover:bg-seal disabled:border-rule disabled:bg-paper-sunken disabled:text-muted"
        >
          {trackBusy ? "Working…" : "Accept all"}
        </button>
        <button
          type="button"
          onClick={() => void onResolveAll("reject")}
          disabled={trackBusy || !canResolve}
          className="inline-flex h-7 items-center rounded-item border border-rule bg-paper px-2.5 text-xs text-muted hover:border-seal hover:text-seal disabled:opacity-40"
        >
          Reject all
        </button>
      </span>
    </div>
  );
}

export function SelectionRibbon({
  selectedQuote,
  onCopySelectedQuote,
  onFindInDocument,
  onCreateNoteFromSelection,
  onRunSkillFromSelection,
}: {
  selectedQuote: string;
  onCopySelectedQuote: () => Promise<void>;
  onFindInDocument: () => void;
  onCreateNoteFromSelection?: () => void;
  onRunSkillFromSelection?: () => void;
}) {
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 border-b border-ink bg-paper px-5 py-3"
      data-testid="document-editor-selection-ribbon"
    >
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-track2 text-ink">
          Selected passage
        </p>
        <p className="mt-1 max-w-3xl truncate text-sm text-muted">{selectedQuote}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void onCopySelectedQuote()}
          className="border border-rule px-3 py-2 text-xs font-semibold text-ink hover:border-ink"
        >
          Copy
        </button>
        <button
          type="button"
          onClick={onFindInDocument}
          className="border border-rule px-3 py-2 text-xs font-semibold text-ink hover:border-ink"
        >
          Find in document
        </button>
        {onCreateNoteFromSelection && (
          <button
            type="button"
            onClick={onCreateNoteFromSelection}
            className="border border-ink bg-ink px-3 py-2 text-xs font-semibold text-paper hover:bg-seal"
          >
            Add review note
          </button>
        )}
        {onRunSkillFromSelection && (
          <button
            type="button"
            onClick={onRunSkillFromSelection}
            className="border border-ink bg-paper px-3 py-2 text-xs font-semibold text-ink hover:bg-paper-sunken"
          >
            Run skill
          </button>
        )}
      </div>
    </div>
  );
}

export function DraftNotices({
  draftSaveError,
  draftConflict,
  onReloadAfterError,
  remoteDraftNotice,
  onReloadAfterNotice,
  originalImportState,
  localDraft,
  onRestoreLocalDraft,
  onDiscardLocalDraft,
}: {
  draftSaveError: boolean;
  draftConflict: string | null;
  onReloadAfterError: () => void;
  remoteDraftNotice: string | null;
  onReloadAfterNotice: () => void;
  originalImportState: "idle" | "loading" | "ready" | "error";
  localDraft: DocumentLocalDraft | null;
  onRestoreLocalDraft: () => void;
  onDiscardLocalDraft: () => void;
}) {
  return (
    <>
      {draftSaveError && (
        <div
          className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-300 bg-amber-50 px-5 py-2 text-xs leading-5 text-amber-900"
          data-testid="document-server-draft-error"
        >
          <span>
            {draftConflict ??
              "Shared draft could not be saved. The browser copy is preserved locally; try saving again before leaving this file."}
          </span>
          <button
            type="button"
            onClick={onReloadAfterError}
            className="border border-amber-900 bg-paper px-3 py-1.5 text-xs font-semibold text-amber-950 hover:bg-amber-100"
          >
            Reload shared draft
          </button>
        </div>
      )}
      {remoteDraftNotice && (
        <div
          className="flex flex-wrap items-center justify-between gap-3 border-b border-rule bg-paper-sunken px-5 py-2 text-xs leading-5 text-muted"
          data-testid="document-remote-draft-notice"
        >
          <span>{remoteDraftNotice}</span>
          <button
            type="button"
            onClick={onReloadAfterNotice}
            className="border border-rule bg-paper px-3 py-1.5 text-xs font-semibold text-ink hover:border-ink"
          >
            Reload shared draft
          </button>
        </div>
      )}
      {originalImportState === "loading" && (
        <p className="border-b border-rule bg-paper-sunken px-5 py-2 text-xs text-muted">
          Importing Word structure into the editable working copy...
        </p>
      )}
      {originalImportState === "ready" && (
        <p
          className="border-b border-rule bg-paper-sunken px-5 py-2 text-xs text-muted"
          data-testid="document-word-import-ready"
        >
          Word structure imported into the shared draft. Save a version when the edit is ready.
        </p>
      )}
      {originalImportState === "error" && (
        <p
          className="border-b border-amber-300 bg-amber-50 px-5 py-2 text-xs leading-5 text-amber-900"
          data-testid="document-word-import-fallback"
        >
          Word structure could not be imported here, so the editor is using extracted text.
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
              onClick={onRestoreLocalDraft}
              className="border border-ink bg-paper px-3 py-1.5 text-xs font-semibold text-ink hover:bg-ink hover:text-paper"
            >
              Restore draft
            </button>
            <button
              type="button"
              onClick={onDiscardLocalDraft}
              className="border border-rule bg-paper px-3 py-1.5 text-xs font-semibold text-muted hover:border-ink hover:text-ink"
            >
              Discard
            </button>
          </span>
        </div>
      )}
    </>
  );
}

export function WorkingDiffPanel({
  workingDiffParts,
  insertedChars,
  deletedChars,
}: {
  workingDiffParts: WorkingDiffPart[];
  insertedChars: number;
  deletedChars: number;
}) {
  return (
    <div
      className="border-b border-rule bg-paper px-5 py-3"
      data-testid="document-working-diff"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-track2 text-muted">
            Unsaved changes
          </p>
          <p className="mt-1 text-sm text-ink">
            Review the working copy before saving it as a new document version.
          </p>
        </div>
        <dl className="flex flex-wrap gap-2 text-xs">
          <div className="border border-rule bg-paper-sunken px-3 py-2">
            <dt className="tech-token uppercase tracking-track2 text-muted">Added</dt>
            <dd className="mt-1 font-semibold text-green-900">
              {insertedChars.toLocaleString()} chars
            </dd>
          </div>
          <div className="border border-rule bg-paper-sunken px-3 py-2">
            <dt className="tech-token uppercase tracking-track2 text-muted">Removed</dt>
            <dd className="mt-1 font-semibold text-red-900">
              {deletedChars.toLocaleString()} chars
            </dd>
          </div>
        </dl>
      </div>
      <details className="mt-3 border border-rule bg-paper-sunken">
        <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-ink">
          Preview redline before saving
        </summary>
        <div className="max-h-[260px] overflow-auto border-t border-rule bg-paper p-4 text-sm leading-7">
          {renderWorkingDiffParts(workingDiffParts)}
        </div>
      </details>
    </div>
  );
}

export type NoteAnchorSummary = DocumentNoteHighlight & { located: boolean };

export function ReviewMapPanel({
  noteAnchorSummaries,
  locatedNoteCount,
  onJumpToNote,
}: {
  noteAnchorSummaries: NoteAnchorSummary[];
  locatedNoteCount: number;
  onJumpToNote: (quote: string) => void;
}) {
  return (
    <div
      className="border-b border-rule bg-paper px-5 py-3"
      data-testid="document-editor-review-map"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-track2 text-muted">
            Review map
          </p>
          <p className="mt-1 text-sm text-ink">
            {locatedNoteCount} of {noteAnchorSummaries.length} note anchor
            {noteAnchorSummaries.length === 1 ? "" : "s"} located in this working copy.
          </p>
        </div>
        <span className="border border-rule bg-paper-sunken px-2 py-1 text-[11px] font-semibold uppercase tracking-track2 text-muted">
          Anchored notes
        </span>
      </div>
      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        {noteAnchorSummaries.map((note) => (
          <button
            key={note.id}
            type="button"
            onClick={() => onJumpToNote(note.quote)}
            className={`min-w-[220px] max-w-[280px] border px-3 py-2 text-left text-xs leading-5 ${
              note.located
                ? "border-ink bg-paper text-ink"
                : "border-amber-300 bg-amber-50 text-amber-950"
            }`}
          >
            <span className="block font-semibold">{note.label}</span>
            <span className="mt-1 block max-h-10 overflow-hidden text-muted">
              {note.quote}
            </span>
            <span className="mt-2 block tech-token uppercase tracking-track2">
              {note.located ? "Located" : "Not located"}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function EditorSideRail({
  sourceHighlight,
  sourceLocated,
  selectedQuote,
  selectedQuoteAnchored,
  onCopySelectedQuote,
  onCreateNoteFromSelection,
  noteHighlights,
  outlineItems,
  onFind,
}: {
  sourceHighlight?: string | null;
  sourceLocated: boolean;
  selectedQuote?: string;
  selectedQuoteAnchored?: boolean;
  onCopySelectedQuote: () => Promise<void>;
  onCreateNoteFromSelection?: () => void;
  noteHighlights: DocumentNoteHighlight[];
  outlineItems: { id: string; label: string; query: string }[];
  onFind: (query: string) => void;
}) {
  return (
    <aside className="border-b border-rule bg-paper px-5 py-5 lg:border-b-0 lg:border-r">
      <div className="space-y-5">
        {sourceHighlight && (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-track2 text-muted">
              Source passage
            </p>
            <p className="mt-2 text-sm leading-6 text-muted">
              {sourceLocated ? "Located in this version." : "Not located in this version."}
            </p>
            <button
              type="button"
              onClick={() => onFind(sourceHighlight)}
              className="mt-2 text-xs font-medium text-ink underline underline-offset-4 hover:text-muted"
            >
              Search cited text
            </button>
          </div>
        )}
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
            <button
              type="button"
              onClick={() => void onCopySelectedQuote()}
              className="mt-3 w-full border border-rule px-3 py-2 text-xs font-semibold text-ink hover:border-ink"
            >
              Copy passage
            </button>
            {onCreateNoteFromSelection && (
              <button
                type="button"
                onClick={onCreateNoteFromSelection}
                className="mt-2 w-full border border-ink bg-ink px-3 py-2 text-xs font-semibold text-paper hover:bg-seal"
              >
                Add review note
              </button>
            )}
          </div>
        )}
        {noteHighlights.length > 0 && (
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
                  onClick={() => onFind(note.quote)}
                  className="block w-full border border-rule bg-paper px-3 py-2 text-left text-xs leading-5 text-muted hover:border-ink hover:text-ink"
                >
                  <span className="block font-medium text-ink">{note.label}</span>
                  <span className="mt-1 block max-h-10 overflow-hidden">{note.quote}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
        )}
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
                  onClick={() => onFind(item.query)}
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
  );
}

export function SelectionBubbleMenu({
  editor,
  onCopyEditorSelection,
  onHighlightSelection,
  onSetLink,
  onCreateNoteFromSelection,
  onRunSkillFromSelection,
}: {
  editor: Editor;
  onCopyEditorSelection: () => Promise<void>;
  onHighlightSelection: () => void;
  onSetLink: () => void;
  onCreateNoteFromSelection?: () => void;
  onRunSkillFromSelection?: () => void;
}) {
  return (
    <BubbleMenu
      editor={editor}
      shouldShow={({ editor: bubbleEditor }) =>
        selectedEditorText(bubbleEditor).length >= 3
      }
      options={{ placement: "top", offset: 8 }}
    >
      <div
        className="flex items-center gap-1 border border-ink bg-paper px-1.5 py-1 shadow-[0_10px_30px_rgba(0,0,0,0.12)]"
        data-testid="document-editor-selection-menu"
      >
        <button
          type="button"
          onClick={() => void onCopyEditorSelection()}
          className="px-2 py-1 text-xs font-semibold text-ink hover:bg-paper-sunken"
        >
          Copy
        </button>
        <button
          type="button"
          onClick={onHighlightSelection}
          className="px-2 py-1 text-xs font-semibold text-ink hover:bg-paper-sunken"
        >
          Highlight
        </button>
        <button
          type="button"
          onClick={onSetLink}
          className="px-2 py-1 text-xs font-semibold text-ink hover:bg-paper-sunken"
        >
          Link
        </button>
        {onCreateNoteFromSelection && (
          <button
            type="button"
            onClick={onCreateNoteFromSelection}
            className="bg-ink px-2 py-1 text-xs font-semibold text-paper hover:bg-seal"
          >
            Add note
          </button>
        )}
        {onRunSkillFromSelection && (
          <button
            type="button"
            onClick={onRunSkillFromSelection}
            className="px-2 py-1 text-xs font-semibold text-ink hover:bg-paper-sunken"
          >
            Run skill
          </button>
        )}
      </div>
    </BubbleMenu>
  );
}
