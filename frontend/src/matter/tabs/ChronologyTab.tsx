import { useState } from "react";
import {
  acceptChronologyEvent,
  buildChronology,
  rejectChronologyEvent,
  type ChronologyResponse,
} from "../../lib/api";
import {
  Badge,
  EmptyState,
  ErrorCallout,
  InlineSpinner,
  LoadingLine,
  ToggleButton,
} from "../../ui/primitives";
import { CprGateBanner } from "../CprGateBanner";

export function ChronologyTab({
  chron,
  slug,
  showSoF,
  setShowSoF,
  onConfirmGate,
  onReload,
}: {
  chron: ChronologyResponse | null;
  // slug + onReload drive auto-build / accept / reject. Omitted in the
  // static demo, where the chronology has no live backend behind it.
  slug?: string;
  showSoF: boolean;
  setShowSoF: (v: boolean) => void;
  onConfirmGate: () => void;
  onReload?: () => void;
}) {
  const [building, setBuilding] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!chron) return <LoadingLine label="loading chronology" />;

  // Auto-build and accept/reject only exist when wired to a live matter.
  const live = Boolean(slug && onReload);

  const onBuild = async () => {
    if (!slug || !onReload) return;
    setBuilding(true);
    setError(null);
    try {
      await buildChronology(slug);
      onReload();
    } catch (err) {
      setError(String(err));
    } finally {
      setBuilding(false);
    }
  };

  const onAccept = async (eventId: string) => {
    if (!slug || !onReload) return;
    setPendingId(eventId);
    setError(null);
    try {
      await acceptChronologyEvent(slug, eventId);
      onReload();
    } catch (err) {
      setError(String(err));
    } finally {
      setPendingId(null);
    }
  };

  const onReject = async (eventId: string) => {
    if (!slug || !onReload) return;
    setPendingId(eventId);
    setError(null);
    try {
      await rejectChronologyEvent(slug, eventId);
      onReload();
    } catch (err) {
      setError(String(err));
    } finally {
      setPendingId(null);
    }
  };

  return (
    <div className="max-w-4xl">
      {/* Same header tier as Documents — this tab previously opened with
          the CPR banner or the auto-build button, no page name. */}
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-ink">Chronology</h1>
        <p className="mt-1 text-sm text-muted">
          The matter's events in date order. Proposed events count only
          once a person accepts them.
        </p>
      </div>

      {chron.gate.required && !chron.gate.confirmed && (
        <CprGateBanner count={chron.gate.tainted_event_count} onConfirm={onConfirmGate} />
      )}

      {error && (
        <div className="mb-4">
          <ErrorCallout message={error} compact />
        </div>
      )}

      {live && (
        <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
          <button
            type="button"
            onClick={onBuild}
            disabled={building}
            className="border border-ink rounded-item px-3 py-1.5 text-[11px] tech-token uppercase tracking-track2 text-ink hover:bg-wash transition-colors inline-flex items-center gap-2 min-h-[36px] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {building && <InlineSpinner />}
            {building ? "Building…" : "Auto-build from documents"}
          </button>
          <p className="text-[11px] text-muted">
            Uses this matter's AI model. Proposed events must be reviewed and accepted by a person before they count.
          </p>
        </div>
      )}

      {chron.events.length === 0 && (
        <EmptyState
          title="No events yet"
          body="Upload dated documents on the Documents tab, or auto-build a draft chronology above. Events are extracted from each document body and appear here with their source for review."
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
            pendingId={pendingId}
            onAccept={onAccept}
            onReject={onReject}
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
  pendingId,
  onAccept,
  onReject,
}: {
  events: import("../../lib/api").ChronologyEvent[];
  pendingId: string | null;
  onAccept: (eventId: string) => void;
  onReject: (eventId: string) => void;
}) {
  // Rejected events drop out of the active view entirely.
  const visible = events.filter((e) => e.status !== "rejected");
  return (
    <div className="border-t border-rule overflow-x-auto">
      <div className="min-w-[720px]">
        <div className="grid grid-cols-[110px_50px_1fr_220px] gap-4 px-4 py-2 bg-paper border-b border-ink text-[10px] uppercase tracking-[0.18em] text-muted">
          <span>Date</span>
          <span>Sig</span>
          <span>Event</span>
          <span>Source · flags</span>
        </div>
        {visible.map((e) => {
        const sigBarWidth = `${Math.max(0, Math.min(100, (e.significance / 5) * 100))}%`;
        const proposed = e.status === "proposed";
        const rowPending = pendingId === e.id;
        return (
          <div
            key={e.id}
            className={`relative grid grid-cols-[110px_50px_1fr_220px] gap-4 items-baseline px-4 py-2.5 hover:bg-wash transition-colors text-[11px] tech-token border-b border-rule/60${
              proposed ? " bg-wash/40" : ""
            }`}
          >
            <div
              /* Significance bar. Was #00A35C green — the one flat green in an
                 Almond & Ink UI, and at sig 5 it flooded the whole row like a
                 broken selection state. A quiet ink wash keeps the encoding. */
              className="absolute right-0 top-0 bottom-0 bg-ink/6 pointer-events-none"
              style={{ width: sigBarWidth }}
              aria-hidden="true"
            />
            <span className="text-ink z-10">{e.event_date}</span>
            <span className="text-muted z-10">{e.significance}</span>
            <span className="z-10 flex flex-wrap items-baseline gap-2 min-w-0">
              {proposed && <Badge>Proposed</Badge>}
              {e.redacted ? (
                <span className="text-seal italic truncate">{e.description}</span>
              ) : (
                <span className="text-ink truncate">{e.description}</span>
              )}
            </span>
            <span className="z-10 flex flex-wrap items-center gap-2 truncate">
              {proposed ? (
                <span className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onAccept(e.id)}
                    disabled={rowPending}
                    className="border border-ink rounded-item px-2 py-0.5 text-[10px] uppercase tracking-track2 text-ink hover:bg-ink hover:text-paper transition-colors inline-flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {rowPending && <InlineSpinner />}
                    Accept
                  </button>
                  <button
                    type="button"
                    onClick={() => onReject(e.id)}
                    disabled={rowPending}
                    className="border border-rule rounded-item px-2 py-0.5 text-[10px] uppercase tracking-track2 text-muted hover:text-seal hover:border-seal transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Reject
                  </button>
                </span>
              ) : (
                e.source_doc_filenames.map((fn) => (
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
                ))
              )}
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
