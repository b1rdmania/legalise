/**
 * Kind-aware artifact preview.
 *
 * Renders a structured view for known artifact kinds and falls back to
 * pretty-printed JSON for anything else. Substrate stores artifact
 * payloads opaquely; rendering rules live entirely on the frontend.
 *
 * Known kinds today (per the reference modules in examples/modules):
 *   - motion_draft: { markdown: string, claim_summary?: string,
 *                     claim_type?: string }
 *   - evidence_list: { evidence: [{ document_id, relevance,
 *                                   citation_hint }] }
 *   - findings_pack: { findings: [{ clause_id, severity, comment,
 *                                   citation }] } — Contract Review
 *                    (see examples/modules/contract_review/capability.py)
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

interface Finding {
  clause_id?: string;
  severity?: string;
  comment?: string;
  citation?: string;
}

interface FindingsPackPayload {
  findings: Finding[];
  // Conservative: rendered via the shared block ONLY if a module emits
  // structured anchors. Plain `citation` strings are never turned into
  // source chips (no fake anchors).
  source_anchors?: SourceAnchor[];
  claims?: AnchoredClaim[];
}

interface SourceAnchor {
  id: string;
  source_type: string;
  document_id?: string;
  filename?: string;
  label?: string;
  quote?: string | null;
  quote_found_in_source?: boolean;
}

interface AnchoredClaim {
  id: string;
  text: string;
  anchor_ids: string[];
}

interface SkillResponsePayload {
  output: string;
  model_id?: string;
  input?: string | null;
  source_anchors?: SourceAnchor[];
  claims?: AnchoredClaim[];
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

function looksLikeFindingsPack(p: unknown): p is FindingsPackPayload {
  if (!p || typeof p !== "object") return false;
  const v = (p as Record<string, unknown>).findings;
  return Array.isArray(v);
}

function looksLikeSkillResponse(p: unknown): p is SkillResponsePayload {
  if (!p || typeof p !== "object") return false;
  const v = (p as Record<string, unknown>).output;
  return typeof v === "string";
}

function documentSourceHref(
  matterSlug: string,
  anchor: SourceAnchor,
): string | null {
  if (!anchor.document_id) return null;
  const params = new URLSearchParams();
  params.set("from", "assistant");
  params.set("source", anchor.id);
  if (anchor.quote) params.set("quote", anchor.quote);
  if (anchor.quote_found_in_source !== undefined) {
    params.set("quote_found", anchor.quote_found_in_source ? "true" : "false");
    params.set("quoteFound", anchor.quote_found_in_source ? "true" : "false");
  }
  return `/matters/${encodeURIComponent(matterSlug)}/documents/${encodeURIComponent(
    anchor.document_id,
  )}?${params.toString()}`;
}

export function ArtifactPreview({
  payload,
  kindHint,
  matterSlug,
}: {
  payload: unknown;
  kindHint: string | null;
  // When supplied, source chips link to the document detail route.
  matterSlug?: string;
}) {
  // Prefer the explicit kind hint when we have one; only fall back to
  // shape detection when the kind is missing (e.g. inline invocation
  // result that the substrate hasn't kind-tagged yet).
  const kind =
    kindHint ??
    (looksLikeMotionDraft(payload)
      ? "motion_draft"
      : looksLikeFindingsPack(payload)
        ? "findings_pack"
        : looksLikeEvidenceList(payload)
          ? "evidence_list"
          : looksLikeSkillResponse(payload)
            ? "skill_response"
            : null);

  if (kind === "motion_draft" && looksLikeMotionDraft(payload)) {
    return <MotionDraftView payload={payload} />;
  }
  if (kind === "findings_pack" && looksLikeFindingsPack(payload)) {
    return <FindingsPackView payload={payload} matterSlug={matterSlug} />;
  }
  if (kind === "evidence_list" && looksLikeEvidenceList(payload)) {
    return <EvidenceListView payload={payload} />;
  }
  if (kind === "skill_response" && looksLikeSkillResponse(payload)) {
    return <SkillResponseView payload={payload} matterSlug={matterSlug} />;
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
              <code className="tech-token">{payload.claim_type}</code>
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
              <td className="px-3 py-2 tech-token text-xs">
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

function FindingsPackView({
  payload,
  matterSlug,
}: {
  payload: FindingsPackPayload;
  matterSlug?: string;
}) {
  if (payload.findings.length === 0) {
    return (
      <p className="mt-3 text-sm text-muted">No findings recorded.</p>
    );
  }
  return (
    <>
    <div
      className="mt-3 overflow-x-auto rounded-md border border-line"
      data-testid="findings-pack-view"
    >
      <table className="min-w-full text-sm">
        <thead className="bg-paper-sunken text-xs uppercase tracking-widest text-muted">
          <tr>
            <th className="px-3 py-2 text-left">Clause</th>
            <th className="px-3 py-2 text-left">Severity</th>
            <th className="px-3 py-2 text-left">Comment</th>
            <th className="px-3 py-2 text-left">Citation</th>
          </tr>
        </thead>
        <tbody>
          {payload.findings.map((f, i) => (
            <tr key={i} className="border-t border-line align-top">
              <td className="px-3 py-2 tech-token text-xs">
                {f.clause_id ?? "—"}
              </td>
              <td className="px-3 py-2">
                <SeverityBadge severity={f.severity} />
              </td>
              <td className="px-3 py-2 text-sm">{f.comment ?? "—"}</td>
              <td className="px-3 py-2 text-sm text-muted">
                {f.citation ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    {payload.source_anchors !== undefined && (
      <SourceAnchorsBlock
        anchors={payload.source_anchors ?? []}
        claims={payload.claims}
        matterSlug={matterSlug}
      />
    )}
    </>
  );
}

// Source coverage + chips. Honest by construction: shows what was cited,
// never claims the cited material proves anything. A quote that wasn't
// located in the source body is flagged as a caution, not a failure.
export function SourceAnchorsBlock({
  anchors,
  claims,
  matterSlug,
}: {
  anchors: SourceAnchor[];
  claims?: AnchoredClaim[];
  matterSlug?: string;
}) {
  if (anchors.length === 0) {
    return (
      <p className="mt-3 text-xs text-muted" data-testid="no-sources">
        No sources cited for this output.
      </p>
    );
  }
  const claimList = claims ?? [];
  const cited = claimList.filter((c) => c.anchor_ids.length > 0).length;
  const uncited = claimList.length - cited;
  const docAnchors = anchors.filter((a) => !a.quote);
  const quoteAnchors = anchors.filter((a) => a.quote);

  return (
    <div className="mt-3 rounded-md border border-line bg-paper-sunken px-3 py-2" data-testid="source-anchors">
      <p className="text-xs uppercase tracking-widest text-muted">Sources cited</p>
      <p className="mt-1 text-xs text-muted">
        {claimList.length > 0
          ? `${claimList.length} claim${claimList.length === 1 ? "" : "s"} · ${cited} cited · ${uncited} uncited`
          : `${docAnchors.length} document${docAnchors.length === 1 ? "" : "s"} in context`}
        . Cited for review — Legalise does not certify they prove the claim.
      </p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {docAnchors.map((a) => {
          const label = a.label ?? a.filename ?? a.id;
          const href = matterSlug ? documentSourceHref(matterSlug, a) : null;
          const chip = (
            <span className="inline-flex items-center rounded-full border border-line bg-paper px-2 py-0.5 text-[11px]">
              {label}
            </span>
          );
          return (
            <li key={a.id} data-testid={`source-chip-${a.id}`}>
              {href ? (
                <a
                  href={href}
                  className="hover:text-ink"
                >
                  {chip}
                </a>
              ) : (
                chip
              )}
            </li>
          );
        })}
      </ul>
      {quoteAnchors.length > 0 && (
        <ul className="mt-2 space-y-1">
          {quoteAnchors.map((a) => {
            const href = matterSlug ? documentSourceHref(matterSlug, a) : null;
            return (
              <li key={a.id} className="text-xs" data-testid={`source-quote-${a.id}`}>
                <span className="text-muted">{a.label ?? a.filename}: </span>
                <span className="italic">“{a.quote}”</span>{" "}
                {a.quote_found_in_source === false ? (
                  <span className="text-seal">— quote not found in source</span>
                ) : a.quote_found_in_source === true ? (
                  <span className="text-muted">— quote located in source</span>
                ) : null}
                {href && (
                  <>
                    {" "}
                    <a
                      href={href}
                      className="underline underline-offset-4 hover:text-ink"
                    >
                      Open passage
                    </a>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function SkillResponseView({
  payload,
  matterSlug,
}: {
  payload: SkillResponsePayload;
  matterSlug?: string;
}) {
  return (
    <div className="mt-3" data-testid="skill-response-view">
      {(payload.input || payload.model_id) && (
        <div className="rounded-md border border-line bg-paper-sunken px-3 py-2 text-sm">
          {payload.input && (
            <>
              <p className="text-xs uppercase tracking-widest text-muted">Request</p>
              <p className="mt-1">{payload.input}</p>
            </>
          )}
          {payload.model_id && (
            <p className="mt-1 text-xs text-muted">
              Model: <code className="tech-token">{payload.model_id}</code>
            </p>
          )}
        </div>
      )}
      <pre className="mt-3 max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-md border border-line bg-paper px-3 py-2 text-sm">
        {payload.output || "(empty response)"}
      </pre>
      {payload.source_anchors !== undefined && (
        <SourceAnchorsBlock
          anchors={payload.source_anchors ?? []}
          claims={payload.claims}
          matterSlug={matterSlug}
        />
      )}
    </div>
  );
}

function SeverityBadge({ severity }: { severity?: string }) {
  if (!severity) return <span className="text-muted">—</span>;
  // Substrate vocabulary verbatim ("low" | "medium" | "high"); the
  // badge colour is the only translation.
  const tone =
    severity === "high"
      ? "bg-seal text-paper"
      : severity === "medium"
        ? "bg-amber-500 text-paper"
        : severity === "low"
          ? "bg-line text-ink"
          : "bg-paper-sunken text-muted";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}
    >
      {severity}
    </span>
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
