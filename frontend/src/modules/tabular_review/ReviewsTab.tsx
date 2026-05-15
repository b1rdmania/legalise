// ReviewsTab — MatterDetail tab entry for the tabular review module.
//
// Internal state machine: list view vs editor view, keyed on the
// selected review id. No URL routing in v0.1 — the parent tab is
// hash-routed; a deeper drill-down lives in component state.

import { useState } from "react";
import { Matter, ReviewSummary } from "./api";
import { ReviewEditor } from "./ReviewEditor";
import { ReviewList } from "./ReviewList";

type Props = {
  matter: Matter;
  // When set, ReviewList renders these directly (no fetch). Used by the
  // public read-only demo (`#/demo`) — production MatterDetail omits it.
  initialReviews?: ReviewSummary[];
};

export function ReviewsTab({ matter, initialReviews }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  if (selected) {
    return (
      <ReviewEditor
        slug={matter.slug}
        reviewId={selected}
        onBack={() => setSelected(null)}
      />
    );
  }
  return (
    <ReviewList
      slug={matter.slug}
      onSelect={setSelected}
      initialReviews={initialReviews}
    />
  );
}
