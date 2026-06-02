import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  getMatterWorkflows,
  listAssistantMessages,
  postAssistantMessage,
  ProviderKeyMissingError,
  ProviderUpstreamError,
  providerUpstreamMessage,
  type AssistantMessage,
  type ChronologyEvent,
  type Matter,
  type MatterDocument,
  type SuggestedAction,
  type WorkflowState,
} from "../../lib/api";
import { InlineSpinner, ProviderKeyMissingBanner, primaryBtn } from "../../ui/primitives";
import { InlineAgentStatus, MessageBubble } from "../MessageBubble";
import { MatterPulse } from "../MatterPulse";
import type { TabKey } from "./types";

interface AssistantTabProps {
  matter: Matter;
  docs: MatterDocument[] | null;
  chronology: ChronologyEvent[];
  setTabAndHash: (next: TabKey) => void;
  // Counts for the Matter Pulse strip. Already in scope on the parent.
  auditCount?: number;
  // Demo / unauth path: pre-resolved granted workflows count so the
  // pulse doesn't fire a 401-prone fetch.
  workflowsGrantedCount?: number;
  // Demo override: prefilled messages + disabled input + custom placeholder.
  initialMessages?: AssistantMessage[];
  disabled?: boolean;
  disabledPlaceholder?: string;
  // Called when a Suggested Action chip is clicked in disabled (demo) mode.
  onDisabledAction?: () => void;
  showPostureInPulse?: boolean;
}

