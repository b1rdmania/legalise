import { useEffect, useState, type ReactNode } from "react";
import { listMatters, type Matter } from "../lib/api";
import { EmptyState, ErrorCallout } from "../ui/primitives";

function formatType(raw: string): string {
  if (!raw) return "-";
  return raw
    .split("_")
    .map((p) => (p.length === 0 ? p : p[0].toUpperCase() + p.slice(1)))
    .join(" ");
}

function MonoPill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center border border-rule px-2 py-0.5 font-mono uppercase text-[10px] tracking-track2 font-bold text-ink">
      {children}
    </span>
  );
}

export function MatterList() {
  const [matters, setMatters] = useState<Matter[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listMatters()
      .then((rows) => setMatters(rows))
      .catch((e) => setError(String(e)));
  }, []);

  return (
    <div className="max-w-page mx-auto px-4 sm:px-6 lg:px-10 py-12">
      <div className="mb-10 flex flex-wrap items-end justify-between gap-6">
        <div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight2 text-ink leading-[1.1] mb-1">
            Matters
          </h1>
          {matters && (
            <p className="text-sm text-muted">{matters.length} matters</p>
          )}
        </div>
        <a
          href="/matters/new"
          className="bg-ink text-paper px-4 py-2 hover:bg-black transition-colors text-sm font-medium min-h-[44px] inline-flex items-center"
        >
          New matter
        </a>
      </div>

      {error && <ErrorCallout message={error} />}

      {matters && matters.length === 0 && (
        <EmptyState
          title="No matters yet"
          body="Create your first matter to begin."
          action={
            <a
              href="/matters/new"
              className="bg-ink text-paper px-4 py-2 hover:bg-black transition-colors text-sm font-medium min-h-[44px] inline-flex items-center"
            >
              New matter
            </a>
          }
        />
      )}

      {matters && matters.length > 0 && (
        <div className="border-t border-rule overflow-x-auto">
          <div className="min-w-[860px]">
            <div className="grid grid-cols-[2fr_160px_120px_140px_120px_120px] gap-4 px-4 py-3 text-muted bg-paper border-b border-rule font-mono uppercase tracking-track2 text-[9px]">
              <span>Matter</span>
              <span>Type</span>
              <span>Status</span>
              <span>Privilege</span>
              <span>Opened</span>
              <span>Retention</span>
            </div>
            {matters.map((m) => (
              <a
                key={m.id}
                href={`/matters/${m.slug}/assistant`}
                className="grid grid-cols-[2fr_160px_120px_140px_120px_120px] gap-4 px-4 py-4 border-b border-rule hover:bg-wash transition-colors items-center"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-ink truncate">
                    {m.title}
                  </span>
                  <span className="block text-xs font-mono text-muted truncate mt-1">
                    {m.slug}
                  </span>
                </span>
                <span className="text-sm text-prose truncate">
                  {formatType(m.matter_type)}
                </span>
                <span>
                  <MonoPill>{m.status}</MonoPill>
                </span>
                <span>
                  <MonoPill>{m.privilege_posture}</MonoPill>
                </span>
                <span className="text-sm font-mono text-ink">
                  {m.opened_at.slice(0, 10)}
                </span>
                <span className="text-sm font-mono text-muted">
                  {m.retention_until ? m.retention_until.slice(0, 10) : "-"}
                </span>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
