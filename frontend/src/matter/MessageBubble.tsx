import type {
  AssistantMessage,
  ChronologyEvent,
  MatterDocument,
  SuggestedAction,
} from "../lib/api";

// Shared message renderer for matter assistant surfaces.
//
// Shape rules (from chat redesign brief, 2026-05-19):
// - User: right-aligned, bg-wash + border, ink text. Never bg-ink (reserved for primary actions).
// - Assistant: left-aligned, plain prose. Per-turn metadata line in mono muted.
// - Citations: small bordered chips BELOW the assistant paragraph (not inline).
// - Suggestions: compact outline buttons below the assistant paragraph.

const MODEL_LABEL = "Claude Sonnet 4.6";

interface Props {
  message: AssistantMessage;
  docs: MatterDocument[] | null;
  chronology: ChronologyEvent[];
  // Source-anchor callbacks. The doc callback receives the
  // document_id from the citation so the chat surface can route
  // straight to that document, not just to the Documents tab.
  onDocChip: (documentId: string) => void;
  onChronChip: (eventId: string) => void;
  onAction?: (a: SuggestedAction) => void;
  onSources?: (message: AssistantMessage) => void;
  onVersions?: (message: AssistantMessage) => void;
  onRecord?: (message: AssistantMessage) => void;
  compact?: boolean;
}

export function MessageBubble({
  message,
  docs,
  chronology,
  onDocChip,
  onChronChip,
  onAction,
  onSources,
  onVersions,
  onRecord,
  compact = false,
}: Props) {
  const isUser = message.role === "user";
  if (isUser) return <UserMessage content={message.content} compact={compact} />;
  return (
    <AssistantMessageView
      message={message}
      docs={docs}
      chronology={chronology}
      onDocChip={onDocChip}
      onChronChip={onChronChip}
      onAction={onAction}
      onSources={onSources}
      onVersions={onVersions}
      onRecord={onRecord}
      compact={compact}
    />
  );
}

function UserMessage({ content, compact }: { content: string; compact: boolean }) {
  const cls = compact
    ? "max-w-[90%] bg-wash border border-rule px-3 py-2 text-xs text-ink whitespace-pre-wrap leading-relaxed"
    : "max-w-[560px] bg-wash border border-rule px-4 py-3 text-sm text-ink whitespace-pre-wrap leading-relaxed";
  return (
    <div className="flex justify-end">
      <div className={cls}>{content}</div>
    </div>
  );
}

function AssistantMessageView({
  message,
  docs,
  chronology,
  onDocChip,
  onChronChip,
  onAction,
  onSources,
  onVersions,
  onRecord,
  compact,
}: Props) {
  const { text, citations } = extractCitations(message.content, docs, chronology);
  const sourceCount = citations.length;
  const hasActions = message.suggested_actions.length > 0;
  const hasActionCard = !compact && (sourceCount > 0 || hasActions);
  const metaSizing = compact ? "text-[10px]" : "text-[11px]";
  const proseSizing = compact ? "text-xs" : "text-[15px]";

  return (
    <div className="flex justify-start">
      <div
        className={
          (compact
            ? "max-w-full"
            : "w-full border-l-2 border-rule bg-paper px-4 py-3") +
          " flex flex-col gap-2"
        }
      >
        <div className={`font-mono ${metaSizing} text-muted`}>
          Assistant{compact ? "" : ` · ${MODEL_LABEL}`}
          {!compact && sourceCount > 0
            ? ` · ${sourceCount} source${sourceCount === 1 ? "" : "s"}`
            : ""}
          {" · recorded in Record"}
        </div>
        <div className={`${proseSizing} text-ink leading-relaxed whitespace-pre-wrap`}>
          {text}
        </div>
        {citations.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {citations.map((c, i) => (
              <button
                key={`${c.kind}-${c.id}-${i}`}
                type="button"
                onClick={() =>
                  c.kind === "doc" ? onDocChip(c.id) : onChronChip(c.id)
                }
                title={c.full}
                className={`inline-flex items-center border border-rule bg-paper text-ink px-2 py-0.5 font-mono ${
                  compact ? "text-[10px]" : "text-[11px]"
                } hover:border-ink transition-colors`}
              >
                <span className="text-muted">
                  {c.kind === "doc" ? "Document" : "Event"}
                </span>
                <span className="text-muted mx-1" aria-hidden>{"·"}</span>
                <span>{c.label}</span>
              </button>
            ))}
          </div>
        )}
        {!compact && message.suggested_actions.length > 0 && onAction && !hasActionCard && (
          <div className="flex flex-wrap gap-2 pt-1">
            {message.suggested_actions.map((a, i) => (
              <button
                key={`${a.type}-${i}`}
                type="button"
                onClick={() => onAction(a)}
                className="border border-rule text-ink bg-paper px-3 py-1.5 text-xs font-medium hover:border-ink transition-colors"
              >
                {a.label}
              </button>
            ))}
          </div>
        )}
        {hasActionCard && (
          <AssistantActionCard
            message={message}
            citations={citations}
            onDocChip={onDocChip}
            onAction={onAction}
            onSources={onSources}
            onVersions={onVersions}
            onRecord={onRecord}
          />
        )}
      </div>
    </div>
  );
}

