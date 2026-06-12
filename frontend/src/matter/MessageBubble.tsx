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


function modelLabel(message: AssistantMessage): string | null {
  // The model is a settings choice, not per-message chrome; only the
  // honesty case (no model at all) earns a token in the meta line.
  if (message.model_used === "deterministic-summary") return "extract, no model";
  return null;
}

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
  // rounded-card matches the P21 panel radius — square bubbles read as
  // unfinished against the rounded shell (P29 §2).
  const cls = compact
    ? "max-w-[90%] rounded-card bg-wash border border-rule px-3 py-2 text-xs text-ink whitespace-pre-wrap leading-relaxed"
    : "max-w-[560px] rounded-card bg-wash border border-rule px-4 py-3 text-[15px] text-ink whitespace-pre-wrap leading-relaxed";
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
  const outputKind = outputKindForMessage(message);
  const hasOutputRow = !compact && outputKind !== null;
  const metaSizing = compact ? "text-[10px]" : "text-[11px]";
  const proseSizing = compact ? "text-xs" : "text-[15px]";

  return (
    <div className="flex justify-start">
      {/* P29 §2: assistant turns are plain prose on the panel — no gray
          block, no left border. The output row and chips carry the chrome. */}
      <div className={(compact ? "max-w-full" : "w-full") + " flex flex-col gap-2"}>
        <div className={`tech-token ${metaSizing} text-muted`}>
          Assistant{!compact && modelLabel(message) ? ` · ${modelLabel(message)}` : ""}
          {!compact && sourceCount > 0
            ? ` · ${sourceCount} source${sourceCount === 1 ? "" : "s"}`
            : ""}
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
                className={`inline-flex items-center rounded-item border border-rule bg-paper text-ink px-2 py-0.5 tech-token ${
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
        {!compact && message.suggested_actions.length > 0 && onAction && !hasOutputRow && (
          <div className="flex flex-wrap gap-2 pt-1">
            {message.suggested_actions.map((a, i) => (
              <button
                key={`${a.type}-${i}`}
                type="button"
                onClick={() => onAction(a)}
                className="rounded-item border border-rule text-ink bg-paper px-3 py-1.5 text-xs font-medium hover:border-ink transition-colors"
              >
                {a.label}
              </button>
            ))}
          </div>
        )}
        {hasOutputRow && (
          <AssistantOutputRow
            message={message}
            citations={citations}
            outputKind={outputKind}
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

function AssistantOutputRow({
  message,
  citations,
  outputKind,
  onDocChip,
  onAction,
  onSources,
  onVersions,
  onRecord,
}: {
  message: AssistantMessage;
  citations: Citation[];
  outputKind: OutputKind;
  onDocChip: (documentId: string) => void;
  onAction?: (a: SuggestedAction) => void;
  onSources?: (message: AssistantMessage) => void;
  onVersions?: (message: AssistantMessage) => void;
  onRecord?: (message: AssistantMessage) => void;
}) {
  const firstDoc = citations.find((citation) => citation.kind === "doc");
  const primaryAction = message.suggested_actions.find(
    (action) => !(firstDoc && action.type === "view_document"),
  ) ?? null;
  const summaryTitle = summaryCardTitle(message.content);
  const outputTitle = summaryTitle
    ? summaryTitle
    : primaryAction
    ? primaryAction.label
    : firstDoc
      ? "Document answer"
      : "Matter answer";
  const status =
    citations.length > 0
      ? `${citations.length} source${citations.length === 1 ? "" : "s"}`
      : "draft";

  return (
    <div
      className="mt-2 flex flex-wrap items-center gap-2 rounded-card border border-rule bg-paper px-3 py-2"
      data-testid="assistant-output-row"
    >
      <span
        aria-hidden="true"
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-sm border border-rule bg-paper-sunken tech-token text-[10px] font-semibold uppercase text-muted"
      >
        {outputKind.slice(0, 1)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate text-sm font-semibold text-ink">{outputTitle}</span>
          <span className="rounded-full border border-rule bg-paper-sunken px-2 py-0.5 text-[10px] font-medium uppercase tracking-track2 text-muted">
            {status}
          </span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {firstDoc && (
          <button
            type="button"
            onClick={() => onDocChip(firstDoc.id)}
            className="text-muted underline underline-offset-4 hover:text-ink"
          >
            Open
          </button>
        )}
        {!firstDoc && primaryAction && onAction && (
          <button
            type="button"
            onClick={() => onAction(primaryAction)}
            className="text-muted underline underline-offset-4 hover:text-ink"
          >
            Open
          </button>
        )}
        {citations.length > 0 && onSources && (
          <button
            type="button"
            onClick={() => onSources(message)}
            className="text-muted underline underline-offset-4 hover:text-ink"
          >
            Sources
          </button>
        )}
        {firstDoc && onVersions && (
          <button
            type="button"
            onClick={() => onVersions(message)}
            className="text-muted underline underline-offset-4 hover:text-ink"
          >
            Versions
          </button>
        )}
        {onRecord && (
          <button
            type="button"
            onClick={() => onRecord(message)}
            className="text-muted underline underline-offset-4 hover:text-ink"
          >
            Activity
          </button>
        )}
      </div>
    </div>
  );
}

type OutputKind =
  | "Summary"
  | "Anonymise";

const OUTPUT_ACTION_KIND: Partial<Record<SuggestedAction["type"], OutputKind>> = {
  anonymise_document: "Anonymise",
};

function outputKindForMessage(message: AssistantMessage): OutputKind | null {
  if (summaryCardTitle(message.content)) return "Summary";
  for (const action of message.suggested_actions) {
    const kind = OUTPUT_ACTION_KIND[action.type];
    if (kind) return kind;
  }
  return null;
}

function summaryCardTitle(content: string): string | null {
  const firstLine = content
    .split(/\r?\n/)
    .find((line) => line.trim().length > 0)
    ?.trim();
  if (!firstLine) return null;
  const match = firstLine.match(/^Summary of\s+(.+?):?$/i);
  return match ? `Summary of ${match[1]}` : null;
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
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 tech-token ${text} text-muted`}>
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
