/**
 * SR-3 — ApprovalsTab focused test: a pending review renders, opens to
 * the review screen, and Approve calls decideReview.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { ApprovalsTab } from "./ApprovalsTab";
import * as api from "../../lib/api";
import type { SupervisorReview } from "../../lib/api";

function pendingReview(over: Partial<SupervisorReview> = {}): SupervisorReview {
  return {
    id: "rev-1",
    matter_id: "m-1",
    artifact_id: "art-1",
    invocation_id: "inv-1",
    module_id: "examples.contract-review",
    capability_id: "review",
    kind: "findings_pack",
    artifact_hash: "a".repeat(64),
    state: "pending",
    requested_by_id: "u-1",
    requested_at: "2026-05-28T10:00:00",
    decided_by_id: null,
    decided_at: null,
    note: null,
    ...over,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(api, "readArtifact").mockResolvedValue({
    id: "art-1",
    matter_id: "m-1",
    module_id: "examples.contract-review",
    capability_id: "review",
    invocation_id: "inv-1",
    kind: "findings_pack",
    created_by_id: "u-1",
    created_at: "2026-05-28T09:00:00",
    size_bytes: 42,
    payload: { findings: [] },
  });
});
afterEach(() => cleanup());

describe("ApprovalsTab", () => {
  it("renders a pending review and approves it", async () => {
    vi.spyOn(api, "listSupervisorReviews").mockResolvedValue({
      matter_id: "m-1",
      reviews: [pendingReview()],
    });
    const decide = vi
      .spyOn(api, "decideReview")
      .mockResolvedValue(pendingReview({ state: "approved" }));

    render(<ApprovalsTab slug="khan" />);

    await waitFor(() => {
      expect(screen.getByText("Pending")).toBeInTheDocument();
    });
    // Open the review screen.
    fireEvent.click(screen.getByText("findings_pack"));
    await waitFor(() => {
      expect(screen.getByText("Approve")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Approve"));
    await waitFor(() => {
      expect(decide).toHaveBeenCalledWith("khan", "rev-1", "approve", undefined);
    });
  });

  it("shows the empty state when there are no reviews", async () => {
    vi.spyOn(api, "listSupervisorReviews").mockResolvedValue({ matter_id: "m-1", reviews: [] });
    render(<ApprovalsTab slug="khan" />);
    await waitFor(() => {
      expect(screen.getByText(/no reviews yet/i)).toBeInTheDocument();
    });
  });
});
