import type { ChronologyResponse } from "../../lib/api";
import { Badge, EmptyState, LoadingLine, ToggleButton } from "../../ui/primitives";
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
      {chron.gate.required && !chron.gate.confirmed && (
        <CprGateBanner count={chron.gate.tainted_event_count} onConfirm={onConfirmGate} />
      )}

      {chron.events.length === 0 && (
        <EmptyState
          title="No events yet"
          body="Upload dated documents on the Documents tab. Chronology events are extracted from each document body and appear here with their source."
        />
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
            <p className="tech-token text-[11px] text-muted mt-4">
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
        <div className="grid grid-cols-[110px_50px_1fr_220px] gap-4 px-4 py-2 bg-paper border-b border-ink text-[10px] uppercase tracking-[0.18em] text-muted">
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
            className="relative grid grid-cols-[110px_50px_1fr_220px] gap-4 items-baseline px-4 py-2.5 hover:bg-wash transition-colors text-[11px] tech-token border-b border-rule/60"
          >
            <div
              className="absolute right-0 top-0 bottom-0 bg-[#00A35C]/15 pointer-events-none"
              style={{ width: sigBarWidth }}
              aria-hidden="true"
            />
            <span className="text-ink z-10">{e.event_date}</span>
            <span className="text-muted z-10">{e.significance}</span>
            {e.redacted ? (
              <span className="text-seal italic z-10 truncate">{e.description}</span>
            ) : (
              <span className="text-ink z-10 truncate">{e.description}</span>
            )}
            <span className="z-10 flex flex-wrap items-center gap-2 truncate">
              {e.source_doc_filenames.map((fn) => (
                // TODO(joy-source-link): wire to the source document when
                // a routed Document detail view lands. Plain span keeps
                // the source visible without faking an affordance.
                <span
                  key={fn}
                  className="text-muted truncate max-w-[160px]"
                  title={fn}
                >
                  {fn}
                </span>
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
