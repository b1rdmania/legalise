import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  listAssistantMessages,
  postAssistantMessage,
  type AssistantMessage,
  type ChronologyEvent,
  type Matter,
  type MatterDocument,
  type SuggestedAction,
} from "../../lib/api";
import { InlineSpinner, primaryBtn } from "../../ui/primitives";
import { AgentStatusCard } from "../AgentStatusCard";
import type { TabKey } from "./types";

interface AssistantTabProps {
  matter: Matter;
  docs: MatterDocument[] | null;
  chronology: ChronologyEvent[];
  setTabAndHash: (next: TabKey) => void;
  // Demo override: prefilled messages + disabled input + custom placeholder.
  initialMessages?: AssistantMessage[];
  disabled?: boolean;
  disabledPlaceholder?: string;
}

const ACTION_TARGET: Record<SuggestedAction["type"], TabKey> = {
  run_pre_motion: "premotion",
  draft_letter: "letters",
  review_contract: "contract-review",
  view_document: "documents",
  view_audit: "audit",
  view_chronology: "chronology",
  anonymise_document: "documents",
};

export function AssistantTab({
  matter,
  docs,
  chronology,
  setTabAndHash,
  initialMessages,
  disabled = false,
  disabledPlaceholder,
}: AssistantTabProps) {
  const [messages, setMessages] = useState<AssistantMessage[]>(initialMessages ?? []);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(Boolean(initialMessages));
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Initial fetch (skip in demo: initialMessages provided).
  useEffect(() => {
    if (initialMessages) return;
    let cancelled = false;
    listAssistantMessages(matter.slug)
      .then((rows) => {
        if (!cancelled) {
          setMessages(rows);
          setLoaded(true);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(formatError(err));
          setLoaded(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [matter.slug, initialMessages]);

  // Auto-scroll to newest message.
  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, thinking]);

  const recentDocs = useMemo(() => {
    if (!docs) return [];
    return [...docs]
      .sort((a, b) => (a.uploaded_at < b.uploaded_at ? 1 : -1))
      .slice(0, 3);
  }, [docs]);

  const topEvents = useMemo(() => {
    return [...chronology]
      .sort((a, b) => (b.significance - a.significance) || (a.event_date < b.event_date ? 1 : -1))
      .slice(0, 3);
  }, [chronology]);

  const toggleDoc = (id: string) => {
    setSelectedDocIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const onSend = async () => {
    const content = input.trim();
    if (!content || pending || disabled) return;
    setError(null);
    setPending(true);
    setThinking(true);
    const optimistic: AssistantMessage = {
      id: `optimistic-${Date.now()}`,
      role: "user",
      content,
      suggested_actions: [],
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    setInput("");
    try {
      const res = await postAssistantMessage(matter.slug, {
        content,
        selected_document_ids: selectedDocIds.size > 0 ? Array.from(selectedDocIds) : undefined,
      });
      setMessages((prev) => {
        const without = prev.filter((m) => m.id !== optimistic.id);
        return [...without, res.user, res.assistant];
      });
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setError(formatError(err));
    } finally {
      setPending(false);
      setThinking(false);
    }
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      onSend();
    }
  };

  const dispatchAction = (a: SuggestedAction) => {
    const target = ACTION_TARGET[a.type];
    if (target) setTabAndHash(target);
  };

  const dispatchDocChip = () => setTabAndHash("documents");
  const dispatchChronChip = () => setTabAndHash("chronology");

  return (
    <div>
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-8">
      <div className="flex flex-col min-h-[520px]">
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto border border-rule bg-paper p-6 space-y-4 max-h-[60vh]"
        >
          {!loaded && (
            <p className="font-mono text-xs text-muted flex items-center gap-2">
              <InlineSpinner />
              loading conversation
            </p>
          )}
          {loaded && messages.length === 0 && (
            <div className="text-sm text-muted space-y-4">
              <p>
                Ask anything about this matter. The assistant has the chronology,
                the uploaded documents, and the audit trail in context.
              </p>
              <p className="text-xs text-muted">
                Citations appear inline as chips. Suggested next steps appear below each reply.
              </p>
              {/* Preview: AgentStatusCard placeholder until the backend surfaces real
                  multi-step run data on AssistantMessage. Design lift only. */}
              <div className="pt-4">
                <div className="eyebrow mb-2">Preview</div>
                <AgentStatusCard
                  status="complete"
                  defaultExpanded
                  steps={[
                    { label: "Read chronology and top three significant events.", status: "complete" },
                    { label: "Scanned uploaded documents for relevant clauses.", status: "complete" },
                    { label: "Drafted reply with inline citations.", status: "complete" },
                  ]}
                  reasoning="Cross-referenced the dismissal date in the chronology against the contractual notice clause, then framed the reply around the s.98 ERA test."
                />
              </div>
            </div>
          )}
          {messages.map((m) => (
            <MessageBubble
              key={m.id}
              message={m}
              docs={docs}
              chronology={chronology}
              onDocChip={dispatchDocChip}
              onChronChip={dispatchChronChip}
              onAction={dispatchAction}
            />
          ))}
          {thinking && (
            <div className="flex justify-start">
              <div className="bg-wash border border-rule px-4 py-2 text-sm text-muted flex items-center gap-2 max-w-[80%]">
                <InlineSpinner />
                <span className="font-mono uppercase tracking-track2 text-[10px]">
                  Assistant is thinking
                </span>
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="border border-[#D9304F] bg-[#FEF2F2] text-[#B91C1C] text-sm p-3 mt-3">
            <div className="font-semibold mb-1">Could not send message</div>
            <p className="leading-relaxed whitespace-pre-wrap">{error}</p>
          </div>
        )}

        {disabled ? (
          // Compact unauth state - no oversized inert textarea.
          <div className="mt-3 border border-rule p-4 flex flex-wrap items-center gap-3 bg-paper">
            <p className="text-sm text-prose m-0 flex-1 min-w-[200px]">
              {disabledPlaceholder ?? "Sign up to chat with the assistant on your own matter."}
            </p>
            <a
              href="#/auth/signup"
              className="bg-ink text-paper px-4 py-2 hover:bg-black transition-colors text-sm font-medium min-h-[40px] inline-flex items-center"
            >
              Sign up free
            </a>
            <a
              href="#/auth/signin"
              className="text-sm text-muted hover:text-ink transition-colors"
            >
              Sign in
            </a>
          </div>
        ) : (
        <div className="mt-3">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKey}
            disabled={pending}
            rows={3}
            placeholder="Ask about the matter. Cmd/Ctrl+Enter to send."
            className="w-full bg-paper border border-rule px-4 py-3 text-[15px] focus:border-ink focus:outline-none transition-colors font-sans text-ink resize-y disabled:bg-wash disabled:text-muted disabled:cursor-not-allowed"
          />
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="font-mono uppercase tracking-track2 text-[10px] text-muted">
              {selectedDocIds.size > 0
                ? `${selectedDocIds.size} doc${selectedDocIds.size === 1 ? "" : "s"} attached as context`
                : "Recent documents used as context by default"}
            </span>
            <button
              onClick={onSend}
              disabled={pending || !input.trim()}
              className={primaryBtn}
            >
              {pending ? "Sending…" : "Send"}
            </button>
          </div>
        </div>
        )}
      </div>

      <aside className="border border-rule bg-paper p-5 self-start space-y-5">
        <div>
          <div className="eyebrow tracking-track2 mb-1">Matter</div>
          <div className="text-sm font-semibold text-ink">{matter.title}</div>
          <div className="text-xs text-muted font-mono mt-1">{matter.slug}</div>
        </div>
        <div>
          <div className="eyebrow tracking-track2 mb-1">Posture</div>
          <div className="text-xs font-mono font-bold text-ink">{matter.privilege_posture}</div>
        </div>
        {topEvents.length > 0 && (
          <div>
            <div className="eyebrow tracking-track2 mb-2">Top chronology</div>
            <ul className="space-y-2">
              {topEvents.map((ev) => (
                <li key={ev.id} className="text-xs leading-snug">
                  <div className="font-mono text-ink">{ev.event_date}</div>
                  <div className="text-prose">{ev.description}</div>
                </li>
              ))}
            </ul>
          </div>
        )}
        {recentDocs.length > 0 && (
          <div>
            <div className="eyebrow tracking-track2 mb-2">Recent documents</div>
            <ul className="space-y-2">
              {recentDocs.map((d) => {
                const checked = selectedDocIds.has(d.id);
                return (
                  <li key={d.id}>
                    <label className="flex items-start gap-2 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={disabled}
                        onChange={() => toggleDoc(d.id)}
                        className="mt-0.5"
                      />
                      <span className="font-mono text-ink truncate">{d.filename}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
            <p className="text-[10px] text-muted mt-2 leading-snug">
              Tick to attach as explicit context for the next message.
            </p>
          </div>
        )}
      </aside>
    </div>
    </div>
  );
}

// -- Message bubble --------------------------------------------------------

function MessageBubble({
  message,
  docs,
  chronology,
  onDocChip,
  onChronChip,
  onAction,
}: {
  message: AssistantMessage;
  docs: MatterDocument[] | null;
  chronology: ChronologyEvent[];
  onDocChip: () => void;
  onChronChip: () => void;
  onAction: (a: SuggestedAction) => void;
}) {
  const isUser = message.role === "user";
  return (
    <div className={isUser ? "flex justify-end" : "flex justify-start"}>
      <div className={"max-w-[85%] " + (isUser ? "items-end" : "items-start") + " flex flex-col gap-2"}>
        <div
          className={
            "px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap border " +
            (isUser
              ? "bg-ink text-paper border-ink"
              : "bg-wash text-ink border-rule")
          }
        >
          {renderContent(message.content, docs, chronology, onDocChip, onChronChip, isUser)}
        </div>
        {!isUser && message.suggested_actions.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {message.suggested_actions.map((a, i) => (
              <button
                key={`${a.type}-${i}`}
                onClick={() => onAction(a)}
                className="border border-ink text-ink bg-paper px-3 py-1.5 text-xs font-medium hover:bg-ink hover:text-paper transition-colors"
              >
                {a.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// -- Citation parsing ------------------------------------------------------

// Citations carry the entity ID (UUID or kebab/dotted slug), never the title.
// The character class is restricted so a closing bracket inside a document
// title can't terminate the parser. Labels resolve via lookup below.
const CITATION_RE = /\[(doc|chron):([A-Za-z0-9_.\-]+)\]/g;

// Strip a common file extension off a document filename for chip display.
// Hyphens and underscores are kept as-is.
function stripExtension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  if (dot <= 0) return filename;
  const ext = filename.slice(dot + 1).toLowerCase();
  // Conservative allow-list of legal document extensions.
  if (/^(pdf|docx|doc|txt|md|rtf|odt|eml|msg|csv|xlsx|xls|png|jpg|jpeg|tiff)$/.test(ext)) {
    return filename.slice(0, dot);
  }
  return filename;
}

const HUMAN_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Format an ISO date or YYYY-MM-DD string as "12 Mar 2026". Falls back to
// the raw input if it doesn't parse.
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

function renderContent(
  content: string,
  docs: MatterDocument[] | null,
  chronology: ChronologyEvent[],
  onDocChip: () => void,
  onChronChip: () => void,
  invert: boolean,
) {
  const docLabel = new Map<string, string>();
  const docFull = new Map<string, string>();
  for (const d of docs ?? []) {
    const full = d.filename || d.id;
    docFull.set(d.id, full);
    docLabel.set(d.id, stripExtension(full));
  }
  const chronLabel = new Map<string, string>();
  const chronFull = new Map<string, string>();
  for (const e of chronology) {
    chronFull.set(e.id, `${e.event_date}: ${e.description || e.id}`);
    chronLabel.set(e.id, formatHumanDate(e.event_date));
  }

  const parts: Array<string | { kind: "doc" | "chron"; id: string }> = [];
  let last = 0;
  let m: RegExpExecArray | null;
  CITATION_RE.lastIndex = 0;
  while ((m = CITATION_RE.exec(content)) !== null) {
    if (m.index > last) parts.push(content.slice(last, m.index));
    parts.push({ kind: m[1] as "doc" | "chron", id: m[2] });
    last = m.index + m[0].length;
  }
  if (last < content.length) parts.push(content.slice(last));

  return parts.map((p, i) => {
    if (typeof p === "string") return <span key={i}>{p}</span>;
    const onClick = p.kind === "doc" ? onDocChip : onChronChip;
    const lookup = p.kind === "doc" ? docLabel.get(p.id) : chronLabel.get(p.id);
    const fullId = p.kind === "doc" ? docFull.get(p.id) ?? p.id : chronFull.get(p.id) ?? p.id;
    const label = lookup ?? p.id.slice(0, 8);
    const prefix = p.kind === "doc" ? "Document" : "Chronology";
    const cls = invert
      ? "inline-flex items-center border border-paper/60 bg-paper/10 text-paper px-1.5 py-0.5 mx-0.5 text-[11px] font-mono align-baseline hover:bg-paper hover:text-ink transition-colors"
      : "inline-flex items-center border border-ink bg-paper text-ink px-1.5 py-0.5 mx-0.5 text-[11px] font-mono align-baseline hover:bg-ink hover:text-paper transition-colors";
    return (
      <button key={i} type="button" onClick={onClick} className={cls} title={fullId}>
        [{prefix}: {label}]
      </button>
    );
  });
}

function formatError(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err);
  const m = text.match(/^Error:\s*(\d{3})\s+([^:]+):\s*(.*)$/s);
  if (!m) return text.replace(/^Error:\s*/, "");
  const [, status, , raw] = m;
  let body = raw.trim();
  try {
    const parsed = JSON.parse(body);
    if (parsed && typeof parsed.detail === "string") body = parsed.detail;
  } catch {
    // not JSON
  }
  if (status === "401") return "You need to sign in again to use the assistant.";
  if (status === "409") return body || "This matter's posture blocks cloud model calls. Switch posture or use a local model.";
  if (status === "422") return body || "The request was rejected. Check your API key and try again.";
  return `HTTP ${status}: ${body}`;
}
