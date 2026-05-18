// MappingTable - token → original reveal. Matter-owner-only on the
// backend; this component assumes the parent has already gated the
// view (the 403 will surface as an error string if not).
//
// Caps at 200 rows visible with an explicit "+N more" footer so a
// pathological document can't blow up the DOM.

import { useEffect, useState } from "react";
import {
  MappingRead,
  TokenMapping,
  getAnonymisationMapping,
} from "./api";

type Props = {
  documentId: string;
  // Optional pre-fetched data, e.g. when a parent already paid the round trip.
  data?: MappingRead | null;
};

const VISIBLE_LIMIT = 200;

export function MappingTable({ documentId, data: initial }: Props) {
  const [data, setData] = useState<MappingRead | null>(initial ?? null);
  const [loading, setLoading] = useState(!initial);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initial) {
      setData(initial);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getAnonymisationMapping(documentId)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [documentId, initial]);

  if (loading) return <p>Loading mapping…</p>;
  if (error) return <p role="alert" style={{ color: "crimson" }}>{error}</p>;
  if (!data) return <p>No mapping available.</p>;

  const tokens: TokenMapping[] = data.tokens;
  const visible = tokens.slice(0, VISIBLE_LIMIT);
  const hidden = Math.max(0, tokens.length - VISIBLE_LIMIT);

  return (
    <div>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            <th style={th}>Token</th>
            <th style={th}>Entity type</th>
            <th style={th}>Original</th>
            <th style={th}>Occurrences</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((t) => (
            <tr key={t.token}>
              <td style={td}><code>{t.token}</code></td>
              <td style={td}>{t.entity_type}</td>
              <td style={td}>{t.original}</td>
              <td style={td}>{t.occurrences}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {hidden > 0 && (
        <p style={{ fontSize: 12, color: "#555", marginTop: 8 }}>
          +{hidden} more token{hidden === 1 ? "" : "s"} not shown.
        </p>
      )}
    </div>
  );
}

const th: React.CSSProperties = {
  borderBottom: "1px solid #ccc",
  textAlign: "left",
  padding: "4px 8px",
  fontWeight: 600,
};

const td: React.CSSProperties = {
  borderBottom: "1px solid #eee",
  padding: "4px 8px",
  fontSize: 13,
};