function AssistantActionCard({
  message,
  citations,
  onDocChip,
  onAction,
  onSources,
  onVersions,
  onRecord,
}: {
  message: AssistantMessage;
  citations: Citation[];
  onDocChip: (documentId: string) => void;
  onAction?: (a: SuggestedAction) => void;
  onSources?: (message: AssistantMessage) => void;
  onVersions?: (message: AssistantMessage) => void;
  onRecord?: (message: AssistantMessage) => void;
}) {
  const firstDoc = citations.find((citation) => citation.kind === "doc");
  const primaryAction = message.suggested_actions[0] ?? null;
  const cardTitle = primaryAction
    ? primaryAction.label
    : firstDoc
      ? "Document answer"
      : "Matter answer";
  const cardKind = primaryAction ? actionKindLabel(primaryAction.type) : "Answer";

  return (
    <div className="mt-2 border border-rule bg-paper-sunken p-3" data-testid="assistant-action-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-track2 text-muted">
            {cardKind}
          </p>
          <h3 className="mt-1 text-sm font-semibold text-ink">{cardTitle}</h3>
          <p className="mt-1 text-xs leading-5 text-muted">
            {citations.length > 0
              ? `${citations.length} source${citations.length === 1 ? "" : "s"} attached to this turn.`
              : "No source document was attached to this turn."}
          </p>
        </div>
        <span className="border border-rule bg-paper px-2 py-1 text-[10px] font-semibold uppercase tracking-track2 text-muted">
          Draft
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {firstDoc && (
          <button
            type="button"
            onClick={() => onDocChip(firstDoc.id)}
            className="border border-ink bg-ink px-3 py-1.5 text-xs font-medium text-paper hover:bg-black"
          >
            Open document
          </button>
        )}
        {primaryAction && onAction && (
          <button
            type="button"
            onClick={() => onAction(primaryAction)}
            className="border border-rule bg-paper px-3 py-1.5 text-xs font-medium text-ink hover:border-ink"
          >
            Run action
          </button>
        )}
        {citations.length > 0 && onSources && (
          <button
            type="button"
            onClick={() => onSources(message)}
            className="border border-rule bg-paper px-3 py-1.5 text-xs font-medium text-ink hover:border-ink"
          >
            Sources
          </button>
        )}
        {firstDoc && onVersions && (
          <button
            type="button"
            onClick={() => onVersions(message)}
            className="border border-rule bg-paper px-3 py-1.5 text-xs font-medium text-ink hover:border-ink"
          >
            Versions
          </button>
        )}
        {onRecord && (
          <button
            type="button"
            onClick={() => onRecord(message)}
            className="border border-rule bg-paper px-3 py-1.5 text-xs font-medium text-ink hover:border-ink"
          >
            Record
          </button>
        )}
      </div>
    </div>
  );
}

