import { useMemo, useState } from "react";

import type { AuditEntry } from "../../lib/api";
import { LoadingLine } from "../../ui/primitives";

export function AuditTab({ audit }: { audit: AuditEntry[] | null }) {
  const [moduleFilter, setModuleFilter] = useState<string>("");

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
            {visible.map((e) => (
              <div
                key={e.id}
                className="grid grid-cols-[170px_100px_180px_140px_70px_70px_1fr] gap-4 px-4 py-3 border-b border-rule hover:bg-wash transition-colors font-mono text-[11px] items-center"
              >
                <span className="text-ink">{e.timestamp.slice(0, 19).replace("T", " ")}</span>
                <span className="text-prose truncate">{e.module ?? "-"}</span>
                <span className="text-ink font-bold truncate">{e.action}</span>
                <span className="text-prose truncate">{e.model_used ?? "-"}</span>
                <span className="text-ink">{e.token_count ?? "-"}</span>
                <span className="text-ink">{e.latency_ms != null ? `${e.latency_ms}ms` : "-"}</span>
                <span className="text-muted truncate">{(e.prompt_hash ?? "-").slice(0, 8)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
