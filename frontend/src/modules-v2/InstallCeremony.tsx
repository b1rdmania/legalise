/**
 * /skills/install/{ceremony_id} — admission to the register.
 *
 * The trust ceremony, rendered as a live scan instead of a stepper.
 * The substrate's verification states (inspect → signature → publisher
 * → permissions → gates) advance automatically on load, each landing
 * as a ledger entry with its real result — every transition is still
 * an individual audit row; the compression is in the clicking, not the
 * record. The scan halts at the decision boundary: one human choice,
 * Approve & enable (granted → enabled) or Refuse (entry struck).
 *
 * State machine (substrate, app/core/trust_ceremony.py):
 *   discovered → inspected → signature_checked → publisher_checked
 *     → permissions_reviewed → gates_reviewed → [decision] → granted
 *     → enabled.
 *   Fast path (verified publisher): discovered → publisher_checked
 *     → permissions_reviewed → [decision] → granted → enabled.
 *   Terminal failures: rejected_by_user / signature_failed /
 *     publisher_blocked / permission_denied / sandbox_profile_missing.
 *
 * Design: Standing Order (docs in the artist pass) — ink/paper/seal,
 * ledger rows with hairline rules, red spent only where something
 * happened (a refusal, a failure, the final seal).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  advanceCeremony,
  getCeremony,
  InvalidCeremonyTransitionError,
  type CeremonyPermissionCard,
  type CeremonyResponse,
} from "../lib/api";

const TERMINAL_FAILURE_STATES: ReadonlySet<string> = new Set([
  "rejected_by_user",
  "signature_failed",
  "publisher_blocked",
  "permission_denied",
  "sandbox_profile_missing",
]);

// Verification states the scan walks through automatically. The order
// matters for rendering; fast-path ceremonies simply never visit some.
const SCAN_STATES = [
  "discovered",
  "inspected",
  "signature_checked",
  "publisher_checked",
  "permissions_reviewed",
  "gates_reviewed",
] as const;

const TIERS = [
  "factual_extraction",
  "legal_information",
  "draft_advice",
  "supervised_legal_advice",
  "approved_final_advice",
] as const;

function decisionState(fastPath: boolean): string {
  return fastPath ? "permissions_reviewed" : "gates_reviewed";
}

function capStrings(card: CeremonyPermissionCard, key: "reads" | "writes"): string[] {
  const out = new Set<string>();
  for (const raw of card.capabilities ?? []) {
    if (!raw || typeof raw !== "object") continue;
    const values = (raw as Record<string, unknown>)[key];
    if (!Array.isArray(values)) continue;
    for (const v of values) if (typeof v === "string") out.add(v);
  }
  return [...out].sort();
}

function gateStrings(card: CeremonyPermissionCard): string[] {
  return Array.isArray(card.gates)
    ? card.gates.filter((g): g is string => typeof g === "string")
    : [];
}

function needsModel(card: CeremonyPermissionCard): boolean {
  return (card.capabilities ?? []).some(
    (raw) =>
      raw &&
      typeof raw === "object" &&
      (raw as Record<string, unknown>).model_access === "required",
  );
}

function localOnly(card: CeremonyPermissionCard): boolean | null {
  const dm = card.data_movement_summary;
  if (!dm || typeof dm !== "object") return null;
  const v = (dm as Record<string, unknown>).local_only;
  return typeof v === "boolean" ? v : null;
}

// One ledger entry per scan state, with the real verification result.
function entryFor(
  state: string,
  card: CeremonyPermissionCard,
): { label: string; value: string; bad?: boolean } | null {
  switch (state) {
    case "discovered":
      return {
        label: "Manifest located",
        value: `${card.module_id}${card.version ? ` · v${card.version}` : ""}`,
      };
    case "inspected":
      return {
        label: "Manifest inspected",
        value: `${(card.capabilities ?? []).length} permission set(s) declared`,
      };
    case "signature_checked": {
      const status = card.signature_status ?? "unknown";
      return {
        label: "Signature",
        value: status.replaceAll("_", " "),
        bad: status === "failed" || status === "invalid",
      };
    }
    case "publisher_checked":
      return {
        label: "Publisher",
        value: `${card.publisher || "unknown"} · ${
          card.publisher_verified ? "verified" : "community — unverified"
        }`,
      };
    case "permissions_reviewed": {
      const reads = capStrings(card, "reads");
      const writes = capStrings(card, "writes");
      return {
        label: "Permissions",
        value:
          [
            reads.length ? `reads ${reads.length}` : null,
            writes.length ? `writes ${writes.length}` : null,
            needsModel(card) ? "model required" : null,
          ]
            .filter(Boolean)
            .join(" · ") || "none declared",
      };
    }
    case "gates_reviewed": {
      const gates = gateStrings(card);
      return {
        label: "Gates",
        value: gates.length ? gates.join(" · ") : "none",
      };
    }
    case "granted":
      return { label: "Standing granted", value: "permissions approved" };
    case "enabled":
      return { label: "Enrolled", value: "added to this workspace" };
    default:
      return null;
  }
}

type Phase =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "scanning" }
  | { kind: "decision" }
  | { kind: "enrolling" }
  | { kind: "enrolled" }
  | { kind: "refused" }
  | { kind: "failed"; state: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function InstallCeremony({ ceremonyId }: { ceremonyId: string }) {
  const nav = useNavigate();
  const [ceremony, setCeremony] = useState<CeremonyResponse | null>(null);
  const [reached, setReached] = useState<string[]>([]);
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [banner, setBanner] = useState<string | null>(null);
  const scanStarted = useRef(false);

  const phaseFor = useCallback((c: CeremonyResponse): Phase => {
    if (c.state === "enabled") return { kind: "enrolled" };
    if (c.state === "rejected_by_user") return { kind: "refused" };
    if (TERMINAL_FAILURE_STATES.has(c.state)) return { kind: "failed", state: c.state };
    if (c.state === decisionState(c.fast_path) || c.state === "granted")
      return { kind: "decision" };
    return { kind: "scanning" };
  }, []);

  // Load + auto-scan. Each advance is its own audited transition; the
  // stagger exists so the operator can watch the workings land.
  useEffect(() => {
    if (scanStarted.current) return; // StrictMode double-mount guard
    scanStarted.current = true;
    let cancelled = false;

    void (async () => {
      let c: CeremonyResponse;
      try {
        c = await getCeremony(ceremonyId);
      } catch (err) {
        if (!cancelled) setPhase({ kind: "error", message: String(err) });
        return;
      }
      if (cancelled) return;
      setCeremony(c);

      // States already passed (revisit / reload) render immediately.
      const seen = new Set<string>();
      for (const h of c.history) {
        const s = (h as Record<string, unknown>).state;
        if (typeof s === "string") seen.add(s);
      }
      seen.add(c.state);
      setReached(SCAN_STATES.filter((s) => seen.has(s)));

      const initial = phaseFor(c);
      setPhase(initial);
      if (initial.kind !== "scanning") return;

      // Walk the verification states. Stop at the decision boundary.
      try {
        const stopAt = decisionState(c.fast_path);
        let safety = 8;
        while (!cancelled && c.state !== stopAt && safety-- > 0) {
          await sleep(450);
          if (cancelled) return;
          c = await advanceCeremony(ceremonyId, "trust");
          if (cancelled) return;
          setCeremony(c);
          setReached((prev) =>
            prev.includes(c.state) ? prev : [...prev, c.state],
          );
          if (c.is_terminal || TERMINAL_FAILURE_STATES.has(c.state)) {
            setPhase(phaseFor(c));
            return;
          }
        }
        if (!cancelled) {
          await sleep(350);
          setPhase({ kind: "decision" });
        }
      } catch (err) {
        if (cancelled) return;
        if (err instanceof InvalidCeremonyTransitionError) {
          setBanner(err.message);
          try {
            const fresh = await getCeremony(ceremonyId);
            setCeremony(fresh);
            setPhase(phaseFor(fresh));
          } catch {
            setPhase({ kind: "error", message: err.message });
          }
          return;
        }
        setPhase({ kind: "error", message: String(err) });
      }
    })();

    return () => {
      // StrictMode mounts effects twice: the first run is cancelled here,
      // so release the guard and let the surviving mount run the scan.
      cancelled = true;
      scanStarted.current = false;
    };
  }, [ceremonyId, phaseFor]);

  const onApprove = async () => {
    if (!ceremony) return;
    setPhase({ kind: "enrolling" });
    try {
      let c = ceremony;
      // granted (module.grant.created) then grant → enabled
      // (module.enabled). Two audited transitions, one decision.
      if (c.state !== "granted") {
        c = await advanceCeremony(ceremonyId, "trust");
        setCeremony(c);
        setReached((prev) => [...prev, "granted"]);
        await sleep(450);
      }
      c = await advanceCeremony(ceremonyId, "grant");
      setCeremony(c);
      setReached((prev) => [...prev, "enabled"]);
      setPhase({ kind: "enrolled" });
    } catch (err) {
      if (err instanceof InvalidCeremonyTransitionError) {
        setBanner(err.message);
        const fresh = await getCeremony(ceremonyId).catch(() => null);
        if (fresh) {
          setCeremony(fresh);
          setPhase(phaseFor(fresh));
          return;
        }
      }
      setPhase({ kind: "error", message: String(err) });
    }
  };

  const onRefuse = async () => {
    try {
      const c = await advanceCeremony(ceremonyId, "reject");
      setCeremony(c);
      setPhase({ kind: "refused" });
      window.setTimeout(() => {
        void nav({ to: "/skills" });
      }, 1400);
    } catch (err) {
      setPhase({ kind: "error", message: String(err) });
    }
  };

  const backLink = (
    <p className="mb-6">
      <Link
        to="/skills"
        className="text-sm text-muted underline underline-offset-4 decoration-rule hover:decoration-seal hover:text-seal"
      >
        ← Skills
      </Link>
    </p>
  );

  if (phase.kind === "loading") {
    return (
      <div className="page-shell">
        {backLink}
        <p className="text-sm text-muted">Opening the record…</p>
      </div>
    );
  }
  if (phase.kind === "error" || !ceremony) {
    return (
      <div className="page-shell">
        {backLink}
        <h1 className="text-xl font-bold tracking-tight2">Ceremony not found</h1>
        <p className="mt-3 text-sm text-muted">
          {phase.kind === "error" ? phase.message : "No ceremony loaded."}
        </p>
      </div>
    );
  }

  const card = ceremony.permission_card;
  const scanning = phase.kind === "scanning";
  const refused = phase.kind === "refused";

  return (
    <div className="page-shell">
      <p className="text-[10px] uppercase tracking-[0.25em] text-muted">
        The register of AI counsel — admission
      </p>
      <h1 className="mt-3 text-[32px] leading-tight tracking-tight2">
        {card.module_name || ceremony.module_id}
      </h1>
      <p className="mt-1 text-xs text-muted">
        {card.publisher || "unknown publisher"}
        {card.version ? ` · v${card.version}` : ""} ·{" "}
        <span className="tech-token">{ceremony.ceremony_id.slice(0, 8)}</span>
      </p>

      {/* The scan ledger */}
      <div className="mt-10 border-t border-rule" data-testid="ceremony-scan">
        {reached.map((state, i) => {
          const e = entryFor(state, card);
          if (!e) return null;
          return (
            <div
              key={state}
              data-testid={`scan-row-${state}`}
              className="flex items-baseline gap-4 border-b border-rule/60 py-2.5 animate-[fadeIn_0.4s_ease-out]"
            >
              <span className="tech-token w-10 shrink-0 text-[11px] text-muted">
                {String(i + 1).padStart(4, "0")}
              </span>
              <span className="w-40 shrink-0 text-[10px] uppercase tracking-[0.18em] text-muted">
                {e.label}
              </span>
              <span
                className={
                  "flex-1 text-sm " + (e.bad ? "text-seal" : "text-ink")
                }
              >
                {e.value}
              </span>
              <span
                aria-hidden="true"
                className={
                  "shrink-0 text-xs " + (e.bad ? "text-seal" : "text-ink")
                }
              >
                {e.bad ? "✕" : "✓"}
              </span>
            </div>
          );
        })}
        {scanning && (
          <div className="flex items-baseline gap-4 py-2.5">
            <span className="tech-token w-10 shrink-0 text-[11px] text-muted">
              {String(reached.length + 1).padStart(4, "0")}
            </span>
            <span className="text-sm text-muted">verifying…</span>
          </div>
        )}
        {refused && (
          <div
            className="flex items-baseline gap-4 border-b border-seal/50 py-2.5"
            data-testid="scan-row-refused"
          >
            <span className="tech-token w-10 shrink-0 text-[11px] text-seal">
              {String(reached.length + 1).padStart(4, "0")}
            </span>
            <span className="w-40 shrink-0 text-[10px] uppercase tracking-[0.18em] text-seal">
              Refused
            </span>
            <span className="flex-1 text-sm text-seal line-through">
              admission declined — entry struck
            </span>
            <span aria-hidden="true" className="shrink-0 text-xs text-seal">
              ✕
            </span>
          </div>
        )}
      </div>

      {banner && (
        <div className="mt-6 border border-seal/40 bg-seal/5 px-4 py-3 text-sm text-seal">
          {banner}
        </div>
      )}

      {/* The decision */}
      {(phase.kind === "decision" || phase.kind === "enrolling") && (
        <Decision
          card={card}
          enrolling={phase.kind === "enrolling"}
          onApprove={() => void onApprove()}
          onRefuse={() => void onRefuse()}
        />
      )}

      {phase.kind === "enrolled" && (
        <div className="mt-10 border border-rule bg-paper p-5" data-testid="ceremony-enrolled">
          <p className="text-[10px] uppercase tracking-[0.25em] text-muted">
            Admitted to the register
          </p>
          <p className="mt-2 text-sm leading-relaxed text-prose">
            {card.module_name || ceremony.module_id} holds standing in this
            workspace. It runs only on matters where it is enabled, and every
            run leaves a signed, auditable record.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              to="/register"
              className="inline-flex items-center rounded-md bg-ink px-4 py-2 text-sm text-paper hover:opacity-90"
            >
              View the register
            </Link>
            <Link
              to="/skills"
              className="inline-flex items-center rounded-md border border-rule px-4 py-2 text-sm hover:border-ink"
            >
              Back to the library
            </Link>
          </div>
        </div>
      )}

      {phase.kind === "failed" && (
        <div className="mt-10 border border-seal/40 bg-seal/5 p-5">
          <p className="text-sm font-medium text-seal">
            Admission terminated: {phase.state.replaceAll("_", " ")}
          </p>
          <p className="mt-1 text-sm text-muted">
            The refusal is recorded with the same fidelity as an approval.
            Return to the library to start again.
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function Decision({
  card,
  enrolling,
  onApprove,
  onRefuse,
}: {
  card: CeremonyPermissionCard;
  enrolling: boolean;
  onApprove: () => void;
  onRefuse: () => void;
}) {
  const reads = capStrings(card, "reads");
  const writes = capStrings(card, "writes");
  const local = localOnly(card);
  const tierIdx = Math.max(
    0,
    TIERS.indexOf((card.advice_tier_max ?? "factual_extraction") as (typeof TIERS)[number]),
  );

  return (
    <section className="mt-10" data-testid="ceremony-decision">
      <p className="text-[10px] uppercase tracking-[0.25em] text-muted">
        Grant of standing
      </p>
      <div className="mt-3 space-y-2 text-sm leading-relaxed text-prose">
        {reads.length > 0 && (
          <p>
            Reads{" "}
            {reads.map((r, i) => (
              <span key={r}>
                <span className="tech-token text-xs">{r}</span>
                {i < reads.length - 1 ? ", " : ""}
              </span>
            ))}
            .
          </p>
        )}
        {writes.length > 0 && (
          <p>
            Writes{" "}
            {writes.map((w, i) => (
              <span key={w}>
                <span className="tech-token text-xs">{w}</span>
                {i < writes.length - 1 ? ", " : ""}
              </span>
            ))}
            .
          </p>
        )}
        {needsModel(card) && (
          <p>
            Calls the model through the workspace gateway, under each
            matter's privilege posture — a paused matter blocks the call.
          </p>
        )}
        {local === true && <p>Nothing leaves the workspace.</p>}
        {local === false && (
          <p className="text-seal">Sends data outside the workspace.</p>
        )}
        <p className="flex items-center gap-2">
          <span>Advice ceiling:</span>
          <span aria-hidden="true" className="tracking-[0.2em] text-ink">
            {TIERS.map((_t, i) => (i <= tierIdx ? "●" : "○")).join("")}
          </span>
          <span className="text-xs text-muted">
            {(card.advice_tier_max ?? "factual_extraction").replaceAll("_", " ")}
          </span>
        </p>
        <p className="text-xs text-muted">
          Workspace-wide trust; running it is enabled per matter. Every run
          is recorded and its output requires review and sign-off.
        </p>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onApprove}
          disabled={enrolling}
          data-testid="ceremony-approve-all"
          className="inline-flex items-center rounded-md bg-ink px-5 py-2.5 text-sm text-paper hover:bg-seal disabled:opacity-50"
        >
          {enrolling ? "Recording…" : "Approve & enable"}
        </button>
        <button
          type="button"
          onClick={onRefuse}
          disabled={enrolling}
          data-testid="ceremony-refuse"
          className="inline-flex items-center px-3 py-2.5 text-sm text-muted hover:text-seal disabled:opacity-50"
        >
          Refuse admission
        </button>
      </div>
    </section>
  );
}