// Three concrete first-actions per matter type. Per JOY.md "Suggested
// Actions": not generic. Matter-shaped starters that prefill the composer.
const SUGGESTED_BY_TYPE: Record<string, string[]> = {
  employment_tribunal: [
    "Draft a Letter Before Action for the dismissal",
    "Run pre-motion against the conduct framing",
    "Summarise the witness statement",
  ],
  civil: [
    "Draft a CPR pre-action letter",
    "Run contract review on the NDA",
    "Build the chronology from the documents",
  ],
};
const SUGGESTED_DEFAULT = [
  "Summarise this matter",
  "List the documents and what they say",
  "What deadlines should I be tracking?",
];

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
  auditCount,
  workflowsGrantedCount,
  initialMessages,
  disabled = false,
  disabledPlaceholder,
  onDisabledAction,
  showPostureInPulse = true,
}: AssistantTabProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [messages, setMessages] = useState<AssistantMessage[]>(initialMessages ?? []);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keyMissingProvider, setKeyMissingProvider] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(Boolean(initialMessages));
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set());
  // In-chat skill picker reads PR 4's source-of-truth: getMatterWorkflows.
  // Only workflows already granted on this matter appear — the chat
  // surface never invents skill state.
  const [enabledSkills, setEnabledSkills] = useState<WorkflowState[]>([]);
  const [skillsOpen, setSkillsOpen] = useState(false);
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

  // Fetch enabled-in-matter skills for the in-chat picker. Same call
  // MatterSkillsTab uses, same filter: grant === "granted" + availability
  // ok. Skipped in demo (disabled) mode to avoid 401s on the unauth path.
  useEffect(() => {
    if (disabled) return;
    let cancelled = false;
    void getMatterWorkflows(matter.slug)
      .then((r) => {
        if (cancelled) return;
        setEnabledSkills(
          r.workflows.filter((w) => w.grant === "granted"),
        );
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [matter.slug, disabled]);

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
    setKeyMissingProvider(null);
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
      if (err instanceof ProviderKeyMissingError) {
        setKeyMissingProvider(err.provider);
      } else {
        setError(formatError(err));
      }
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

  const suggestions = useMemo(
    () => SUGGESTED_BY_TYPE[matter.matter_type] ?? SUGGESTED_DEFAULT,
    [matter.matter_type],
  );

  const onSuggestion = (s: string) => {
    if (disabled) {
      onDisabledAction?.();
      return;
    }
    setInput(s);
    // Defer focus so the textarea has rendered the new value.
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const [attachOpen, setAttachOpen] = useState(false);

  const onPickSkill = (w: WorkflowState) => {
    setSkillsOpen(false);
    if (disabled) {
      onDisabledAction?.();
      return;
    }
    setTabAndHash(w.key as TabKey);
  };

  return (
    <div className="mx-auto w-full max-w-[1040px] flex flex-col min-h-[520px]">
      <div className="mb-6">
        <MatterPulse
          matter={matter}
          documentsCount={docs?.length ?? 0}
          chronologyCount={chronology.length}
          auditCount={auditCount ?? 0}
          workflowsGrantedCount={workflowsGrantedCount}
          skipFetch={disabled}
          showPosture={showPostureInPulse}
        />
        {/* Quiet folder context — what's here + where the record lives.
            Visible at a glance, never dominating the chat surface. */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>
              {docs && docs.length > 0
                ? `${docs.length} document${docs.length === 1 ? "" : "s"} in this matter`
                : "No documents yet"}
            </span>
            {recentDocs.length > 0 && (
              <span className="flex flex-wrap items-center gap-x-2">
                <span aria-hidden="true">·</span>
                {recentDocs.slice(0, 2).map((d, i) => (
                  <span key={d.id} className="font-mono truncate max-w-[180px]">
                    {i > 0 && <span aria-hidden="true" className="mr-2">·</span>}
                    {d.filename}
                  </span>
                ))}
                {docs && docs.length > 2 && (
                  <button
                    type="button"
                    onClick={() => setTabAndHash("documents")}
                    className="underline underline-offset-4 hover:text-ink"
                  >
                    +{docs.length - 2} more
                  </button>
                )}
              </span>
            )}
            <button
              type="button"
              onClick={() => setTabAndHash("documents")}
              className="underline underline-offset-4 hover:text-ink"
              data-testid="open-documents-link"
            >
              Open documents →
            </button>
          </div>
          <button
            type="button"
            onClick={() => setTabAndHash("audit")}
            className="underline underline-offset-4 hover:text-ink"
            data-testid="open-record-link"
          >
            View record →
          </button>
        </div>
      </div>
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto pt-2 pb-6 space-y-5 max-h-[64vh]"
      >
        {!loaded && (
          <p className="font-mono text-xs text-muted flex items-center gap-2">
            <InlineSpinner />
            loading conversation
          </p>
        )}
        {loaded && messages.length === 0 && (
          <div className="space-y-6 border border-rule bg-paper-sunken p-5" data-testid="chat-empty-state">
            <div className="text-sm text-prose space-y-2">
              <p>
                This is the folder for <strong>{matter.title}</strong>. Ask
                anything about the documents in here, or run a skill enabled
                on this matter.
              </p>
              <p className="text-xs text-muted">
                Sources appear as chips below each answer. Outputs you sign
                off land in the matter Record.
              </p>
            </div>
            <div>
              <div className="eyebrow mb-2">Try one of these</div>
              <div className="flex flex-wrap gap-2">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => onSuggestion(s)}
                    className="border border-rule text-ink bg-paper px-3 py-1.5 text-xs font-medium hover:border-ink transition-colors text-left"
                  >
                    {s}
                  </button>
                ))}
              </div>
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

      {keyMissingProvider && <ProviderKeyMissingBanner provider={keyMissingProvider} />}
      {error && (
        <div className="border border-[#D9304F] bg-[#FEF2F2] text-[#B91C1C] text-sm p-3 mt-3">
          <div className="font-semibold mb-1">Could not send message</div>
          <p className="leading-relaxed whitespace-pre-wrap">{error}</p>
        </div>
      )}

      {disabled ? (
        // Compact unauth state - sticky strip, attached to chat column.
        <div className="mt-3 sticky bottom-0 bg-paper pt-3">
          <div className="border-t border-rule py-3 flex flex-wrap items-center gap-3">
            <p className="text-sm text-prose m-0 flex-1 min-w-[200px]">
              {disabledPlaceholder ?? "Create an evaluation account to ask the assistant against this matter."}
            </p>
            <div className="flex items-center gap-3">
              <a
                href="/auth/signup"
                className="bg-ink text-paper px-4 py-2 hover:bg-black transition-colors text-sm font-medium min-h-[40px] inline-flex items-center"
              >
                Create account
              </a>
              <a
                href="/auth/signin"
                className="text-sm text-muted hover:text-ink transition-colors"
              >
                Sign in
              </a>
            </div>
          </div>
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
            ref={textareaRef}
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
                onClick={() => setSkillsOpen((v) => !v)}
                aria-expanded={skillsOpen}
                aria-haspopup="menu"
                data-testid="chat-skills-toggle"
                className="font-mono text-[11px] text-muted hover:text-ink transition-colors"
              >
                Skills{enabledSkills.length > 0 ? ` (${enabledSkills.length})` : ""}
              </button>
              {skillsOpen && (
                <div
                  role="menu"
                  aria-label="Skills enabled in this matter"
                  className="absolute bottom-full left-0 mb-2 border border-rule bg-paper p-3 w-[300px] z-10"
                  data-testid="chat-skills-popover"
                >
                  <div className="eyebrow mb-2">Enabled in this matter</div>
                  {enabledSkills.length === 0 ? (
                    <p className="text-xs text-muted">
                      No skills enabled on this matter yet.{" "}
                      <button
                        type="button"
                        onClick={() => {
                          setSkillsOpen(false);
                          setTabAndHash("workflows");
                        }}
                        className="underline underline-offset-4 hover:text-ink"
                      >
                        Enable a skill →
                      </button>
                    </p>
                  ) : (
                    <>
                      <ul className="space-y-2">
                        {enabledSkills.map((w) => (
                          <li key={w.key}>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => onPickSkill(w)}
                              disabled={w.availability !== "ok"}
                              title={w.reason ?? undefined}
                              className="flex w-full items-start justify-between gap-2 border border-rule px-2 py-1.5 text-left text-xs hover:border-ink disabled:opacity-50"
                              data-testid={`chat-skill-${w.key}`}
                            >
                              <span>
                                <span className="block text-ink font-medium">
                                  {w.title}
                                </span>
                                {w.availability !== "ok" && (
                                  <span className="block text-[10px] text-muted">
                                    {w.availability === "blocked-by-posture"
                                      ? "Blocked by privilege state"
                                      : "Needs permission in this matter"}
                                  </span>
                                )}
                              </span>
                              <span aria-hidden="true" className="text-muted">
                                →
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                      <button
                        type="button"
                        onClick={() => {
                          setSkillsOpen(false);
                          setTabAndHash("workflows");
                        }}
                        className="mt-3 text-xs text-muted underline underline-offset-4 hover:text-ink"
                      >
                        Manage skills →
                      </button>
                    </>
                  )}
                </div>
              )}
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

            {/* Right: Send */}
            <div className="flex items-center gap-3">
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
  if (err instanceof ProviderUpstreamError) return providerUpstreamMessage(err);
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
  if (status === "409") return body || "This matter's privilege state blocks cloud model calls. Change privilege or use a local model.";
  if (status === "422") return body || "The request was rejected. Check your API key and try again.";
  return `HTTP ${status}: ${body}`;
}
