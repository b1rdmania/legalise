import type { AuditEntry, Matter, MatterDocument } from "../lib/api";
import type { TabKey } from "./tabs/types";

interface Props {
  matter: Matter;
  docs: MatterDocument[] | null;
  audit: AuditEntry[] | null;
  // Kept for signature compatibility with MatterDetail; nav now lives
  // in the global sidebar (Phase 17-IA), so the summary no longer
  // renders its own action buttons.
  onSelectTab?: (tab: TabKey) => void;
}

function postureLabel(posture: string): string {
  if (posture === "A_cleared") return "Cleared";
  if (posture === "B_mixed") return "Mixed";
  if (posture === "C_paused") return "Paused";
  return posture;
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  return value.slice(0, 10);
}

// Phase 17-IA-B: a slim record header, not a stat-strip + coaching
// box. Canonical tokens only (border-rule, square, no shadow) to match
// the Audit page density — kills the border-line/shadow/rounded design
// leak the walkthrough flagged. Nav moved to the sidebar, so no action
// buttons here.
export function MatterRecordSummary({ matter, docs, audit }: Props) {
  const facts: { label: string; value: string }[] = [
    { label: "Posture", value: postureLabel(matter.privilege_posture) },
    { label: "Type", value: matter.matter_type },
    { label: "Status", value: matter.status },
    { label: "Documents", value: docs ? String(docs.length) : "—" },
    { label: "Audit rows", value: audit ? String(audit.length) : "—" },
    { label: "Opened", value: formatDate(matter.opened_at) },
  ];

  return (
    <header aria-label="Matter record" className="mb-8 border-b border-rule pb-5">
      <p className="text-[11px] uppercase tracking-widest text-muted">Matter</p>
      <h1 className="mt-1 text-2xl font-bold tracking-tight2 text-ink">
        {matter.title}
      </h1>
      <p className="mt-1 font-mono text-xs text-muted">{matter.slug}</p>
      <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2">
        {facts.map((f) => (
          <div key={f.label}>
            <dt className="text-[10px] uppercase tracking-widest text-muted">
              {f.label}
            </dt>
            <dd className="mt-0.5 text-sm text-ink">{f.value}</dd>
          </div>
        ))}
      </dl>
    </header>
  );
}
