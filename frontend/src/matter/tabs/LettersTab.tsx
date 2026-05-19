import type {
  LetterCatalogue,
  LetterDraft,
  Matter,
} from "../../lib/api";
import { Badge, EmptyState, ErrorCallout, LoadingLine, ProviderKeyMissingBanner } from "../../ui/primitives";

export function LettersTab({
  matter,
  catalogue,
  selected,
  onSelect,
  drafting,
  error,
  keyMissingProvider,
  draft,
  onDraft,
  docxBusy,
  docxError,
  onDownloadDocx,
}: {
  matter: Matter;
  catalogue: LetterCatalogue | null;
  selected: string | null;
  onSelect: (id: string) => void;
  drafting: boolean;
  error: string | null;
  keyMissingProvider?: string | null;
  draft: LetterDraft | null;
  onDraft: () => void;
  docxBusy: boolean;
  docxError: string | null;
  onDownloadDocx: () => void;
}) {
  const blocked = matter.privilege_posture === "C_paused";

  if (!catalogue) return <LoadingLine label="loading letter catalogue" />;

  return (
    <div className="max-w-4xl">
      {catalogue.letter_types.length === 0 && (
        <EmptyState
          title="No letter skills mapped"
          body={`No letter skills are registered for matter_type=${catalogue.matter_type}.`}
        />
      )}

      {catalogue.letter_types.length > 0 && (
        <>
          <div className="border-t border-rule mb-6">
            {catalogue.letter_types.map((lt) => {
              const active = selected === lt.id;
              return (
                <button
                  key={lt.id}
                  onClick={() => onSelect(lt.id)}
                  className={
                    "w-full text-left px-4 py-4 border-b border-rule last:border-b-0 block " +
                    (active
                      ? "bg-wash text-ink border-l-2 border-l-ink -ml-[2px] pl-[18px]"
                      : "hover:bg-wash")
                  }
                >
                  <div className="flex flex-wrap items-center gap-3 mb-1">
                    <span className="text-sm font-semibold text-ink">{lt.label}</span>
                    {lt.is_default && <Badge>DEFAULT</Badge>}
                    <span className="font-mono text-xs text-muted ml-auto">
                      {lt.plugin}/{lt.skill}
                    </span>
                  </div>
                  <p className="text-sm text-prose leading-relaxed">{lt.summary}</p>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-4 mb-6">
            <button
              onClick={onDraft}
              disabled={drafting || blocked || !selected}
              className="bg-ink text-paper px-4 py-2 hover:bg-black transition-colors text-sm font-medium min-h-[44px] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {drafting ? "Drafting…" : draft ? "Re-draft letter" : "Draft letter"}
            </button>
            {blocked && (
              <span className="text-sm text-muted">
                Privilege posture C_paused blocks LLM calls.
              </span>
            )}
          </div>

          {keyMissingProvider && <ProviderKeyMissingBanner provider={keyMissingProvider} />}
          {error && <ErrorCallout message={error} compact />}

          {draft && (
            <div className="border border-rule">
              <div className="border-b border-rule px-4 py-3 flex flex-wrap items-center justify-between gap-4 bg-paper">
                <div className="flex items-center gap-4">
                  <span className="eyebrow">Draft</span>
                  <span className="font-mono text-xs text-ink">{draft.letter_type}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs text-muted">
                    {draft.model_used} · {draft.token_count} tok ·{" "}
                    {(draft.latency_ms / 1000).toFixed(1)}s
                  </span>
                  <button
                    onClick={onDownloadDocx}
                    disabled={docxBusy}
                    className="border border-rule hover:border-ink text-ink px-3 py-1.5 hover:bg-wash transition-colors text-xs font-medium min-h-[36px] disabled:opacity-40"
                  >
                    {docxBusy ? "Rendering…" : "Download .docx"}
                  </button>
                </div>
              </div>
              <pre className="p-6 font-sans text-base leading-[1.7] text-ink whitespace-pre-wrap">
                {draft.draft_markdown}
              </pre>
              {docxError && (
                <div className="border-t border-rule p-4">
                  <ErrorCallout message={docxError} compact />
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
