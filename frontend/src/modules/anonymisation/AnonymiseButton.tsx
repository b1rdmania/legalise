// AnonymiseButton - per-document trigger. Three visual states:
//   1. "Anonymise"     - no redacted body yet.
//   2. "Re-anonymise"  - a redacted body exists; clicking re-runs.
//   3. spinner         - request in flight.
//
// On success the parent is notified via `onResult` so it can refresh
// any side-by-side view (RedactedToggle / MappingTable).

import { useEffect, useState } from "react";
import {
  AnonymisationResult,
  anonymiseDocument,
  getAnonymisation,
} from "./api";

type Props = {
  documentId: string;
  onResult?: (result: AnonymisationResult) => void;
};

export function AnonymiseButton({ documentId, onResult }: Props) {
  const [existing, setExisting] = useState<AnonymisationResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Probe for an existing redacted body so the label reflects state.
  // A 404 is the expected "never anonymised" path - swallow it.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await getAnonymisation(documentId);
        if (!cancelled) setExisting(result);
      } catch {
        if (!cancelled) setExisting(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [documentId]);

  const handleClick = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await anonymiseDocument(documentId);
      setExisting(result);
      onResult?.(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const label = busy
    ? "Anonymising…"
    : existing
      ? "Re-anonymise"
      : "Anonymise";

  return (
    <div style={{ display: "inline-flex", flexDirection: "column", gap: 4 }}>
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        aria-busy={busy}
        title={
          existing
            ? `Last run via ${existing.engine} on ${new Date(existing.anonymised_at).toLocaleString()} - ${existing.entity_count} entities`
            : "Run document anonymisation"
        }
      >
        {label}
      </button>
      {error && (
        <span role="alert" style={{ color: "crimson", fontSize: 12 }}>
          {error}
        </span>
      )}
    </div>
  );
}
