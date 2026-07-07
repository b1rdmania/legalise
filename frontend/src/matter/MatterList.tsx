import { useEffect, useState } from "react";
import { listApiKeys, listMatters, type Matter } from "../lib/api";
import { postureLabel, postureTone } from "../lib/posture";
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
  // A new user has no provider key on file yet. Used to show one quiet
  // first-run orientation note. On error we stay silent rather than nag.
  const [noKey, setNoKey] = useState(false);

  useEffect(() => {
    listMatters()
      .then((rows) => setMatters(rows))
      .catch((e) => setError(String(e)));
    listApiKeys()
      .then((keys) => setNoKey(keys.length === 0))
      .catch(() => setNoKey(false));
  }, []);

  return (
    <div className="page-shell">
      <PageHeader
        display
        title="Matters"
        description="Every matter in this workspace. Each row shows its type, status, and AI-access state. Open a matter to work on it."
        actions={
          /* From md up the rail already pins its own "+ New matter" CTA a
             few hundred pixels away; two identical dark buttons on one
             screen fight for the same weight. Below md the rail is behind
             the drawer, so the header button stays. */
          <a
            href="/matters/new"
            className="bg-ink text-paper px-4 py-2 hover:bg-seal transition-colors text-sm font-medium min-h-[44px] inline-flex items-center md:hidden"
          >
            New matter
          </a>
        }
      />

      {noKey && (
        <div className="mb-8 border border-rule bg-wash px-5 py-4">
          <div className="text-[10px] uppercase tracking-[0.25em] text-muted mb-2">
            Start here
          </div>
          <p className="max-w-2xl text-sm leading-relaxed text-prose">
            New to the workspace? Walk the public demo to see the whole loop
            end to end, with nothing to set up. To run skills on your own
            matters, add a model key in settings.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-5">
            <a
              href="/guided-demo"
              className="text-sm text-ink underline underline-offset-4 decoration-rule transition-colors hover:decoration-seal hover:text-seal"
            >
              Walk the demo
            </a>
            <a
              href="/settings/keys"
              className="text-sm text-muted underline underline-offset-4 decoration-rule transition-colors hover:decoration-seal hover:text-seal"
            >
              Add a model key
            </a>
          </div>
        </div>
      )}

      {error && <ErrorCallout message={error} />}

      {matters && matters.length === 0 && (
        <EmptyState
          title="No matters yet"
          body="You haven't created any matters yet. Create one to get started."
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
          <SectionRule label="All matters" right={String(matters.length)} />
          <div className="mt-1">
            {matters.map((m, i) => (
              <a
                key={m.id}
                href={`/matters/${m.slug}`}
                className="block transition-colors hover:bg-wash"
              >
                <LedgerLine
                  index={i + 1}
                  label={formatType(m.matter_type)}
                  right={
                    <span className="flex items-center gap-3">
                      <span className="text-[10px] uppercase tracking-[0.18em] text-ink">
                        {m.status}
                      </span>
                      {(() => {
                        const tone = postureTone(m.privilege_posture);
                        return (
                          <span
                            className="inline-flex shrink-0 items-center px-2 py-0.5 text-[10px] uppercase tracking-[0.14em]"
                            style={{ color: tone.color, backgroundColor: tone.bg }}
                            title={`AI access: ${postureLabel(m.privilege_posture)}`}
                          >
                            {postureLabel(m.privilege_posture)}
                          </span>
                        );
                      })()}
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
