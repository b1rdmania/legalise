/**
 * Professional Sign-Off v1 — SignOff hero screen test.
 *
 * Renders the output, gates submit on the affirmation, enforces reasoning
 * for observations, and on submit posts the sign-off + navigates to the
 * confirmation record.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";

import { SignOff } from "./SignOff";
import * as api from "../lib/api";

function mountSign() {
  const root = createRootRoute({ component: () => <Outlet /> });
  const signRoute = createRoute({
    getParentRoute: () => root,
    path: "/matters/$slug/artifacts/$artifactId/sign",
    component: () => <SignOff slug="khan" artifactId="art-1" />,
  });
  const confirmStub = createRoute({
    getParentRoute: () => root,
    path: "/matters/$slug/signoffs/$signoffId",
    component: () => <div data-testid="confirm-stub" />,
  });
  const detailStub = createRoute({
    getParentRoute: () => root,
    path: "/matters/$slug/artifacts/$artifactId",
    component: () => <div data-testid="detail-stub" />,
  });
  const router = createRouter({
    routeTree: root.addChildren([signRoute, confirmStub, detailStub]),
    history: createMemoryHistory({ initialEntries: ["/matters/khan/artifacts/art-1/sign"] }),
  });
  return render(<RouterProvider router={router} />);
}

const ARTIFACT = {
  id: "art-1",
  matter_id: "m-1",
  module_id: "demo.guided-skill",
  capability_id: "summarise",
  invocation_id: "inv-1",
  kind: "skill_response",
  created_by_id: "u-1",
  created_at: "2026-05-29T12:00:00",
  size_bytes: 100,
  payload: { output: "A plain-English summary.", model_id: "stub-echo" },
};

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(api, "readArtifact").mockResolvedValue(ARTIFACT as never);
});
afterEach(() => cleanup());

describe("SignOff", () => {
  it("gates submit on the affirmation, then signs and navigates", async () => {
    const createSignoff = vi
      .spyOn(api, "createSignoff")
      .mockResolvedValue({ id: "so-1" } as never);
    mountSign();

    await waitFor(() => expect(screen.getByTestId("signoff-artifact")).toBeInTheDocument());
    const submit = screen.getByTestId("signoff-submit");
    // Disabled until the "I have reviewed this" affirmation.
    expect(submit).toBeDisabled();
    fireEvent.click(screen.getByTestId("signoff-affirm"));
    expect(submit).not.toBeDisabled();

    fireEvent.click(submit);
    await waitFor(() =>
      expect(createSignoff).toHaveBeenCalledWith("khan", {
        artifact_id: "art-1",
        decision: "signed",
        reasoning: undefined,
      }),
    );
    await waitFor(() => expect(screen.getByTestId("confirm-stub")).toBeInTheDocument());
  });

  it("requires reasoning for sign-with-observations", async () => {
    mountSign();
    await waitFor(() => expect(screen.getByTestId("signoff-artifact")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("signoff-affirm"));
    fireEvent.click(screen.getByTestId("signoff-decision-signed_with_observations"));
    // Affirmed but no reasoning → still blocked.
    expect(screen.getByTestId("signoff-submit")).toBeDisabled();
    fireEvent.change(screen.getByTestId("signoff-reasoning"), {
      target: { value: "Para 2 overstates the limitation period." },
    });
    expect(screen.getByTestId("signoff-submit")).not.toBeDisabled();
  });
});
