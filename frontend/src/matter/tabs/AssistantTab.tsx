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
import { InlineAgentStatus, MessageBubble } from "../MessageBubble";
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

  const docsById = useMemo(() => {
    const map = new Map<string, MatterDocument>();
    for (const d of docs ?? []) map.set(d.id, d);
    return map;
  }, [docs]);

  const recentDocs = useMemo(() => {
    if (!docs) return [];
    return [...docs]
      .sort((a, b) => (a.uploaded_at < b.uploaded_at ? 1 : -1))
      .slice(0, 5);
  }, [docs]);

  const attachedDocs = useMemo(() => {
    const arr: MatterDocument[] = [];
    for (const id of selectedDocIds) {
      const d = docsById.get(id);
      if (d) arr.push(d);
    }
    return arr;
  }, [selectedDocIds, docsById]);

  const toggleDoc = (id: string) => {
    setSelectedDocIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const removeDoc = (id: string) => {
    setSelectedDocIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
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

  const [attachOpen, setAttachOpen] = useState(false);

  return (
    <div className="mx-auto w-full max-w-[760px] flex flex-col min-h-[520px]">
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto py-6 space-y-6 max-h-[64vh]"
      >
        {!loaded && (
          <p className="font-mono text-xs text-muted flex items-center gap-2">
            <InlineSpinner />
            loading conversation
          </p>
        )}
        {loaded && messages.length === 0 && (
          <div className="space-y-6">
            <div className="text-sm text-prose space-y-2">
              <p>
                Ask anything about this matter. The assistant has the chronology, the uploaded
                documents, and the audit trail in context.
              </p>
              <p className="text-xs text-muted">
                Citations appear as chips below each reply. Suggested next steps appear below the
                response.
              </p>
            </div>
            {/* Preview: AgentStatusCard placeholder until the backend surfaces real
                multi-step run data on AssistantMessage. Design lift only. */}
            <div>
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
            <InlineAgentStatus
              steps={[
                { label: "Read chronology", status: "complete" },
                { label: "Checked documents", status: "complete" },
                { label: "Drafting answer", status: "running" },
              ]}
            />
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
        <div className="mt-3 sticky bottom-0 bg-paper pt-3">
          {/* Context attachments as chips ABOVE the composer */}
          {attachedDocs.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {attachedDocs.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => removeDoc(d.id)}
                  title={`Remove ${d.filename}`}
                  className="inline-flex items-center gap-1.5 border border-rule bg-paper px-2 py-1 font-mono text-[11px] text-ink hover:border-ink transition-colors"
                >
                  <span className="text-muted">Document</span>
                  <span className="max-w-[180px] truncate">{d.filename}</span>
                  <span className="text-muted ml-1" aria-hidden>x</span>
                </button>
              ))}
            </div>
          )}

          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKey}
            disabled={pending}
            rows={3}
            placeholder={`Ask about ${matter.title}. Cmd/Ctrl+Enter to send.`}
            className="w-full bg-paper border border-rule px-4 py-3 text-[15px] focus:border-ink focus:outline-none transition-colors font-sans text-ink resize-y disabled:bg-wash disabled:text-muted disabled:cursor-not-allowed"
          />
          <div className="mt-2 flex items-center justify-between gap-3 flex-wrap">
            {/* Left: attachment chips + workflows stub */}
            <div className="flex items-center gap-3 relative">
              <button
                type="button"
                onClick={() => setAttachOpen((v) => !v)}
                className="font-mono text-[11px] text-muted hover:text-ink transition-colors"
              >
                + Documents
              </button>
              <button
                type="button"
                onClick={() => setTabAndHash("workflows")}
                className="font-mono text-[11px] text-muted hover:text-ink transition-colors"
              >
                Workflows
              </button>
              {attachOpen && recentDocs.length > 0 && (
                <div className="absolute bottom-full left-0 mb-2 border border-rule bg-paper p-3 w-[280px] z-10">
                  <div className="eyebrow mb-2">Attach documents</div>
                  <ul className="space-y-2">
                    {recentDocs.map((d) => {
                      const checked = selectedDocIds.has(d.id);
                      return (
                        <li key={d.id}>
                          <label className="flex items-start gap-2 text-xs cursor-pointer">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleDoc(d.id)}
                              className="mt-0.5"
                            />
                            <span className="font-mono text-ink truncate">{d.filename}</span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                  <button
                    type="button"
                    onClick={() => setAttachOpen(false)}
                    className="mt-3 font-mono text-[10px] text-muted hover:text-ink"
                  >
                    Close
                  </button>
                </div>
              )}
            </div>

            {/* Right: model picker (stub) + Send */}
            <div className="flex items-center gap-3">
              <span
                className="font-mono text-[11px] text-muted"
                title="Model picker stub. Not wired in v0.1."
              >
                Claude Sonnet 4.6 v
              </span>
              <button
                onClick={onSend}
                disabled={pending || !input.trim()}
                className={primaryBtn}
              >
                {pending ? "Sending..." : "Send"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
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
