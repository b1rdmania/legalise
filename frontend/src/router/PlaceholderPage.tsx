/**
 * Phase 14 A0 placeholder.
 *
 * Rendered by routes whose Phase 14 sub-step hasn't shipped yet. Until
 * the sub-step lands the route resolves cleanly (deep-links don't 404)
 * but renders an explicit "coming in Phase 14 X" notice.
 *
 * Replace with the real page when its sub-step ratifies — do NOT extend
 * this component with feature behaviour; it's a marker, not a base class.
 */

type Props = {
  phase: "A" | "B" | "C" | "D" | "E" | "F" | "G";
  route: string;
  title: string;
};

export function PlaceholderPage({ phase, route, title }: Props) {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16 text-ink">
      <p className="text-xs uppercase tracking-widest text-muted">
        Phase 14 {phase}
      </p>
      <h1 className="mt-2 text-3xl font-serif">{title}</h1>
      <p className="mt-4 text-muted">
        This surface is reserved by the Phase 14 build plan. The route
        is live so deep-links resolve, but the page lands when sub-step
        {" "}
        <span className="font-mono">{phase}</span> ratifies.
      </p>
      <p className="mt-2 text-xs text-muted font-mono">{route}</p>
    </div>
  );
}
