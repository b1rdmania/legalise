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
            <div className="text-sm text-muted">
              <p className="mb-2">
                Ask anything about this matter. The assistant has the chronology,
                the uploaded documents, and the audit trail in context.
              </p>
              <p className="text-xs text-muted">
                Citations appear inline as chips. Suggested next steps appear below each reply.
              </p>
            </div>
          )}
          {messages.map((m) => (
            <MessageBubble
              key={m.id}
              message={m}
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
          <div className="border border-red-700 bg-red-50 text-red-700 text-sm p-3 mt-3">
            <div className="font-semibold mb-1">Could not send message</div>
            <p className="leading-relaxed whitespace-pre-wrap">{error}</p>
          </div>
        )}

        <div className="mt-3">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKey}
            disabled={disabled || pending}
            rows={3}
            placeholder={
              disabled
                ? disabledPlaceholder ?? "Sign up to chat with the assistant on your own matter"
                : "Ask about the matter. Cmd/Ctrl+Enter to send."
            }
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
              disabled={disabled || pending || !input.trim()}
              className={primaryBtn}
            >
              {pending ? "Sending…" : "Send"}
            </button>
          </div>
        </div>
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
  );
}

// -- Message bubble --------------------------------------------------------

function MessageBubble({
  message,
  onDocChip,
  onChronChip,
  onAction,
}: {
  message: AssistantMessage;
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
          {renderContent(message.content, onDocChip, onChronChip, isUser)}
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

const CITATION_RE = /\[(doc|chron):([^\]]+)\]/g;

function renderContent(
  content: string,
  onDocChip: () => void,
  onChronChip: () => void,
  invert: boolean,
) {
  const parts: Array<string | { kind: "doc" | "chron"; label: string }> = [];
  let last = 0;
  let m: RegExpExecArray | null;
  CITATION_RE.lastIndex = 0;
  while ((m = CITATION_RE.exec(content)) !== null) {
    if (m.index > last) parts.push(content.slice(last, m.index));
    parts.push({ kind: m[1] as "doc" | "chron", label: m[2] });
    last = m.index + m[0].length;
  }
  if (last < content.length) parts.push(content.slice(last));

  return parts.map((p, i) => {
    if (typeof p === "string") return <span key={i}>{p}</span>;
    const onClick = p.kind === "doc" ? onDocChip : onChronChip;
    const cls = invert
      ? "inline-flex items-center border border-paper/60 bg-paper/10 text-paper px-1.5 py-0.5 mx-0.5 text-[11px] font-mono align-baseline hover:bg-paper hover:text-ink transition-colors"
      : "inline-flex items-center border border-ink bg-paper text-ink px-1.5 py-0.5 mx-0.5 text-[11px] font-mono align-baseline hover:bg-ink hover:text-paper transition-colors";
    return (
      <button key={i} type="button" onClick={onClick} className={cls}>
        {p.kind === "doc" ? "doc" : "chron"}: {p.label}
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
