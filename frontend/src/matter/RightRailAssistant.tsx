import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  listAssistantMessages,
  postAssistantMessage,
  ProviderUpstreamError,
  providerUpstreamMessage,
  type AssistantMessage,
  type Matter,
} from "../lib/api";
import { InlineSpinner, primaryBtn } from "../ui/primitives";
import { InlineAgentStatus, MessageBubble } from "./MessageBubble";

interface Props {
  matter: Matter;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onOpenFull: () => void;
  // Read-only/demo mode: replace composer with a sign-up strip.
  disabled?: boolean;
}

const MAX_VISIBLE = 5;

// Persistent right-rail Assistant. Lives next to the main column on every
// non-Assistant matter surface. Reuses the assistant API; keeps its own
// local last-5 view (does not share state with AssistantTab).
//
// Shares MessageBubble with AssistantTab via compact mode so the message
// shape stays consistent: user right-aligned on wash, assistant left-aligned
// plain prose with citation chips below.
export function RightRailAssistant({ matter, collapsed, onToggleCollapsed, onOpenFull, disabled = false }: Props) {
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (collapsed) return;
    if (disabled) {
      setLoaded(true);
      return;
    }
    let cancelled = false;
    listAssistantMessages(matter.slug)
      .then((rows) => {
        if (cancelled) return;
        setMessages(rows.slice(-MAX_VISIBLE));
        setLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [matter.slug, collapsed, disabled]);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, pending]);

  const onSend = async () => {
    const content = input.trim();
    if (!content || pending) return;
    setError(null);
    setPending(true);
    const optimistic: AssistantMessage = {
      id: `rr-optimistic-${Date.now()}`,
      role: "user",
      content,
      suggested_actions: [],
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic].slice(-MAX_VISIBLE));
    setInput("");
    try {
      const res = await postAssistantMessage(matter.slug, { content });
      setMessages((prev) => {
        const without = prev.filter((m) => m.id !== optimistic.id);
        return [...without, res.user, res.assistant].slice(-MAX_VISIBLE);
      });
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      if (err instanceof ProviderUpstreamError) {
        setError(providerUpstreamMessage(err));
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setPending(false);
    }
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      onSend();
    }
  };

  if (collapsed) {
    return (
      <aside className="w-[44px] hidden lg:flex lg:flex-col border-l border-rule bg-paper sticky top-[64px] sm:top-[80px] h-[calc(100vh-80px)]">
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label="Expand assistant"
          className="w-full py-3 flex items-center justify-center text-muted hover:text-ink transition-colors border-b border-rule"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="square" strokeLinejoin="miter" aria-hidden>
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </button>
      </aside>
    );
  }

  return (
    <aside className="w-[340px] shrink-0 border-l border-rule bg-paper hidden lg:flex lg:flex-col sticky top-[64px] sm:top-[80px] h-[calc(100vh-64px)] sm:h-[calc(100vh-80px)] overflow-hidden">
      <div className="px-4 py-3 border-b border-rule flex items-center justify-between">
        <div>
          <div className="eyebrow">Assistant</div>
          <div className="font-mono text-[10px] text-muted mt-0.5 truncate">{matter.slug}</div>
        </div>
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label="Collapse assistant"
          className="text-muted hover:text-ink transition-colors p-1"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter" aria-hidden>
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {!loaded && (
          <p className="font-mono text-[10px] uppercase tracking-track2 text-muted flex items-center gap-2">
            <InlineSpinner />
            loading
          </p>
        )}
        {loaded && messages.length === 0 && (
          <p className="text-xs text-prose leading-relaxed">
            Ask anything about {matter.title}.
          </p>
        )}
        {messages.map((m) => (
          <MessageBubble
            key={m.id}
            message={m}
            docs={null}
            chronology={[]}
            onDocChip={onOpenFull}
            onChronChip={onOpenFull}
            compact
          />
        ))}
        {pending && (
          <InlineAgentStatus
            compact
            steps={[
              { label: "Reading", status: "complete" },
              { label: "Drafting", status: "running" },
            ]}
          />
        )}
        {error && (
          <div className="border border-[#D9304F] bg-[#FEF2F2] text-[#B91C1C] text-xs p-2">
            {error}
          </div>
        )}
      </div>

      {disabled ? (
        <div className="border-t border-rule p-3 flex flex-col gap-2">
          <p className="text-xs text-prose leading-relaxed m-0">
            Ask about this matter after signing up.
          </p>
          <a
            href="#/auth/signup"
            className="bg-ink text-paper px-3 py-1.5 text-xs font-medium inline-flex items-center justify-center hover:bg-black transition-colors self-start"
          >
            Sign up free
          </a>
        </div>
      ) : (
      <div className="border-t border-rule p-3">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKey}
          rows={2}
          placeholder="Ask about the matter"
          disabled={pending}
          className="w-full bg-paper border border-rule px-3 py-2 text-xs focus:border-ink focus:outline-none transition-colors font-sans text-ink resize-y disabled:bg-wash"
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              className="font-mono text-[11px] text-muted hover:text-ink whitespace-nowrap transition-colors"
              onClick={onOpenFull}
            >
              + Documents
            </button>
            <span
              className="font-mono text-[10px] text-muted truncate"
              title="Model picker stub. Not wired in v0.1."
            >
              Claude Sonnet 4.6 v
            </span>
          </div>
          <button
            type="button"
            onClick={onSend}
            disabled={pending || !input.trim()}
            className={primaryBtn + " text-xs px-3 py-1.5 min-h-0"}
          >
            {pending ? "Sending" : "Send"}
          </button>
        </div>
        <button
          type="button"
          onClick={onOpenFull}
          className="mt-2 block font-mono text-[11px] text-muted hover:text-ink transition-colors"
        >
          Open full Assistant
        </button>
      </div>
      )}
    </aside>
  );
}
