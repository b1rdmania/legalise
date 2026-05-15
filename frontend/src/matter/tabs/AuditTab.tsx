import type { AuditEntry } from "../../lib/api";
import { LoadingLine } from "../../ui/primitives";

export function AuditTab({ audit }: { audit: AuditEntry[] | null }) {
  if (!audit) return <LoadingLine label="loading audit" />;
  if (audit.length === 0)
    return (
      <div className="border border-rule p-6 text-sm text-muted">
        No entries yet — actions on this matter will appear here.
      </div>
    );

  return (
    <div className="border-t border-rule overflow-x-auto">
      <div className="min-w-[920px]">
        <div className="grid grid-cols-[180px_180px_140px_80px_80px_1fr] gap-4 px-4 py-3 text-muted bg-paper border-b border-rule font-mono uppercase tracking-track2 text-[9px]">
          <span>Timestamp</span>
          <span>Action</span>
          <span>Model</span>
          <span>Tokens</span>
          <span>Latency</span>
          <span>Payload</span>
        </div>
        {audit.map((e) => (
          <div
            key={e.id}
            className="grid grid-cols-[180px_180px_140px_80px_80px_1fr] gap-4 px-4 py-3 border-b border-rule hover:bg-wash transition-colors font-mono text-[11px] items-center"
          >
            <span className="text-ink">{e.timestamp.slice(0, 19).replace("T", " ")}</span>
            <span className="text-ink font-bold truncate">{e.action}</span>
            <span className="text-prose truncate">{e.model_used ?? "—"}</span>
            <span className="text-ink">{e.token_count ?? "—"}</span>
            <span className="text-ink">{e.latency_ms != null ? `${e.latency_ms}ms` : "—"}</span>
            <span className="text-muted truncate">{(e.prompt_hash ?? "—").slice(0, 8)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
