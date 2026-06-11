import { useEffect, useState } from "react";
import { listMatters, type Matter } from "../lib/api";
import { postureLabel } from "../lib/posture";
import { EmptyState, ErrorCallout, PageHeader } from "../ui/primitives";
import { LedgerLine, SectionRule } from "../ui/certificate";

function formatType(raw: string): string {
  if (!raw) return "-";
  return raw
    .split("_")
    .map((p) => (p.length === 0 ? p : p[0].toUpperCase() + p.slice(1)))
    .join(" ");
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
        eyebrowRight={
          matters
            ? `${matters.length} matter${matters.length === 1 ? "" : "s"}`
            : undefined
        }
        title="Matters"
        whisper="The cause list"
        description="Every matter this workspace holds, entered in the order it was opened. An entry records the matter's type, whether it stands open or closed, and the posture of its privilege. Open an entry to take up the matter."
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
          title="Nothing entered"
          body="The cause list holds no matters yet. Open one to make the first entry."
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
        <section>
          <SectionRule
            label="Schedule of matters"
            right={String(matters.length)}
          />
          <div className="mt-1">
            {matters.map((m, i) => (
              <a
                key={m.id}
                href={`/matters/${m.slug}/assistant`}
                className="block transition-colors hover:bg-wash"
              >
                <LedgerLine
                  index={i + 1}
                  label={formatType(m.matter_type)}
                  right={
                    <span className="flex items-baseline gap-3">
                      <span className="text-[10px] uppercase tracking-[0.18em] text-ink">
                        {m.status}
                      </span>
                      <span className="hidden text-[10px] uppercase tracking-[0.18em] text-muted sm:inline">
                        {postureLabel(m.privilege_posture)}
                      </span>
                      <span className="tech-token text-[11px] text-muted">
                        {m.opened_at.slice(0, 10)}
                      </span>
                    </span>
                  }
                >
                  <span className="text-ink">{m.title}</span>
                  <span className="ml-2 hidden tech-token text-[11px] text-muted sm:inline">
                    {m.slug}
                  </span>
                </LedgerLine>
              </a>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
