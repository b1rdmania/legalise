import { useEffect, useState, type ReactNode } from "react";
import { listMatters, type Matter } from "../lib/api";
import { EmptyState, ErrorCallout, PageHeader } from "../ui/primitives";

function formatType(raw: string): string {
  if (!raw) return "-";
  return raw
    .split("_")
    .map((p) => (p.length === 0 ? p : p[0].toUpperCase() + p.slice(1)))
    .join(" ");
}

function MonoPill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-item border border-rule px-2 py-0.5 tech-token uppercase text-[10px] tracking-track2 font-bold text-ink">
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
    <div className="max-w-page mx-auto px-4 sm:px-6 lg:px-10 py-14">
      <PageHeader
        display
        eyebrow="Matters before the workspace"
        eyebrowRight={matters ? `${matters.length} matters` : undefined}
        title="Matters"
        actions={
          <a
            href="/matters/new"
            className="bg-ink text-paper px-4 py-2 hover:bg-seal transition-colors text-sm font-medium min-h-[44px] inline-flex items-center"
          >
            New matter
          </a>
        }
      />

      {error && <ErrorCallout message={error} />}

      {matters && matters.length === 0 && (
        <EmptyState
          title="No matters yet"
          body="Create your first matter to begin."
          action={
            <a
              href="/matters/new"
              className="bg-ink text-paper px-4 py-2 hover:bg-seal transition-colors text-sm font-medium min-h-[44px] inline-flex items-center"
            >
              New matter
            </a>
          }
        />
      )}

      {matters && matters.length > 0 && (
        <div className="border-t border-rule overflow-x-auto">
          <div className="min-w-[860px]">
            <div className="grid grid-cols-[2fr_160px_120px_140px_120px_120px] gap-4 px-4 py-3 bg-paper border-b border-ink text-[10px] uppercase tracking-[0.18em] text-muted">
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
                  <span className="block text-xs tech-token text-muted truncate mt-1">
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
                <span className="text-sm tech-token text-ink">
                  {m.opened_at.slice(0, 10)}
                </span>
                <span className="text-sm tech-token text-muted">
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
