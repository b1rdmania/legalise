/**
 * Phase 14 B — /modules/install/{ceremony_id}.
 *
 * Trust-ceremony stepper. Reads ceremony state via GET /api/modules/install/{id}
 * and lets an admin advance via POST .../advance with action=trust|grant|reject.
 *
 * State machine (substrate, see app/core/trust_ceremony.py:CeremonyState):
 *   discovered → inspected → signature_checked → publisher_checked
 *     → permissions_reviewed → gates_reviewed → granted → enabled
 *   Terminal: enabled / rejected_by_user / signature_failed /
 *             publisher_blocked / permission_denied /
 *             sandbox_profile_missing
 *
 * Action policy (mirrors substrate):
 *   - "trust"  — non-terminal, non-granted: advance one step
 *   - "grant"  — only valid at the granted-ready boundary; persists
 *                InstalledModule and emits module.enabled
 *   - "reject" — any non-terminal: emits module.denied + returns to /modules
 *
 * 409 invalid-transition path (Phase 5 reviewer fix at modules.py:794):
 *   substrate emits module.ceremony.rejected via audit_failure; this
 *   UI surfaces a structured banner naming that audit row, but does
 *   NOT link out. Ceremonies are workspace-scoped, not matter-scoped,
 *   so the existing /matters/{slug}/audit reconstruction view (Phase
 *   14 E) wouldn't surface a ceremony rejection. A global/admin audit
 *   reconstruction surface is a backlog finding (BACKEND_GAP_AUDIT
 *   14-B-#2). Until that lands, the banner is informational only.
 *
 * Reviewer-narrow: no install retry, no manifest editor here (Update
 * is on the detail page), no telemetry beyond the substrate audit rows.
 */

import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  advanceCeremony,
  getCeremony,
  InvalidCeremonyTransitionError,
  type CeremonyAction,
  type CeremonyResponse,
} from "../lib/api";

const ORDERED_STATES: ReadonlyArray<{
  key: string;
  label: string;
  blurb: string;
}> = [
  { key: "discovered", label: "Discovered", blurb: "Module manifest located in the registry." },
  { key: "inspected", label: "Inspected", blurb: "Manifest shape + structural validation passed." },
  { key: "signature_checked", label: "Signature checked", blurb: "Signature verified (or fast-path declared)." },
  { key: "publisher_checked", label: "Publisher checked", blurb: "Publisher identity confirmed against policy." },
  { key: "permissions_reviewed", label: "Permissions reviewed", blurb: "Capabilities + data-movement summary acknowledged." },
  { key: "gates_reviewed", label: "Gates reviewed", blurb: "Posture + advice-tier gates acknowledged." },
  { key: "granted", label: "Granted", blurb: "All capabilities approved; ready to enable." },
  { key: "enabled", label: "Enabled", blurb: "Module installed and available." },
];

const TERMINAL_FAILURE_STATES: ReadonlySet<string> = new Set([
  "rejected_by_user",
  "signature_failed",
  "publisher_blocked",
  "permission_denied",
  "sandbox_profile_missing",
]);

type CeremonyQuery =
  | { status: "loading" }
  | { status: "ready"; ceremony: CeremonyResponse }
  | { status: "error"; message: string };

type AdvanceState =
  | { kind: "idle" }
  | { kind: "running"; action: CeremonyAction }
  | {
      kind: "invalid_transition";
      message: string;
      requestedAction: CeremonyAction;
      ceremonyId: string;
    }
  | { kind: "error"; message: string };

