/**
 * Sign-off confirmation — review-window labels (M13).
 *
 * The confirmation states the review duration plainly on the happy
 * path, renders "—" (never 0) when no open-event exists, and carries
 * the seal-toned implausible-speed note when flagged.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";

import { SignOffConfirmation } from "./SignOffConfirmation";
import * as api from "../lib/api";

function mountConfirmation() {
  const root = createRootRoute({ component: () => <Outlet /> });
  const confirmRoute = createRoute({
    getParentRoute: () => root,
    path: "/matters/$slug/signoffs/$signoffId",
    component: () => <SignOffConfirmation slug="khan" signoffId="so-1" />,
  });
  const detailStub = createRoute({
    getParentRoute: () => root,
    path: "/matters/$slug/artifacts/$artifactId",
    component: () => <div data-testid="detail-stub" />,
  });
  const auditStub = createRoute({
    getParentRoute: () => root,
    path: "/matters/$slug/audit",
    component: () => <div data-testid="audit-stub" />,
  });
  const router = createRouter({
    routeTree: root.addChildren([confirmRoute, detailStub, auditStub]),
    history: createMemoryHistory({
      initialEntries: ["/matters/khan/signoffs/so-1"],
    }),
  });
  return render(<RouterProvider router={router} />);
}

const SIGNOFF: api.Signoff = {
  id: "so-1",
  matter_id: "m-1",
  artifact_id: "art-1",
  invocation_id: "inv-1",
  module_id: "demo.guided-skill",
  capability_id: "summarise",
  kind: "skill_response",
  artifact_hash: "a".repeat(64),
  decision: "signed",
  reasoning: null,
  signer_id: "u-1",
  signer_email: "solicitor@example.com",
  signer_is_author: false,
  signed_at: "2026-06-12T10:30:00+00:00",
  is_current: true,
  review_seconds: 840,
  implausible_speed: false,
};

beforeEach(() => {
  vi.restoreAllMocks();
});
afterEach(() => cleanup());

describe("SignOffConfirmation review labels", () => {
  it("states the review duration plainly on the happy path", async () => {
    vi.spyOn(api, "getSignoff").mockResolvedValue(SIGNOFF);
    mountConfirmation();
    await waitFor(() =>
      expect(screen.getByTestId("signoff-record")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("signoff-review-duration")).toHaveTextContent(
      "14 minutes",
    );
    expect(screen.getByTestId("signoff-reviewed-line")).toHaveTextContent(
      "Reviewed for 14 minutes.",
    );
    // No judgement on the happy path.
    expect(
      screen.queryByTestId("signoff-implausible-speed"),
    ).not.toBeInTheDocument();
  });

  it("renders an em-dash, never 0, when no open-event exists", async () => {
    vi.spyOn(api, "getSignoff").mockResolvedValue({
      ...SIGNOFF,
      review_seconds: null,
    });
    mountConfirmation();
    await waitFor(() =>
      expect(screen.getByTestId("signoff-record")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("signoff-review-duration")).toHaveTextContent("—");
    expect(screen.queryByTestId("signoff-reviewed-line")).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("signoff-implausible-speed"),
    ).not.toBeInTheDocument();
  });

  it("carries the seal-toned note for an implausibly fast signature", async () => {
    vi.spyOn(api, "getSignoff").mockResolvedValue({
      ...SIGNOFF,
      review_seconds: 94,
      implausible_speed: true,
    });
    mountConfirmation();
    await waitFor(() =>
      expect(screen.getByTestId("signoff-record")).toBeInTheDocument(),
    );
    const note = screen.getByTestId("signoff-implausible-speed");
    expect(note).toHaveTextContent("Signed in 94s");
    expect(note.className).toContain("text-seal");
    expect(screen.queryByTestId("signoff-reviewed-line")).not.toBeInTheDocument();
  });
});

describe("formatReviewDuration", () => {
  it("renders seconds below two minutes, minutes after, dash for missing", () => {
    expect(api.formatReviewDuration(null)).toBe("—");
    expect(api.formatReviewDuration(undefined)).toBe("—");
    expect(api.formatReviewDuration(0)).toBe("0s");
    expect(api.formatReviewDuration(94)).toBe("94s");
    expect(api.formatReviewDuration(840)).toBe("14 minutes");
    expect(api.formatReviewDuration(60 * 60 * 3)).toBe("3 hours");
  });
});
