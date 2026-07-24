import { useEffect, useMemo, useState } from "react";

import type { AuditEntry, Matter } from "../../lib/api";
import { LoadingLine } from "../../ui/primitives";
import { narrateEntry } from "../auditNarrate";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

function truncateUuid(value: string): string {
  if (!isUuid(value)) return value;
  return `${value.slice(0, 8)}…${value.slice(-4)}`;
}

// An action with no module is an http/middleware (forensic) row: the
// substrate, not the story. Kept, but hidden from the default timeline.
function isTechnicalRow(e: AuditEntry): boolean {
  return e.module == null;
}

function isBlockedAction(action: string): boolean {
  return (
    action.includes(".blocked") ||
    action.includes(".refused") ||
    action.includes(".denied")
  );
}

// "2026-04-04T13:02:09Z" → "4 Apr, 13:02"
const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function shortTimestamp(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return iso.slice(0, 16).replace("T", " ");
  const month = Number(m[2]);
  if (month < 1 || month > 12) return iso.slice(0, 16).replace("T", " ");
  return `${Number(m[3])} ${SHORT_MONTHS[month - 1]}, ${m[4]}:${m[5]}`;
}

export function AuditTab({ audit, matter }: { audit: AuditEntry[] | null; matter?: Matter | null }) {
  const [moduleFilter, setModuleFilter] = useState<string>("");
  const [showTechnical, setShowTechnical] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const modules = useMemo(() => {
    if (!audit) return [] as string[];
    const set = new Set<string>();
    for (const e of audit) if (e.module) set.add(e.module);
    return Array.from(set).sort();
  }, [audit]);

  const technicalCount = useMemo(
    () => (audit ? audit.filter(isTechnicalRow).length : 0),
    [audit],
  );

  // Default view = the human story (semantic rows). Technical/http rows are
  // folded in only when the toggle is on, or when the user explicitly picks
  // the http filter. The module dropdown still narrows within whatever set.
  const visible = useMemo(() => {
    if (!audit) return [] as AuditEntry[];
    if (moduleFilter === "__http__") return audit.filter(isTechnicalRow);
    if (moduleFilter) return audit.filter((e) => e.module === moduleFilter);
    return showTechnical ? audit : audit.filter((e) => !isTechnicalRow(e));
  }, [audit, moduleFilter, showTechnical]);

  const hiddenTechnical = useMemo(() => {
    if (moduleFilter === "__http__" || showTechnical) return 0;
    // When a specific module is selected there are no technical rows in it,
    // so the only case where technical rows are hidden is the default view.
    return moduleFilter ? 0 : technicalCount;
  }, [moduleFilter, showTechnical, technicalCount]);

  const selected = useMemo(() => {
    if (!selectedId || !audit) return null;
    return audit.find((e) => e.id === selectedId) ?? null;
  }, [selectedId, audit]);

  useEffect(() => {
    if (!selected) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") setSelectedId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  if (!audit) return <LoadingLine label="loading audit" />;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 border-b border-t border-rule bg-paper text-[11px]">
        <span className="text-muted uppercase tracking-[0.18em] text-[10px]">Filter</span>
        <select
          value={moduleFilter}
          onChange={(e) => setModuleFilter(e.target.value)}
          className="bg-paper rounded-item border border-rule px-2 py-1 text-ink tech-token"
        >
          <option value="">All activity</option>
          {modules.map((m) => (
            <option key={m} value={m}>
              {m} ({audit.filter((e) => e.module === m).length})
            </option>
          ))}
          <option value="__http__">http (middleware) ({technicalCount})</option>
        </select>
        {moduleFilter !== "__http__" && (
          <label className="flex items-center gap-2 text-muted select-none cursor-pointer">
            <input
              type="checkbox"
              checked={showTechnical}
              onChange={(e) => setShowTechnical(e.target.checked)}
              className="accent-seal"
            />
            Show technical / HTTP events ({technicalCount})
          </label>
        )}
        <span className="text-muted ml-auto">
          Showing {visible.length} event{visible.length === 1 ? "" : "s"}
          {hiddenTechnical > 0 && ` · ${hiddenTechnical} technical event${hiddenTechnical === 1 ? "" : "s"} hidden`}
        </span>
      </div>
      {visible.length === 0 ? (
        <div className="rounded-card border border-rule p-6 text-sm text-muted">
          No entries match this filter.
        </div>
      ) : (
        // Timeline: a hairline spine runs down the left; each entry is a node
        // on it, so the append-only chain reads as one continuous thread
        // rather than a flat list. The node marks the entry; the spine is the
        // chain. Blocked/refused entries take the seal accent on the node.
        <ol className="relative py-1" data-testid="audit-timeline">
          {visible.map((e, i) => {
            const isSelected = selectedId === e.id;
            const isBlocked = isBlockedAction(e.action);
            const isTechnical = isTechnicalRow(e);
            const isFirst = i === 0;
            const isLast = i === visible.length - 1;
            return (
              <li key={e.id} className="relative">
                <button
                  type="button"
                  onClick={() => setSelectedId(e.id)}
                  className={
                    "group w-full text-left flex items-start gap-4 pl-5 pr-4 py-3 transition-colors " +
                    (isSelected ? "bg-wash" : "hover:bg-wash")
                  }
                >
                  {/* The spine + node. The spine is a single hairline that the
                      node sits on; it stops half a row short at the ends so the
                      thread starts and finishes cleanly. */}
                  <span className="relative shrink-0 self-stretch w-3" aria-hidden="true">
                    <span
                      className={
                        "absolute left-1/2 -translate-x-1/2 w-px bg-rule " +
                        (isFirst ? "top-[18px] " : "top-0 ") +
                        (isLast ? "h-[18px]" : "bottom-0")
                      }
                    />
                    <span
                      className={
                        "absolute left-1/2 top-[14px] -translate-x-1/2 h-2 w-2 rounded-full ring-2 ring-paper " +
                        (isBlocked
                          ? "bg-seal"
                          : isSelected
                            ? "bg-ink"
                            : "bg-rule group-hover:bg-ink transition-colors")
                      }
                    />
                  </span>
                  <span className="tech-token text-[10px] text-muted shrink-0 w-[92px] tabular-nums pt-[3px]">
                    {shortTimestamp(e.timestamp)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={
                        "block text-sm leading-snug " +
                        (isBlocked ? "text-seal font-medium" : "text-ink")
                      }
                    >
                      {narrateEntry(e)}
                    </span>
                    <span className="mt-0.5 block tech-token text-[10px] text-muted truncate">
                      {isTechnical ? "http (middleware)" : e.module ?? "system"} · {e.action}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}

      {selected && (
        <AuditDetailDrawer entry={selected} matter={matter ?? null} onClose={() => setSelectedId(null)} />
      )}
    </div>
  );
}

const DRAWER_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// "2026-04-04T13:02:09Z" → "4 April 2026, 13:02"
function humanTimestamp(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return iso;
  const month = Number(m[2]);
  if (month < 1 || month > 12) return iso;
  return `${Number(m[3])} ${DRAWER_MONTHS[month - 1]} ${m[1]}, ${m[4]}:${m[5]}`;
}

function AuditDetailDrawer({
  entry,
  matter,
  onClose,
}: {
  entry: AuditEntry;
  matter: Matter | null;
  onClose: () => void;
}) {
  const payloadKeys = Object.keys(entry.payload ?? {});
  const hasPayload = payloadKeys.length > 0;
  const isBlocked =
    entry.action.includes(".blocked") ||
    entry.action.includes(".refused") ||
    entry.action.includes(".denied");

  return (
    <>
      <div
        onClick={onClose}
        className="fixed inset-0 z-40 bg-ink/40"
        aria-hidden="true"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Audit entry detail"
        className="fixed top-0 right-0 z-50 h-screen w-[420px] max-w-full bg-paper border-l border-rule p-6 overflow-y-auto md:m-3 md:h-[calc(100vh-24px)] md:rounded-panel md:border md:shadow-panel"
      >
        <div className="flex items-start justify-between gap-4 mb-5">
          <div className="min-w-0">
            <div className="eyebrow mb-2">{isBlocked ? "Refused entry" : "Audit entry"}</div>
            <h3 className={"text-lg font-bold leading-tight wrap-break-word " + (isBlocked ? "text-seal" : "text-ink")}>
              {entry.action}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-muted hover:text-ink min-h-[44px] min-w-[44px] flex items-center justify-center -mr-2 -mt-2"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </button>
        </div>

        {/* What happened, in English, before any identifier. */}
        <p className="mb-6 text-sm leading-relaxed text-prose" data-testid="audit-narration">
          {narrateEntry(entry)}
        </p>

        <dl className="grid grid-cols-[90px_1fr] gap-y-3 gap-x-4 text-[13px] mb-6 border-t border-rule pt-4">
          <PlainRow label="When" value={humanTimestamp(entry.timestamp)} />
          <PlainRow label="Who" value={entry.actor_id ? "Workspace user" : "System"} />
          {matter?.title && <PlainRow label="Matter" value={matter.title} />}
          {entry.model_used && <PlainRow label="Model" value={entry.model_used} />}
        </dl>

        {/* The complete technical material — present, never leading. */}
        <details className="border-t border-rule pt-4">
          <summary className="cursor-pointer text-[10px] uppercase tracking-[0.18em] text-muted hover:text-ink">
            Technical record
          </summary>
          <dl className="mt-4 grid grid-cols-[110px_1fr] gap-y-3 gap-x-4 tech-token text-[12px]">
            <Row label="Timestamp" value={entry.timestamp} />
            <Row label="Module" value={entry.module ?? "-"} />
            <Row label="Action" value={entry.action} />
            <ActorRow actor={entry.actor_id} />
            <ResourceRow entry={entry} />
            <MatterIdRow matterId={entry.matter_id} matter={matter} />
            <Row label="Tokens" value={entry.token_count != null ? String(entry.token_count) : "-"} />
            <Row label="Latency" value={entry.latency_ms != null ? `${entry.latency_ms}ms` : "-"} />
            <Row label="Prompt hash" value={entry.prompt_hash ?? "-"} mono break />
            <Row label="Response hash" value={entry.response_hash ?? "-"} mono break />
            <Row label="Entry id" value={entry.id} mono break />
          </dl>
          {hasPayload && (
            <pre className="mt-4 rounded-card tech-token text-xs bg-wash border border-rule p-3 overflow-x-auto whitespace-pre-wrap break-all">
              {JSON.stringify(entry.payload, null, 2)}
            </pre>
          )}
        </details>
      </aside>
    </>
  );
}

function PlainRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-[10px] uppercase tracking-[0.18em] text-muted self-center">{label}</dt>
      <dd className="text-ink wrap-break-word">{value}</dd>
    </>
  );
}

function Row({
  label,
  value,
  mono,
  break: brk,
}: {
  label: string;
  value: string;
  mono?: boolean;
  break?: boolean;
}) {
  return (
    <>
      <dt className="text-muted uppercase tracking-track2 text-[9px] self-center">{label}</dt>
      <dd className={"text-ink " + (mono ? "tech-token " : "") + (brk ? "break-all" : "wrap-break-word")}>
        {value}
      </dd>
    </>
  );
}

function RowLabel({ label }: { label: string }) {
  return (
    <dt className="text-muted uppercase tracking-track2 text-[9px] self-center">{label}</dt>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const onClick = () => {
    try {
      void navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-xs text-muted hover:text-seal transition-colors"
      aria-label={copied ? "Copied" : "Copy full value"}
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function UuidValue({ value }: { value: string }) {
  return (
    <span className="inline-flex items-center gap-2 break-all">
      <span className="tech-token text-ink" title={value}>
        {truncateUuid(value)}
      </span>
      <CopyButton value={value} />
    </span>
  );
}

function ActorRow({ actor }: { actor: string | null | undefined }) {
  if (!actor) {
    return (
      <>
        <RowLabel label="Actor" />
        <dd className="text-ink">system</dd>
      </>
    );
  }
  if (isUuid(actor)) {
    return (
      <>
        <RowLabel label="Actor" />
        <dd>
          <UuidValue value={actor} />
        </dd>
      </>
    );
  }
  return (
    <>
      <RowLabel label="Actor" />
      <dd className="text-ink wrap-break-word">{actor}</dd>
    </>
  );
}

function ResourceRow({ entry }: { entry: AuditEntry }) {
  const type = entry.resource_type;
  const id = entry.resource_id;
  if (!type && !id) {
    return (
      <>
        <RowLabel label="Resource" />
        <dd className="text-ink">-</dd>
      </>
    );
  }
  if (type && id && isUuid(id)) {
    return (
      <>
        <RowLabel label="Resource" />
        <dd className="inline-flex items-center gap-2 break-all">
          <span className="tech-token text-ink" title={`${type}:${id}`}>
            {type}:{truncateUuid(id)}
          </span>
          <CopyButton value={`${type}:${id}`} />
        </dd>
      </>
    );
  }
  const value = type && id ? `${type}:${id}` : id ?? type ?? "-";
  return (
    <>
      <RowLabel label="Resource" />
      <dd className="text-ink tech-token wrap-break-word">{value}</dd>
    </>
  );
}

function MatterIdRow({
  matterId,
  matter,
}: {
  matterId: string | null | undefined;
  matter: Matter | null;
}) {
  if (!matterId) {
    return (
      <>
        <RowLabel label="Matter id" />
        <dd className="text-ink">-</dd>
      </>
    );
  }
  const titleMatches = matter && matter.id === matterId && matter.title;
  if (titleMatches) {
    return (
      <>
        <RowLabel label="Matter id" />
        <dd>
          <div className="text-ink wrap-break-word">{matter.title}</div>
          {isUuid(matterId) ? (
            <div className="mt-1 text-muted">
              <UuidValue value={matterId} />
            </div>
          ) : (
            <div className="mt-1 text-muted tech-token break-all">{matterId}</div>
          )}
        </dd>
      </>
    );
  }
  if (isUuid(matterId)) {
    return (
      <>
        <RowLabel label="Matter id" />
        <dd>
          <UuidValue value={matterId} />
        </dd>
      </>
    );
  }
  return (
    <>
      <RowLabel label="Matter id" />
      <dd className="text-ink tech-token wrap-break-word">{matterId}</dd>
    </>
  );
}