export function InstallCeremony({ ceremonyId }: { ceremonyId: string }) {
  const nav = useNavigate();
  const [q, setQ] = useState<CeremonyQuery>({ status: "loading" });
  const [adv, setAdv] = useState<AdvanceState>({ kind: "idle" });

  const refresh = useCallback(async () => {
    try {
      const ceremony = await getCeremony(ceremonyId);
      setQ({ status: "ready", ceremony });
    } catch (err) {
      setQ({ status: "error", message: String(err) });
    }
  }, [ceremonyId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onAdvance = async (action: CeremonyAction) => {
    setAdv({ kind: "running", action });
    try {
      const next = await advanceCeremony(ceremonyId, action);
      setAdv({ kind: "idle" });
      if (action === "reject") {
        // Reject is terminal; bounce to catalog after a beat so the
        // user sees the terminal-state row before the route change.
        setQ({ status: "ready", ceremony: next });
        window.setTimeout(() => {
          void nav({ to: "/modules" });
        }, 700);
        return;
      }
      setQ({ status: "ready", ceremony: next });
    } catch (err) {
      if (err instanceof InvalidCeremonyTransitionError) {
        setAdv({
          kind: "invalid_transition",
          message: err.message,
          requestedAction: err.requestedAction,
          ceremonyId: err.ceremonyId,
        });
        // Refresh to get authoritative state — substrate may have moved
        // it via the audit_failure side-channel.
        void refresh();
        return;
      }
      setAdv({ kind: "error", message: String(err) });
    }
  };

  if (q.status === "loading") {
    return (
      <div className="mx-auto max-w-3xl px-6 py-12 text-sm text-muted">
        Loading ceremony…
      </div>
    );
  }
  if (q.status === "error") {
    return (
      <div className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-xl font-serif">Ceremony not found</h1>
        <p className="mt-3 text-sm text-muted">{q.message}</p>
      </div>
    );
  }

  const c = q.ceremony;
  const isTerminal = c.is_terminal;
  const isFailure = TERMINAL_FAILURE_STATES.has(c.state);

  return (
    <div className="mx-auto max-w-3xl px-6 py-12 text-ink">
      <p className="text-xs uppercase tracking-widest text-muted">
        Trust ceremony
      </p>
      <h1 className="mt-2 text-3xl font-serif">{c.module_id}</h1>
      <p className="mt-1 text-xs font-mono text-muted">
        ceremony {c.ceremony_id}
      </p>

      <Stepper currentState={c.state} />

      <PermissionCard card={c.permission_card} />

      {/* Banners */}
      {adv.kind === "invalid_transition" && (
        <InvalidTransitionBanner state={adv} />
      )}
      {adv.kind === "error" && (
        <div className="mt-6 rounded-md border border-seal/40 bg-seal/5 px-4 py-3 text-sm text-seal">
          {adv.message}
        </div>
      )}
      {isFailure && (
        <div className="mt-6 rounded-md border border-seal/40 bg-seal/5 px-4 py-3">
          <p className="text-sm font-medium text-seal">
            Ceremony terminated: {c.state}
          </p>
          <p className="mt-1 text-sm text-muted">
            No further actions. Return to the catalog to start a new
            ceremony if needed.
          </p>
        </div>
      )}

      {/* Controls */}
      {!isTerminal && (
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => onAdvance("trust")}
            disabled={adv.kind === "running"}
            className="inline-flex items-center rounded-md bg-ink px-4 py-2 text-paper hover:opacity-90 disabled:opacity-50"
          >
            {adv.kind === "running" && adv.action === "trust"
              ? "Advancing…"
              : c.state === "granted"
                ? "Trust (already granted)"
                : "Trust + continue"}
          </button>
          <button
            type="button"
            onClick={() => onAdvance("grant")}
            disabled={adv.kind === "running"}
            className="inline-flex items-center rounded-md border border-ink px-4 py-2 text-ink hover:bg-ink hover:text-paper disabled:opacity-50"
          >
            {adv.kind === "running" && adv.action === "grant"
              ? "Enabling…"
              : "Grant + enable"}
          </button>
          <button
            type="button"
            onClick={() => onAdvance("reject")}
            disabled={adv.kind === "running"}
            className="inline-flex items-center rounded-md border border-line px-4 py-2 text-muted hover:text-ink disabled:opacity-50"
          >
            {adv.kind === "running" && adv.action === "reject"
              ? "Rejecting…"
              : "Reject"}
          </button>
        </div>
      )}

      {c.state === "enabled" && (
        <div className="mt-8 rounded-md border border-line p-4">
          <p className="text-sm font-medium">Module enabled</p>
          <p className="mt-1 text-sm text-muted">
            The InstalledModule row is persisted and a{" "}
            <span className="font-mono">module.enabled</span> audit row
            was written.
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function Stepper({ currentState }: { currentState: string }) {
  const currentIdx = ORDERED_STATES.findIndex((s) => s.key === currentState);
  const isFailure = TERMINAL_FAILURE_STATES.has(currentState);

  return (
    <ol className="mt-8 space-y-3">
      {ORDERED_STATES.map((step, i) => {
        const done = !isFailure && i < currentIdx;
        const active = !isFailure && i === currentIdx;
        return (
          <li key={step.key} className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className={
                "mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full border text-xs " +
                (done
                  ? "border-ink bg-ink text-paper"
                  : active
                    ? "border-ink text-ink"
                    : "border-line text-muted")
              }
            >
              {done ? "✓" : i + 1}
            </span>
            <div className="text-sm">
              <p className={active ? "font-medium" : "text-muted"}>
                {step.label}
              </p>
              <p className="text-xs text-muted">{step.blurb}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function PermissionCard({
  card,
}: {
  card: CeremonyResponse["permission_card"];
}) {
  const caps = Array.isArray(card.capabilities) ? card.capabilities : [];
  const events = Array.isArray(card.audit_events) ? card.audit_events : [];
  return (
    <section className="mt-10 rounded-md border border-line p-4">
      <h2 className="text-sm uppercase tracking-widest text-muted">
        Permission card
      </h2>
      <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
        <DT label="Module">
          {card.module_name ?? card.module_id}
        </DT>
        <DT label="Version">{card.version ?? "—"}</DT>
        <DT label="Publisher">
          {card.publisher ?? "—"}
          {card.publisher_verified ? " (verified)" : ""}
        </DT>
        <DT label="Signature">{card.signature_status ?? "—"}</DT>
        <DT label="Visibility">{card.visibility ?? "—"}</DT>
        <DT label="Advice tier max">{card.advice_tier_max ?? "—"}</DT>
        <DT label="Capabilities">{caps.length}</DT>
        <DT label="Audit events">{events.length}</DT>
      </dl>
    </section>
  );
}

function DT({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-widest text-muted">{label}</dt>
      <dd className="mt-1">{children}</dd>
    </div>
  );
}

function InvalidTransitionBanner({
  state,
}: {
  state: Extract<AdvanceState, { kind: "invalid_transition" }>;
}) {
  // No audit deep-link here: ceremonies are workspace-scoped, not
  // matter-scoped, and the only existing audit surface is the matter
  // reconstruction page (Phase 14 E target). A global/admin audit
  // reconstruction surface is filed as BACKEND_GAP_AUDIT 14-B-#2;
  // until that ships, the banner names the audit row and stops.
  return (
    <div className="mt-6 rounded-md border border-seal/40 bg-seal/5 px-4 py-3">
      <p className="text-sm font-medium text-seal">
        Invalid ceremony transition
      </p>
      <p className="mt-1 text-sm text-muted">
        Action <span className="font-mono">{state.requestedAction}</span> is
        not valid from the current state. {state.message}
      </p>
      <p className="mt-2 text-sm text-muted">
        The substrate wrote a{" "}
        <span className="font-mono">module.ceremony.rejected</span> audit
        row for this attempt. A global audit-trail view is not yet
        surfaced (tracked as BACKEND_GAP_AUDIT finding 14-B-#2); until
        then the substrate row is the source of truth.
      </p>
    </div>
  );
}