function actionKindLabel(type: SuggestedAction["type"]): string {
  switch (type) {
    case "run_pre_motion":
      return "Pre-motion";
    case "draft_letter":
      return "Draft letter";
    case "review_contract":
      return "Review";
    case "anonymise_document":
      return "Anonymise";
    case "view_document":
      return "Document";
    case "view_audit":
      return "Record";
    case "view_chronology":
      return "Chronology";
  }
}

// -- Citation extraction ---------------------------------------------------

// Citations carry the entity ID (UUID or kebab/dotted slug), never the title.
const CITATION_RE = /\[(doc|chron):([A-Za-z0-9_.\-]+)\]/g;

interface Citation {
  kind: "doc" | "chron";
  id: string;
  label: string;
  full: string;
}

function extractCitations(
  content: string,
  docs: MatterDocument[] | null,
  chronology: ChronologyEvent[],
): { text: string; citations: Citation[] } {
  const docLabel = new Map<string, string>();
  const docFull = new Map<string, string>();
  for (const d of docs ?? []) {
    const full = d.filename || d.id;
    docFull.set(d.id, full);
    // Keep full filename (with extension) on the chip; ID stays in tooltip.
    docLabel.set(d.id, full);
  }
  const chronLabel = new Map<string, string>();
  const chronFull = new Map<string, string>();
  for (const e of chronology) {
    chronFull.set(e.id, `${e.event_date}: ${e.description || e.id}`);
    chronLabel.set(e.id, formatHumanDate(e.event_date));
  }

  const citations: Citation[] = [];
  const seen = new Set<string>();
  // Strip citation markers from inline text. Sources show as chips below.
  const text = content.replace(CITATION_RE, "").replace(/[ \t]+([.,;:!?])/g, "$1").replace(/[ \t]{2,}/g, " ").trim();

  let m: RegExpExecArray | null;
  CITATION_RE.lastIndex = 0;
  while ((m = CITATION_RE.exec(content)) !== null) {
    const kind = m[1] as "doc" | "chron";
    const id = m[2];
    const key = `${kind}:${id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const lookup = kind === "doc" ? docLabel.get(id) : chronLabel.get(id);
    const full = kind === "doc" ? docFull.get(id) ?? id : chronFull.get(id) ?? id;
    citations.push({
      kind,
      id,
      label: lookup ?? id.slice(0, 12),
      full,
    });
  }
  return { text, citations };
}

const HUMAN_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatHumanDate(iso: string): string {
  if (!iso) return iso;
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return iso;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!year || !month || !day || month < 1 || month > 12) return iso;
  return `${day} ${HUMAN_MONTHS[month - 1]} ${year}`;
}

// -- Inline agent status (during streaming) --------------------------------

// Small, narrow, understated. Not a card.
// Renders: `Working...  ✓ Read X  ✓ Checked Y  • Drafting answer`
export interface InlineAgentStep {
  label: string;
  status: "complete" | "running" | "pending";
}

export function InlineAgentStatus({ steps, compact = false }: { steps?: InlineAgentStep[]; compact?: boolean }) {
  const text = compact ? "text-[10px]" : "text-xs";
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 font-mono ${text} text-muted`}>
      <span className="text-prose">Working...</span>
      {(steps ?? []).map((s, i) => (
        <span key={i} className="inline-flex items-center gap-1">
          {s.status === "complete" && <CheckMark />}
          {s.status === "running" && <span className="text-prose">{"•"}</span>}
          {s.status === "pending" && <span className="text-muted">{"◦"}</span>}
          <span className={s.status === "complete" ? "text-prose" : "text-muted"}>{s.label}</span>
        </span>
      ))}
    </div>
  );
}

function CheckMark() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#00A35C" strokeWidth="3" strokeLinecap="square" strokeLinejoin="miter" aria-hidden>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
