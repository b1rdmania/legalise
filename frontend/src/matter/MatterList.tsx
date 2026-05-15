import { useEffect, useState } from "react";
import { listMatters, type Matter } from "../lib/api";
import { ErrorCallout, StatusBadge } from "../ui/primitives";

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
          <div className="eyebrow font-mono text-muted mb-4">MATTERS</div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight2 text-ink leading-[1.1]">
            All matters.
          </h1>
          {matters && (
            <p className="text-sm text-muted mt-3">
              {matters.length} record{matters.length === 1 ? "" : "s"}
            </p>
          )}
        </div>
        <a
          href="#/matters/new"
          className="bg-ink text-paper px-4 py-2 hover:bg-black transition-colors text-sm font-medium min-h-[44px] inline-flex items-center"
        >
          New matter
        </a>
      </div>

      {error && <ErrorCallout message={error} />}

      {matters && matters.length === 0 && (
        <div className="border border-rule p-6 text-sm text-muted">
          No matters yet —{" "}
          <a
            href="#/matters/new"
            className="text-ink underline hover:text-muted"
          >
            create one
          </a>
          .
        </div>
      )}

      {matters && matters.length > 0 && (
        <div className="border-t border-rule overflow-x-auto">
          <div className="min-w-[640px]">
            <div className="grid grid-cols-[1fr_180px_120px_140px] gap-4 px-4 py-3 text-muted bg-paper border-b border-rule font-mono uppercase tracking-track2 text-[9px]">
              <span>Slug</span>
              <span>Type</span>
              <span>Status</span>
              <span>Opened</span>
            </div>
            {matters.map((m) => (
              <a
                key={m.id}
                href={`#/matters/${m.slug}`}
                className="grid grid-cols-[1fr_180px_120px_140px] gap-4 px-4 py-3 border-b border-rule hover:bg-wash transition-colors font-mono text-[11px]"
              >
                <span className="text-ink font-bold truncate">{m.slug}</span>
                <span className="text-prose truncate">{m.matter_type}</span>
                <span>
                  <StatusBadge status={m.status} />
                </span>
                <span className="text-ink">{m.opened_at.slice(0, 10)}</span>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
