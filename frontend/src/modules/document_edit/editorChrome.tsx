// Presentational chrome for the document editor: toolbar button
// primitives, the formatting toolbar, and the working-diff redline
// renderer. All markup and class strings are verbatim from the pre-split
// DocumentRichEditor.tsx (Fluff C3); state stays in the parent.
import type { ChangeEvent, RefObject } from "react";
import type { Editor } from "@tiptap/react";

import { buildVersionDiff } from "./VersionDiff";
import { documentStatsFromText } from "./editorText";

export type WorkingDiffPart = ReturnType<typeof buildVersionDiff>[number];

export const EDITOR_TEXT_COLORS = [
  { label: "Ink text", value: "#181818" },
  { label: "Red text", value: "#8C1D18" },
  { label: "Amber text", value: "#8A5A00" },
  { label: "Green text", value: "#236A44" },
  { label: "Blue text", value: "#245B8A" },
] as const;

export function ToolbarButton({
  active,
  children,
  onClick,
  label,
  disabled,
}: {
  active?: boolean;
  children: string;
  onClick: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-8 min-w-8 items-center justify-center rounded-item border px-2 text-sm disabled:cursor-not-allowed disabled:opacity-35 ${
        active
          ? "border-ink bg-ink text-paper"
          : "border-rule bg-paper text-ink hover:border-ink"
      }`}
    >
      {children}
    </button>
  );
}

export function ToolbarGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-1 border-r border-rule pr-2 last:border-r-0 last:pr-0">
      <span className="mr-1 hidden text-[10px] font-semibold uppercase tracking-track2 text-muted xl:inline">
        {label}
      </span>
      {children}
    </div>
  );
}

export function ColorButton({
  active,
  color,
  label,
  onClick,
}: {
  active?: boolean;
  color: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`inline-flex h-8 min-w-8 items-center justify-center rounded-item border bg-paper px-2 ${
        active ? "border-ink" : "border-rule hover:border-ink"
      }`}
    >
      <span
        className="block h-4 w-4 rounded-sm border border-rule"
        style={{ backgroundColor: color }}
        aria-hidden="true"
      />
    </button>
  );
}

export function ViewModeButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-8 items-center rounded-item border px-3 text-xs ${
        active
          ? "border-ink bg-ink text-paper"
          : "border-rule bg-paper text-muted hover:border-ink hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

export function renderWorkingDiffParts(parts: WorkingDiffPart[]) {
  return parts.map((part, index) => {
    if (part.type === "insert") {
      return (
        <ins
          key={`${part.type}-${index}`}
          className="bg-green-100 px-0.5 text-green-950 no-underline"
        >
          {part.text}
        </ins>
      );
    }
    if (part.type === "delete") {
      return (
        <del
          key={`${part.type}-${index}`}
          className="bg-red-100 px-0.5 text-red-950"
        >
          {part.text}
        </del>
      );
    }
    return <span key={`${part.type}-${index}`}>{part.text}</span>;
  });
}

export function FormatToolbar({
  editor,
  imageInputRef,
  uploadingImage,
  onImageUpload,
  onSetLink,
  onInsertImageUrl,
}: {
  editor: Editor | null;
  imageInputRef: RefObject<HTMLInputElement | null>;
  uploadingImage: boolean;
  onImageUpload: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  onSetLink: () => void;
  onInsertImageUrl: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-rule px-4 py-2">
      {editor && (
        <>
          <ToolbarGroup label="Style">
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
          </ToolbarGroup>
          <ToolbarGroup label="Text">
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
              label="Link"
              active={editor.isActive("link")}
              onClick={onSetLink}
            >
              Link
            </ToolbarButton>
            <ToolbarButton
              label="Remove link"
              disabled={!editor.isActive("link")}
              onClick={() =>
                editor.chain().focus().extendMarkRange("link").unsetLink().run()
              }
            >
              Unlink
            </ToolbarButton>
          </ToolbarGroup>
          <ToolbarGroup label="Colour">
            {EDITOR_TEXT_COLORS.map((color) => (
              <ColorButton
                key={color.value}
                label={color.label}
                color={color.value}
                active={editor.isActive("textStyle", { color: color.value })}
                onClick={() => editor.chain().focus().setColor(color.value).run()}
              />
            ))}
            <ToolbarButton
              label="Remove text colour"
              disabled={!editor.isActive("textStyle")}
              onClick={() => editor.chain().focus().unsetColor().run()}
            >
              Clear
            </ToolbarButton>
          </ToolbarGroup>
          <ToolbarGroup label="Align">
            <ToolbarButton
              label="Align left"
              active={editor.isActive({ textAlign: "left" })}
              onClick={() => editor.chain().focus().setTextAlign("left").run()}
            >
              L
            </ToolbarButton>
            <ToolbarButton
              label="Align centre"
              active={editor.isActive({ textAlign: "center" })}
              onClick={() => editor.chain().focus().setTextAlign("center").run()}
            >
              C
            </ToolbarButton>
            <ToolbarButton
              label="Align right"
              active={editor.isActive({ textAlign: "right" })}
              onClick={() => editor.chain().focus().setTextAlign("right").run()}
            >
              R
            </ToolbarButton>
          </ToolbarGroup>
          <ToolbarGroup label="Lists">
            <ToolbarButton
              label="Bullet list"
              active={editor.isActive("bulletList")}
              onClick={() => editor.chain().focus().toggleBulletList().run()}
            >
              •
            </ToolbarButton>
            <ToolbarButton
              label="Numbered list"
              active={editor.isActive("orderedList")}
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
            >
              1.
            </ToolbarButton>
            <ToolbarButton
              label="Checklist"
              active={editor.isActive("taskList")}
              onClick={() => editor.chain().focus().toggleTaskList().run()}
            >
              ☑
            </ToolbarButton>
          </ToolbarGroup>
          <ToolbarGroup label="Media">
            <input
              ref={imageInputRef}
              data-testid="document-image-upload-input"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={(event) => void onImageUpload(event)}
            />
            <ToolbarButton
              label={uploadingImage ? "Uploading image" : "Upload image"}
              disabled={uploadingImage}
              onClick={() => imageInputRef.current?.click()}
            >
              Up
            </ToolbarButton>
            <ToolbarButton
              label="Insert image URL"
              onClick={onInsertImageUrl}
            >
              Img
            </ToolbarButton>
          </ToolbarGroup>
          <ToolbarGroup label="Table">
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
            {!editor.isActive("table") && (
              <ToolbarButton
                label="Add row"
                disabled
                onClick={() => editor.chain().focus().addRowAfter().run()}
              >
                +R
              </ToolbarButton>
            )}
          </ToolbarGroup>
        </>
      )}
      <span className="ml-auto text-xs text-muted">Formatting tools</span>
    </div>
  );
}

export function CommandBarRow({
  canvasMode,
  onSetCanvasMode,
  formatOpen,
  onToggleFormat,
  findOpen,
  onToggleFind,
  proposedEditCount,
  redlinesVisible,
  onToggleRedlines,
  draftSaveError,
  dirty,
  editorStatusLabel,
  sourceLabel,
  onSave,
  canSave,
  saving,
  onSaveAndDownloadDocx,
  canDownloadDocx,
  downloadingDocx,
  onCopyWorkingText,
  onDownloadWorkingText,
  plainText,
  onReset,
}: {
  canvasMode: "page" | "wide";
  onSetCanvasMode: (mode: "page" | "wide") => void;
  formatOpen: boolean;
  onToggleFormat: () => void;
  findOpen: boolean;
  onToggleFind: () => void;
  proposedEditCount: number;
  redlinesVisible: boolean;
  onToggleRedlines: () => void;
  draftSaveError: boolean;
  dirty: boolean;
  editorStatusLabel: string;
  sourceLabel: string;
  onSave: () => Promise<unknown>;
  canSave: boolean;
  saving: boolean;
  onSaveAndDownloadDocx: () => Promise<void>;
  canDownloadDocx: boolean;
  downloadingDocx: boolean;
  onCopyWorkingText: () => Promise<void>;
  onDownloadWorkingText: () => void;
  plainText: string;
  onReset: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 px-4 py-2.5 text-[13px]">
      <div
        className="flex items-center gap-1 border-r border-rule pr-2"
        aria-label="Document view"
        data-testid="document-editor-view-mode"
      >
        <ViewModeButton active={canvasMode === "page"} onClick={() => onSetCanvasMode("page")}>
          Page
        </ViewModeButton>
        <ViewModeButton active={canvasMode === "wide"} onClick={() => onSetCanvasMode("wide")}>
          Wide
        </ViewModeButton>
      </div>
      <button
        type="button"
        onClick={onToggleFormat}
        aria-expanded={formatOpen}
        className="inline-flex h-8 items-center rounded-item border border-rule px-3 text-xs text-muted hover:border-ink hover:text-ink"
      >
        Format
      </button>
      <button
        type="button"
        onClick={onToggleFind}
        aria-expanded={findOpen}
        className="inline-flex h-8 items-center rounded-item border border-rule px-3 text-xs text-muted hover:border-ink hover:text-ink"
      >
        Find
      </button>
      {proposedEditCount > 0 && (
        <button
          type="button"
          onClick={onToggleRedlines}
          aria-pressed={redlinesVisible}
          data-testid="document-editor-redlines-toggle"
          className={`inline-flex h-8 items-center rounded-item border px-3 text-xs ${
            redlinesVisible
              ? "border-ink bg-paper text-ink"
              : "border-rule bg-paper text-muted hover:border-ink hover:text-ink"
          }`}
        >
          Redlines ({proposedEditCount})
        </button>
      )}
      <span className="ml-2 inline-flex items-center gap-2 text-xs text-muted">
        <span
          className={`h-2 w-2 rounded-full ${
            draftSaveError
              ? "bg-red-700"
              : dirty
                ? "bg-amber-500"
                : "bg-emerald-700"
          }`}
          aria-hidden="true"
        />
        {editorStatusLabel}
      </span>
      {sourceLabel?.startsWith("Viewing saved version") && (
        <span className="text-xs text-muted">{sourceLabel}</span>
      )}
      <div className="ml-auto flex items-center gap-1.5">
        <button
          type="button"
          onClick={onSave}
          disabled={!canSave}
          className="inline-flex h-8 items-center rounded-item border border-ink bg-ink px-3 text-xs text-paper disabled:border-rule disabled:bg-paper-sunken disabled:text-muted"
        >
          {saving ? "Saving…" : "Save version"}
        </button>
        <details className="relative" data-testid="document-editor-more">
          <summary className="inline-flex h-8 cursor-pointer list-none items-center rounded-item border border-rule px-3 text-xs text-muted hover:border-ink hover:text-ink">
            More
          </summary>
          <div className="absolute right-0 z-20 mt-1 grid min-w-44 gap-1 rounded-card border border-rule bg-paper p-1.5 shadow-panel">
            <button
              type="button"
              onClick={() => void onSaveAndDownloadDocx()}
              disabled={!canDownloadDocx}
              className="inline-flex h-8 items-center rounded-item px-2 text-xs text-ink hover:bg-paper-sunken disabled:text-muted"
            >
              {downloadingDocx ? "Preparing…" : dirty ? "Save & download DOCX" : "Download DOCX"}
            </button>
            <button
              type="button"
              onClick={() => void onCopyWorkingText()}
              disabled={!plainText.trim()}
              className="inline-flex h-8 items-center rounded-item px-2 text-xs text-ink hover:bg-paper-sunken disabled:text-muted"
            >
              Copy text
            </button>
            <button
              type="button"
              onClick={onDownloadWorkingText}
              disabled={!plainText.trim()}
              className="inline-flex h-8 items-center rounded-item px-2 text-xs text-ink hover:bg-paper-sunken disabled:text-muted"
            >
              Download text
            </button>
            <span
              className="inline-flex h-8 items-center px-2 text-xs text-muted"
              data-testid="document-editor-word-count"
            >
              {documentStatsFromText(plainText).words.toLocaleString()} words
            </span>
            <button
              type="button"
              onClick={() => window.print()}
              disabled={!plainText.trim()}
              className="inline-flex h-8 items-center rounded-item px-2 text-xs text-ink hover:bg-paper-sunken disabled:text-muted"
            >
              Print / PDF
            </button>
            <button
              type="button"
              onClick={onReset}
              disabled={!dirty || saving}
              className="inline-flex h-8 items-center rounded-item px-2 text-xs text-ink hover:bg-paper-sunken disabled:text-muted"
            >
              Reset
            </button>
          </div>
        </details>
      </div>
    </div>
  );
}

// Status line for the command bar. Verbatim ternaries from the pre-split
// DocumentRichEditor.tsx (Fluff C3).
export function editorStatusLabelFor({
  dirty,
  draftLoadState,
  draftSaveState,
  serverDraftCounter,
  savedMessage,
  latestVersionNumber,
}: {
  dirty: boolean;
  draftLoadState: "loading" | "ready" | "error";
  draftSaveState: "idle" | "saving" | "saved" | "error";
  serverDraftCounter: number | null;
  savedMessage: string | null;
  latestVersionNumber?: number;
}) {
  const sharedDraftLabel =
    draftLoadState === "loading"
      ? "Loading shared draft"
      : draftSaveState === "saving"
        ? "Saving shared draft"
        : draftSaveState === "saved"
          ? `Shared draft saved${serverDraftCounter !== null ? ` · r${serverDraftCounter}` : ""}`
          : draftSaveState === "error"
            ? "Local fallback active"
            : "Shared draft ready";
  return dirty
    ? sharedDraftLabel
    : savedMessage
      ? savedMessage
      : latestVersionNumber
        ? `Saved v${latestVersionNumber}`
        : "Extracted text";
}
