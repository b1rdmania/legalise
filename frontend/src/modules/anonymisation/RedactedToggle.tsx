// RedactedToggle - switches between the original extracted body and
// the redacted body. Caller supplies the original; this component
// fetches the redacted view lazily on first toggle.

import { useEffect, useState } from "react";
import { AnonymisationResult, getAnonymisation } from "./api";

type Props = {
  documentId: string;
  originalText: string;
  // Allows the parent to pre-supply a freshly-run result so we skip
  // the round trip. Optional.
  initialResult?: AnonymisationResult | null;
};

type Mode = "original" | "redacted";

export function RedactedToggle({ documentId, originalText, initialResult }: Props) {
  const [mode, setMode] = useState<Mode>("original");
  const [result, setResult] = useState<AnonymisationResult | null>(initialResult ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialResult) setResult(initialResult);
  }, [initialResult]);

  const ensureRedacted = async () => {
    if (result) return;
    setLoading(true);
    setError(null);
    try {
      const r = await getAnonymisation(documentId);
      setResult(r);
    } catch (e) {
      setError(
        e instanceof Error && e.message.startsWith("404")
          ? "No redacted body yet - run Anonymise first."
          : e instanceof Error
            ? e.message
            : String(e),
      );
    } finally {
      setLoading(false);
    }
  };

  const switchTo = async (next: Mode) => {
    if (next === "redacted") {
      await ensureRedacted();
    }
    setMode(next);
  };

  const visibleText =
    mode === "redacted" && result ? result.redacted_text : originalText;

  return (
    <div>
      <div role="tablist" style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "original"}
          onClick={() => switchTo("original")}
        >
          Original
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "redacted"}
          onClick={() => switchTo("redacted")}
          disabled={loading}
        >
          {loading ? "Loading…" : "Redacted"}
        </button>
        {result && mode === "redacted" && (
          <span style={{ fontSize: 12, color: "#555", alignSelf: "center" }}>
            {result.engine} • {result.entity_count} entities
          </span>
        )}
      </div>
      {error && (
        <p role="alert" style={{ color: "crimson", fontSize: 12 }}>
          {error}
        </p>
      )}
      <pre
        style={{
          whiteSpace: "pre-wrap",
          fontFamily: "inherit",
          margin: 0,
          maxHeight: 480,
          overflow: "auto",
        }}
      >
        {visibleText}
      </pre>
    </div>
  );
}
