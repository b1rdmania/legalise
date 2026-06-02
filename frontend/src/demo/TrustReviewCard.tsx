/**
 * Compact Trust and Review card for the guided demo (`/demo-loop`).
 *
 * States the three governance facts that hold for every run on this matter,
 * with a single CTA that opens the four-question Proof drawer. The drawer
 * itself carries the deeper link into Record; the card is the
 * first humane proof layer.
 *
 * Honesty boundary: no "verified" wording, no audit-row count. Claims are
 * only what the current substrate actually delivers — runs are recorded,
 * sign-off gates final treatment, artifact contents and source references
 * are visible per output.
 *
 * Scoped narrowly to /demo-loop. Matter-shell rollout is a separate later
 * call (see memory: legalise-trust-card-rollout-caveat).
 */

type TrustReviewCardProps = {
  onViewProof: () => void;
};

export function TrustReviewCard({ onViewProof }: TrustReviewCardProps) {
  return (
    <aside
      className="rounded-md border border-rule bg-wash p-4"
      data-testid="trust-review-card"
      aria-label="Trust and review state"
    >
      <h2 className="text-[11px] uppercase tracking-widest text-muted">Trust &amp; review</h2>
      <ul className="mt-2 space-y-1.5 text-sm">
        <li>
          <span className="font-medium">Audit trail.</span>{" "}
          Every run is recorded in the matter&rsquo;s Record.
        </li>
        <li>
          <span className="font-medium">Human review.</span>{" "}
          A separate reviewer must sign off before output is treated as final.
        </li>
        <li>
          <span className="font-medium">Source visibility.</span>{" "}
          Artifact contents and source references are viewable per output.
        </li>
      </ul>
      <p className="mt-3">
        <button
          type="button"
          onClick={onViewProof}
          className="inline-flex items-center rounded-md border border-rule px-3 py-1.5 text-xs hover:border-ink"
          data-testid="trust-review-view-proof"
        >
          View proof &rarr;
        </button>
      </p>
    </aside>
  );
}
