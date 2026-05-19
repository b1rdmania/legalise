import { useEffect, useMemo, useState } from "react";

import type { AuditEntry } from "../../lib/api";
import { LoadingLine } from "../../ui/primitives";

export function AuditTab({ audit }: { audit: AuditEntry[] | null }) {
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
      <div className="flex items-center gap-3 px-4 py-3 border-b border-t border-rule bg-paper text-[11px] font-mono">
        <span className="text-muted uppercase tracking-track2 text-[9px]">Filter</span>
        <select
          value={moduleFilter}
          onChange={(e) => setModuleFilter(e.target.value)}
          className="bg-paper border border-rule px-2 py-1 text-ink"
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
        <div className="border border-rule p-6 text-sm text-muted">
          No entries match this filter.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[1020px]">
            <div className="grid grid-cols-[170px_100px_180px_140px_70px_70px_1fr] gap-4 px-4 py-3 text-muted bg-paper border-b border-rule font-mono uppercase tracking-track2 text-[9px]">
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
              return (
                <button
                  type="button"
                  key={e.id}
                  onClick={() => setSelectedId(e.id)}
                  className={
                    "w-full text-left grid grid-cols-[170px_100px_180px_140px_70px_70px_1fr] gap-4 px-4 py-3 border-b border-rule transition-colors font-mono text-[11px] items-center " +
                    (isSelected ? "bg-wash" : "hover:bg-wash")
                  }
                >
                  <span className="text-ink">{e.timestamp.slice(0, 19).replace("T", " ")}</span>
                  <span className="text-prose truncate">{e.module ?? "-"}</span>
                  <span className="text-ink font-bold truncate">{e.action}</span>
                  <span className="text-prose truncate">{e.model_used ?? "-"}</span>
                  <span className="text-ink">{e.token_count ?? "-"}</span>
                  <span className="text-ink">{e.latency_ms != null ? `${e.latency_ms}ms` : "-"}</span>
                  <span className="text-muted truncate">{(e.prompt_hash ?? "-").slice(0, 8)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {selected && (
        <AuditDetailDrawer entry={selected} onClose={() => setSelectedId(null)} />
      )}
    </div>
  );
}

function AuditDetailDrawer({ entry, onClose }: { entry: AuditEntry; onClose: () => void }) {
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

        <dl className="grid grid-cols-[110px_1fr] gap-y-3 gap-x-4 font-mono text-[12px] mb-6">
          <Row label="Timestamp" value={entry.timestamp} />
          <Row label="Module" value={entry.module ?? "-"} />
          <Row label="Action" value={entry.action} />
          <Row label="Actor" value={entry.actor_id ?? "system"} />
          <Row label="Resource" value={resourceLabel(entry)} />
          <Row label="Matter id" value={entry.matter_id ?? "-"} />
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
            <pre className="font-mono text-xs bg-wash border border-rule p-3 overflow-x-auto whitespace-pre-wrap break-all">
              {JSON.stringify(entry.payload, null, 2)}
            </pre>
          </div>
        )}
      </aside>
    </>
  );
}

function resourceLabel(entry: AuditEntry): string {
  const type = entry.resource_type;
  const id = entry.resource_id;
  if (!type && !id) return "-";
  if (type && id) return `${type}:${id}`;
  return id ?? type ?? "-";
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
      <dd className={"text-ink " + (mono ? "font-mono " : "") + (brk ? "break-all" : "break-words")}>
        {value}
      </dd>
    </>
  );
}
