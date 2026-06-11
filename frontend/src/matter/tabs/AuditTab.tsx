import { useEffect, useMemo, useState } from "react";

import type { AuditEntry, Matter } from "../../lib/api";
import { LoadingLine } from "../../ui/primitives";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

function truncateUuid(value: string): string {
  if (!isUuid(value)) return value;
  return `${value.slice(0, 8)}…${value.slice(-4)}`;
}

export function AuditTab({ audit, matter }: { audit: AuditEntry[] | null; matter?: Matter | null }) {
  const [moduleFilter, setModuleFilter] = useState<string>("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const modules = useMemo(() => {
    if (!audit) return [] as string[];
    const set = new Set<string>();
    for (const e of audit) if (e.module) set.add(e.module);
    return Array.from(set).sort();
  }, [audit]);

  const visible = useMemo(() => {
    if (!audit) return [] as AuditEntry[];
    if (!moduleFilter) return audit;
    if (moduleFilter === "__http__") return audit.filter((e) => e.module == null);
    return audit.filter((e) => e.module === moduleFilter);
  }, [audit, moduleFilter]);

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
      <div className="flex items-center gap-3 px-4 py-3 border-b border-t border-rule bg-paper text-[11px] tech-token">
        <span className="text-muted uppercase tracking-[0.18em] text-[10px]">Filter</span>
        <select
          value={moduleFilter}
          onChange={(e) => setModuleFilter(e.target.value)}
          className="bg-paper rounded-item border border-rule px-2 py-1 text-ink"
        >
          <option value="">All ({audit.length})</option>
          {modules.map((m) => (
            <option key={m} value={m}>
              {m} ({audit.filter((e) => e.module === m).length})
            </option>
          ))}
          <option value="__http__">
            http (middleware) ({audit.filter((e) => e.module == null).length})
          </option>
        </select>
        <span className="text-muted ml-auto">
          {visible.length} of {audit.length}
        </span>
      </div>
      {visible.length === 0 ? (
        <div className="rounded-card border border-rule p-6 text-sm text-muted">
          No entries match this filter.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[1020px]">
            <div className="grid grid-cols-[170px_100px_180px_140px_70px_70px_1fr] gap-4 px-4 py-3 bg-paper border-b border-ink text-[10px] uppercase tracking-[0.18em] text-muted">
              <span>Timestamp</span>
              <span>Module</span>
              <span>Action</span>
              <span>Model</span>
              <span>Tokens</span>
              <span>Latency</span>
              <span>Hash</span>
            </div>
            {visible.map((e) => {
              const isSelected = selectedId === e.id;
              // Blocked / refused / denied actions are the audit-trail
              // events that matter most for "what didn't happen and why".
              // Surface them with the seal accent so they're scannable.
              const isBlocked =
                e.action.includes(".blocked") ||
                e.action.includes(".refused") ||
                e.action.includes(".denied");
              return (
                <button
                  type="button"
                  key={e.id}
                  onClick={() => setSelectedId(e.id)}
                  className={
                    "w-full text-left grid grid-cols-[170px_100px_180px_140px_70px_70px_1fr] gap-4 px-4 py-2.5 border-b border-rule/60 transition-colors text-[11px] items-baseline " +
                    (isSelected ? "bg-wash" : "hover:bg-wash")
                  }
                >
                  <span className="tech-token text-muted">{e.timestamp.slice(0, 19).replace("T", " ")}</span>
                  <span className="text-[10px] uppercase tracking-[0.18em] text-muted truncate">{e.module ?? "-"}</span>
                  <span className={"tech-token truncate " + (isBlocked ? "text-seal line-through decoration-1" : "text-ink")}>{e.action}</span>
                  <span className="tech-token text-prose truncate">{e.model_used ?? "-"}</span>
                  <span className="tech-token text-ink">{e.token_count ?? "-"}</span>
                  <span className="tech-token text-ink">{e.latency_ms != null ? `${e.latency_ms}ms` : "-"}</span>
                  <span className="tech-token text-muted truncate">{(e.prompt_hash ?? "-").slice(0, 8)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {selected && (
        <AuditDetailDrawer entry={selected} matter={matter ?? null} onClose={() => setSelectedId(null)} />
      )}
    </div>
  );
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
        className="fixed top-0 right-0 z-50 h-screen w-[420px] max-w-full bg-paper border-l border-rule p-6 overflow-y-auto"
      >
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <div className="eyebrow mb-2">Audit entry</div>
            <h3 className="text-lg font-bold text-ink leading-tight">{entry.action}</h3>
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

        <dl className="grid grid-cols-[110px_1fr] gap-y-3 gap-x-4 tech-token text-[12px] mb-6">
          <Row label="Timestamp" value={entry.timestamp} />
          <Row label="Module" value={entry.module ?? "-"} />
          <Row label="Action" value={entry.action} />
          <ActorRow actor={entry.actor_id} />
          <ResourceRow entry={entry} />
          <MatterIdRow matterId={entry.matter_id} matter={matter} />
          <Row label="Model" value={entry.model_used ?? "-"} />
          <Row label="Tokens" value={entry.token_count != null ? String(entry.token_count) : "-"} />
          <Row label="Latency" value={entry.latency_ms != null ? `${entry.latency_ms}ms` : "-"} />
          <Row label="Prompt hash" value={entry.prompt_hash ?? "-"} mono break />
          <Row label="Response hash" value={entry.response_hash ?? "-"} mono break />
          <Row label="Entry id" value={entry.id} mono break />
        </dl>

        {hasPayload && (
          <div>
            <div className="eyebrow mb-2">Payload</div>
          <pre className="rounded-card tech-token text-xs bg-wash border border-rule p-3 overflow-x-auto whitespace-pre-wrap break-all">
              {JSON.stringify(entry.payload, null, 2)}
            </pre>
          </div>
        )}
      </aside>
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
      <dd className={"text-ink " + (mono ? "tech-token " : "") + (brk ? "break-all" : "break-words")}>
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
      <dd className="text-ink break-words">{actor}</dd>
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
      <dd className="text-ink tech-token break-words">{value}</dd>
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
          <div className="text-ink break-words">{matter.title}</div>
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
      <dd className="text-ink tech-token break-words">{matterId}</dd>
    </>
  );
}
