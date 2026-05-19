import type { ChronologyResponse } from "../../lib/api";
import { Badge, LoadingLine, ToggleButton } from "../../ui/primitives";
import { CprGateBanner } from "../CprGateBanner";

export function ChronologyTab({
  chron,
  showSoF,
  setShowSoF,
  onConfirmGate,
}: {
  chron: ChronologyResponse | null;
  showSoF: boolean;
  setShowSoF: (v: boolean) => void;
  onConfirmGate: () => void;
}) {
  if (!chron) return <LoadingLine label="loading chronology" />;

  return (
    <div className="max-w-4xl">
      <div className="mb-10 pb-8 border-b border-rule">
        <div className="eyebrow mb-3">05 · Chronology</div>
        <h2 className="text-2xl font-bold tracking-tight2 text-ink mb-3">
          Chronology
        </h2>
        <p className="text-sm text-prose max-w-2xl leading-relaxed">
          Events extracted from the matter documents, sorted by date.
          Disclosure-sourced events sit behind the CPR 31.22 gate until
          counsel acknowledges the implied undertaking. The Statement of
          facts variant filters to significance four and above.
        </p>
      </div>

      {chron.gate.required && !chron.gate.confirmed && (
        <CprGateBanner count={chron.gate.tainted_event_count} onConfirm={onConfirmGate} />
      )}

      {chron.events.length === 0 && (
        <div className="border border-rule p-6 text-sm text-muted">
          No events seeded. Live extraction lands v0.2.
        </div>
      )}

      {chron.events.length > 0 && (
        <>
          <div className="flex gap-4 border-b border-rule h-10 items-center mb-4">
            <ToggleButton active={!showSoF} onClick={() => setShowSoF(false)}>
              Full
            </ToggleButton>
            <ToggleButton active={showSoF} onClick={() => setShowSoF(true)}>
              Statement of facts
            </ToggleButton>
          </div>
          <ChronologyTable
            events={showSoF ? chron.statement_of_facts_variant : chron.events}
          />
          {chron.gate.confirmed && chron.gate.confirmed_at && (
            <p className="font-mono text-[11px] text-muted mt-4">
              cpr_31_22_acknowledged · {chron.gate.confirmed_at.slice(0, 19).replace("T", " ")}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function ChronologyTable({
  events,
}: {
  events: import("../../lib/api").ChronologyEvent[];
}) {
  return (
    <div className="border-t border-rule overflow-x-auto">
      <div className="min-w-[720px]">
        <div className="grid grid-cols-[110px_50px_1fr_220px] gap-4 px-4 py-2 text-muted bg-paper border-b border-rule font-mono uppercase tracking-track2 text-[9px]">
          <span>Date</span>
          <span>Sig</span>
          <span>Event</span>
          <span>Source · flags</span>
        </div>
        {events.map((e) => {
        const sigBarWidth = `${Math.max(0, Math.min(100, (e.significance / 5) * 100))}%`;
        return (
          <div
            key={e.id}
            className="relative h-[22px] grid grid-cols-[110px_50px_1fr_220px] gap-4 items-center px-4 hover:bg-wash transition-colors text-[11px] font-mono border-b border-rule"
          >
            <div
              className="absolute right-0 top-0 bottom-0 bg-[#00A35C]/15 pointer-events-none"
              style={{ width: sigBarWidth }}
              aria-hidden="true"
            />
            <span className="text-ink z-10 font-bold">{e.event_date}</span>
            <span className="text-muted z-10">{e.significance}</span>
            {e.redacted ? (
              <span className="text-[#D9304F] italic z-10 truncate">{e.description}</span>
            ) : (
              <span className="text-ink z-10 truncate">{e.description}</span>
            )}
            <span className="z-10 flex flex-wrap items-center gap-2 truncate">
              {e.source_doc_filenames.map((fn) => (
                <a
                  key={fn}
                  href="#"
                  onClick={(ev) => ev.preventDefault()}
                  className="text-muted hover:text-ink truncate max-w-[160px]"
                >
                  {fn}
                </a>
              ))}
              {e.from_disclosure && <Badge>CPR 31.22</Badge>}
              {e.priv_flag && <Badge>PRIV</Badge>}
            </span>
          </div>
        );
      })}
      </div>
    </div>
  );
}
