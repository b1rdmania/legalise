/**
 * Phase 14 D — kind-aware artifact preview.
 *
 * Renders a structured view for known artifact kinds and falls back to
 * pretty-printed JSON for anything else. Substrate stores artifact
 * payloads opaquely; rendering rules live entirely on the frontend.
 *
 * Known kinds today (per Phase 9 + examples/modules/pre_motion):
 *   - motion_draft: { markdown: string, claim_summary?: string,
 *                     claim_type?: string }
 *   - evidence_list: { evidence: [{ document_id, relevance,
 *                                   citation_hint }] }
 *
 * Unknown kinds OR payloads that don't match the known shape fall
 * through to a JSON block. Substrate-stored payloads should never
 * surprise the UI; the fallback is the safe default.
 */

interface MotionDraftPayload {
  markdown: string;
  claim_summary?: string;
  claim_type?: string;
}

interface EvidenceItem {
  document_id?: string;
  relevance?: string;
  citation_hint?: string;
}

interface EvidenceListPayload {
  evidence: EvidenceItem[];
}

function looksLikeMotionDraft(p: unknown): p is MotionDraftPayload {
  if (!p || typeof p !== "object") return false;
  const v = (p as Record<string, unknown>).markdown;
  return typeof v === "string" && v.length > 0;
}

function looksLikeEvidenceList(p: unknown): p is EvidenceListPayload {
  if (!p || typeof p !== "object") return false;
  const v = (p as Record<string, unknown>).evidence;
  return Array.isArray(v);
}

export function ArtifactPreview({
  payload,
  kindHint,
}: {
  payload: unknown;
  kindHint: string | null;
}) {
  // Prefer the explicit kind hint when we have one; only fall back to
  // shape detection when the kind is missing (e.g. inline invocation
  // result that the substrate hasn't kind-tagged yet).
  const kind =
    kindHint ??
    (looksLikeMotionDraft(payload)
      ? "motion_draft"
      : looksLikeEvidenceList(payload)
        ? "evidence_list"
        : null);

  if (kind === "motion_draft" && looksLikeMotionDraft(payload)) {
    return <MotionDraftView payload={payload} />;
  }
  if (kind === "evidence_list" && looksLikeEvidenceList(payload)) {
    return <EvidenceListView payload={payload} />;
  }
  return <JsonFallback payload={payload} />;
}

function MotionDraftView({ payload }: { payload: MotionDraftPayload }) {
  return (
    <div className="mt-3" data-testid="motion-draft-view">
      {payload.claim_summary && (
        <div className="rounded-md border border-line bg-paper-sunken px-3 py-2 text-sm">
          <p className="text-xs uppercase tracking-widest text-muted">
            Claim summary
          </p>
          <p className="mt-1">{payload.claim_summary}</p>
          {payload.claim_type && (
            <p className="mt-1 text-xs text-muted">
              Claim type:{" "}
              <code className="font-mono">{payload.claim_type}</code>
            </p>
          )}
        </div>
      )}
      <pre className="mt-3 max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-md border border-line bg-paper px-3 py-2 text-sm">
        {payload.markdown}
      </pre>
    </div>
  );
}

function EvidenceListView({ payload }: { payload: EvidenceListPayload }) {
  if (payload.evidence.length === 0) {
    return (
      <p className="mt-3 text-sm text-muted">
        Evidence list is empty.
      </p>
    );
  }
  return (
    <div className="mt-3 overflow-x-auto rounded-md border border-line" data-testid="evidence-list-view">
      <table className="min-w-full text-sm">
        <thead className="bg-paper-sunken text-xs uppercase tracking-widest text-muted">
          <tr>
            <th className="px-3 py-2 text-left">Document</th>
            <th className="px-3 py-2 text-left">Relevance</th>
            <th className="px-3 py-2 text-left">Citation</th>
          </tr>
        </thead>
        <tbody>
          {payload.evidence.map((row, i) => (
            <tr key={i} className="border-t border-line">
              <td className="px-3 py-2 font-mono text-xs">
                {row.document_id ?? "—"}
              </td>
              <td className="px-3 py-2 text-sm">{row.relevance ?? "—"}</td>
              <td className="px-3 py-2 text-sm">
                {row.citation_hint ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function JsonFallback({ payload }: { payload: unknown }) {
  return (
    <pre
      className="mt-3 max-h-[60vh] overflow-auto rounded-md border border-line bg-paper px-3 py-2 text-xs"
      data-testid="json-fallback"
    >
      {JSON.stringify(payload, null, 2)}
    </pre>
  );
}
